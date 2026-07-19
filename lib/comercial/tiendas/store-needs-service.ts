/**
 * lib/comercial/tiendas/store-needs-service.ts
 *
 * FASE 7 — Needs loader for the Tiendas module.
 * Bridges real PIL inventory + policy rules → StoreNeed[].
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: TIENDAS-INVENTORY-02
 */

import "server-only";

import type {
  StoreNeed,
  StoreNeedsSummary,
  InventoryItem,
  MainWarehouseStock,
} from "./store-needs-types";
import type { StorePolicyRule } from "./store-policy-types";

import { calculateStoreNeeds, groupNeedsByStore } from "./store-needs-engine";
import { listStorePolicies } from "./store-policy-service";
import { SagCurrentProvider } from "./providers/sag-current-provider";
import { evaluateCoverage } from "@/lib/comercial/rules/coverage";
import type { CommercialCoverageInput, CommercialCoverageResult } from "@/lib/comercial/rules/coverage";

// ── Main loader ─────────────────────────────────────────────────────────────

export interface StoreNeedsResult {
  needs:          StoreNeed[];
  summaries:      StoreNeedsSummary[];
  storeCount:     number;
  totalOut:       number;
  totalLow:       number;
  totalHealthy:   number;
  totalOverstock: number;
}

/**
 * Load all store needs for an organization.
 *
 * Flow:
 *   1. Load SAG data (stores, inventory, main stock)
 *   2. Load policy rules
 *   3. For each store, map inventory → InventoryItem[]
 *   4. Run needs engine per store
 *   5. Aggregate summaries
 */
export async function loadStoreNeeds(orgId: string): Promise<StoreNeedsResult> {
  const provider = new SagCurrentProvider();

  let sagData;
  try {
    sagData = await provider.load(orgId);
  } catch {
    return emptyResult();
  }

  if (sagData.stores.length === 0) return emptyResult();

  // Load all policy rules
  const policies = await listStorePolicies(orgId);
  const allRules: StorePolicyRule[] = policies.flatMap(p => p.rules);

  // Index main warehouse stock
  const mainStock: MainWarehouseStock[] = sagData.mainStock.map(s => ({
    referenceCode: s.referenceCode,
    size:          s.size,
    color:         s.color,
    availableQty:  Math.max(0, s.availableUnits - s.reservedUnits),
  }));

  // Calculate needs per store
  const allNeeds: StoreNeed[] = [];

  for (const store of sagData.stores) {
    // Filter inventory for this store
    const storeInventory = sagData.inventory.filter(v => v.storeId === store.id);
    if (storeInventory.length === 0) continue;

    // Map StoreInventoryVariant → InventoryItem
    const items: InventoryItem[] = storeInventory.map(v => ({
      productId:     `${v.referenceCode}|${v.size}|${v.color}`,
      referenceCode: v.referenceCode,
      productName:   v.productName,
      line:          v.line,
      subgroup:      v.category, // v.category = real subgrupoSag (from TIENDAS-ADAPTER-REAL-DATA-01)
      category:      v.category,
      productClass:  inferProductClass(v),
      sizeClass:     undefined,
      size:          v.size,
      color:         v.color,
      currentQty:    v.currentUnits,
    }));

    const storeNeeds = calculateStoreNeeds(
      {
        storeId:       store.id,
        storeName:     store.name,
        warehouseId:   store.sagWarehouseCode,
        warehouseName: store.name,
      },
      items,
      mainStock,
      allRules,
    );

    allNeeds.push(...storeNeeds);
  }

  // Sort all needs by priority
  allNeeds.sort((a, b) => b.priorityScore - a.priorityScore);

  const summaries = groupNeedsByStore(allNeeds);

  return {
    needs:          allNeeds,
    summaries,
    storeCount:     sagData.stores.length,
    totalOut:       allNeeds.filter(n => n.status === "out").length,
    totalLow:       allNeeds.filter(n => n.status === "low").length,
    totalHealthy:   allNeeds.filter(n => n.status === "healthy").length,
    totalOverstock: allNeeds.filter(n => n.status === "overstock").length,
  };
}

// ── Product class inference ─────────────────────────────────────────────────

interface VariantLike {
  size: string;
  color: string;
  category: string;
  line: string;
}

function inferProductClass(v: VariantLike): "textile" | "bulky" | "accessory" | "other" {
  const cat = (v.category || "").toUpperCase(); // Now = real subgrupoSag

  // Textile: has real size/color, or subgrupoSag indicates clothing
  if (v.size && v.size !== "SIN_TALLA" && v.color && v.color !== "SIN_COLOR") return "textile";
  if (/PIJAMA|CAMISET|CONJUNT|PANTALON|VESTID|BLUSA|SHORT|LEGGIN|BODY|FALDA|CAMIBUSO|POLO|BUZO|CHAQUETA|BATA|JOGGER|BERMUDA|MAMELUCO/.test(cat)) return "textile";

  // Bulky: large items (SAG linea 5 subgroups)
  if (/CUNA|COCHE|MUEBLE|CORRAL|SILLA|CAMINADOR|MOTO/.test(cat)) return "bulky";

  // Accessory: small items
  if (/ACCESORI|BOLSO|MALET|BIBERON|TETERO|LONCHERA|TERMOS/.test(cat)) return "accessory";

  // Business line fallback
  const lineId = (v.line || "").trim();
  if (lineId === "castillitos" || lineId === "latin_kids") return "textile";
  if (lineId === "accesorios_importacion") return "other";

  return "other";
}

// ── Coverage engine integration ─────────────────────────────────────────────

/**
 * Evaluate coverage for a single product in a store using the
 * Commercial Coverage Rules Engine (single source of truth).
 *
 * This is the authoritative entry point for coverage suggestions.
 * When rules change, results change automatically — no code changes needed.
 */
export function evaluateStoreCoverage(
  orgId: string,
  storeId: string,
  storeName: string,
  item: InventoryItem,
  mainWarehouseQty: number,
  allRules: StorePolicyRule[],
): CommercialCoverageResult {
  const input: CommercialCoverageInput = {
    tenantId: orgId,
    organizationId: orgId,
    storeId,
    storeName,
    productId: item.productId,
    referenceCode: item.referenceCode,
    productName: item.productName,
    productClass: item.productClass,
    businessLine: item.line,
    subgroup: item.subgroup,
    sizeClass: item.sizeClass,
    category: item.category,
    color: item.color,
    currentUnits: item.currentQty,
    sourceAvailableUnits: mainWarehouseQty,
    activeRules: allRules.filter(r => !r.storeId || r.storeId === storeId),
  };

  return evaluateCoverage(input);
}

// ── Empty result ────────────────────────────────────────────────────────────

function emptyResult(): StoreNeedsResult {
  return {
    needs:          [],
    summaries:      [],
    storeCount:     0,
    totalOut:       0,
    totalLow:       0,
    totalHealthy:   0,
    totalOverstock: 0,
  };
}
