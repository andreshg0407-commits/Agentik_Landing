/**
 * lib/inventory/commercial-reference-status.ts
 *
 * COMERCIAL-INVENTORY-CANONICAL-STATUS-01
 *
 * Single source of truth for the question:
 *   "Is this reference commercially available?"
 *
 * Pure TypeScript. No Prisma. No React. No server-only.
 * No side effects. No queries. Fully deterministic.
 */

// ── Canonical status ────────────────────────────────────────────────────────

export type CommercialReferenceStatus =
  | "ACTIVE_AVAILABLE"
  | "ACTIVE_NON_COMMERCIAL"
  | "LOW_ACTIVITY_AVAILABLE"
  | "LOW_ACTIVITY_NON_COMMERCIAL"
  | "DORMANT"
  | "ARCHIVE_REVIEW"
  | "UNKNOWN";

// ── Stock distribution flag (metadata, NOT a status) ────────────────────────

export type StockDistributionFlag =
  | "COMMERCIAL_STOCK_AVAILABLE"
  | "STOCK_ONLY_PRODUCTION"
  | "STOCK_ONLY_STAGING"
  | "STOCK_ONLY_CONTAINER"
  | "STOCK_ONLY_VENDOR_OR_STORE"
  | "NO_STOCK_ANYWHERE"
  | "NO_ACTIVITY_DATA";

// ── Input context (pre-computed data only) ──────────────────────────────────

export interface CommercialReferenceContext {
  /** From reference-lifecycle resolveLifecycleState() */
  lifecycleState: "ACTIVE" | "LOW_ACTIVITY" | "DORMANT" | "ARCHIVE_REVIEW" | "NO_ACTIVITY_DATA";
  /** ka_nl_bodega values where this reference has positive stock */
  warehouseIds: string[];
  /** Positive stock in commercial warehouses (COMMERCIAL_TEXTILE + COMMERCIAL_AVAILABLE_IMPORT) */
  totalCommercialStock: number;
  /** Positive stock in PRODUCTION_ONLY warehouses */
  totalProductionStock: number;
  /** Positive stock in IMPORT_CONTAINER warehouses */
  totalContainerStock: number;
  /** Positive stock in IMPORT_STAGING warehouses */
  totalStagingStock: number;
  /** Positive stock in VENDOR or STORE warehouses (not classified elsewhere) */
  totalOtherStock: number;
  /** From reference-lifecycle resolveLastRelevantActivity() */
  lastRelevantActivity: Date | null;
  /** Data quality flags (e.g. MISSING_LAST_MODIFIED, MISSING_LAST_SALE) */
  dataQualityFlags: string[];
}

// ── Resolver result ─────────────────────────────────────────────────────────

