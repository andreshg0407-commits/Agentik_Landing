/**
 * lib/comercial/tiendas/store-replenishment-service.ts
 *
 * Service layer for the Tiendas module.
 *
 * Data strategy — SAG only:
 *   1. Query SagCurrentProvider (real Prisma data)
 *   2. If no data, return empty workspace — never inject demo/fictitious data
 *
 * No demo data is ever used for real tenants.
 * No hardcoded stores, names, cities, or responsibles leak into production.
 *
 * Sprint: COMERCIAL-TIENDAS-DATA-CONTRACT-03
 * Hardening: COMERCIAL-TIENDAS-NO-DEMO
 */

import type {
  TiendasWorkspaceData,
  StoreDetailData,
  StoreCard,
  StoreLocation,
  StoreInventoryVariant,
  StoreReplenishmentRule,
  MainWarehouseAvailability,
  ReplenishmentSuggestion,
  StoreCopilotSignal,
  ProviderMetadata,
  ProviderResult,
} from "./store-replenishment-types";

import {
  calculateStoreShortages,
  calculateExactReplenishment,
  calculateStoreHealth,
  deriveStoreHealthStatus,
  buildStoreSuggestions,
  rankStorePriority,
} from "./store-replenishment-engine";

import { SagCurrentProvider } from "./providers/sag-current-provider";
import { listStorePolicies } from "./store-policy-service";
import type { StorePolicyRule } from "./store-policy-types";
import { evaluateStoreAssortment, generateDefaultAssortmentRules } from "./assortment-engine";
import type { AssortmentRule } from "./assortment-types";
import { computeTextileCoverage } from "./textile-coverage-engine";
import { buildRuleCatalog, buildRuleCatalogFromPrisma } from "./store-rule-catalog";
import type { StoreRuleCatalog } from "./store-rule-catalog";

// ── In-memory TTL cache ─────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const TTL_DATA     = 2 * 60 * 1000; // 2 min — resolved data
const TTL_POLICIES = 60 * 1000;     // 1 min — policies
const TTL_CATALOG  = 5 * 60 * 1000; // 5 min — rule catalog

// ── Data source resolution ───────────────────────────────────────────────────

interface ResolvedData {
  stores:         StoreLocation[];
  inventory:      StoreInventoryVariant[];
  mainStock:      MainWarehouseAvailability[];
  rules:          StoreReplenishmentRule[];
  mainWarehouse:  { code: string; name: string };
  lastSyncAt:     string | null;
  metadata:       ProviderMetadata;
}

/**
 * Bridge CanonicalMainWarehouseRecord → MainWarehouseAvailability
 * (engine uses the simpler type without committedUnits)
 */
function bridgeMainStock(result: ProviderResult): MainWarehouseAvailability[] {
  return result.mainStock.map(s => ({
    warehouseCode:  s.warehouseCode,
    referenceCode:  s.referenceCode,
    size:           s.size,
    color:          s.color,
    availableUnits: s.availableUnits,
    reservedUnits:  s.reservedUnits,
    updatedAt:      s.updatedAt,
  }));
}

const EMPTY_METADATA: ProviderMetadata = {
  kind:           "sag_current",
  label:          "Sin datos sincronizados",
  connected:      false,
  lastReadAt:     null,
  variantSupport: false,
};

async function resolveData(orgId: string): Promise<ResolvedData> {
  const cacheKey = `resolvedData:${orgId}`;
  const cached = getCached<ResolvedData>(cacheKey);
  if (cached) return cached;

  console.time("[TIENDAS_PERF] resolveData");
  const sagProvider = new SagCurrentProvider();
  try {
    const result = await sagProvider.load(orgId);

    const data: ResolvedData = {
      stores:        result.stores,
      inventory:     result.inventory,
      mainStock:     bridgeMainStock(result),
      rules:         result.rules,
      mainWarehouse: result.mainWarehouse,
      lastSyncAt:    result.metadata.lastReadAt,
      metadata:      result.metadata,
    };
    setCache(cacheKey, data, TTL_DATA);
    console.timeEnd("[TIENDAS_PERF] resolveData");
    return data;
  } catch {
    console.timeEnd("[TIENDAS_PERF] resolveData");
    // SAG unavailable — return empty workspace
    return {
      stores:        [],
      inventory:     [],
      mainStock:     [],
      rules:         [],
      mainWarehouse: { code: "BOD-PRINCIPAL", name: "Bodega Principal" },
      lastSyncAt:    null,
      metadata:      EMPTY_METADATA,
    };
  }
}

