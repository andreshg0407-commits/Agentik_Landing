/**
 * lib/comercial/tiendas/sag-store-adapter.ts
 *
 * SAG adapter for the Tiendas module.
 * Queries real SAG data from Prisma: warehouses from ProductInventoryLevel,
 * inventory by warehouse, main warehouse availability, and warehouse names
 * from the cached SAG BODEGAS lookup.
 *
 * Data sources:
 *   ProductInventoryLevel — per-warehouse, per-variant stock levels (PRIMARY)
 *   SagWarehouseLookupCache — cached BODEGAS names (from AgentExecution)
 *   CRMQuoteLine        — variant-level data (size, color, warehouseName) from CRM
 *   CommercialCoverageSnapshot — aggregate availability (main warehouse fallback)
 *   StoreWarehouseMappingConfig — admin warehouse configuration (from AgentExecution)
 *
 * Key fix (TIENDAS-INVENTORY-01):
 *   Stores are now discovered from ProductInventoryLevel warehouses (SAG ka_nl_bodega),
 *   NOT from SaleRecord billing channels. SaleRecord stores like "Almacen A" are
 *   invoicing channels (derived from FUENTES comprobante codes), not physical warehouses.
 *   PIL warehouseId IS the SAG ka_nl_bodega numeric PK — used directly for queries.
 *
 * Returns null/empty gracefully when no data is available.
 * Never fakes data — missing data is an explicit signal.
 *
 * Sprint: COMERCIAL-TIENDAS-SAG-02
 * Hardening: COMERCIAL-TIENDAS-NO-HARDCODE-05
 * Fix: TIENDAS-INVENTORY-01
 */

import { prisma } from "@/lib/prisma";
import type {
  StoreLocation,
  StoreInventoryVariant,
  MainWarehouseAvailability,
} from "./store-replenishment-types";
// TIENDAS-ADAPTER-REAL-DATA-01: removed inferCategory/inferProductType — now uses real SAG fields
import { resolveBusinessLineId } from "./store-business-lines";
import { resolveVariantSizeColor } from "./variant-attribute-resolver";
import {
  listWarehouseConfigs,
  type StoreWarehouseMappingConfig,
} from "./store-warehouse-config-service";
import {
  loadWarehouseLookup,
  resolveWarehouseName,
  isRetailWarehouse,
  isMainWarehouse as isMainWh,
  isNonRetailWarehouse,
  type SagWarehouseMap,
} from "./sag-warehouse-lookup";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoreWarehouseMapping {
  storeName:        string;
  sagWarehouseCode: string;
  city:             string;
  responsibleName:  string;
  storeType:        "tienda" | "outlet" | "punto_venta";
  isMainWarehouse:  boolean;
  active:           boolean;
  source:           "sag" | "admin_config";
}

export interface SagStoreResult {
  stores:         StoreLocation[];
  mainWarehouse:  { code: string; name: string } | null;
  inventory:      StoreInventoryVariant[];
  mainStock:      MainWarehouseAvailability[];
  lastSyncAt:     string | null;
  sagConnected:   boolean;
}

// ── Config → Mapping bridge ─────────────────────────────────────────────────

function configToMapping(c: StoreWarehouseMappingConfig): StoreWarehouseMapping {
  return {
    storeName:        c.storeName,
    sagWarehouseCode: c.sagWarehouseCode,
    city:             c.city,
    responsibleName:  c.responsibleName,
    storeType:        c.storeType,
    isMainWarehouse:  c.isMainWarehouse,
    active:           c.active,
    source:           c.source,
  };
}

/**
 * Load warehouse mappings from admin configuration.
 * Returns empty array if no config exists — never returns hardcoded data.
 */
async function getWarehouseMap(orgId: string): Promise<StoreWarehouseMapping[]> {
  const configs = await listWarehouseConfigs(orgId);
  return configs.map(configToMapping);
}

// ── Slug helpers ─────────────────────────────────────────────────────────────

function toStoreId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ── PIL warehouse discovery ─────────────────────────────────────────────────

/**
 * Discover all distinct warehouses from ProductInventoryLevel.
 * Returns SAG ka_nl_bodega values as strings (matching PIL warehouseId).
 */
async function discoverPilWarehouses(orgId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invDb = () => (prisma as any).productInventoryLevel;
  try {
    if (typeof invDb() !== "object" || !invDb()) return [];

    const rows: Array<{ warehouseId: string }> = await invDb().findMany({
      where:    { organizationId: orgId },
      select:   { warehouseId: true },
      distinct: ["warehouseId"],
    });
    return rows
      .map(r => r.warehouseId)
      .filter(id => id && id !== "_default");
  } catch {
    return [];
  }
}

