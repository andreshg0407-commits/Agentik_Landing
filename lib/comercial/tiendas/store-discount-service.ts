/**
 * lib/comercial/tiendas/store-discount-service.ts
 *
 * AGENTIK-STORES-DISCOUNTS-TAB-01 — Store Discount Recommendation Service
 * AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01 — Real aging from InventoryTransfer
 * AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01 — Dynamic aging discount policy
 * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01 — SAG current discount comparison
 *
 * Identifies references eligible for automatic discount based on their
 * time-in-store (daysInStore = last transfer date into store).
 *
 * Architecture:
 *   - Consumes getCanonicalStoreDetail() for store items/refs
 *   - Consumes loadStoreDiscountAgingFacts() for real aging from transfers
 *   - Consumes buildEffectiveAgingDiscountPolicy() for dynamic discount rules
 *   - Recommendations only — does NOT modify prices or write to DB
 *
 * Aging source (AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01):
 *   - PRIMARY: InventoryTransfer.documentDate (SAG MOVIMIENTOS fuente 34/206)
 *   - NEVER: ProductEntity.createdAtSag (product creation, not store entry)
 *   - FALLBACK: SIN_FECHA if no transfer exists
 *
 * Discount authority (AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01):
 *   - SINGLE AUTHORITY: EffectiveAgingDiscountPolicy from Derrotero registry
 *   - NEVER: DISCOUNT_RULES or CASTILLITOS_AUTOMATIC_MARKDOWN independently
 */

import "server-only";

import { getCanonicalStoreDetail } from "./store-distribution-service";
import type { StoreDistributionItem } from "./store-distribution-types";
import { isExcludedFromAutomaticPricing } from "../commercial-exclusions";
import { loadStoreDiscountAgingFacts } from "./store-discount-aging-service";
import {
  buildEffectiveAgingDiscountPolicy,
  evaluateAgingDiscount,
} from "./store-effective-rule-registry";
import { CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS } from "./store-policy-pack-config";
import { getStoreRules } from "./store-policy-service";
import { fetchActiveSagDiscountsSimple, buildDiscountIndex, resolveSagDiscount } from "./store-sag-discount-adapter";
import { DISCOUNT_ELIGIBLE_STORE_PKS } from "./store-sag-discount-types";
import type { SagActiveDiscount, SagDiscountFetchResult } from "./store-sag-discount-types";
import { compareSagVsAgentik } from "./store-sag-discount-comparison";

// Re-export everything from client-safe types file
export type {
  DiscountTier,
  DiscountLineName,
  DiscountRecommendation,
  DiscountKpis,
  StoreDiscountResponse,
  AgingDiscountEvaluation,
  AgingDiscountStatus,
} from "./store-discount-types";

export {
  DISCOUNT_TIER_LABEL,
  DISCOUNT_TIER_COLOR,
  DISCOUNT_TIER_SORT_ORDER,
  DISCOUNT_RULES,
  resolveDiscountTier,
  computeDaysInStore,
  deriveDiscountTierCompat,
} from "./store-discount-types";

import type {
  DiscountLineName,
  DiscountRecommendation,
  DiscountKpis,
  StoreDiscountResponse,
} from "./store-discount-types";

import {
  DISCOUNT_TIER_SORT_ORDER,
  deriveDiscountTierCompat,
} from "./store-discount-types";

// ── Line classification ──────────────────────────────────────────────────────