export interface CommercialReferenceResult {
  status: CommercialReferenceStatus;
  reason: string;
  stockDistribution: StockDistributionFlag;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the canonical commercial status for a reference.
 *
 * Deterministic. No side effects. No queries.
 *
 * Precedence (mandatory, never reordered):
 *   1. NO_ACTIVITY_DATA → UNKNOWN
 *   2. ARCHIVE_REVIEW   → ARCHIVE_REVIEW
 *   3. DORMANT           → DORMANT
 *   4. ACTIVE / LOW_ACTIVITY → evaluate commercial stock
 *
 * Stock CANNOT promote a dormant reference to available.
 * Dates CANNOT promote a container-only reference to available.
 */
export function resolveCommercialReferenceStatus(
  ctx: CommercialReferenceContext,
): CommercialReferenceResult {
  const { lifecycleState, totalCommercialStock, totalProductionStock, totalContainerStock, totalStagingStock, totalOtherStock } = ctx;

  const stockFlag = resolveStockDistribution(ctx);

  // ── Precedence 1: NO_ACTIVITY_DATA → UNKNOWN ──
  if (lifecycleState === "NO_ACTIVITY_DATA") {
    return { status: "UNKNOWN", reason: "Sin datos de actividad — no es posible clasificar", stockDistribution: "NO_ACTIVITY_DATA" };
  }

  // ── Precedence 2: ARCHIVE_REVIEW → ARCHIVE_REVIEW (stock irrelevant) ──
  if (lifecycleState === "ARCHIVE_REVIEW") {
    return { status: "ARCHIVE_REVIEW", reason: "Inactividad extrema (>730 dias) — revision de archivo", stockDistribution: stockFlag };
  }

  // ── Precedence 3: DORMANT → DORMANT (stock irrelevant) ──
  if (lifecycleState === "DORMANT") {
    return { status: "DORMANT", reason: "Dormante (366-730 dias sin actividad) — no disponible comercialmente", stockDistribution: stockFlag };
  }

  // ── Precedence 4: ACTIVE / LOW_ACTIVITY → evaluate stock ──

  const hasCommercialStock = totalCommercialStock > 0;
  const hasNonCommercialStock = totalProductionStock > 0 || totalContainerStock > 0 || totalStagingStock > 0 || totalOtherStock > 0;

  if (lifecycleState === "LOW_ACTIVITY") {
    if (hasCommercialStock) {
      return { status: "LOW_ACTIVITY_AVAILABLE", reason: `Baja actividad con stock comercial (${totalCommercialStock} uds)`, stockDistribution: stockFlag };
    }
    if (hasNonCommercialStock) {
      return { status: "LOW_ACTIVITY_NON_COMMERCIAL", reason: "Baja actividad — stock solo en bodegas no comerciales", stockDistribution: stockFlag };
    }
    return { status: "LOW_ACTIVITY_NON_COMMERCIAL", reason: "Baja actividad — sin stock en ninguna bodega", stockDistribution: stockFlag };
  }

  // ACTIVE
  if (hasCommercialStock) {
    return { status: "ACTIVE_AVAILABLE", reason: `Activa con stock comercial (${totalCommercialStock} uds)`, stockDistribution: stockFlag };
  }
  if (hasNonCommercialStock) {
    return { status: "ACTIVE_NON_COMMERCIAL", reason: "Activa — stock solo en bodegas no comerciales", stockDistribution: stockFlag };
  }
  return { status: "ACTIVE_NON_COMMERCIAL", reason: "Activa — sin stock en ninguna bodega", stockDistribution: stockFlag };
}

// ── Stock distribution classification ───────────────────────────────────────

function resolveStockDistribution(ctx: CommercialReferenceContext): StockDistributionFlag {
  if (ctx.lifecycleState === "NO_ACTIVITY_DATA") return "NO_ACTIVITY_DATA";

  if (ctx.totalCommercialStock > 0) return "COMMERCIAL_STOCK_AVAILABLE";

  // No commercial stock — classify by what exists
  if (ctx.totalProductionStock > 0 && ctx.totalContainerStock === 0 && ctx.totalStagingStock === 0 && ctx.totalOtherStock === 0) {
    return "STOCK_ONLY_PRODUCTION";
  }
  if (ctx.totalStagingStock > 0 && ctx.totalProductionStock === 0 && ctx.totalContainerStock === 0 && ctx.totalOtherStock === 0) {
    return "STOCK_ONLY_STAGING";
  }
  if (ctx.totalContainerStock > 0 && ctx.totalProductionStock === 0 && ctx.totalStagingStock === 0 && ctx.totalOtherStock === 0) {
    return "STOCK_ONLY_CONTAINER";
  }
  if (ctx.totalOtherStock > 0 && ctx.totalProductionStock === 0 && ctx.totalContainerStock === 0 && ctx.totalStagingStock === 0) {
    return "STOCK_ONLY_VENDOR_OR_STORE";
  }

  // Mixed non-commercial or truly zero
  const totalAll = ctx.totalProductionStock + ctx.totalContainerStock + ctx.totalStagingStock + ctx.totalOtherStock;
  if (totalAll === 0) return "NO_STOCK_ANYWHERE";

  // Mixed non-commercial: pick the dominant one
  const max = Math.max(ctx.totalProductionStock, ctx.totalContainerStock, ctx.totalStagingStock, ctx.totalOtherStock);
  if (max === ctx.totalContainerStock) return "STOCK_ONLY_CONTAINER";
  if (max === ctx.totalProductionStock) return "STOCK_ONLY_PRODUCTION";
  if (max === ctx.totalStagingStock) return "STOCK_ONLY_STAGING";
  return "STOCK_ONLY_VENDOR_OR_STORE";
}