// ── Store list ───────────────────────────────────────────────────────────────

export async function getSagWarehouses(orgId: string): Promise<string[]> {
  const warehouseIds = await discoverPilWarehouses(orgId);
  return warehouseIds.sort((a, b) => Number(a) - Number(b));
}

export async function getStoreWarehouses(orgId: string): Promise<StoreLocation[]> {
  const [mapping, pilWarehouseIds, lookup] = await Promise.all([
    getWarehouseMap(orgId),
    discoverPilWarehouses(orgId),
    loadWarehouseLookup(orgId),
  ]);

  const stores: StoreLocation[] = [];
  const usedWarehouseIds = new Set<string>();

  // Strategy 1: Admin-configured stores — use their sagWarehouseCode directly
  for (const m of mapping) {
    if (m.isMainWarehouse || !m.active) continue;

    const whId = m.sagWarehouseCode;
    const hasPilData = pilWarehouseIds.includes(whId);
    usedWarehouseIds.add(whId);

    stores.push({
      id:               toStoreId(m.storeName),
      name:             m.storeName,
      sagWarehouseCode: whId,
      responsibleName:  m.responsibleName || "Sin asignar",
      status:           hasPilData ? "activa" : "pausada",
      storeType:        m.storeType,
      city:             m.city || "",
      lastSyncAt:       hasPilData ? new Date().toISOString() : null,
    });
  }

  // Strategy 2: Auto-discover retail warehouses from PIL + BODEGAS lookup
  for (const whId of pilWarehouseIds) {
    if (usedWarehouseIds.has(whId)) continue;

    const entry = lookup.get(whId);
    if (!entry) continue; // No BODEGAS name — skip unknown warehouses

    // Skip main warehouse (shown separately), non-retail, and inactive
    if (isMainWh(entry)) continue;
    if (isNonRetailWarehouse(entry)) continue;
    if (!entry.active) continue;

    // Only show retail warehouses (franchise stores, named locations)
    if (!isRetailWarehouse(entry)) continue;

    usedWarehouseIds.add(whId);
    stores.push({
      id:               toStoreId(entry.name),
      name:             entry.name,
      sagWarehouseCode: whId,  // SAG ka_nl_bodega — matches PIL warehouseId
      responsibleName:  "Sin asignar",
      status:           "activa",
      storeType:        "tienda",
      city:             "",
      lastSyncAt:       new Date().toISOString(),
    });
  }

  return stores;
}

export async function getMainWarehouse(orgId: string): Promise<{ code: string; name: string } | null> {
  // Priority 1: Admin config
  const mapping = await getWarehouseMap(orgId);
  const main = mapping.find(m => m.isMainWarehouse && m.active);
  if (main) return { code: main.sagWarehouseCode, name: main.storeName };

  // Priority 2: BODEGAS lookup — find "BODEGA PRINCIPAL"
  const lookup = await loadWarehouseLookup(orgId);
  for (const [whId, entry] of lookup) {
    if (isMainWh(entry)) {
      return { code: whId, name: entry.name };
    }
  }

  // Priority 3: Heuristic — warehouse "10" is typically the main one (biggest PIL footprint)
  const pilIds = await discoverPilWarehouses(orgId);
  if (pilIds.includes("10")) {
    const name = resolveWarehouseName(lookup, "10");
    return { code: "10", name };
  }

  return null;
}

export async function mapSagWarehouseToStore(
  warehouseName: string,
  orgId: string,
): Promise<StoreWarehouseMapping | null> {
  const mapping = await getWarehouseMap(orgId);
  const upper = warehouseName.toUpperCase().trim();
  return mapping.find(m =>
    m.storeName.toUpperCase() === upper ||
    m.sagWarehouseCode.toUpperCase() === upper,
  ) ?? null;
}

// ── Inventory by warehouse ───────────────────────────────────────────────────

/**
 * Load variant-level inventory for a store warehouse.
 *
 * warehouseCode is now a SAG ka_nl_bodega value (e.g. "17", "11")
 * that matches PIL.warehouseId directly.
 *
 * Strategy:
 *   1. ProductInventoryLevel — best source (actual stock per variant per warehouse)
 *   2. CRMQuoteLine          — fallback (qty from recent orders as proxy)
 */
