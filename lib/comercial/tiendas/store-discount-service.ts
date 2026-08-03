/**
 * lib/comercial/tiendas/store-discount-service.ts
 *
 * AGENTIK-STORES-DISCOUNTS-TAB-01 — Store Discount Recommendation Service
 * AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01 — Real aging from InventoryTransfer
 *
 * Identifies references eligible for automatic discount based on their
 * time-in-store (daysInStore = last transfer date into store).
 *
 * Architecture:
 *   - Consumes getCanonicalStoreDetail() for store items/refs
 *   - Consumes loadStoreDiscountAgingFacts() for real aging from transfers
 *   - Recommendations only — does NOT modify prices or write to DB
 *
 * Aging source (AGENTIK-STORES-DISCOUNTS-AGING-SOURCE-01):
 *   - PRIMARY: InventoryTransfer.documentDate (SAG MOVIMIENTOS fuente 34/206)
 *   - NEVER: ProductEntity.createdAtSag (product creation, not store entry)
 *   - FALLBACK: SIN_FECHA if no transfer exists
 */

import "server-only";

import { getCanonicalStoreDetail } from "./store-distribution-service";
import type { StoreDistributionItem } from "./store-distribution-types";
import { isExcludedFromAutomaticPricing } from "../commercial-exclusions";
import { loadStoreDiscountAgingFacts } from "./store-discount-aging-service";

// Re-export everything from client-safe types file
export type {
  DiscountTier,
  DiscountLineName,
  DiscountRecommendation,
  DiscountKpis,
  StoreDiscountResponse,
} from "./store-discount-types";

export {
  DISCOUNT_TIER_LABEL,
  DISCOUNT_TIER_COLOR,
  DISCOUNT_TIER_SORT_ORDER,
  DISCOUNT_RULES,
  resolveDiscountTier,
  computeDaysInStore,
} from "./store-discount-types";

import type {
  DiscountTier,
  DiscountLineName,
  DiscountRecommendation,
  DiscountKpis,
  StoreDiscountResponse,
} from "./store-discount-types";

import {
  DISCOUNT_TIER_SORT_ORDER,
  resolveDiscountTier,
} from "./store-discount-types";

// ── Line classification ──────────────────────────────────────────────────────

function resolveDiscountLine(item: StoreDistributionItem): DiscountLineName {
  if (item.world === "IMPORT") return "ACCESORIOS";
  if (item.canonicalLine === "latin_kids") return "LATIN_KIDS";
  if (item.canonicalLine === "castillitos") return "CASTILLITOS";
  return "SIN_CLASIFICAR";
}

// ── Reason builder ───────────────────────────────────────────────────────────

function buildReason(daysInStore: number | null, tier: DiscountTier, percent: number): string {
  if (tier === "SIN_FECHA") return "Sin fecha de ingreso disponible. No se puede calcular descuento.";
  if (tier === "NONE") return `${daysInStore} dias en tienda. Sin descuento (menos de 90 dias).`;
  return `${daysInStore} dias en tienda. Descuento recomendado: ${percent}%.`;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function loadStoreDiscounts(
  orgId: string,
  storeId: string,
): Promise<StoreDiscountResponse> {
  const detail = await getCanonicalStoreDetail(orgId, storeId);

  if (!detail) {
    return {
      storeId,
      storeName: storeId,
      recommendations: [],
      kpis: { totalEvaluated: 0, none: 0, tenPercent: 0, thirtyPercent: 0, fiftyPercent: 0, seventyPercent: 0, sinFecha: 0, excludedSpecialCollection: 0 },
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

  const recommendations: DiscountRecommendation[] = [];

  for (const ref of eligibleRefs) {
    const data = refMap.get(ref)!;
    const first = data.items[0];

    // Aging from transfer records — NOT from item.entryDate
    const fact = agingFacts.get(ref);
    const daysInStore = fact?.daysInStore ?? null;
    const { tier, percent } = resolveDiscountTier(daysInStore);
    const reason = buildReason(daysInStore, tier, percent);

    recommendations.push({
      referenceCode:   ref,
      description:     first.productName,
      imageUrl:        first.imageUrl,
      entryDate:       fact?.lastTransferDate ?? null,
      daysInStore,
      storeQty:        data.totalQty,
      discountPercent: percent,
      discountTier:    tier,
      canonicalLine:   resolveDiscountLine(first),
      group:           first.group,
      subgroup:        first.subgroup,
      sizeClass:       first.sizeClass,
      variantCount:    data.items.length,
      reason,
    });
  }

  // Sort: highest discount first, then most days, then most qty
  recommendations.sort((a, b) => {
    const tierDiff = DISCOUNT_TIER_SORT_ORDER[a.discountTier] - DISCOUNT_TIER_SORT_ORDER[b.discountTier];
    if (tierDiff !== 0) return tierDiff;
    const daysDiff = (b.daysInStore ?? -1) - (a.daysInStore ?? -1);
    if (daysDiff !== 0) return daysDiff;
    return b.storeQty - a.storeQty;
  });

  // Build KPIs
  const kpis: DiscountKpis = {
    totalEvaluated:  recommendations.length,
    none:            recommendations.filter(r => r.discountTier === "NONE").length,
    tenPercent:      recommendations.filter(r => r.discountTier === "TEN_PERCENT").length,
    thirtyPercent:   recommendations.filter(r => r.discountTier === "THIRTY_PERCENT").length,
    fiftyPercent:    recommendations.filter(r => r.discountTier === "FIFTY_PERCENT").length,
    seventyPercent:  recommendations.filter(r => r.discountTier === "SEVENTY_PERCENT").length,
    sinFecha:        recommendations.filter(r => r.discountTier === "SIN_FECHA").length,
    excludedSpecialCollection,
  };

  return {
    storeId,
    storeName: detail.store.name,
    recommendations,
    kpis,
    computedAt: new Date().toISOString(),
  };
}
