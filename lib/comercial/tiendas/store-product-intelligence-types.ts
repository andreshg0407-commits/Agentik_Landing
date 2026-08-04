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

  /** Top N by net units — COMMERCIAL_PRODUCT_UNIVERSE only */
  topByUnits: TopProductEntry[];
  /** Top N by net revenue — COMMERCIAL_PRODUCT_UNIVERSE only */
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
