/**
 * lib/comercial/tiendas/store-sag-discount-types.ts
 *
 * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01
 *
 * Types for the SAG CURRENT active discount source.
 * Client-safe: NO "server-only" import. Pure types and constants only.
 *
 * SAG authority: v_articulos_descuento (view over ARTICULOS_DESCUENTOS)
 * Granularity: reference x warehouse x effective date range
 * Resolution: exactly ONE active row per (reference, warehouse) — certified zero duplicates.
 */

// ── SAG active discount record ──────────────────────────────────────────────

export interface SagActiveDiscount {
  /** Reference code (k_sc_codigo_articulo from SAG) */
  readonly referenceCode: string;
  /** SAG warehouse business code (CodigoBodega = ss_codigo) */
  readonly warehouseCode: string;
  /** SAG warehouse internal PK (ka_nl_bodega) */
  readonly warehousePk: number;
  /** SAG warehouse display name (NombreBodega) */
  readonly warehouseName: string;
  /** Discount percentage 0-100 (PorcentajeDescuento) */
  readonly discountPercent: number;
  /** Effective start date ISO string (FechaInicial) */
  readonly effectiveFrom: string;
  /** Effective end date ISO string (FechaFinal) */
  readonly effectiveTo: string;
}

// ── Resolution result (discriminated union — fail-closed) ───────────────────

/** No active discount configured in SAG for this reference x warehouse. */
export interface SagDiscountNone {
  readonly status: "NONE";
}

/** Exactly one active discount found — certified. */
export interface SagDiscountActive {
  readonly status: "ACTIVE";
  readonly discount: SagActiveDiscount;
}

/**
 * More than one active discount row found for the same (reference, warehouse).
 * FAIL CLOSED: no automatic recommendation. Surface as diagnostic attention state.
 * Current data has zero cases, but this is a schema safety net, not a permanent guarantee.
 */
export interface SagDiscountAmbiguous {
  readonly status: "AMBIGUOUS";
  readonly discounts: readonly SagActiveDiscount[];
}

export type SagDiscountResolution =
  | SagDiscountNone
  | SagDiscountActive
  | SagDiscountAmbiguous;

// ── Comparison action (Agentik target vs SAG current) ───────────────────────

export type SagComparisonAction =
  /** SAG has no discount, Agentik recommends one → apply new discount */
  | "APPLY"
  /** SAG has lower discount than Agentik target → increase to target */
  | "INCREASE"
  /** SAG matches Agentik target → already aligned, no action needed */
  | "ALIGNED"
  /** SAG has higher discount than Agentik target → do NOT auto-decrease */
  | "KEEP_HIGHER_SAG"
  /** Agentik target is 0 but SAG has active discount → informational only */
  | "NO_AGENTIK_ACTION"
  /** SAG resolution is AMBIGUOUS → no automatic recommendation */
  | "AMBIGUOUS_SAG"
  /** Reference excluded from automatic pricing (CD-*) → no suggestion */
  | "EXCLUDED";

// ── Per-store comparison result ─────────────────────────────────────────────

export interface StoreDiscountComparison {
  /** Store slug (e.g. "centro", "san_diego") */
  readonly storeId: string;
  /** Store display name */
  readonly storeName: string;
  /** SAG warehouse internal PK for this store */
  readonly warehousePk: number;
  /** Current SAG discount percentage (null if NONE) */
  readonly currentDiscountPercent: number | null;
  /** Agentik recommended target discount percentage */
  readonly targetDiscountPercent: number;
  /** Resolved action */
  readonly action: SagComparisonAction;
}

// ── Reference-level aggregated result ───────────────────────────────────────

export interface ReferenceDiscountSagComparison {
  readonly referenceCode: string;
  readonly description: string;
  /** Per-store comparisons (one per eligible retail store) */
  readonly storeActions: readonly StoreDiscountComparison[];
  /** Summary counts */
  readonly storesAligned: number;
  readonly storesToApply: number;
  readonly storesToIncrease: number;
  readonly storesKeepHigher: number;
  readonly storesAmbiguous: number;
  readonly storesNoAgentikAction: number;
  /** True if at least one store requires action (APPLY or INCREASE) */
  readonly hasActionableStores: boolean;
}

// ── SAG availability status ──────────────────────────────────────────────────

/**
 * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-CERTIFICATION-01:
 * Explicit availability state for SAG discount comparison.
 *
 * AVAILABLE: SAG responded, comparison is certified.
 * UNAVAILABLE: SAG fetch failed — Agentik target preserved but comparison
 *   is NOT certified. No APPLY/INCREASE actions are valid.
 */
export type SagComparisonStatus = "AVAILABLE" | "UNAVAILABLE";

// ── Fetch diagnostics ───────────────────────────────────────────────────────

export interface SagDiscountFetchResult {
  readonly discounts: readonly SagActiveDiscount[];
  readonly rowCount: number;
  readonly fetchDurationMs: number;
  readonly fetchedAt: string;
}

// ── Store warehouse mapping for discount comparison ─────────────────────────

/**
 * Eligible retail store warehouses for discount comparison.
 * Maps store slug → SAG warehouse PK (ka_nl_bodega).
 *
 * Source: warehouse-master.ts (businessType === "STORE")
 * Verified against SAG BODEGAS table in forensic audit.
 */
export const DISCOUNT_ELIGIBLE_STORE_PKS: ReadonlyMap<string, { pk: number; name: string }> = new Map([
  ["centro",    { pk: 31, name: "CENTRO" }],
  ["san_diego", { pk: 11, name: "SAN DIEGO" }],
  ["gran_plaza",{ pk: 32, name: "GRAN PLAZA" }],
  ["caldas",    { pk: 39, name: "CALDAS" }],
]);

/**
 * Reverse: SAG ka_nl_bodega → store slug.
 * Used when indexing SAG discount rows by warehouse PK.
 */
export const SAG_PK_TO_STORE_SLUG: ReadonlyMap<number, string> = new Map(
  [...DISCOUNT_ELIGIBLE_STORE_PKS.entries()].map(([slug, { pk }]) => [pk, slug]),
);
