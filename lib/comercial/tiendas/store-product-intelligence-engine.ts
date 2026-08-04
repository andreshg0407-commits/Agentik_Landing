/**
 * lib/comercial/tiendas/store-product-intelligence-engine.ts
 *
 * AGENTIK-STORES-PRODUCT-INTELLIGENCE-ENGINE-01
 *
 * Server-side engine that transforms StoreSaleLineRecord facts
 * into canonical product intelligence for a single store.
 *
 * Domain-oriented, not UI-oriented.
 * No labels, colors, cards, copy, or presentation.
 * No SAG runtime queries — uses local DB only.
 * No `new Date()` in pure metric functions — uses explicit asOfDate.
 *
 * Two universes:
 *   ALL_SALES_FACTS — all StoreSaleLineRecord rows (financial reconciliation)
 *   COMMERCIAL_PRODUCT_UNIVERSE — lineaSag != "OTROS" (rankings, rates, momentum)
 *
 * Inventory authority: warehouse-master.ts (getStoreWarehousePks).
 * Never hardcodes warehouse IDs. Never guesses externalRef values.
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getStoreWarehousePks,
  resolveWarehouseByPk,
} from "@/lib/inventory/warehouse-master";
import { resolveActiveStores } from "./store-governance-service";
import {
  isCommercialProductEligible,
  rankProducts,
} from "./store-product-intelligence-types";
import type {
  StoreProductIntelligence,
  AggregatedProductEntry,
  SalesRateEntry,
  MomentumEntry,
  MomentumConfig,
  NoSalesEntry,
  NoSalesResult,
  CategoryPerformanceEntry,
  CategoryCoverage,
  CommercialUniverseCoverage,
  DataCoverage,
  IntelligencePerformance,
  ProductReferenceEnrichment,
  ProductMomentumStatus,
  NoSalesClassification,
  InventoryAvailability,
  WindowId,
  TimeWindow,
  ComparisonWindows,
} from "./store-product-intelligence-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ══════════════════════════════════════════════════════════════════════════════
// Window helpers (pure — no new Date())
// ══════════════════════════════════════════════════════════════════════════════

export function buildWindow(id: WindowId, asOfDate: string): TimeWindow {
  const to = asOfDate;
  if (id === "YTD") {
    return { id, dateFrom: `${asOfDate.slice(0, 4)}-01-01`, dateTo: to };
  }
  const days = id === "LAST_30_DAYS" ? 30 : id === "LAST_60_DAYS" ? 60 : 90;
  const from = subtractDays(asOfDate, days - 1);
  return { id, dateFrom: from, dateTo: to };
}

export function buildComparisonWindows(windowDays: number, asOfDate: string): ComparisonWindows {
  const recentTo = asOfDate;
  const recentFrom = subtractDays(asOfDate, windowDays - 1);
  const previousTo = subtractDays(recentFrom, 1);
  const previousFrom = subtractDays(previousTo, windowDays - 1);
  return {
    recent: { id: "LAST_30_DAYS", dateFrom: recentFrom, dateTo: recentTo },
    previous: { id: "LAST_30_DAYS", dateFrom: previousFrom, dateTo: previousTo },
  };
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ══════════════════════════════════════════════════════════════════════════════
// Raw aggregate types (internal)
// ══════════════════════════════════════════════════════════════════════════════

interface RefAggregate {
  referenceCode: string;
  articleName: string;
  netUnits: number;
  netRevenue: number;
  invoiceUnits: number;
  invoiceTotal: number;
  creditNoteUnits: number;
  creditNoteTotal: number;
  invoiceCount: number;
  lastFacturaDate: string | null;
  sizeCount: number;
  colorCount: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// DB batch queries
// ══════════════════════════════════════════════════════════════════════════════

async function loadAggregatesForWindow(
  orgId: string,
  storeId: string,
  dateFrom: string,
  dateTo: string,
): Promise<RefAggregate[]> {
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT
      "referenceCode",
      MIN("articleName") as "articleName",
      SUM(CASE WHEN "documentFamily"='FACTURA' THEN "quantity"::numeric ELSE 0 END) as "invoiceUnits",
      SUM(CASE WHEN "documentFamily"='FACTURA' THEN "lineTotal"::numeric ELSE 0 END) as "invoiceTotal",
      SUM(CASE WHEN "documentFamily"='NOTA_CREDITO' THEN "quantity"::numeric ELSE 0 END) as "creditNoteUnits",
      SUM(CASE WHEN "documentFamily"='NOTA_CREDITO' THEN ABS("lineTotal"::numeric) ELSE 0 END) as "creditNoteTotal",
      COUNT(DISTINCT CASE WHEN "documentFamily"='FACTURA' THEN "erpMovId" END) as "invoiceCount",
      MAX(CASE WHEN "documentFamily"='FACTURA' THEN "documentDate"::text ELSE NULL END) as "lastFacturaDate",
      COUNT(DISTINCT "size") as "sizeCount",
      COUNT(DISTINCT "color") as "colorCount"
    FROM "StoreSaleLineRecord"
    WHERE "organizationId" = $1
    AND "storeId" = $2
    AND "documentDate" >= $3::date
    AND "documentDate" <= $4::date
    GROUP BY "referenceCode"
  `, orgId, storeId, dateFrom, dateTo);

  return rows.map(r => ({
    referenceCode: r.referenceCode,
    articleName: r.articleName,
    invoiceUnits: Number(r.invoiceUnits),
    invoiceTotal: Number(r.invoiceTotal),
    creditNoteUnits: Number(r.creditNoteUnits),
    creditNoteTotal: Number(r.creditNoteTotal),
    netUnits: Number(r.invoiceUnits) - Number(r.creditNoteUnits),
    netRevenue: Number(r.invoiceTotal) - Number(r.creditNoteTotal),
    invoiceCount: Number(r.invoiceCount),
    lastFacturaDate: r.lastFacturaDate ? String(r.lastFacturaDate).slice(0, 10) : null,
    sizeCount: Number(r.sizeCount),
    colorCount: Number(r.colorCount),
  }));
}

async function loadDataCoverage(
  orgId: string,
  storeId: string,
): Promise<{ minDate: string | null; maxDate: string | null; totalLines: number; totalRefs: number }> {
  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT
      MIN("documentDate")::text as "minDate",
      MAX("documentDate")::text as "maxDate",
      COUNT(*) as "totalLines",
      COUNT(DISTINCT "referenceCode") as "totalRefs"
    FROM "StoreSaleLineRecord"
    WHERE "organizationId" = $1
    AND "storeId" = $2
  `, orgId, storeId);
  const r = rows[0];
  return {
    minDate: r?.minDate ? String(r.minDate).slice(0, 10) : null,
    maxDate: r?.maxDate ? String(r.maxDate).slice(0, 10) : null,
    totalLines: Number(r?.totalLines ?? 0),
    totalRefs: Number(r?.totalRefs ?? 0),
  };
}

async function loadProductEnrichment(
  orgId: string,
  referenceCodes: string[],
): Promise<Map<string, ProductReferenceEnrichment>> {
  if (referenceCodes.length === 0) return new Map();

  const products: any[] = await db.productEntity.findMany({
    where: {
      organizationId: orgId,
      externalId: { in: referenceCodes },
    },
    select: {
      id: true,
      externalId: true,
      name: true,
      lineaSag: true,
      grupoSag: true,
      subgrupoSag: true,
    },
  });

  // Load hero images in single batch
  const productIds = products.map((p: any) => p.id);
  const pidByRef = new Map<string, string>(products.map((p: any) => [p.externalId, p.id]));

  const heroMap = new Map<string, string>();
  if (productIds.length > 0) {
    try {
      const assets: any[] = await db.productAssetLink.findMany({
        where: {
          productId: { in: productIds },
          role: "hero",
        },
        select: {
          productId: true,
          asset: { select: { cdnUrl: true } },
        },
      });
      for (const a of assets) {
        if (a.asset?.cdnUrl) heroMap.set(a.productId, a.asset.cdnUrl);
      }
    } catch {
      // ProductAssetLink may not exist — graceful degradation
    }
  }

  const map = new Map<string, ProductReferenceEnrichment>();
  for (const p of products) {
    const ref = p.externalId;
    const pid = pidByRef.get(ref);
    map.set(ref, {
      referenceCode: ref,
      productName: p.name,
      heroImageUrl: pid ? heroMap.get(pid) ?? null : null,
      lineaSag: p.lineaSag ?? null,
      grupoSag: p.grupoSag ?? null,
      subgrupoSag: p.subgrupoSag ?? null,
    });
  }
  return map;
}

/**
 * Load current store stock using the canonical warehouse authority.
 *
 * Uses warehouse-master.ts (getStoreWarehousePks) + store governance
 * to resolve storeId → PIL warehouseId. This is the same authority
 * used by store-snapshot-source-service.ts.
 *
 * Returns null if warehouse mapping cannot be resolved (INVENTORY_UNAVAILABLE).
 */
