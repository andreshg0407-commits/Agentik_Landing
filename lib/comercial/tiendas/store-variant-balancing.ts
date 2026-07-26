/**
 * lib/comercial/tiendas/store-variant-balancing.ts
 *
 * Pure variant-level balancing engine for store replenishment and replacement.
 *
 * Given a reference's store variants, warehouse variants, and a target qty,
 * distributes units across variants prioritizing absent sizes, then lowest
 * stock, then color diversity. Uses round-robin allocation.
 *
 * No DB, no SOAP, no side effects. All data comes via parameters.
 *
 * Sprint: AGENTIK-STORES-NEEDS-VARIANT-BALANCING-01
 */

import type {
  StoreVariantSnapshot,
  VariantAllocation,
  VariantAllocationSuggestion,
  VariantBalanceQuality,
  ReplacementVariant,
} from "./store-distribution-types";

// ── Commercial size sort (shared with store-distribution-service) ─────────

const BABY_SIZE_ORDER: Record<string, number> = {
  "0-3": 1, "3-6": 2, "6-9": 3, "9-12": 4, "12-18": 5, "18-24": 6,
};

function commercialSizeRank(size: string | null): number {
  if (!size || size === "SIN_TALLA") return 1000;
  if (BABY_SIZE_ORDER[size]) return BABY_SIZE_ORDER[size];
  const num = parseInt(size, 10);
  if (!isNaN(num) && num >= 1 && num <= 20) return 100 + num;
  const upper = size.toUpperCase();
  if (upper === "SMALL" || upper === "PEQUEÑO") return 200;
  if (upper === "MEDIUM" || upper === "MEDIANO") return 201;
  if (upper === "LARGE" || upper === "GRANDE") return 202;
  const alpha: Record<string, number> = { XS: 300, S: 301, M: 302, L: 303, XL: 304, XXL: 305 };
  if (alpha[upper]) return alpha[upper];
  return 800;
}

// ── Types for balancing inputs ───────────────────────────────────────────

interface WarehouseVariant {
  size:  string;
  color: string;
  qty:   number;  // available units
}

interface BalancingInput {
  requestedQty:        number;
  maxUnitsPerRef:      number;
  currentStoreTotal:   number;
  storeVariants:       StoreVariantSnapshot[];
  warehouseVariants:   WarehouseVariant[];
  isTextile:           boolean;
}

// ── Eligible variant: one warehouse variant that can receive allocation ──

interface EligibleVariant {
  size:                string;
  color:               string;
  storeQty:            number;
  warehouseQty:        number;
  allocated:           number;
  isAbsentInStore:     boolean;
  sizeRank:            number;
}

// ── Core balancing algorithm ─────────────────────────────────────────────

/**
 * Build balanced variant allocation for a reference (replenishment or replacement).
 *
 * Algorithm:
 * 1. Merge store + warehouse variants into eligible list
 * 2. Filter to warehouse variants with stock > 0
 * 3. Sort: absent sizes first → lowest store qty → size order → color A-Z
 * 4. Round-robin: allocate 1 unit per round across eligible variants
 * 5. Stop when requestedQty reached or all warehouse stock exhausted
 */
