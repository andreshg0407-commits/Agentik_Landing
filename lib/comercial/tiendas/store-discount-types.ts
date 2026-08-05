/**
 * lib/comercial/tiendas/store-discount-types.ts
 *
 * AGENTIK-STORES-DISCOUNTS-TAB-01 — Discount types & constants
 *
 * Client-safe: NO "server-only" import.
 * Types and display constants used by both server service and client UI.
 */

// ── Discount tiers ──────────────────────────────────────────────────────────

export type DiscountTier =
  | "NONE"
  | "TEN_PERCENT"
  | "THIRTY_PERCENT"
  | "FIFTY_PERCENT"
  | "SEVENTY_PERCENT"
  | "SIN_FECHA";

export const DISCOUNT_TIER_LABEL: Record<DiscountTier, string> = {
  NONE:             "Sin descuento",
  TEN_PERCENT:      "10%",
  THIRTY_PERCENT:   "30%",
  FIFTY_PERCENT:    "50%",
  SEVENTY_PERCENT:  "70%",
  SIN_FECHA:        "Sin fecha",
};

export const DISCOUNT_TIER_COLOR: Record<DiscountTier, string> = {
  NONE:             "#22c55e", // green
  TEN_PERCENT:      "#3b82f6", // blue
  THIRTY_PERCENT:   "#f59e0b", // amber
  FIFTY_PERCENT:    "#f97316", // orange
  SEVENTY_PERCENT:  "#ef4444", // red
  SIN_FECHA:        "#9ca3af", // gray
};

export const DISCOUNT_TIER_SORT_ORDER: Record<DiscountTier, number> = {
  SEVENTY_PERCENT:  0,
  FIFTY_PERCENT:    1,
  THIRTY_PERCENT:   2,
  TEN_PERCENT:      3,
  NONE:             4,
  SIN_FECHA:        5,
};

// ── Discount rules (pure functions, no server deps) ─────────────────────────

/**
 * @deprecated AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01
 * Legacy hardcoded discount rules. Replaced by EffectiveAgingDiscountPolicy
 * from the effective rule registry. Kept for backward compatibility only.
 */
export const DISCOUNT_RULES: { minDays: number; maxDays: number; percent: number; tier: DiscountTier }[] = [
  { minDays: 0,   maxDays: 89,  percent: 0,  tier: "NONE" },
  { minDays: 90,  maxDays: 179, percent: 10, tier: "TEN_PERCENT" },
  { minDays: 180, maxDays: 269, percent: 30, tier: "THIRTY_PERCENT" },
  { minDays: 270, maxDays: 364, percent: 50, tier: "FIFTY_PERCENT" },
  { minDays: 365, maxDays: Infinity, percent: 70, tier: "SEVENTY_PERCENT" },
];

/**
 * @deprecated AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01
 * Use evaluateAgingDiscount() from store-effective-rule-registry instead.
 */
export function resolveDiscountTier(daysInStore: number | null): { tier: DiscountTier; percent: number } {
  if (daysInStore === null) return { tier: "SIN_FECHA", percent: 0 };
  for (const rule of DISCOUNT_RULES) {
    if (daysInStore >= rule.minDays && daysInStore <= rule.maxDays) {
      return { tier: rule.tier, percent: rule.percent };
    }
  }
  return { tier: "NONE", percent: 0 };
}