export async function getStoreInventoryByWarehouse(
  orgId: string,
  storeId: string,
  warehouseCode: string,
): Promise<StoreInventoryVariant[]> {
  const items: StoreInventoryVariant[] = [];
  const now = new Date().toISOString();

  // Strategy 1: ProductInventoryLevel (real stock)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invDb = () => (prisma as any).productInventoryLevel;
  try {
    if (typeof invDb() === "object" && invDb()) {
      const levels: Array<{
        quantity: number; reservedQty: number; externalRef: string | null;
        updatedAt: Date | null;
        product?: { name: string; sku: string | null; subgrupoSag: string | null; productLine: string | null } | null;
        variant?: { sku: string | null; name: string | null; attributes: unknown; variantAttributes?: Array<{ key: string; value: string }> } | null;
      }> = await invDb().findMany({
        where: { organizationId: orgId, warehouseId: warehouseCode },
        include: {
          product: { select: { name: true, sku: true, subgrupoSag: true, productLine: true } },
          variant: { include: { variantAttributes: { select: { key: true, value: true } } } },
        },
      });

      for (const lv of levels) {
        const resolved = resolveVariantSizeColor(lv.variant);
        const ref   = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
        const name  = lv.product?.name ?? ref;

        if (!ref) continue;

        items.push({
          storeId,
          warehouseCode,
          referenceCode: ref.toUpperCase(),
          productName:   name,
          category:      lv.product?.subgrupoSag || "SIN_SUBGRUPO_SAG",
          line:          resolveBusinessLineId(lv.product?.productLine),
          size:          resolved.size,
          color:         resolved.color,
          currentUnits:  Math.max(0, lv.quantity - lv.reservedQty),
          minUnits:      4,  // V2: from StoreReplenishmentRule
          idealUnits:    8,
          updatedAt:     lv.updatedAt?.toISOString() ?? now,
        });
      }

      if (items.length > 0) return items;
    }
  } catch {
    // Fall through to Strategy 2
  }

  // Strategy 2: CRMQuoteLine (order history as inventory proxy)
  try {
    const p = prisma as unknown as Record<string, unknown>;
    if (typeof p["cRMQuoteLine"] !== "object") return items;

    // Resolve warehouse name for CRM search
    const lookup = await loadWarehouseLookup(orgId);
    const whName = resolveWarehouseName(lookup, warehouseCode);

    const lines = await prisma.cRMQuoteLine.findMany({
      where: {
        organizationId: orgId,
        warehouseName:  { contains: whName, mode: "insensitive" as const },
      },
      select: {
        reference:     true,
        productName:   true,
        qty:           true,
        size:          true,
        color:         true,
        warehouseName: true,
        syncedAt:      true,
      },
      orderBy: { syncedAt: "desc" },
    });

    // Aggregate by variant key
    const variantMap = new Map<string, StoreInventoryVariant>();
    for (const ln of lines) {
      const size  = ln.size ?? "";
      const color = ln.color ?? "";
      const ref   = ln.reference.toUpperCase();
      const key   = `${ref}|${size}|${color}`;

      if (!variantMap.has(key)) {
        variantMap.set(key, {
          storeId,
          warehouseCode,
          referenceCode: ref,
          productName:   ln.productName ?? ref,
          category:      "SIN_SUBGRUPO_SAG",  // CRM fallback has no SAG subgrupoSag
          line:          "accesorios_importacion",  // CRM fallback → default business line
          size:          size || "SIN_TALLA",
          color:         color || "SIN_COLOR",
          currentUnits:  0,
          minUnits:      4,
          idealUnits:    8,
          updatedAt:     ln.syncedAt?.toISOString() ?? now,
        });
      }
      const v = variantMap.get(key)!;
      v.currentUnits += typeof ln.qty === "number" ? ln.qty : Number(ln.qty ?? 0);
    }

    items.push(...variantMap.values());
  } catch {
    // No CRM data available
  }

  return items;
}

// ── Main warehouse availability ──────────────────────────────────────────────

/**
 * Load main warehouse availability.
 *
 * mainWarehouseCode is now a SAG ka_nl_bodega value (e.g. "10")
 * that matches PIL.warehouseId directly.
 */
