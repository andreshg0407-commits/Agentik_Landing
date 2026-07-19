/**
 * lib/comercial/tiendas/store-suggestions-service.ts
 *
 * FASE 10 — Server loader for store replenishment suggestions.
 * Bridges StoreNeedsResult + MainWarehouseStock + ProductCatalog → suggestions.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: TIENDAS-REPLENISHMENT-SUGGESTIONS-01
 * Sprint: TIENDAS-REPLACEMENT-INTELLIGENCE-01
 */

import "server-only";

import type { StoreReplenishmentSuggestion, StoreSuggestionsSummary } from "./store-suggestions-types";
import type { MainWarehouseStock } from "./store-needs-types";
import type { CandidateProduct } from "./store-replacement-types";

import { loadStoreNeeds } from "./store-needs-service";
import { buildStoreReplenishmentSuggestions, groupSuggestionsByStore } from "./store-suggestions-engine";
import { SagCurrentProvider } from "./providers/sag-current-provider";
import { prisma } from "@/lib/prisma";
import { resolveBusinessLineId } from "./store-business-lines";

// ── Result type ──────────────────────────────────────────────────────────────

export interface StoreSuggestionsResult {
  suggestions:       StoreReplenishmentSuggestion[];
  summaries:         StoreSuggestionsSummary[];
  storeCount:        number;
  totalTransferFull: number;
  totalTransferPartial: number;
  totalFindReplacement: number;
  totalNoAction:     number;
  totalOverstockReview: number;
  totalTransferUnits: number;
}

// ── Main loader ──────────────────────────────────────────────────────────────

/**
 * Load all replenishment suggestions for an organization.
 *
 * Flow:
 *   1. Load needs (from store-needs-service)
 *   2. Load main warehouse stock (from SAG)
 *   3. Load candidate products (ProductEntity + SaleRecord aggregation)
 *   4. Build suggestions via engine (V2 intelligence when candidates available)
 *   5. Aggregate summaries
 */
export async function loadStoreSuggestions(orgId: string): Promise<StoreSuggestionsResult> {
  // 1. Load needs
  const needsResult = await loadStoreNeeds(orgId);
  if (needsResult.needs.length === 0) return emptyResult();

  // 2. Load main warehouse stock
  const provider = new SagCurrentProvider();
  let mainStock: MainWarehouseStock[] = [];
  try {
    const sagData = await provider.load(orgId);
    mainStock = sagData.mainStock.map(s => ({
      referenceCode: s.referenceCode,
      size:          s.size,
      color:         s.color,
      availableQty:  Math.max(0, s.availableUnits - s.reservedUnits),
    }));
  } catch {
    // If SAG fails, proceed with empty main stock
  }

  // 3. Load candidate products (best-effort)
  const candidateProducts = await loadCandidateProducts(orgId, mainStock);

  // 4. Build suggestions (V2 replacement intelligence when candidates available)
  const suggestions = buildStoreReplenishmentSuggestions(
    needsResult.needs,
    mainStock,
    candidateProducts.length > 0 ? candidateProducts : undefined,
  );

  // 5. Aggregate
  const summaries = groupSuggestionsByStore(suggestions);

  return {
    suggestions,
    summaries,
    storeCount:           needsResult.storeCount,
    totalTransferFull:    suggestions.filter(s => s.suggestedAction === "transfer_full").length,
    totalTransferPartial: suggestions.filter(s => s.suggestedAction === "transfer_partial").length,
    totalFindReplacement: suggestions.filter(s => s.suggestedAction === "find_replacement").length,
    totalNoAction:        suggestions.filter(s => s.suggestedAction === "no_action").length,
    totalOverstockReview: suggestions.filter(s => s.suggestedAction === "overstock_review").length,
    totalTransferUnits:   suggestions.reduce((sum, s) => sum + s.transferQty, 0),
  };
}

// ── Candidate product loading ────────────────────────────────────────────────

/**
 * Load candidate products by joining ProductEntity with PIL stock and SaleRecord.
 *
 * Returns CandidateProduct[] enriched with:
 *   - price (from ProductEntity)
 *   - mainWarehouseQty (aggregated from PIL main warehouse)
 *   - recentSalesQty (aggregated from SaleRecord last 90 days)
 */
async function loadCandidateProducts(
  orgId:     string,
  mainStock: MainWarehouseStock[],
): Promise<CandidateProduct[]> {
  try {
    // Load products with stock > 0 in main warehouse
    const db = prisma as any;

    const products = await db.productEntity.findMany({
      where: { organizationId: orgId },
      select: {
        sku:           true,
        name:          true,
        productLine:   true,
        subgrupoSag:   true,
        price:         true,
      },
    });

    if (!products || products.length === 0) return [];

    // Index main stock by reference (aggregate all variants per reference)
    const refStockMap = new Map<string, number>();
    for (const s of mainStock) {
      const existing = refStockMap.get(s.referenceCode) ?? 0;
      refStockMap.set(s.referenceCode, existing + s.availableQty);
    }

    // Load recent sales (last 90 days) aggregated by productCode
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let salesMap = new Map<string, number>();
    try {
      const salesAgg = await db.saleRecord.groupBy({
        by:    ["productCode"],
        where: {
          organizationId: orgId,
          saleDate:       { gte: ninetyDaysAgo },
          productCode:    { not: null },
        },
        _sum: { units: true },
      });
      for (const row of salesAgg ?? []) {
        if (row.productCode) {
          salesMap.set(row.productCode, row._sum?.units ?? 0);
        }
      }
    } catch {
      // SaleRecord query may fail (table may not exist for all tenants)
    }

    // Build candidate products
    const candidates: CandidateProduct[] = [];
    for (const p of products) {
      const ref = p.sku ?? "";
      if (!ref) continue;

      const mainQty = refStockMap.get(ref) ?? 0;

      candidates.push({
        referenceCode:   ref,
        productName:     p.name ?? ref,
        line:            resolveBusinessLineId(p.productLine),
        subgroup:        p.subgrupoSag || "SIN_SUBGRUPO_SAG",
        category:        p.subgrupoSag || "SIN_SUBGRUPO_SAG",
        productClass:    "textile", // default; heuristic could improve this
        price:           p.price ?? null,
        mainWarehouseQty: mainQty,
        recentSalesQty:  salesMap.get(ref) ?? 0,
      });
    }

    return candidates;
  } catch {
    // If product catalog is not available, return empty (engine uses fallback)
    return [];
  }
}

// ── Empty result ─────────────────────────────────────────────────────────────

function emptyResult(): StoreSuggestionsResult {
  return {
    suggestions:          [],
    summaries:            [],
    storeCount:           0,
    totalTransferFull:    0,
    totalTransferPartial: 0,
    totalFindReplacement: 0,
    totalNoAction:        0,
    totalOverstockReview: 0,
    totalTransferUnits:   0,
  };
}