export function computeDaysInStore(entryDate: string | null, now: Date = new Date()): number | null {
  if (!entryDate) return null;
  const entry = new Date(entryDate);
  if (isNaN(entry.getTime())) return null;
  const diffMs = now.getTime() - entry.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ── Recommendation type ─────────────────────────────────────────────────────

export type DiscountLineName = "CASTILLITOS" | "LATIN_KIDS" | "ACCESORIOS" | "SIN_CLASIFICAR";

export interface DiscountRecommendation {
  referenceCode:    string;
  description:      string;
  imageUrl:         string | null;
  entryDate:        string | null;
  daysInStore:      number | null;
  storeQty:         number;
  discountPercent:  number;
  discountTier:     DiscountTier;
  canonicalLine:    DiscountLineName;
  group:            string;
  subgroup:         string;
  sizeClass:        string | null;
  variantCount:     number;
  reason:           string;
  /**
   * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01:
   * Per-store SAG comparison. Present when SAG current discount data is available.
   * Each entry shows the current SAG discount vs Agentik target for one store.
   */
  sagComparison?: import("./store-sag-discount-types").StoreDiscountComparison[];
  /** Summary: how many stores still need action (APPLY or INCREASE). */
  sagActionableStores?: number;
  /** Summary: how many stores are already aligned with the Agentik target. */
  sagAlignedStores?: number;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface DiscountKpis {
  totalEvaluated:  number;
  none:            number;
  tenPercent:      number;
  thirtyPercent:   number;
  fiftyPercent:    number;
  seventyPercent:  number;
  sinFecha:        number;
  /**
   * AGENTIK-COMMERCIAL-CD-LINE-GLOBAL-EXCLUSION-01:
   * referencias CD-* (colección especial) retenidas por regla global —
   * nunca evaluadas para descuento automático.
   */
  excludedSpecialCollection: number;
  /** AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01: dynamic discount buckets */
  buckets: Array<{ percent: number; count: number }>;
}

// ── Response ─────────────────────────────────────────────────────────────────

export interface StoreDiscountResponse {
  storeId:       string;
  storeName:     string;
  recommendations: DiscountRecommendation[];
  kpis:          DiscountKpis;
  computedAt:    string;
  /** AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01: set when policy validation fails */
  policyStatus?: "VALID" | "POLICY_INVALID";
  /** Validation errors when policyStatus === "POLICY_INVALID" */
  policyErrors?: string[];
  /**
   * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-CERTIFICATION-01:
   * SAG availability state. AVAILABLE = comparison certified.
   * UNAVAILABLE = SAG failed, no actionable comparison, targets preserved.
   */
  sagComparisonStatus?: import("./store-sag-discount-types").SagComparisonStatus;
  /**
   * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01:
   * SAG discount fetch diagnostics. Present when SAG data was fetched.
   */
  sagFetchResult?: {
    rowCount: number;
    fetchDurationMs: number;
    fetchedAt: string;
  };
  /** Count of recommendations already aligned with SAG (no action needed). */
  sagAlignedTotal?: number;
  /** Count of recommendations requiring action (APPLY or INCREASE). */
  sagActionableTotal?: number;
}

// ── Aging discount evaluation (AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01) ──

export type AgingDiscountStatus = "EVALUATED" | "SIN_FECHA" | "NO_RULE" | "POLICY_INVALID";

export interface AgingDiscountEvaluation {
  referenceCode: string;
  daysInStore: number | null;
  agingSource: "TRANSFER" | "SIN_FECHA";
  matchedRuleId: string | null;
  discountPercent: number | null;
  status: AgingDiscountStatus;
  reason: string;
}

// ── DiscountTier backward compatibility ─────────────────────────────────────

/**
 * AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01
 *
 * Derive legacy DiscountTier from dynamic discountPercent + evaluation status.
 * Used to maintain backward compat with UI consumers that still use
 * DiscountTier for colors, labels, and sort order.
 *
 * IMPORTANT: discountPercent=80 is preserved as canonical data.
 * The compat tier maps it to SEVENTY_PERCENT for legacy display only.
 */
export function deriveDiscountTierCompat(
  percent: number | null,
  status: AgingDiscountStatus,
): DiscountTier {
  if (status === "SIN_FECHA" || status === "POLICY_INVALID") return "SIN_FECHA";
  if (percent === null || percent === 0) return "NONE";
  if (percent <= 10) return "TEN_PERCENT";
  if (percent <= 30) return "THIRTY_PERCENT";
  if (percent <= 50) return "FIFTY_PERCENT";
  return "SEVENTY_PERCENT";
}
