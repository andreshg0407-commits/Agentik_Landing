/**
 * lib/comercial/tiendas/store-derrotero-service.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01 — SEXTO
 *
 * Server-side service for derrotero coverage evaluation.
 * Provides:
 *   - getStoreDerroteroCoverage(orgId, storeId)    — single store
 *   - getAllStoresDerroteroCoverageSummary(orgId)    — all stores + matrix
 *   - getStoreCoverageGaps(orgId, storeId)          — coverage gaps
 *   - getEffectiveDerroteroConfig(storeSlug)        — effective config
 *
 * Performance:
 *   - Reuses getCanonicalStoreDetail() shared cache (2min TTL)
 *   - All evaluation is pure computation (< 5ms hot path)
 *   - No additional DB queries
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";

import type {
  StoreDerroteroCoverageResult,
  MainWarehouseCoverageMatrix,
  StoreDerroteroCoverageMatrix,
  StoreDerrotero,
  EffectiveDerroteroConfig,
  DerroteroCoverageGapSummary,
  StoreCoveragePriority,
  WarehouseAllocationSimulation,
} from "./store-derrotero-types";

import type { StoreDistributionItem } from "./store-distribution-types";

import { buildStoreDerroteroFromSalesPortfolioDerrotero } from "./store-derrotero-adapter";
import { evaluateStoreDerroteroCoverage, extractCoverageGaps } from "./store-derrotero-coverage-engine";
import {
  buildMainWarehouseCoverageMatrix,
  type MainWarehouseRefMeta,
} from "./store-derrotero-warehouse-matrix";
import { prioritizeWarehouseCoverageCandidates } from "./store-derrotero-priority-engine";
import { simulateWarehouseAllocation } from "./store-derrotero-allocation-simulator";
import { getCanonicalStoreDetail, CANONICAL_STORE_IDENTITY } from "./store-distribution-service";
import {
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_ACCESSORY_COVERAGE,
} from "./store-policy-pack-config";

// ── Default store priority (SÉPTIMO) ────────────────────────────────────────

const DEFAULT_STORE_PRIORITY_ORDER = ["centro", "caldas", "san_diego", "gran_plaza"];

// ── TTL cache ───────────────────────────────────────────────────────────────

interface CacheEntry<T> { data: T; expiresAt: number; }
const coverageCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = coverageCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { coverageCache.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  coverageCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const TTL_COVERAGE = 2 * 60 * 1000;

const inflight = new Map<string, Promise<unknown>>();

export function invalidateDerroteroCoverageCache(orgId: string): void {
  for (const key of coverageCache.keys()) {
    if (key.startsWith(`derrotero:${orgId}:`)) coverageCache.delete(key);
  }
}

// ── Active store slugs ──────────────────────────────────────────────────────

const ACTIVE_STORE_SLUGS = Object.values(CANONICAL_STORE_IDENTITY).map(s => s.slug);
const STORE_NAME_BY_SLUG = Object.fromEntries(
  Object.values(CANONICAL_STORE_IDENTITY).map(s => [s.slug, s.name]),
);

// ── Derrotero singleton ─────────────────────────────────────────────────────

let cachedDerrotero: StoreDerrotero | null = null;

function getDerrotero(tenantId: string): StoreDerrotero {
  if (cachedDerrotero && cachedDerrotero.tenantId === tenantId) return cachedDerrotero;
  cachedDerrotero = buildStoreDerroteroFromSalesPortfolioDerrotero(tenantId);
  return cachedDerrotero;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildMainWarehouseStockByRef(items: StoreDistributionItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!map.has(item.referenceCode)) {
      map.set(item.referenceCode, item.mainWarehouseAvailable);
    }
  }
  return map;
}

function collectMainWarehouseRefs(
  items: StoreDistributionItem[],
  seen: Set<string>,
): MainWarehouseRefMeta[] {
  const refs: MainWarehouseRefMeta[] = [];
  for (const item of items) {
    if (seen.has(item.referenceCode) || item.mainWarehouseAvailable <= 0) continue;
    seen.add(item.referenceCode);
    refs.push({
      referenceCode: item.referenceCode,
      productName: item.productName,
      canonicalLine: item.canonicalLine,
      group: item.group,
      subgroup: item.subgroup,
      sizeClass: item.sizeClass,
      mainWarehouseStock: item.mainWarehouseAvailable,
    });
  }
  return refs;
}

// ── Public API: Single store coverage ───────────────────────────────────────

export async function getStoreDerroteroCoverage(
  orgId: string,
  storeSlug: string,
): Promise<StoreDerroteroCoverageResult | null> {
  if (!ACTIVE_STORE_SLUGS.includes(storeSlug)) return null;

  const cacheKey = `derrotero:${orgId}:store:${storeSlug}`;
  const cached = getCached<StoreDerroteroCoverageResult>(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing as Promise<StoreDerroteroCoverageResult | null>;

  const promise = getStoreDerroteroCoverageImpl(orgId, storeSlug, cacheKey);
  inflight.set(cacheKey, promise);
  promise.finally(() => inflight.delete(cacheKey));
  return promise;
}

async function getStoreDerroteroCoverageImpl(
  orgId: string,
  storeSlug: string,
  cacheKey: string,
): Promise<StoreDerroteroCoverageResult | null> {
  const detail = await getCanonicalStoreDetail(orgId, storeSlug);
  if (!detail) return null;

  const derrotero = getDerrotero("castillitos");
  const storeName = STORE_NAME_BY_SLUG[storeSlug] ?? storeSlug;
  const mainWarehouseStockByRef = buildMainWarehouseStockByRef(detail.items);

  const coverage = evaluateStoreDerroteroCoverage(
    storeSlug,
    storeName,
    derrotero,
    detail.items,
    mainWarehouseStockByRef,
  );

  setCache(cacheKey, coverage, TTL_COVERAGE);
  return coverage;
}

// ── Public API: All stores summary + matrix + priorities + simulation ───────

export async function getAllStoresDerroteroCoverageSummary(
  orgId: string,
): Promise<{
  coverages: StoreDerroteroCoverageResult[];
  matrix: StoreDerroteroCoverageMatrix;
  warehouseMatrix: MainWarehouseCoverageMatrix;
  gapSummaries: DerroteroCoverageGapSummary[];
  priorities: StoreCoveragePriority[];
  simulation: WarehouseAllocationSimulation;
  derrotero: StoreDerrotero;
}> {
  const summaryKey = `derrotero:${orgId}:summary`;
  type SummaryResult = Awaited<ReturnType<typeof getAllStoresDerroteroCoverageSummary>>;
  const cached = getCached<SummaryResult>(summaryKey);
  if (cached) return cached;

  const existing = inflight.get(summaryKey);
  if (existing) return existing as Promise<SummaryResult>;

  const promise = getAllStoresDerroteroCoverageSummaryImpl(orgId, summaryKey);
  inflight.set(summaryKey, promise);
  promise.finally(() => inflight.delete(summaryKey));
  return promise;
}

async function getAllStoresDerroteroCoverageSummaryImpl(
  orgId: string,
  summaryKey: string,
): Promise<{
  coverages: StoreDerroteroCoverageResult[];
  matrix: StoreDerroteroCoverageMatrix;
  warehouseMatrix: MainWarehouseCoverageMatrix;
  gapSummaries: DerroteroCoverageGapSummary[];
  priorities: StoreCoveragePriority[];
  simulation: WarehouseAllocationSimulation;
  derrotero: StoreDerrotero;
}> {
  const derrotero = getDerrotero("castillitos");

  const detailResults = await Promise.all(
    ACTIVE_STORE_SLUGS.map(slug => getCanonicalStoreDetail(orgId, slug)),
  );

  const coverages: StoreDerroteroCoverageResult[] = [];
  const allMainWarehouseRefs: MainWarehouseRefMeta[] = [];
  const mainWarehouseRefsSeen = new Set<string>();

  for (let i = 0; i < ACTIVE_STORE_SLUGS.length; i++) {
    const slug = ACTIVE_STORE_SLUGS[i];
    const detail = detailResults[i];
    if (!detail) continue;

    const storeName = STORE_NAME_BY_SLUG[slug] ?? slug;
    const mainWarehouseStockByRef = buildMainWarehouseStockByRef(detail.items);

    const coverage = evaluateStoreDerroteroCoverage(
      slug,
      storeName,
      derrotero,
      detail.items,
      mainWarehouseStockByRef,
    );
    coverages.push(coverage);

    const newRefs = collectMainWarehouseRefs(detail.items, mainWarehouseRefsSeen);
    allMainWarehouseRefs.push(...newRefs);
  }

  const warehouseMatrix = buildMainWarehouseCoverageMatrix(
    "castillitos",
    coverages,
    allMainWarehouseRefs,
  );

  const matrix: StoreDerroteroCoverageMatrix = {
    tenantId: "castillitos",
    stores: coverages,
    derrotero,
    computedAt: new Date().toISOString(),
  };

  // Extract gaps for all stores
  const gapSummaries = coverages.map(c => extractCoverageGaps(c));

  // Prioritize candidates across stores (CUARTO)
  const priorities = prioritizeWarehouseCoverageCandidates(
    coverages,
    gapSummaries,
    warehouseMatrix.candidates,
  );

  // Simulate allocation (QUINTO)
  const simulation = simulateWarehouseAllocation(
    priorities,
    warehouseMatrix.candidates,
    gapSummaries,
  );

  const result = { coverages, matrix, warehouseMatrix, gapSummaries, priorities, simulation, derrotero };
  setCache(summaryKey, result, TTL_COVERAGE);
  return result;
}

// ── Public API: Coverage gaps ───────────────────────────────────────────────

export async function getStoreCoverageGaps(
  orgId: string,
  storeSlug: string,
): Promise<DerroteroCoverageGapSummary | null> {
  const coverage = await getStoreDerroteroCoverage(orgId, storeSlug);
  if (!coverage) return null;
  return extractCoverageGaps(coverage);
}

// ── Public API: Effective config (QUINTO + SÉPTIMO) ─────────────────────────

export function getEffectiveDerroteroConfig(storeSlug: string): EffectiveDerroteroConfig {
  const storeName = STORE_NAME_BY_SLUG[storeSlug] ?? storeSlug;

  return {
    storeSlug,
    storeName,
    minimumCoverageReferences: 1,
    castillitosTextile: {
      min: CASTILLITOS_TEXTILE_COVERAGE.minimumUnits,
      ideal: CASTILLITOS_TEXTILE_COVERAGE.idealUnits,
      max: CASTILLITOS_TEXTILE_COVERAGE.maximumUnits,
    },
    latinKidsTextile: {
      min: LATIN_KIDS_TEXTILE_COVERAGE.minimumUnits,
      ideal: LATIN_KIDS_TEXTILE_COVERAGE.idealUnits,
      max: LATIN_KIDS_TEXTILE_COVERAGE.maximumUnits,
    },
    accessoryIdealBySize: { ...CASTILLITOS_ACCESSORY_COVERAGE.idealBySize },
    storePriorityOrder: DEFAULT_STORE_PRIORITY_ORDER,
    source: "TENANT_DEFAULT",
    overrideReason: null,
  };
}