async function loadCurrentStoreStock(
  orgId: string,
  storeId: string,
): Promise<Map<string, { currentStock: number; entryDate: string | null }> | null> {
  const warehousePk = await resolveStoreWarehousePk(orgId, storeId);
  if (!warehousePk) return null;

  const rows: any[] = await db.$queryRawUnsafe(`
    SELECT
      pe."externalId" as "referenceCode",
      SUM(GREATEST(pil."quantity"::numeric - COALESCE(pil."reservedQty"::numeric, 0), 0)) as "currentStock",
      MIN(pil."createdAt")::text as "entryDate"
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe."id" = pil."productId" AND pe."organizationId" = pil."organizationId"
    WHERE pil."organizationId" = $1
    AND pil."warehouseId" = $2
    AND pil."quantity"::numeric > 0
    GROUP BY pe."externalId"
  `, orgId, warehousePk);

  const map = new Map<string, { currentStock: number; entryDate: string | null }>();
  for (const r of rows) {
    map.set(r.referenceCode, {
      currentStock: Number(r.currentStock),
      entryDate: r.entryDate ? String(r.entryDate).slice(0, 10) : null,
    });
  }
  return map;
}

/**
 * Resolve storeId → PIL warehouseId using canonical authorities.
 *
 * Authority chain:
 *   1. Store governance (resolveActiveStores) → warehouseId per store
 *   2. warehouse-master.ts → getStoreWarehousePks() for validation
 *
 * Returns null if store not found in governance or warehouse master.
 */
