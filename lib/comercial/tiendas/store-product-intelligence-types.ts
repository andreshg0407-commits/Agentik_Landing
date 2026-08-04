/**
 * lib/comercial/tiendas/store-product-intelligence-types.ts
 *
 * AGENTIK-STORES-PRODUCT-INTELLIGENCE-ENGINE-01
 *
 * Client-safe domain types for store product intelligence.
 * NO server-only import. Pure types only.
 *
 * Domain orientation: metrics, not presentation.
 * No labels, colors, cards, or copy.
 */

// ══════════════════════════════════════════════════════════════════════════════
// Discriminated status types
// ══════════════════════════════════════════════════════════════════════════════

export type ProductDataStatus = "READY" | "PARTIAL_DATA" | "NO_DATA" | "NOT_SYNCED";

export type InventoryAvailability = "READY" | "INVENTORY_UNAVAILABLE";

export type ProductMomentumStatus =
  | "ACCELERATING"
  | "DECELERATING"
  | "STABLE"
  | "NEW_ACTIVITY"
  | "NO_ACTIVITY";

export type NoSalesClassification =
  | "CURRENT_STOCK_NO_RECENT_SALES"
  | "RECENTLY_RECEIVED"
  | "NO_CURRENT_STOCK"
  | "HAS_RECENT_SALES"
  | "NO_DATA";

// ══════════════════════════════════════════════════════════════════════════════
// Commercial eligibility
// ══════════════════════════════════════════════════════════════════════════════

/** Lines excluded from commercial rankings but preserved in ALL_SALES_FACTS */
export const NON_COMMERCIAL_LINES: ReadonlySet<string> = new Set(["OTROS"]);

/**
 * Determines if a reference is eligible for commercial rankings.
 * Derives from canonical SAG taxonomy (lineaSag), not from regex or heuristics.
 *
 * ALL_SALES_FACTS: financial reconciliation uses all refs including OTROS.
 * COMMERCIAL_PRODUCT_UNIVERSE: rankings, momentum, rates use only commercial refs.
 */
export function isCommercialProductEligible(lineaSag: string | null): boolean {
  if (lineaSag === null) return true; // unclassified refs stay in universe until classified
  return !NON_COMMERCIAL_LINES.has(lineaSag);
}

// ══════════════════════════════════════════════════════════════════════════════
// Window model
// ══════════════════════════════════════════════════════════════════════════════

export type WindowId = "LAST_30_DAYS" | "LAST_60_DAYS" | "LAST_90_DAYS" | "YTD";

export interface TimeWindow {
  id: WindowId;
  dateFrom: string; // ISO date
  dateTo: string;   // ISO date (inclusive)
}

export interface ComparisonWindows {
  recent: TimeWindow;
  previous: TimeWindow;
}

// ══════════════════════════════════════════════════════════════════════════════
// Product reference enrichment
// ══════════════════════════════════════════════════════════════════════════════

export interface ProductReferenceEnrichment {
  referenceCode: string;
  productName: string;       // from ProductEntity.name (authority)
  heroImageUrl: string | null;
  lineaSag: string | null;
  grupoSag: string | null;
  subgrupoSag: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Top products
// ══════════════════════════════════════════════════════════════════════════════

export interface TopProductEntry {
  referenceCode: string;
  productName: string;
  heroImageUrl: string | null;
  lineaSag: string | null;
  grupoSag: string | null;
  subgrupoSag: string | null;