async function resolveDataAndPolicies(orgId: string) {
  const policyCacheKey = `policies:${orgId}`;
  let policies = getCached<StorePolicyRule[]>(policyCacheKey);

  const [data, rawPolicies] = await Promise.all([
    resolveData(orgId),
    policies !== null ? Promise.resolve(null) : listStorePolicies(orgId),
  ]);

  if (rawPolicies) {
    policies = rawPolicies.flatMap(p => p.rules);
    setCache(policyCacheKey, policies, TTL_POLICIES);
  }

  return { data, policyRules: policies! };
}

// ── Workspace data ───────────────────────────────────────────────────────────

export interface TiendasWorkspaceResult {
  workspace: TiendasWorkspaceData;
  metadata:  ProviderMetadata;
}

/** Internal: compute workspace + suggestions from resolved data (avoids double resolveData) */
async function computeWorkspace(orgId: string) {
  console.time("[TIENDAS_PERF] computeWorkspace");
  const { data, policyRules } = await resolveDataAndPolicies(orgId);

  const allShortages = calculateStoreShortages(data.inventory, policyRules);
  const allSuggestions = calculateExactReplenishment(
    allShortages, data.mainStock, data.rules, data.inventory,
  );

  const cards: StoreCard[] = data.stores.map(store => {
    const health = calculateStoreHealth(
      store.id, store.name, data.inventory, allShortages, allSuggestions, store.lastSyncAt, policyRules, data.mainStock,
    );
    return { store, health, status: deriveStoreHealthStatus(health) };
  });

  const rankedHealths = rankStorePriority(cards.map(c => c.health));
  const rankedCards = rankedHealths.map(h => cards.find(c => c.store.id === h.storeId)!);

  console.timeEnd("[TIENDAS_PERF] computeWorkspace");
  return { rankedCards, allSuggestions, data, policyRules };
}

export async function getStoresWorkspace(orgId: string): Promise<TiendasWorkspaceResult> {
  const { rankedCards, data } = await computeWorkspace(orgId);

  return {
    workspace: {
      stores:            rankedCards,
      mainWarehouseCode: data.mainWarehouse.code,
      mainWarehouseName: data.mainWarehouse.name,
      lastSyncAt:        data.lastSyncAt,
    },
    metadata: data.metadata,
  };
}

/** Combined load: workspace + copilot signals in a single resolveData call. */
export async function getStoresWorkspaceWithSignals(orgId: string): Promise<{
  workspace: TiendasWorkspaceData;
  metadata: ProviderMetadata;
  signals: StoreCopilotSignal[];
}> {
  const { rankedCards, allSuggestions, data } = await computeWorkspace(orgId);

  const signals: StoreCopilotSignal[] = [];
  for (const card of rankedCards) {
    const storeSignals = buildStoreSuggestions(
      card.store.id, card.store.name, card.health, allSuggestions,
    );
    signals.push(...storeSignals);
  }

  return {
    workspace: {
      stores:            rankedCards,
      mainWarehouseCode: data.mainWarehouse.code,
      mainWarehouseName: data.mainWarehouse.name,
      lastSyncAt:        data.lastSyncAt,
    },
    metadata: data.metadata,
    signals: signals.sort((a, b) => a.priority - b.priority).slice(0, 3),
  };
}

// ── Store detail ─────────────────────────────────────────────────────────────