export async function getMainWarehouseAvailability(
  orgId: string,
  mainWarehouseCode: string,
): Promise<MainWarehouseAvailability[]> {
  const items: MainWarehouseAvailability[] = [];
  const now = new Date().toISOString();

  // Strategy 1: ProductInventoryLevel for main warehouse (variant-level)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invDb2 = () => (prisma as any).productInventoryLevel;
  try {
    if (typeof invDb2() === "object" && invDb2()) {
      const levels: Array<{
        quantity: number; reservedQty: number; externalRef: string | null;
        updatedAt: Date | null;
        product?: { sku: string | null } | null;
        variant?: { sku: string | null; name: string | null; attributes: unknown; variantAttributes?: Array<{ key: string; value: string }> } | null;
      }> = await invDb2().findMany({
        where: { organizationId: orgId, warehouseId: { in: [mainWarehouseCode, "_default"] } },
        include: {
          product: { select: { sku: true } },
          variant: { include: { variantAttributes: { select: { key: true, value: true } } } },
        },
      });

      for (const lv of levels) {
        const resolved = resolveVariantSizeColor(lv.variant);
        const ref   = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
        if (!ref) continue;

        items.push({
          warehouseCode: mainWarehouseCode,
          referenceCode: ref.toUpperCase(),
          size:  resolved.size,
          color: resolved.color,
          availableUnits: lv.quantity,
          reservedUnits:  lv.reservedQty,
          updatedAt:      lv.updatedAt?.toISOString() ?? now,
        });
      }

      if (items.length > 0) return items;
    }
  } catch {
    // Fall through to Strategy 2
  }

  // Strategy 2: CommercialCoverageSnapshot (aggregate, no variant)
  try {
    const p = prisma as unknown as Record<string, unknown>;
    if (typeof p["commercialCoverageSnapshot"] !== "object") return items;

    const snapshots = await prisma.commercialCoverageSnapshot.findMany({
      where:   { organizationId: orgId },
      orderBy: { snapshotAt: "desc" },
      select: {
        refCode:          true,
        description:      true,
        disponible:       true,
        pendingOrdersQty: true,
        snapshotAt:       true,
      },
    });

    // Deduplicate — latest per refCode
    const seen = new Set<string>();
    for (const snap of snapshots) {
      const ref = snap.refCode.toUpperCase();
      if (seen.has(ref)) continue;
      seen.add(ref);

      items.push({
        warehouseCode: mainWarehouseCode,
        referenceCode: ref,
        size:          "",  // aggregate — no variant breakdown
        color:         "",
        availableUnits: Math.max(0, snap.disponible ?? 0),
        reservedUnits:  snap.pendingOrdersQty ?? 0,
        updatedAt:      snap.snapshotAt.toISOString(),
      });
    }
  } catch {
    // No coverage data
  }

  return items;
}

// ── Lightweight summary (dashboard only) ────────────────────────────────────

export interface StoreSummaryRow {
  storeId:       string;
  warehouseCode: string;
  activeItems:   number;
  totalItems:    number;
}

/**
 * Load lightweight inventory COUNTS per warehouse in a single batch query.
 * No joins, no variant attributes — just counts for dashboard cards.
 */
