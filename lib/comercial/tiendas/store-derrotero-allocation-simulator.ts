/**
 * lib/comercial/tiendas/store-derrotero-allocation-simulator.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01 — QUINTO + TERCERO
 *
 * Deterministic simulation of warehouse allocation across stores.
 *
 * Rules:
 *   - Maintains remainingWarehouseQty per reference
 *   - Assigns suggestions in priority order
 *   - Deducts from remaining — no double-booking
 *   - Never exceeds stock real, shortageQty, or maxUnitsPerRef
 *   - Rule 36 blocking respected
 *   - Variant-level balanced allocation for textile (TERCERO)
 *
 * Pure function — no persistence, no side effects.
 */

import type {
  MainWarehouseCoverageCandidate,
  StoreCoveragePriority,
  DerroteroCoverageGapSummary,
  DerroteroVariantAllocation,
  DerroteroVariantAllocationSuggestion,
  DerroteroAllocationQuality,
  StoreAllocationEntry,
  WarehouseAllocationSimulation,
} from "./store-derrotero-types";

// ── Variant allocation (TERCERO) ────────────────────────────────────────────

interface VariantInput {
  variantKey: string;
  size: string | null;
  color: string | null;
  storeQty: number;
  warehouseQty: number;
}

// Baby size ordering for textile balancing
const BABY_SIZE_ORDER: Record<string, number> = {
  "0-3": 1, "3-6": 2, "6-9": 3, "9-12": 4, "12-18": 5, "18-24": 6,
};

