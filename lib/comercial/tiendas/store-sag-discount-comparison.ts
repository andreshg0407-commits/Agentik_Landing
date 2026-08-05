/**
 * lib/comercial/tiendas/store-sag-discount-comparison.ts
 *
 * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01
 *
 * Pure comparison engine: Agentik target discount vs SAG current discount.
 *
 * Client-safe: NO "server-only" import. Pure functions only.
 *
 * Law:
 *   - EXCLUDED reference → EXCLUDED (never generates automatic action)
 *   - AMBIGUOUS SAG → AMBIGUOUS_SAG (never generates automatic action)
 *   - SAG NONE + Agentik > 0 → APPLY
 *   - SAG ACTIVE < Agentik → INCREASE (current → target)
 *   - SAG ACTIVE = Agentik → ALIGNED (no action)
 *   - SAG ACTIVE > Agentik → KEEP_HIGHER_SAG (no auto-decrease)
 *   - SAG ACTIVE > 0 + Agentik = 0 → NO_AGENTIK_ACTION (informational)
 *
 * IMPORTANT — target vs delta:
 *   Agentik's recommended discount is the TARGET percentage, not an additive delta.
 *   currentDiscountPercent=10, targetDiscountPercent=30 means:
 *     "increase FROM 10% TO 30%" — NOT "add 30 more percentage points".
 */

import { isExcludedFromAutomaticPricing } from "../commercial-exclusions";
import type {
  SagDiscountResolution,
  SagComparisonAction,
  StoreDiscountComparison,
  ReferenceDiscountSagComparison,
} from "./store-sag-discount-types";
import { DISCOUNT_ELIGIBLE_STORE_PKS } from "./store-sag-discount-types";

// ── Single comparison ───────────────────────────────────────────────────────

/**
 * Compare a single (reference, store) pair.
 *
 * @param sagResolution  The SAG resolution for this (reference, warehouse)
 * @param targetPercent  Agentik's recommended target discount percentage (0-100)
 * @param isExcluded     Whether the reference is excluded from automatic pricing
 * @returns The resolved action
 */
export function compareSagVsAgentik(
  sagResolution: SagDiscountResolution,
  targetPercent: number,
  isExcluded: boolean,
): SagComparisonAction {
  if (isExcluded) return "EXCLUDED";
  if (sagResolution.status === "AMBIGUOUS") return "AMBIGUOUS_SAG";

  const sagPercent = sagResolution.status === "ACTIVE"
    ? sagResolution.discount.discountPercent
    : null;

  // SAG has no discount
  if (sagPercent === null || sagPercent === 0) {
    if (targetPercent > 0) return "APPLY";
    return "ALIGNED"; // both zero
  }

  // SAG has a discount, Agentik target is 0
  if (targetPercent === 0) return "NO_AGENTIK_ACTION";

  // Both have discounts — compare
  if (sagPercent === targetPercent) return "ALIGNED";
  if (sagPercent < targetPercent) return "INCREASE";
  return "KEEP_HIGHER_SAG";
}

// ── Per-store comparison builder ────────────────────────────────────────────

/**
 * Build a StoreDiscountComparison for a single store.
 */
export function buildStoreComparison(
  storeSlug: string,
  storeName: string,
  warehousePk: number,
  sagResolution: SagDiscountResolution,
  targetPercent: number,
  isExcluded: boolean,
): StoreDiscountComparison {
  const action = compareSagVsAgentik(sagResolution, targetPercent, isExcluded);

  const currentDiscountPercent = sagResolution.status === "ACTIVE"
    ? sagResolution.discount.discountPercent
    : null;

  return {
    storeId: storeSlug,
    storeName,
    warehousePk,
    currentDiscountPercent,
    targetDiscountPercent: targetPercent,
    action,
  };
}

// ── Reference-level aggregated comparison ───────────────────────────────────

/**
 * Build an aggregated comparison for a reference across all eligible stores.
 *
 * @param referenceCode  The product reference code
 * @param description    Product description
 * @param targetPercent  Agentik recommended target discount (same for all stores)
 * @param sagResolutions Map of storeSlug → SagDiscountResolution
 */
export function buildReferenceComparison(
  referenceCode: string,
  description: string,
  targetPercent: number,
  sagResolutions: ReadonlyMap<string, SagDiscountResolution>,
): ReferenceDiscountSagComparison {
  const excluded = isExcludedFromAutomaticPricing(referenceCode);

  const storeActions: StoreDiscountComparison[] = [];

  for (const [slug, { pk, name }] of DISCOUNT_ELIGIBLE_STORE_PKS) {
    const sagRes = sagResolutions.get(slug) ?? { status: "NONE" as const };
    storeActions.push(
      buildStoreComparison(slug, name, pk, sagRes, targetPercent, excluded),
    );
  }

  const counts = {
    storesAligned: 0,
    storesToApply: 0,
    storesToIncrease: 0,
    storesKeepHigher: 0,
    storesAmbiguous: 0,
    storesNoAgentikAction: 0,
  };

  for (const sa of storeActions) {
    switch (sa.action) {
      case "ALIGNED": counts.storesAligned++; break;
      case "APPLY": counts.storesToApply++; break;
      case "INCREASE": counts.storesToIncrease++; break;
      case "KEEP_HIGHER_SAG": counts.storesKeepHigher++; break;
      case "AMBIGUOUS_SAG": counts.storesAmbiguous++; break;
      case "NO_AGENTIK_ACTION": counts.storesNoAgentikAction++; break;
      // EXCLUDED doesn't count toward any action category
    }
  }

  return {
    referenceCode,
    description,
    storeActions,
    ...counts,
    hasActionableStores: counts.storesToApply > 0 || counts.storesToIncrease > 0,
  };
}

// ── Batch comparison ────────────────────────────────────────────────────────

/**
 * Build comparisons for a batch of recommendations against SAG current state.
 *
 * @param recommendations Array of { referenceCode, description, discountPercent }
 * @param sagIndex        SAG discount lookup index (from buildDiscountIndex)
 * @returns Array of ReferenceDiscountSagComparison, one per reference
 */
export function buildBatchComparisons(
  recommendations: readonly {
    referenceCode: string;
    description: string;
    discountPercent: number;
  }[],
  sagIndex: ReadonlyMap<string, import("./store-sag-discount-types").SagActiveDiscount[]>,
): ReferenceDiscountSagComparison[] {
  return recommendations.map(rec => {
    const sagResolutions = new Map<string, SagDiscountResolution>();

    for (const [slug, { pk }] of DISCOUNT_ELIGIBLE_STORE_PKS) {
      const key = `${rec.referenceCode}|${pk}`;
      const entries = sagIndex.get(key);

      if (!entries || entries.length === 0) {
        sagResolutions.set(slug, { status: "NONE" });
      } else if (entries.length === 1) {
        sagResolutions.set(slug, { status: "ACTIVE", discount: entries[0] });
      } else {
        sagResolutions.set(slug, { status: "AMBIGUOUS", discounts: entries });
      }
    }

    return buildReferenceComparison(
      rec.referenceCode,
      rec.description,
      rec.discountPercent,
      sagResolutions,
    );
  });
}