export async function getStoreDetail(orgId: string, storeId: string): Promise<StoreDetailData | null> {
  console.time("[TIENDAS_PERF] getStoreDetail");
  const { data, policyRules } = await resolveDataAndPolicies(orgId);

  const store = data.stores.find(s => s.id === storeId);
  if (!store) { console.timeEnd("[TIENDAS_PERF] getStoreDetail"); return null; }
  const inventory = data.inventory.filter(v => v.storeId === storeId);
  const shortages = calculateStoreShortages(inventory, policyRules);
  const suggestions = calculateExactReplenishment(
    shortages, data.mainStock, data.rules, data.inventory,
  );
  const rules = data.rules.filter(r => r.storeId === storeId);
  const health = calculateStoreHealth(storeId, store.name, inventory, shortages, suggestions, store.lastSyncAt, policyRules, data.mainStock);

  // Assortment needs — only when the store has explicit policy rules
  // Without rules, Agentik does NOT know what the store should carry → no faltantes, no sugerencias
  const storeHasRules = policyRules.some(r => r.active && r.storeId === storeId);
  const assortmentNeeds = storeHasRules
    ? evaluateStoreAssortment(
        storeId, store.name, inventory, data.mainStock,
        generateDefaultAssortmentRules(storeId, inventory), data.inventory,
      )
    : [];

  // Textile coverage NOT computed here — lazy loaded via store_textile_coverage action (PERF-01)

  console.timeEnd("[TIENDAS_PERF] getStoreDetail");
  return { store, health, shortages, suggestions, rules, mainWarehouse: data.mainStock, assortmentNeeds };
}

// ── Inventory query ──────────────────────────────────────────────────────────

export async function getStoreInventory(orgId: string, storeId: string): Promise<StoreInventoryVariant[]> {
  const data = await resolveData(orgId);
  return data.inventory.filter(v => v.storeId === storeId);
}

// ── Rules query ──────────────────────────────────────────────────────────────

export async function getStoreRules(orgId: string, storeId: string): Promise<StoreReplenishmentRule[]> {
  const data = await resolveData(orgId);
  return data.rules.filter(r => r.storeId === storeId);
}

// ── Suggestions query ────────────────────────────────────────────────────────

export async function getStoreSuggestions(orgId: string, storeId: string): Promise<ReplenishmentSuggestion[]> {
  const { data, policyRules } = await resolveDataAndPolicies(orgId);
  const inventory = data.inventory.filter(v => v.storeId === storeId);
  const shortages = calculateStoreShortages(inventory, policyRules);
  return calculateExactReplenishment(shortages, data.mainStock, data.rules, data.inventory);
}

// ── Main warehouse query ─────────────────────────────────────────────────────

export async function getMainWarehouseAvailability(orgId: string): Promise<MainWarehouseAvailability[]> {
  const data = await resolveData(orgId);
  return data.mainStock;
}

// ── Per-tab lazy loaders (TIENDAS-PERFORMANCE-LOAD-01) ─────────────────────

/** Lightweight store summary: just store + health, no heavy computation */
export async function getStoreSummary(orgId: string, storeId: string) {
  const { data, policyRules } = await resolveDataAndPolicies(orgId);
  const store = data.stores.find(s => s.id === storeId);
  if (!store) return null;

  const inventory = data.inventory.filter(v => v.storeId === storeId);
  const shortages = calculateStoreShortages(inventory, policyRules);
  const suggestions = calculateExactReplenishment(shortages, data.mainStock, data.rules, data.inventory);
  const health = calculateStoreHealth(storeId, store.name, inventory, shortages, suggestions, store.lastSyncAt, policyRules, data.mainStock);
  const storeHasRules = policyRules.some(r => r.active && r.storeId === storeId);

  return { store, health, hasRules: storeHasRules };
}

/** Lazy: shortages only */
export async function getStoreShortages(orgId: string, storeId: string) {
  const { data, policyRules } = await resolveDataAndPolicies(orgId);
  const inventory = data.inventory.filter(v => v.storeId === storeId);
  const shortages = calculateStoreShortages(inventory, policyRules);
  const storeHasRules = policyRules.some(r => r.active && r.storeId === storeId);
  const assortmentNeeds = storeHasRules
    ? evaluateStoreAssortment(storeId, "", inventory, data.mainStock,
        generateDefaultAssortmentRules(storeId, inventory), data.inventory)
    : [];
  return { shortages, assortmentNeeds, hasRules: storeHasRules };
}