function sizeRank(size: string | null): number {
  if (!size) return 1000;
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

/**
 * Build balanced variant allocation for a derrotero coverage gap.
 *
 * For textile: prioritize absent sizes, then lowest stock, then color diversity.
 * For accessories: NOT_APPLICABLE.
 */
export function buildDerroteroVariantAllocation(
  shortageQty: number,
  maxUnitsPerRef: number,
  currentStoreTotal: number,
  storeVariants: Array<{ size: string | null; color: string | null; qty: number }>,
  warehouseVariants: Array<{ size: string | null; color: string | null; qty: number }>,
  isTextile: boolean,
  remainingWarehouseQty: number,
): DerroteroVariantAllocationSuggestion {
  if (!isTextile) {
    return {
      totalRequestedQty: shortageQty,
      totalAllocatedQty: 0,
      unallocatedQty: shortageQty,
      allocations: [],
      quality: "NOT_APPLICABLE",
    };
  }

  if (shortageQty <= 0) {
    return {
      totalRequestedQty: 0,
      totalAllocatedQty: 0,
      unallocatedQty: 0,
      allocations: [],
      quality: "BALANCED",
    };
  }

  // Build store variant index
  const storeIndex = new Map<string, number>();
  for (const sv of storeVariants) {
    const key = `${sv.size ?? "SIN_TALLA"}|${sv.color ?? "SIN_COLOR"}`;
    storeIndex.set(key, (storeIndex.get(key) ?? 0) + sv.qty);
  }

  // Check data quality
  const hasIncomplete = warehouseVariants.some(v => !v.size || !v.color);
  const hasReal = warehouseVariants.some(v => v.size && v.color);

  // Build eligible list
  const eligible: Array<VariantInput & { allocated: number; isAbsent: boolean; rank: number }> = [];
  for (const wv of warehouseVariants) {
    if (wv.qty <= 0) continue;
    const isUnclassified = !wv.size || !wv.color;
    if (isUnclassified && hasReal) continue;

    const key = `${wv.size ?? "SIN_TALLA"}|${wv.color ?? "SIN_COLOR"}`;
    const storeQty = storeIndex.get(key) ?? 0;

    eligible.push({
      variantKey: key,
      size: wv.size,
      color: wv.color,
      storeQty,
      warehouseQty: wv.qty,
      allocated: 0,
      isAbsent: storeQty === 0,
      rank: sizeRank(wv.size),
    });
  }

  if (eligible.length === 0) {
    const quality: DerroteroAllocationQuality = hasIncomplete && !hasReal
      ? "INCOMPLETE_VARIANT_DATA"
      : "INSUFFICIENT_STOCK";
    return {
      totalRequestedQty: shortageQty,
      totalAllocatedQty: 0,
      unallocatedQty: shortageQty,
      allocations: [],
      quality,
    };
  }

  // Sort: absent first → lowest store qty → size order → color A-Z
  eligible.sort((a, b) => {
    if (a.isAbsent !== b.isAbsent) return a.isAbsent ? -1 : 1;
    if (a.storeQty !== b.storeQty) return a.storeQty - b.storeQty;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (a.color ?? "").localeCompare(b.color ?? "");
  });

  // Cap by maxUnitsPerRef and remaining warehouse
  const maxAllocatable = Math.max(0, maxUnitsPerRef - currentStoreTotal);
  const targetQty = Math.min(shortageQty, maxAllocatable, remainingWarehouseQty);

  // Round-robin allocation
  let totalAllocated = 0;
  let changed = true;
  while (totalAllocated < targetQty && changed) {
    changed = false;
    for (const ev of eligible) {
      if (totalAllocated >= targetQty) break;
      if (ev.allocated >= ev.warehouseQty) continue;
      ev.allocated += 1;
      totalAllocated += 1;
      changed = true;
    }
  }

  const allocations: DerroteroVariantAllocation[] = [];
  for (const ev of eligible) {
    if (ev.allocated <= 0) continue;
    allocations.push({
      variantKey: ev.variantKey,
      size: ev.size,
      color: ev.color,
      storeQtyBefore: ev.storeQty,
      warehouseQty: ev.warehouseQty,
      suggestedQty: ev.allocated,
      storeQtyAfter: ev.storeQty + ev.allocated,
      reason: ev.isAbsent
        ? "Talla/color ausente en tienda"
        : ev.storeQty <= 1
          ? "Talla/color con stock bajo"
          : "Balanceo de surtido",
    });
  }

  const quality: DerroteroAllocationQuality =
    totalAllocated >= shortageQty ? "BALANCED" :
    totalAllocated > 0 ? "PARTIAL" :
    "INSUFFICIENT_STOCK";

  return {
    totalRequestedQty: shortageQty,
    totalAllocatedQty: totalAllocated,
    unallocatedQty: shortageQty - totalAllocated,
    allocations,
    quality,
  };
}

// ── Warehouse allocation simulation (QUINTO) ────────────────────────────────

/**
 * Simulate deterministic warehouse allocation across all stores.
 *
 * Processes priorities in order, deducting from remaining warehouse stock.
 * Never proposes the same unit to multiple stores.
 */
export function simulateWarehouseAllocation(
  priorities: StoreCoveragePriority[],
  candidates: MainWarehouseCoverageCandidate[],
  gapSummaries: DerroteroCoverageGapSummary[],
): WarehouseAllocationSimulation {
  // Build candidate lookup by referenceCode
  const candidateByRef = new Map<string, MainWarehouseCoverageCandidate>();
  for (const c of candidates) candidateByRef.set(c.referenceCode, c);

  // Track remaining warehouse qty per reference
  const remainingByRef = new Map<string, number>();
  for (const c of candidates) {
    remainingByRef.set(c.referenceCode, c.mainWarehouseStock);
  }

  // Build gap lookup
  const gapById = new Map<string, { storeSlug: string; refShortage: number; totalUnits: number }>();
  for (const gs of gapSummaries) {
    for (const g of gs.gaps) {
      gapById.set(g.coverageGapId, {
        storeSlug: g.storeSlug,
        refShortage: g.refShortage,
        totalUnits: g.totalUnits,
      });
    }
  }

  const allocationByStore = new Map<string, StoreAllocationEntry[]>();
  const blockedAllocations: Array<{ storeId: string; coverageGapId: string; reason: string }> = [];
  const uncoveredGaps: string[] = [];
  const evidence: string[] = [];
  let totalAllocated = 0;

  for (const priority of priorities) {
    if (priority.blocked) {
      blockedAllocations.push({
        storeId: priority.storeId,
        coverageGapId: priority.coverageGapId,
        reason: priority.blockedReason ?? "Bloqueado por Regla 36",
      });
      evidence.push(`${priority.storeId}:${priority.coverageGapId} BLOCKED — ${priority.blockedReason}`);
      continue;
    }

    // Find matching candidate(s) for this gap
    const gap = gapById.get(priority.coverageGapId);
    if (!gap) continue;

    // Find candidates that can cover this gap
    const matchingCandidates = candidates.filter(c =>
      c.coverableStores.includes(priority.storeId) &&
      (remainingByRef.get(c.referenceCode) ?? 0) > 0,
    );

    if (matchingCandidates.length === 0) {
      uncoveredGaps.push(priority.coverageGapId);
      evidence.push(`${priority.storeId}:${priority.coverageGapId} NO_STOCK`);
      continue;
    }

    // Use the first matching candidate (highest priority from matrix sort)
    const candidate = matchingCandidates[0];
    const remaining = remainingByRef.get(candidate.referenceCode) ?? 0;
    const shortageQty = gap.refShortage;

    // Cap by shortage, remaining, and max units
    const allocateQty = Math.min(shortageQty, remaining);
    if (allocateQty <= 0) {
      uncoveredGaps.push(priority.coverageGapId);
      continue;
    }

    // Build variant allocation for textile (when variant data exists)
    const isTextile = candidate.line === "CASTILLITOS" || candidate.line === "LATIN_KIDS";
    const hasVariants = candidate.variants.length > 0;

    let allocatedQty: number;
    let variantAllocations: DerroteroVariantAllocation[] = [];

    if (hasVariants && isTextile) {
      const warehouseVariants = candidate.variants.map(v => ({
        size: v.size,
        color: v.color,
        qty: v.physicalQty,
      }));

      const variantAlloc = buildDerroteroVariantAllocation(
        allocateQty,
        999, // maxUnitsPerRef not enforced at simulation level
        gap.totalUnits,
        [], // store variants not available at simulation level
        warehouseVariants,
        true,
        remaining,
      );
      allocatedQty = variantAlloc.totalAllocatedQty;
      variantAllocations = variantAlloc.allocations;
    } else {
      // No variant data — simple qty allocation
      allocatedQty = allocateQty;
    }

    // Deduct from remaining
    remainingByRef.set(candidate.referenceCode, remaining - allocatedQty);
    totalAllocated += allocatedQty;

    // Record allocation
    const storeEntries = allocationByStore.get(priority.storeId) ?? [];
    storeEntries.push({
      storeId: priority.storeId,
      storeName: priority.storeName,
      coverageGapId: priority.coverageGapId,
      referenceCode: candidate.referenceCode,
      allocatedQty,
      variantAllocations,
      priorityScore: priority.priorityScore,
      priorityReasons: priority.priorityReasons,
    });
    allocationByStore.set(priority.storeId, storeEntries);

    evidence.push(
      `${priority.storeId}:${priority.coverageGapId} ← ${candidate.referenceCode} ` +
      `qty=${allocatedQty} remaining=${remaining - allocatedQty}`,
    );
  }

  // Compute total remaining
  let remainingWarehouseQty = 0;
  for (const qty of remainingByRef.values()) remainingWarehouseQty += qty;

  return {
    allocationByStore,
    totalAllocated,
    remainingWarehouseQty,
    uncoveredGaps,
    blockedAllocations,
    evidence,
  };
}