async function resolveStoreWarehousePk(orgId: string, storeId: string): Promise<string | null> {
  // 1. Try governance — the same authority used by store-snapshot-source-service
  try {
    const governance = await resolveActiveStores(orgId);
    for (const g of governance) {
      if (g.storeId === storeId) {
        // Validate against warehouse master
        const storePks = getStoreWarehousePks();
        if (storePks.has(g.warehouseId)) return g.warehouseId;
      }
    }
  } catch {
    // Governance not available — fall through to warehouse master
  }

  // 2. Fallback: reverse-lookup from warehouse master
  const storePks = getStoreWarehousePks();
  for (const pk of storePks) {
    const wh = resolveWarehouseByPk(pk);
    if (wh) {
      const slug = wh.ssNombre.toLowerCase().replace(/\s+/g, "_").replace(/^bodega_/, "");
      if (slug === storeId) return pk;
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Commercial universe filtering (pure — no DB)
// ══════════════════════════════════════════════════════════════════════════════

function filterCommercialAggregates(
  aggregates: RefAggregate[],
  enrichment: Map<string, ProductReferenceEnrichment>,
): { commercial: RefAggregate[]; universe: CommercialUniverseCoverage; allTimeRefs: number } {
  const commercial: RefAggregate[] = [];
  let excludedRefs = 0;
  let excludedRevenue = 0;
  let excludedUnits = 0;
  const exclusionReasons: Record<string, number> = {};

  for (const a of aggregates) {
    const e = enrichment.get(a.referenceCode);
    const lineaSag = e?.lineaSag ?? null;
    if (isCommercialProductEligible(lineaSag)) {
      commercial.push(a);
    } else {
      excludedRefs++;
      excludedRevenue += a.netRevenue;
      excludedUnits += a.netUnits;
      const reason = lineaSag ?? "UNKNOWN_LINE";
      exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
    }
  }

  return {
    commercial,
    universe: {
      allSalesRefs: 0, // set by caller with all-time data
      windowActiveRefs: aggregates.length,
      commercialEligibleRefs: commercial.length,
      excludedRefs,
      excludedRevenue,
      excludedUnits,
      exclusionReasons,
    },
    allTimeRefs: 0, // set by caller
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Pure metric functions (no DB, no new Date())
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Full aggregated commercial collection for the primary window — one entry per
 * reference, PRE-slice, net values verbatim (negatives/zeros included, no
 * clamps). Sorted referenceCode ASC for payload determinism (SQL GROUP BY has
 * no stable order). Ranking itself is the canonical pure law rankProducts()
 * in store-product-intelligence-types.ts — single implementation, reused by
 * downstream domain layers for per-universe rankings (UNIVERSE-RANKING-01).
 */
function buildAggregatedProducts(
  aggregates: RefAggregate[],
  enrichment: Map<string, ProductReferenceEnrichment>,
  totalStoreNetRevenue: number,
): AggregatedProductEntry[] {
  return aggregates
    .map(a => {
      const e = enrichment.get(a.referenceCode);
      return {
        referenceCode: a.referenceCode,
        productName: e?.productName ?? a.articleName,
        heroImageUrl: e?.heroImageUrl ?? null,
        lineaSag: e?.lineaSag ?? null,
        grupoSag: e?.grupoSag ?? null,
        subgrupoSag: e?.subgrupoSag ?? null,
        netUnits: a.netUnits,
        netRevenue: a.netRevenue,
        invoiceCount: a.invoiceCount,
        lastSaleDate: a.lastFacturaDate,
        shareOfStoreRevenuePct: totalStoreNetRevenue > 0
          ? (a.netRevenue / totalStoreNetRevenue) * 100
          : 0,
      };
    })
    .sort((a, b) => a.referenceCode.localeCompare(b.referenceCode));
}

function buildSalesRates(
  agg30: RefAggregate[],
  agg60: RefAggregate[],
  agg90: RefAggregate[],
  enrichment: Map<string, ProductReferenceEnrichment>,
): SalesRateEntry[] {
  const map30 = new Map(agg30.map(a => [a.referenceCode, a]));
  const map60 = new Map(agg60.map(a => [a.referenceCode, a]));
  const map90 = new Map(agg90.map(a => [a.referenceCode, a]));

  // Union of all refs with any activity
  const allRefs = new Set([
    ...agg30.map(a => a.referenceCode),
    ...agg60.map(a => a.referenceCode),
    ...agg90.map(a => a.referenceCode),
  ]);

  const result: SalesRateEntry[] = [];
  for (const ref of allRefs) {
    const e = enrichment.get(ref);
    const u30 = map30.get(ref)?.netUnits ?? 0;
    const u60 = map60.get(ref)?.netUnits ?? 0;
    const u90 = map90.get(ref)?.netUnits ?? 0;
    result.push({
      referenceCode: ref,
      productName: e?.productName ?? map90.get(ref)?.articleName ?? ref,
      lineaSag: e?.lineaSag ?? null,
      salesRate30d: u30 / 30,
      salesRate60d: u60 / 60,
      salesRate90d: u90 / 90,
      netUnits30d: u30,
      netUnits60d: u60,
      netUnits90d: u90,
    });
  }
  return result;
}

export function computeMomentumStatus(
  recentUnits: number,
  previousUnits: number,
  config: MomentumConfig,
): { status: ProductMomentumStatus; growthPct: number | null } {
  if (recentUnits === 0 && previousUnits === 0) {
    return { status: "NO_ACTIVITY", growthPct: null };
  }
  if (previousUnits === 0 && recentUnits > 0) {
    return { status: "NEW_ACTIVITY", growthPct: null };
  }
  // previousUnits > 0
  const growthPct = ((recentUnits - previousUnits) / previousUnits) * 100;

  if (config.stabilityThresholdPct !== null && Math.abs(growthPct) <= config.stabilityThresholdPct) {
    return { status: "STABLE", growthPct };
  }
  return {
    status: growthPct > 0 ? "ACCELERATING" : "DECELERATING",
    growthPct,
  };
}

function buildMomentum(
  recentAgg: RefAggregate[],
  previousAgg: RefAggregate[],
  enrichment: Map<string, ProductReferenceEnrichment>,
  config: MomentumConfig,
): MomentumEntry[] {
  const recentMap = new Map(recentAgg.map(a => [a.referenceCode, a]));
  const previousMap = new Map(previousAgg.map(a => [a.referenceCode, a]));

  const allRefs = new Set([
    ...recentAgg.map(a => a.referenceCode),
    ...previousAgg.map(a => a.referenceCode),
  ]);

  const entries: MomentumEntry[] = [];
  for (const ref of allRefs) {
    const recentUnits = recentMap.get(ref)?.netUnits ?? 0;
    const previousUnits = previousMap.get(ref)?.netUnits ?? 0;
    const e = enrichment.get(ref);
    const { status, growthPct } = computeMomentumStatus(recentUnits, previousUnits, config);

    entries.push({
      referenceCode: ref,
      productName: e?.productName ?? recentMap.get(ref)?.articleName ?? previousMap.get(ref)?.articleName ?? ref,
      lineaSag: e?.lineaSag ?? null,
      recentNetUnits: recentUnits,
      previousNetUnits: previousUnits,
      absoluteDelta: recentUnits - previousUnits,
      growthPct,
      status,
      windowDays: config.windowDays,
    });
  }

  entries.sort((a, b) => {
    const statusOrder: Record<ProductMomentumStatus, number> = {
      NEW_ACTIVITY: 0, ACCELERATING: 1, STABLE: 2, DECELERATING: 3, NO_ACTIVITY: 4,
    };
    const so = statusOrder[a.status] - statusOrder[b.status];
    if (so !== 0) return so;
    const ud = b.recentNetUnits - a.recentNetUnits;
    if (ud !== 0) return ud;
    return a.referenceCode.localeCompare(b.referenceCode);
  });

  return entries;
}

function classifyNoSales(
  ref: string,
  stockInfo: { currentStock: number; entryDate: string | null } | undefined,
  lastFacturaDate: string | null,
  asOfDate: string,
  noSalesWindowDays: number,
): NoSalesClassification {
  if (!stockInfo || stockInfo.currentStock <= 0) return "NO_CURRENT_STOCK";

  // Has current stock — check recent sales
  if (lastFacturaDate) {
    const daysSinceSale = daysBetween(lastFacturaDate, asOfDate);
    if (daysSinceSale <= noSalesWindowDays) return "HAS_RECENT_SALES";
  }

  // No recent sales with stock — check if recently received
  if (stockInfo.entryDate) {
    const daysInStore = daysBetween(stockInfo.entryDate, asOfDate);
    if (daysInStore < noSalesWindowDays) return "RECENTLY_RECEIVED";
  }

  return "CURRENT_STOCK_NO_RECENT_SALES";
}

function buildNoSales(
  allTimeAgg: RefAggregate[],
  stockMap: Map<string, { currentStock: number; entryDate: string | null }>,
  recentAgg: RefAggregate[],
  enrichment: Map<string, ProductReferenceEnrichment>,
  asOfDate: string,
  noSalesWindowDays: number,
): NoSalesEntry[] {
  const recentMap = new Map(recentAgg.map(a => [a.referenceCode, a]));
  const allTimeMap = new Map(allTimeAgg.map(a => [a.referenceCode, a]));

  // Universe: refs with current stock OR historically sold in this store
  const universe = new Set([
    ...stockMap.keys(),
    ...allTimeAgg.map(a => a.referenceCode),
  ]);

  const entries: NoSalesEntry[] = [];
  for (const ref of universe) {
    const stockInfo = stockMap.get(ref);
    const allTime = allTimeMap.get(ref);
    const lastFacturaDate = recentMap.get(ref)?.lastFacturaDate ?? allTime?.lastFacturaDate ?? null;

    const classification = classifyNoSales(ref, stockInfo, lastFacturaDate, asOfDate, noSalesWindowDays);

    // Only report CURRENT_STOCK_NO_RECENT_SALES and RECENTLY_RECEIVED
    if (classification !== "CURRENT_STOCK_NO_RECENT_SALES" && classification !== "RECENTLY_RECEIVED") continue;

    // Only include commercial products in no-sales report
    const e = enrichment.get(ref);
    if (!isCommercialProductEligible(e?.lineaSag ?? null)) continue;

    entries.push({
      referenceCode: ref,
      productName: e?.productName ?? allTime?.articleName ?? ref,
      lineaSag: e?.lineaSag ?? null,
      currentStock: stockInfo?.currentStock ?? 0,
      daysInStore: stockInfo?.entryDate ? daysBetween(stockInfo.entryDate, asOfDate) : null,
      lastSaleDate: lastFacturaDate,
      daysSinceLastSale: lastFacturaDate ? daysBetween(lastFacturaDate, asOfDate) : null,
      classification,
    });
  }

  entries.sort((a, b) => {
    if (a.classification !== b.classification) {
      return a.classification === "CURRENT_STOCK_NO_RECENT_SALES" ? -1 : 1;
    }
    const dsA = a.daysSinceLastSale ?? 9999;
    const dsB = b.daysSinceLastSale ?? 9999;
    if (dsA !== dsB) return dsB - dsA;
    return a.referenceCode.localeCompare(b.referenceCode);
  });

  return entries;
}

function buildCategoryPerformance(
  aggregates: RefAggregate[],
  recentAgg: RefAggregate[],
  previousAgg: RefAggregate[],
  enrichment: Map<string, ProductReferenceEnrichment>,
  allTimeReferences: number,
): { entries: CategoryPerformanceEntry[]; coverage: CategoryCoverage } {
  const recentMap = new Map(recentAgg.map(a => [a.referenceCode, a]));
  const previousMap = new Map(previousAgg.map(a => [a.referenceCode, a]));

  const lineGroups = new Map<string, {
    refs: Set<string>; netUnits: number; netRevenue: number;
    recent30d: number; previous30d: number;
  }>();

  let classifiedRevenue = 0;
  let unclassifiedRevenue = 0;
  let classifiedRefs = 0;
  let unclassifiedRefs = 0;

  for (const a of aggregates) {
    const e = enrichment.get(a.referenceCode);
    const line = e?.lineaSag ?? null;
    const key = line ?? "UNCLASSIFIED";

    if (line) { classifiedRevenue += Math.max(0, a.netRevenue); classifiedRefs++; }
    else { unclassifiedRevenue += Math.max(0, a.netRevenue); unclassifiedRefs++; }

    let group = lineGroups.get(key);
    if (!group) {
      group = { refs: new Set(), netUnits: 0, netRevenue: 0, recent30d: 0, previous30d: 0 };
      lineGroups.set(key, group);
    }
    group.refs.add(a.referenceCode);
    group.netUnits += a.netUnits;
    group.netRevenue += a.netRevenue;

    const recent = recentMap.get(a.referenceCode);
    const previous = previousMap.get(a.referenceCode);
    if (recent) group.recent30d += recent.netUnits;
    if (previous) group.previous30d += previous.netUnits;
  }

  const totalClassifiedRevenue = classifiedRevenue + unclassifiedRevenue;

  const entries: CategoryPerformanceEntry[] = [];
  for (const [name, g] of lineGroups) {
    const growthPct = g.previous30d === 0
      ? (g.recent30d > 0 ? null : null)
      : ((g.recent30d - g.previous30d) / g.previous30d) * 100;

    entries.push({
      level: "line",
      name,
      parentName: null,
      referenceCount: g.refs.size,
      netUnits: g.netUnits,
      netRevenue: g.netRevenue,
      sharePct: totalClassifiedRevenue > 0 ? (g.netRevenue / totalClassifiedRevenue) * 100 : 0,
      netUnitsRecent30d: g.recent30d,
      netUnitsPrevious30d: g.previous30d,
      growthPct,
    });
  }

  entries.sort((a, b) => b.netRevenue - a.netRevenue);

  const coverage: CategoryCoverage = {
    windowActiveReferences: classifiedRefs + unclassifiedRefs,
    allTimeReferences,
    classifiedReferences: classifiedRefs,
    classifiedRevenuePct: totalClassifiedRevenue > 0
      ? (classifiedRevenue / totalClassifiedRevenue) * 100
      : 0,
    unclassifiedReferences: unclassifiedRefs,
    unclassifiedRevenuePct: totalClassifiedRevenue > 0
      ? (unclassifiedRevenue / totalClassifiedRevenue) * 100
      : 0,
  };

  return { entries, coverage };
}

// ══════════════════════════════════════════════════════════════════════════════
// Query responsibility map (§13)
// ══════════════════════════════════════════════════════════════════════════════
//
// Q1  loadDataCoverage        — all-time range + counts (1 raw SQL)
// Q2  loadAggregatesForWindow — primary window aggregate (1 raw SQL)
// Q3  loadAggregatesForWindow — 30d window (1 raw SQL)
// Q4  loadAggregatesForWindow — 60d window (1 raw SQL)
// Q5  loadAggregatesForWindow — 90d window (1 raw SQL)
// Q6  loadAggregatesForWindow — momentum recent window (1 raw SQL)
// Q7  loadAggregatesForWindow — momentum previous window (1 raw SQL)
// Q8  resolveStoreWarehousePk — governance + warehouse master (1-2 Prisma)
// Q9  loadCurrentStoreStock   — PIL join PE (1 raw SQL) — depends on Q8
// Q10 loadProductEnrichment   — PE batch (1 Prisma findMany)
// Q11 loadProductEnrichment   — hero images (1 Prisma findMany, may fail gracefully)
// Q12 storeName resolution    — 1 Prisma findFirst
//
// Q1 runs first (gate). Q2-Q7 run in parallel. Q8-Q9 also parallel with Q2-Q7.
// Q10-Q11 run after all refs collected. Q12 runs at end.
// Cumulative DB ms may exceed wall clock ms due to parallel execution.

// ══════════════════════════════════════════════════════════════════════════════
// Main engine entry point
// ══════════════════════════════════════════════════════════════════════════════

export interface IntelligenceOptions {
  orgId: string;
  storeId: string;
  asOfDate: string; // ISO date
  windowId?: WindowId;
  topN?: number;
  momentumConfig?: Partial<MomentumConfig>;
  noSalesWindowDays?: number;
}

const DEFAULT_MOMENTUM_CONFIG: MomentumConfig = {
  windowDays: 30,
  stabilityThresholdPct: 10,
};

export async function buildStoreProductIntelligence(
  opts: IntelligenceOptions,
): Promise<StoreProductIntelligence> {
  const startTotal = Date.now();
  const windowId = opts.windowId ?? "LAST_90_DAYS";
  const topN = Math.max(0, opts.topN ?? 10);
  const momentumConfig: MomentumConfig = {
    ...DEFAULT_MOMENTUM_CONFIG,
    ...opts.momentumConfig,
  };
  const noSalesWindowDays = opts.noSalesWindowDays ?? 30;
  const asOf = opts.asOfDate;

  let dbQueryCount = 0;
  let dbCumulativeMs = 0;

  function trackQuery<T>(p: Promise<T>): Promise<T> {
    dbQueryCount++;
    const t0 = Date.now();
    return p.then(r => { dbCumulativeMs += Date.now() - t0; return r; });
  }

  // ── 1. Data coverage (Q1) ────────────────────────────────────────────────
  const coverageRaw = await trackQuery(loadDataCoverage(opts.orgId, opts.storeId));

  if (coverageRaw.totalLines === 0) {
    const engineMs = Date.now() - startTotal;
    return emptyIntelligence(opts.storeId, asOf, windowId, topN, momentumConfig, "NOT_SYNCED", {
      dbQueryCount, dbCumulativeMs, dbWallClockMs: engineMs, engineComputeMs: 0, totalWallClockMs: engineMs,
    });
  }

  const dataStatus = coverageRaw.maxDate && daysBetween(coverageRaw.maxDate, asOf) <= 14
    ? "READY" as const
    : "PARTIAL_DATA" as const;

  // ── 2. Build windows ──────────────────────────────────────────────────────
  const primaryWindow = buildWindow(windowId, asOf);
  const w30 = buildWindow("LAST_30_DAYS", asOf);
  const w60 = buildWindow("LAST_60_DAYS", asOf);
  const w90 = buildWindow("LAST_90_DAYS", asOf);
  const comparison = buildComparisonWindows(momentumConfig.windowDays, asOf);

  // ── 3. Batch DB queries (Q2-Q9, parallel) ─────────────────────────────────
  const dbBatchStart = Date.now();
  const [aggPrimary, agg30, agg60, agg90, aggRecent, aggPrevious, stockMapOrNull] = await Promise.all([
    trackQuery(loadAggregatesForWindow(opts.orgId, opts.storeId, primaryWindow.dateFrom, primaryWindow.dateTo)),
    trackQuery(loadAggregatesForWindow(opts.orgId, opts.storeId, w30.dateFrom, w30.dateTo)),
    trackQuery(loadAggregatesForWindow(opts.orgId, opts.storeId, w60.dateFrom, w60.dateTo)),
    trackQuery(loadAggregatesForWindow(opts.orgId, opts.storeId, w90.dateFrom, w90.dateTo)),
    trackQuery(loadAggregatesForWindow(opts.orgId, opts.storeId, comparison.recent.dateFrom, comparison.recent.dateTo)),
    trackQuery(loadAggregatesForWindow(opts.orgId, opts.storeId, comparison.previous.dateFrom, comparison.previous.dateTo)),
    trackQuery(loadCurrentStoreStock(opts.orgId, opts.storeId)),
  ]);
  const dbBatchMs = Date.now() - dbBatchStart;

  // ── 4. Inventory availability ──────────────────────────────────────────────
  const inventoryAvailability: InventoryAvailability = stockMapOrNull !== null
    ? "READY"
    : "INVENTORY_UNAVAILABLE";
  const stockMap = stockMapOrNull ?? new Map<string, { currentStock: number; entryDate: string | null }>();

  // ── 5. Collect all reference codes and enrich (Q10-Q11) ───────────────────
  const allRefs = new Set<string>();
  for (const agg of [aggPrimary, agg30, agg60, agg90, aggRecent, aggPrevious]) {
    for (const a of agg) allRefs.add(a.referenceCode);
  }
  for (const ref of stockMap.keys()) allRefs.add(ref);

  const enrichment = await trackQuery(loadProductEnrichment(opts.orgId, [...allRefs]));

  // ── 6. Commercial universe filtering ───────────────────────────────────────
  const computeStart = Date.now();

  const { commercial: commercialPrimary, universe: commercialUniverse } =
    filterCommercialAggregates(aggPrimary, enrichment);
  commercialUniverse.allSalesRefs = coverageRaw.totalRefs;

  // Filter sub-window aggregates for commercial-only metrics
  const filterCommercial = (aggs: RefAggregate[]) =>
    aggs.filter(a => isCommercialProductEligible(enrichment.get(a.referenceCode)?.lineaSag ?? null));

  const comm30 = filterCommercial(agg30);
  const comm60 = filterCommercial(agg60);
  const comm90 = filterCommercial(agg90);
  const commRecent = filterCommercial(aggRecent);
  const commPrevious = filterCommercial(aggPrevious);

  // ── 7. Compute metrics (pure, no DB) ───────────────────────────────────────
  const totalCommercialNetRevenue = commercialPrimary.reduce(
    (sum, a) => sum + Math.max(0, a.netRevenue), 0,
  );

  const aggregatedProducts = buildAggregatedProducts(commercialPrimary, enrichment, totalCommercialNetRevenue);
  const topByUnits = rankProducts(aggregatedProducts, "netUnits", topN);
  const topByRevenue = rankProducts(aggregatedProducts, "netRevenue", topN);
  const salesRates = buildSalesRates(comm30, comm60, comm90, enrichment);
  const momentum = buildMomentum(commRecent, commPrevious, enrichment, momentumConfig);

  // No-sales: uses commercial-filtered aggregates + stock map
  const noSalesRows = buildNoSales(
    commercialPrimary, stockMap, comm30, enrichment, asOf, noSalesWindowDays,
  );

  const noSales: NoSalesResult = {
    inventoryAvailability,
    rows: noSalesRows,
  };

  // Category performance includes ALL lines (including OTROS) for full picture
  const { entries: categoryPerformance, coverage: categoryCoverage } =
    buildCategoryPerformance(aggPrimary, aggRecent, aggPrevious, enrichment, coverageRaw.totalRefs);

  const computeMs = Date.now() - computeStart;

  // ── 8. Resolve store name (Q12) ────────────────────────────────────────────
  const storeName = aggPrimary.length > 0
    ? (await db.storeSaleLineRecord.findFirst({
        where: { organizationId: opts.orgId, storeId: opts.storeId },
        select: { storeName: true },
      }))?.storeName ?? opts.storeId
    : opts.storeId;

  const totalWallClockMs = Date.now() - startTotal;

  return {
    storeId: opts.storeId,
    storeName,
    asOfDate: asOf,

    coverage: {
      dataStatus,
      dataStartDate: coverageRaw.minDate,
      dataEndDate: coverageRaw.maxDate,
      syncedThroughDate: coverageRaw.maxDate,
      dataLagDays: coverageRaw.maxDate ? daysBetween(coverageRaw.maxDate, asOf) : null,
      totalLines: coverageRaw.totalLines,
      totalReferences: coverageRaw.totalRefs,
    },

    commercialUniverse,

    aggregatedProducts,
    topByUnits,
    topByRevenue,
    salesRates,
    momentum,
    noSales,
    categoryPerformance,
    categoryCoverage,

    windowUsed: windowId,
    momentumConfig,
    topN,

    performance: {
      dbQueryCount,
      dbCumulativeMs,
      dbWallClockMs: dbBatchMs,
      engineComputeMs: computeMs,
      totalWallClockMs,
    },
  };
}

function emptyIntelligence(
  storeId: string,
  asOfDate: string,
  windowId: WindowId,
  topN: number,
  momentumConfig: MomentumConfig,
  dataStatus: "NOT_SYNCED" | "NO_DATA",
  perf: IntelligencePerformance,
): StoreProductIntelligence {
  return {
    storeId,
    storeName: storeId,
    asOfDate,
    coverage: {
      dataStatus,
      dataStartDate: null,
      dataEndDate: null,
      syncedThroughDate: null,
      dataLagDays: null,
      totalLines: 0,
      totalReferences: 0,
    },
    commercialUniverse: {
      allSalesRefs: 0,
      windowActiveRefs: 0,
      commercialEligibleRefs: 0,
      excludedRefs: 0,
      excludedRevenue: 0,
      excludedUnits: 0,
      exclusionReasons: {},
    },
    aggregatedProducts: [],
    topByUnits: [],
    topByRevenue: [],
    salesRates: [],
    momentum: [],
    noSales: { inventoryAvailability: "INVENTORY_UNAVAILABLE", rows: [] },
    categoryPerformance: [],
    categoryCoverage: {
      windowActiveReferences: 0,
      allTimeReferences: 0,
      classifiedReferences: 0,
      classifiedRevenuePct: 0,
      unclassifiedReferences: 0,
      unclassifiedRevenuePct: 0,
    },
    windowUsed: windowId,
    momentumConfig,
    topN,
    performance: perf,
  };
}