function resolveDiscountLine(item: StoreDistributionItem): DiscountLineName {
  if (item.world === "IMPORT") return "ACCESORIOS";
  if (item.canonicalLine === "latin_kids") return "LATIN_KIDS";
  if (item.canonicalLine === "castillitos") return "CASTILLITOS";
  return "SIN_CLASIFICAR";
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function loadStoreDiscounts(
  orgId: string,
  storeId: string,
): Promise<StoreDiscountResponse> {
  const emptyKpis: DiscountKpis = {
    totalEvaluated: 0, none: 0, tenPercent: 0, thirtyPercent: 0,
    fiftyPercent: 0, seventyPercent: 0, sinFecha: 0,
    excludedSpecialCollection: 0, buckets: [],
  };

  const detail = await getCanonicalStoreDetail(orgId, storeId);

  if (!detail) {
    return {
      storeId,
      storeName: storeId,
      recommendations: [],
      kpis: emptyKpis,
      computedAt: new Date().toISOString(),
    };
  }

  const items = detail.items;

  // Consolidate by reference: sum units, collect items
  const refMap = new Map<string, {
    items: StoreDistributionItem[];
    totalQty: number;
  }>();

  for (const item of items) {
    const existing = refMap.get(item.referenceCode);
    if (existing) {
      existing.items.push(item);
      existing.totalQty += item.currentUnits;
    } else {
      refMap.set(item.referenceCode, {
        items: [item],
        totalQty: item.currentUnits,
      });
    }
  }

  // Filter: exclude CD-* and qty <= 0 before aging query
  const eligibleRefs: string[] = [];
  let excludedSpecialCollection = 0;

  for (const [ref, data] of refMap) {
    if (isExcludedFromAutomaticPricing(ref)) {
      excludedSpecialCollection++;
      continue;
    }
    if (data.totalQty <= 0) continue;
    eligibleRefs.push(ref);
  }

  // AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01:
  // Resolve aging from InventoryTransfer records (not createdAtSag).
  const agingFacts = await loadStoreDiscountAgingFacts(orgId, storeId, eligibleRefs);

  // AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01:
  // Build effective aging discount policy from Derrotero (1x per store)
  let persistedRules: import("./store-policy-types").StorePolicyRule[] = [];
  try {
    persistedRules = await getStoreRules(orgId, storeId);
  } catch {
    // No persisted rules — use defaults only
  }

  const evaluationDate = new Date().toISOString().slice(0, 10);
  const { policy, errors: policyErrors } = buildEffectiveAgingDiscountPolicy(
    CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS,
    persistedRules,
    storeId,
    evaluationDate,
  );

  // AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01 §1: FAIL CLOSED
  // Invalid policy → zero recommendations. Never evaluate with a partial/broken policy.
  if (policyErrors.length > 0) {
    return {
      storeId,
      storeName: detail.store.name,
      recommendations: [],
      kpis: {
        ...emptyKpis,
        totalEvaluated: eligibleRefs.length,
        excludedSpecialCollection,
      },
      computedAt: new Date().toISOString(),
      policyStatus: "POLICY_INVALID",
      policyErrors: policyErrors.map(e => e.message),
    };
  }

  // Evaluate N references in memory (no N+1)
  const recommendations: DiscountRecommendation[] = [];

  for (const ref of eligibleRefs) {
    const data = refMap.get(ref)!;
    const first = data.items[0];

    const fact = agingFacts.get(ref);
    const daysInStore = fact?.daysInStore ?? null;
    const agingSource = fact?.source ?? "SIN_FECHA";

    // Evaluate using effective policy (SINGLE AUTHORITY)
    const evaluation = evaluateAgingDiscount(ref, daysInStore, agingSource, policy);

    // Derive legacy tier for backward compat (no UI changes)
    const compatTier = deriveDiscountTierCompat(evaluation.discountPercent, evaluation.status);

    recommendations.push({
      referenceCode:   ref,
      description:     first.productName,
      imageUrl:        first.imageUrl,
      entryDate:       fact?.lastTransferDate ?? null,
      daysInStore,
      storeQty:        data.totalQty,
      discountPercent: evaluation.discountPercent ?? 0,
      discountTier:    compatTier,
      canonicalLine:   resolveDiscountLine(first),
      group:           first.group,
      subgroup:        first.subgroup,
      sizeClass:       first.sizeClass,
      variantCount:    data.items.length,
      reason:          evaluation.reason,
    });
  }

  // ── AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01: Enrich with SAG current ──
  // AGENTIK-STORES-DISCOUNTS-SAG-AWARE-CERTIFICATION-01: fail-closed on SAG outage.
  // If SAG is unavailable, targets are preserved but comparison is NOT certified.
  let sagFetchResult: SagDiscountFetchResult | null = null;
  let sagIndex: Map<string, SagActiveDiscount[]> | null = null;
  let sagComparisonStatus: "AVAILABLE" | "UNAVAILABLE" = "UNAVAILABLE";

  try {
    sagFetchResult = await fetchActiveSagDiscountsSimple();
    sagIndex = buildDiscountIndex(sagFetchResult.discounts);
    sagComparisonStatus = "AVAILABLE";
  } catch (err) {
    console.warn(
      `[store-discounts] SAG discount fetch failed for ${storeId}:`,
      err instanceof Error ? err.message : err,
    );
    // sagComparisonStatus stays UNAVAILABLE — no actionable comparison
  }

  // Enrich each recommendation with per-store SAG comparison
  let sagAlignedTotal = 0;
  let sagActionableTotal = 0;

  if (sagIndex) {
    for (const rec of recommendations) {
      const excluded = isExcludedFromAutomaticPricing(rec.referenceCode);
      const storeComparisons: import("./store-sag-discount-types").StoreDiscountComparison[] = [];
      let actionable = 0;
      let aligned = 0;

      for (const [slug, { pk, name }] of DISCOUNT_ELIGIBLE_STORE_PKS) {
        const sagRes = resolveSagDiscount(sagIndex, rec.referenceCode, pk);
        const action = compareSagVsAgentik(sagRes, rec.discountPercent, excluded);

        const currentPercent = sagRes.status === "ACTIVE"
          ? sagRes.discount.discountPercent
          : null;

        storeComparisons.push({
          storeId: slug,
          storeName: name,
          warehousePk: pk,
          currentDiscountPercent: currentPercent,
          targetDiscountPercent: rec.discountPercent,
          action,
        });

        if (action === "APPLY" || action === "INCREASE") actionable++;
        if (action === "ALIGNED") aligned++;
      }

      rec.sagComparison = storeComparisons;
      rec.sagActionableStores = actionable;
      rec.sagAlignedStores = aligned;

      if (actionable > 0) sagActionableTotal++;
      if (aligned === storeComparisons.length && storeComparisons.length > 0) sagAlignedTotal++;
    }
  }

  // Sort: highest discount first, then most days, then most qty
  recommendations.sort((a, b) => {
    const tierDiff = DISCOUNT_TIER_SORT_ORDER[a.discountTier] - DISCOUNT_TIER_SORT_ORDER[b.discountTier];
    if (tierDiff !== 0) return tierDiff;
    const daysDiff = (b.daysInStore ?? -1) - (a.daysInStore ?? -1);
    if (daysDiff !== 0) return daysDiff;
    return b.storeQty - a.storeQty;
  });

  // Build KPIs — legacy named fields + dynamic buckets
  const bucketMap = new Map<number, number>();
  for (const r of recommendations) {
    const p = r.discountPercent;
    bucketMap.set(p, (bucketMap.get(p) ?? 0) + 1);
  }
  const buckets = [...bucketMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([percent, count]) => ({ percent, count }));

  const kpis: DiscountKpis = {
    totalEvaluated:  recommendations.length,
    none:            recommendations.filter(r => r.discountTier === "NONE").length,
    tenPercent:      recommendations.filter(r => r.discountTier === "TEN_PERCENT").length,
    thirtyPercent:   recommendations.filter(r => r.discountTier === "THIRTY_PERCENT").length,
    fiftyPercent:    recommendations.filter(r => r.discountTier === "FIFTY_PERCENT").length,
    seventyPercent:  recommendations.filter(r => r.discountTier === "SEVENTY_PERCENT").length,
    sinFecha:        recommendations.filter(r => r.discountTier === "SIN_FECHA").length,
    excludedSpecialCollection,
    buckets,
  };

  return {
    storeId,
    storeName: detail.store.name,
    recommendations,
    kpis,
    computedAt: new Date().toISOString(),
    policyStatus: "VALID",
    sagComparisonStatus,
    ...(sagFetchResult ? {
      sagFetchResult: {
        rowCount: sagFetchResult.rowCount,
        fetchDurationMs: sagFetchResult.fetchDurationMs,
        fetchedAt: sagFetchResult.fetchedAt,
      },
      sagAlignedTotal,
      sagActionableTotal,
    } : {}),
  };
}