/** Lazy: suggestions only */
export async function getStoreSuggestionsLazy(orgId: string, storeId: string) {
  const { data, policyRules } = await resolveDataAndPolicies(orgId);
  const inventory = data.inventory.filter(v => v.storeId === storeId);
  const shortages = calculateStoreShortages(inventory, policyRules);
  const suggestions = calculateExactReplenishment(shortages, data.mainStock, data.rules, data.inventory);
  const storeHasRules = policyRules.some(r => r.active && r.storeId === storeId);
  const assortmentNeeds = storeHasRules
    ? evaluateStoreAssortment(storeId, "", inventory, data.mainStock,
        generateDefaultAssortmentRules(storeId, inventory), data.inventory)
    : [];
  return { suggestions, assortmentNeeds, hasRules: storeHasRules };
}

/** Lazy: textile coverage only */
export async function getStoreTextileCoverage(orgId: string, storeId: string) {
  const { data, policyRules } = await resolveDataAndPolicies(orgId);
  const inventory = data.inventory.filter(v => v.storeId === storeId);
  const storeHasRules = policyRules.some(r => r.active && r.storeId === storeId);
  const coverage = computeTextileCoverage(storeId, inventory, data.mainStock, data.inventory, storeHasRules);
  return { textileCoverage: coverage, hasRules: storeHasRules };
}

/** Lazy: main warehouse for a specific store context */
export async function getStoreMainWarehouse(orgId: string) {
  const data = await resolveData(orgId);
  return { mainStock: data.mainStock };
}

/** Lazy: paginated inventory for Inventario tab */
export async function getStoreInventoryPaginated(
  orgId: string,
  storeId: string,
  opts: { limit?: number; offset?: number; search?: string; activeOnly?: boolean },
) {
  const data = await resolveData(orgId);
  let items = data.inventory.filter(v => v.storeId === storeId);

  if (opts.activeOnly !== false) {
    items = items.filter(v => v.currentUnits > 0);
  }

  if (opts.search) {
    const q = opts.search.toUpperCase();
    items = items.filter(v =>
      v.referenceCode.includes(q) ||
      v.productName.toUpperCase().includes(q) ||
      v.category.toUpperCase().includes(q),
    );
  }

  const total = items.length;
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  const page = items.slice(offset, offset + limit);

  return { inventory: page, total, limit, offset };
}

// ── Copilot signals ──────────────────────────────────────────────────────────

export async function getStoreCopilotSignals(orgId: string): Promise<StoreCopilotSignal[]> {
  const { rankedCards, allSuggestions } = await computeWorkspace(orgId);

  const signals: StoreCopilotSignal[] = [];
  for (const card of rankedCards) {
    const storeSignals = buildStoreSuggestions(
      card.store.id, card.store.name, card.health, allSuggestions,
    );
    signals.push(...storeSignals);
  }

  return signals
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}

// ── Rule catalog ────────────────────────────────────────────────────────────

/**
 * Build a catalog of real lines/subgroups/classes.
 *
 * HOTFIX TIENDAS-RULE-CATALOG-EMPTY-01:
 * Queries ProductInventoryLevel + ProductEntity directly via Prisma
 * instead of relying on store-filtered inventory (which may be empty
 * if no retail warehouses are configured).
 *
 * Falls back to store inventory if direct query fails.
 */
export async function getStoreRuleCatalog(orgId: string): Promise<StoreRuleCatalog> {
  const cacheKey = `ruleCatalog:${orgId}`;
  const cached = getCached<StoreRuleCatalog>(cacheKey);
  if (cached && cached.lines.length > 0) return cached;

  // Primary: direct Prisma query (all PIL + ProductEntity)
  const catalog = await buildRuleCatalogFromPrisma(orgId);

  if (catalog.lines.length > 0) {
    setCache(cacheKey, catalog, TTL_CATALOG);
    return catalog;
  }

  // Fallback: from resolved store inventory
  const data = await resolveData(orgId);
  const fallback = buildRuleCatalog(data.inventory);
  setCache(cacheKey, fallback, TTL_CATALOG);
  return fallback;
}