export function buildVariantAllocation(input: BalancingInput): VariantAllocationSuggestion {
  const now = new Date().toISOString().slice(0, 10);

  // Accessories: NOT_APPLICABLE for textile-style balancing
  if (!input.isTextile) {
    return {
      totalRequestedQty: input.requestedQty,
      totalAllocatedQty: 0,
      unallocatedQty: input.requestedQty,
      allocations: [],
      balanceQuality: "NOT_APPLICABLE",
      evidenceDate: now,
    };
  }

  if (input.requestedQty <= 0) {
    return {
      totalRequestedQty: 0,
      totalAllocatedQty: 0,
      unallocatedQty: 0,
      allocations: [],
      balanceQuality: "BALANCED",
      evidenceDate: now,
    };
  }

  // Build store variant index: size|color → storeQty
  const storeIndex = new Map<string, number>();
  for (const sv of input.storeVariants) {
    const key = `${sv.size}|${sv.color}`;
    storeIndex.set(key, (storeIndex.get(key) ?? 0) + sv.storeQty);
  }

  // Check for incomplete data
  const hasIncompleteData = input.warehouseVariants.some(
    v => v.size === "SIN_TALLA" || v.color === "SIN_COLOR"
  );
  const hasRealData = input.warehouseVariants.some(
    v => v.size !== "SIN_TALLA" && v.color !== "SIN_COLOR"
  );

  // Build eligible variants from warehouse stock
  const eligible: EligibleVariant[] = [];
  for (const wv of input.warehouseVariants) {
    if (wv.qty <= 0) continue;

    const key = `${wv.size}|${wv.color}`;
    const storeQty = storeIndex.get(key) ?? 0;

    // Skip SIN_TALLA/SIN_COLOR when better-classified options exist
    const isUnclassified = wv.size === "SIN_TALLA" || wv.color === "SIN_COLOR";
    if (isUnclassified && hasRealData) continue;

    eligible.push({
      size: wv.size,
      color: wv.color,
      storeQty,
      warehouseQty: wv.qty,
      allocated: 0,
      isAbsentInStore: storeQty === 0,
      sizeRank: commercialSizeRank(wv.size),
    });
  }

  if (eligible.length === 0) {
    return {
      totalRequestedQty: input.requestedQty,
      totalAllocatedQty: 0,
      unallocatedQty: input.requestedQty,
      allocations: [],
      balanceQuality: "INSUFFICIENT_STOCK",
      evidenceDate: now,
    };
  }

  // Sort: absent first → lowest store qty → size order → color A-Z
  eligible.sort((a, b) => {
    if (a.isAbsentInStore !== b.isAbsentInStore) return a.isAbsentInStore ? -1 : 1;
    if (a.storeQty !== b.storeQty) return a.storeQty - b.storeQty;
    if (a.sizeRank !== b.sizeRank) return a.sizeRank - b.sizeRank;
    return a.color.localeCompare(b.color);
  });

  // Cap: total after allocation must not exceed maxUnitsPerRef
  const maxAllocatable = Math.max(0, input.maxUnitsPerRef - input.currentStoreTotal);
  const targetQty = Math.min(input.requestedQty, maxAllocatable);

  // Round-robin allocation
  let totalAllocated = 0;
  let changed = true;
  while (totalAllocated < targetQty && changed) {
    changed = false;
    for (const ev of eligible) {
      if (totalAllocated >= targetQty) break;
      if (ev.allocated >= ev.warehouseQty) continue; // warehouse exhausted for this variant
      ev.allocated += 1;
      totalAllocated += 1;
      changed = true;
    }
  }

  // Build allocations
  const allocations: VariantAllocation[] = [];
  for (const ev of eligible) {
    if (ev.allocated <= 0) continue;
    allocations.push({
      variantKey: `${ev.size}|${ev.color}`,
      size: ev.size,
      color: ev.color,
      storeQtyBefore: ev.storeQty,
      warehouseAvailableQty: ev.warehouseQty,
      suggestedQty: ev.allocated,
      storeQtyAfter: ev.storeQty + ev.allocated,
      reason: ev.isAbsentInStore
        ? "Talla/color ausente en tienda"
        : ev.storeQty <= 1
          ? "Baja cobertura de esta variante"
          : "Reposicion balanceada",
    });
  }

  // Sort allocations by size order for display
  allocations.sort((a, b) => {
    const ra = commercialSizeRank(a.size);
    const rb = commercialSizeRank(b.size);
    if (ra !== rb) return ra - rb;
    return a.color.localeCompare(b.color);
  });

  // Determine quality
  let balanceQuality: VariantBalanceQuality;
  if (hasIncompleteData && !hasRealData) {
    balanceQuality = "INCOMPLETE_VARIANT_DATA";
  } else if (totalAllocated >= targetQty) {
    balanceQuality = "BALANCED";
  } else if (totalAllocated > 0) {
    balanceQuality = "PARTIAL";
  } else {
    balanceQuality = "INSUFFICIENT_STOCK";
  }

  return {
    totalRequestedQty: input.requestedQty,
    totalAllocatedQty: totalAllocated,
    unallocatedQty: Math.max(0, input.requestedQty - totalAllocated),
    allocations,
    balanceQuality,
    evidenceDate: now,
  };
}

/**
 * Build balancing input from ReplacementVariant[] (for replacement candidates).
 * Store variants come from the target store's inventory of the CANDIDATE reference.
 */
export function buildReplacementBalancingInput(
  suggestedQty: number,
  maxUnitsPerRef: number,
  candidateStoreStock: number,
  candidateVariants: ReplacementVariant[],
  storeVariantsForCandidate: StoreVariantSnapshot[],
  isTextile: boolean,
): BalancingInput {
  return {
    requestedQty: suggestedQty,
    maxUnitsPerRef,
    currentStoreTotal: candidateStoreStock,
    storeVariants: storeVariantsForCandidate,
    warehouseVariants: candidateVariants.map(v => ({
      size:  v.size ?? "SIN_TALLA",
      color: v.color ?? "SIN_COLOR",
      qty:   v.mainWarehouseQty,
    })),
    isTextile,
  };
}