  netUnits: number;
  netRevenue: number;
  invoiceCount: number;
  lastSaleDate: string | null; // MAX(documentDate) of FACTURA only
  rank: number;
  shareOfStoreRevenuePct: number; // product.netRevenue / totalStoreNetRevenue * 100
}

// ══════════════════════════════════════════════════════════════════════════════
// Aggregated collection + canonical ranking law
// (AGENTIK-STORES-PRODUCT-INTELLIGENCE-UNIVERSE-RANKING-01)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * One entry per commercial reference for the PRIMARY window, BEFORE any
 * Top-N slice. Net values are post-NC (invoice − credit note), verbatim from
 * the engine's SQL aggregation — negatives/zeros included, no clamps.
 * shareOfStoreRevenuePct is precomputed once by the engine against the
 * certified store denominator; downstream layers never recompute it.
 *
 * This collection enables REAL rankings over any eligible sub-universe of
 * references (e.g. commercial worlds derived from canonical taxonomy) via
 * rankProducts — without new queries and without duplicating ranking law.
 */
export type AggregatedProductEntry = Omit<TopProductEntry, "rank">;

/**
 * CANONICAL ranking law — single implementation for engine and pure domain
 * layers. Pure: no clock, no DB, no mutation of the input.
 *
 * Top units:   netUnits DESC, netRevenue DESC, referenceCode ASC
 * Top revenue: netRevenue DESC, netUnits DESC, referenceCode ASC
 *
 * Entries with net <= 0 in the ranked dimension are excluded from the ranking
 * (certified law — unchanged). Returns entries re-ranked 1..N.
 */
export function rankProducts(
  entries: readonly AggregatedProductEntry[],
  sortBy: "netUnits" | "netRevenue",
  topN: number,
): TopProductEntry[] {
  const eligible = entries.filter(a => (sortBy === "netUnits" ? a.netUnits : a.netRevenue) > 0);
  const sorted = [...eligible].sort((a, b) => {
    const primary = sortBy === "netUnits"
      ? b.netUnits - a.netUnits
      : b.netRevenue - a.netRevenue;
    if (primary !== 0) return primary;
    const secondary = sortBy === "netUnits"
      ? b.netRevenue - a.netRevenue
      : b.netUnits - a.netUnits;
    if (secondary !== 0) return secondary;
    return a.referenceCode.localeCompare(b.referenceCode);
  });
  return sorted.slice(0, Math.max(0, topN)).map((a, idx) => ({ ...a, rank: idx + 1 }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Sales rate
// ══════════════════════════════════════════════════════════════════════════════

export interface SalesRateEntry {
  referenceCode: string;
  productName: string;
  lineaSag: string | null;

  salesRate30d: number; // netUnits in last 30d / 30
  salesRate60d: number;
  salesRate90d: number;

  netUnits30d: number;
  netUnits60d: number;
  netUnits90d: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Momentum
// ══════════════════════════════════════════════════════════════════════════════

export interface MomentumConfig {
  /** Window size in days for recent vs previous comparison */
  windowDays: number;
  /** Threshold for STABLE classification (absolute growthPct) — null = no STABLE, always ACCELERATING or DECELERATING */
  stabilityThresholdPct: number | null;
}

export interface MomentumEntry {
  referenceCode: string;
  productName: string;
  lineaSag: string | null;

  recentNetUnits: number;
  previousNetUnits: number;
  absoluteDelta: number;
  growthPct: number | null; // null when previous=0 and recent=0
  status: ProductMomentumStatus;

  windowDays: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// No sales
// ══════════════════════════════════════════════════════════════════════════════

export interface NoSalesResult {
  inventoryAvailability: InventoryAvailability;
  rows: NoSalesEntry[];
}

export interface NoSalesEntry {
  referenceCode: string;
  productName: string;
  lineaSag: string | null;

  currentStock: number;
  daysInStore: number | null; // from PIL entryDate, null if unknown
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  classification: NoSalesClassification;
}

// ══════════════════════════════════════════════════════════════════════════════
// Category / line performance
// ══════════════════════════════════════════════════════════════════════════════

export interface CategoryPerformanceEntry {
  /** Taxonomy level: "line" | "group" | "subgroup" */
  level: "line" | "group" | "subgroup";
  name: string;
  /** Parent (null for line level) */
  parentName: string | null;

  referenceCount: number;
  netUnits: number;
  netRevenue: number;
  sharePct: number; // of total classified revenue

  netUnitsRecent30d: number;
  netUnitsPrevious30d: number;
  growthPct: number | null;
}

export interface CategoryCoverage {
  /** Refs with activity in the selected window */
  windowActiveReferences: number;
  /** All-time refs across all synced data */
  allTimeReferences: number;
  /** Of windowActiveReferences, how many have lineaSag populated */
  classifiedReferences: number;
  classifiedRevenuePct: number;
  unclassifiedReferences: number;
  unclassifiedRevenuePct: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Commercial universe coverage
// ══════════════════════════════════════════════════════════════════════════════

export interface CommercialUniverseCoverage {
  /** Total refs in StoreSaleLineRecord for this store (all time) */
  allSalesRefs: number;
  /** Refs active in the selected window */
  windowActiveRefs: number;
  /** Of window active, how many are commercial eligible */
  commercialEligibleRefs: number;
  /** Of window active, how many are excluded (OTROS/non-merchandise) */
  excludedRefs: number;
  /** Revenue from excluded refs (for reconciliation) */
  excludedRevenue: number;
  /** Units from excluded refs */
  excludedUnits: number;
  /** Reasons for exclusion (lineaSag → count) */
  exclusionReasons: Record<string, number>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Data coverage / freshness
// ══════════════════════════════════════════════════════════════════════════════

export interface DataCoverage {
  dataStatus: ProductDataStatus;
  dataStartDate: string | null;
  dataEndDate: string | null;
  syncedThroughDate: string | null;
  dataLagDays: number | null; // asOfDate - syncedThroughDate
  totalLines: number;
  totalReferences: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Performance metrics
// ══════════════════════════════════════════════════════════════════════════════

export interface IntelligencePerformance {
  dbQueryCount: number;
  /** Cumulative time across all DB queries (may exceed wallClockMs when parallel) */
  dbCumulativeMs: number;
  /** Wall clock time for all DB queries (parallel queries overlap) */
  dbWallClockMs: number;
  engineComputeMs: number;
  totalWallClockMs: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Top-level intelligence result
// ══════════════════════════════════════════════════════════════════════════════

export interface StoreProductIntelligence {
  storeId: string;
  storeName: string;
  asOfDate: string; // ISO date used for all window calculations

  coverage: DataCoverage;
  commercialUniverse: CommercialUniverseCoverage;

  /**
   * FULL aggregated commercial collection for the primary window (pre-slice,
   * sorted referenceCode ASC for payload determinism). Source of truth for
   * per-universe rankings downstream via rankProducts.
   */
  aggregatedProducts: AggregatedProductEntry[];

  /** Top N by net units — COMMERCIAL_PRODUCT_UNIVERSE only (= rankProducts(aggregatedProducts, "netUnits", topN)) */
  topByUnits: TopProductEntry[];
  /** Top N by net revenue — COMMERCIAL_PRODUCT_UNIVERSE only (= rankProducts(aggregatedProducts, "netRevenue", topN)) */
  topByRevenue: TopProductEntry[];

  /** Sales rate for commercial references with activity */
  salesRates: SalesRateEntry[];

  /** Momentum comparison — COMMERCIAL_PRODUCT_UNIVERSE only */
  momentum: MomentumEntry[];

  /** References with no recent sales that have current stock */
  noSales: NoSalesResult;

  /** Category performance by line — commercial refs only */
  categoryPerformance: CategoryPerformanceEntry[];
  categoryCoverage: CategoryCoverage;

  /** Configuration used */
  windowUsed: WindowId;
  momentumConfig: MomentumConfig;
  topN: number;

  performance: IntelligencePerformance;
}