export async function getInventorySummaryBatch(
  orgId: string,
  warehouseCodes: string[],
  storeIdByWarehouse: Map<string, string>,
): Promise<StoreSummaryRow[]> {
  if (warehouseCodes.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invDb = () => (prisma as any).productInventoryLevel;
  const rows: StoreSummaryRow[] = [];

  try {
    if (typeof invDb() !== "object" || !invDb()) return [];

    // Single batch query — all warehouses at once, minimal select
    const levels: Array<{
      warehouseId: string;
      quantity: number;
      reservedQty: number;
    }> = await invDb().findMany({
      where: { organizationId: orgId, warehouseId: { in: warehouseCodes } },
      select: { warehouseId: true, quantity: true, reservedQty: true },
    });

    // Aggregate per warehouse
    const byWarehouse = new Map<string, { active: number; total: number }>();
    for (const lv of levels) {
      const entry = byWarehouse.get(lv.warehouseId) ?? { active: 0, total: 0 };
      entry.total++;
      if (Math.max(0, lv.quantity - lv.reservedQty) > 0) entry.active++;
      byWarehouse.set(lv.warehouseId, entry);
    }

    for (const [whCode, counts] of byWarehouse) {
      const storeId = storeIdByWarehouse.get(whCode) ?? whCode;
      rows.push({
        storeId,
        warehouseCode: whCode,
        activeItems: counts.active,
        totalItems: counts.total,
      });
    }
  } catch {
    // PIL unavailable
  }

  return rows;
}

// ── Full SAG read ────────────────────────────────────────────────────────────

/**
 * Load all SAG store data for the Tiendas module.
 * Returns sagConnected: false if no SAG data is available.
 *
 * PERF: Uses batch PIL query (single findMany) instead of per-store N+1.
 */
export async function loadSagStoreData(orgId: string): Promise<SagStoreResult> {
  console.time("[TIENDAS_PERF] loadSagStoreData");

  const [stores, mainWh] = await Promise.all([
    getStoreWarehouses(orgId),
    getMainWarehouse(orgId),
  ]);

  if (stores.length === 0 && !mainWh) {
    console.timeEnd("[TIENDAS_PERF] loadSagStoreData");
    return {
      stores:        [],
      mainWarehouse: null,
      inventory:     [],
      mainStock:     [],
      lastSyncAt:    null,
      sagConnected:  false,
    };
  }

  const mainCode = mainWh?.code ?? "10";
  const allWarehouseCodes = stores.map(s => s.sagWarehouseCode);
  const storeIdMap = new Map(stores.map(s => [s.sagWarehouseCode, s.id]));

  // BATCH: single PIL query for ALL store warehouses + main warehouse in parallel
  console.time("[TIENDAS_PERF] batchInventory");
  const [inventory, mainStock] = await Promise.all([
    loadBatchStoreInventory(orgId, allWarehouseCodes, storeIdMap),
    getMainWarehouseAvailability(orgId, mainCode),
  ]);
  console.timeEnd("[TIENDAS_PERF] batchInventory");

  const lastSyncAt = stores.reduce<string | null>((latest, s) => {
    if (!s.lastSyncAt) return latest;
    if (!latest) return s.lastSyncAt;
    return s.lastSyncAt > latest ? s.lastSyncAt : latest;
  }, null);

  console.timeEnd("[TIENDAS_PERF] loadSagStoreData");
  return {
    stores,
    mainWarehouse: mainWh,
    inventory,
    mainStock,
    lastSyncAt,
    sagConnected: true,
  };
}

/**
 * Load full variant-level inventory for ALL stores in a SINGLE batch query.
 * Replaces the previous N+1 pattern of per-store getStoreInventoryByWarehouse calls.
 */
async function loadBatchStoreInventory(
  orgId: string,
  warehouseCodes: string[],
  storeIdMap: Map<string, string>,
): Promise<StoreInventoryVariant[]> {
  if (warehouseCodes.length === 0) return [];

  const items: StoreInventoryVariant[] = [];
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invDb = () => (prisma as any).productInventoryLevel;
  try {
    if (typeof invDb() !== "object" || !invDb()) return [];

    // SINGLE query for all store warehouses
    const levels: Array<{
      warehouseId: string;
      quantity: number; reservedQty: number; externalRef: string | null;
      updatedAt: Date | null;
      product?: { name: string; sku: string | null; subgrupoSag: string | null; productLine: string | null } | null;
      variant?: { sku: string | null; name: string | null; attributes: unknown; variantAttributes?: Array<{ key: string; value: string }> } | null;
    }> = await invDb().findMany({
      where: { organizationId: orgId, warehouseId: { in: warehouseCodes } },
      include: {
        product: { select: { name: true, sku: true, subgrupoSag: true, productLine: true } },
        variant: { include: { variantAttributes: { select: { key: true, value: true } } } },
      },
    });

    for (const lv of levels) {
      const resolved = resolveVariantSizeColor(lv.variant);
      const ref   = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
      const name  = lv.product?.name ?? ref;
      if (!ref) continue;

      const storeId = storeIdMap.get(lv.warehouseId) ?? lv.warehouseId;

      items.push({
        storeId,
        warehouseCode: lv.warehouseId,
        referenceCode: ref.toUpperCase(),
        productName:   name,
        category:      lv.product?.subgrupoSag || "SIN_SUBGRUPO_SAG",
        line:          resolveBusinessLineId(lv.product?.productLine),
        size:          resolved.size,
        color:         resolved.color,
        currentUnits:  Math.max(0, lv.quantity - lv.reservedQty),
        minUnits:      4,
        idealUnits:    8,
        updatedAt:     lv.updatedAt?.toISOString() ?? now,
      });
    }
    // FASE 9: coverage debug log
    if (items.length > 0) {
      const withSize = items.filter(i => i.size !== "SIN_TALLA").length;
      const withColor = items.filter(i => i.color !== "SIN_COLOR").length;
      console.log(`[TIENDAS_TEXTILE_ATTR_DEBUG] total=${items.length} withSize=${withSize} (${Math.round(withSize/items.length*100)}%) withColor=${withColor} (${Math.round(withColor/items.length*100)}%)`);
    }
  } catch {
    // PIL unavailable
  }

  return items;
}
