/**
 * lib/comercial/tiendas/store-derrotero-coverage-engine.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01
 * AGENTIK-STORES-DERROTERO-DELIVERY-01 — Gate 6: now properly wired
 *
 * Pure coverage evaluation engine. Receives a StoreDerrotero with thresholds
 * already resolved (pack defaults overlaid with effective store overrides by
 * store-derrotero-service.ts → applyEffectiveOverrides).
 *
 * This engine does NOT read persisted rules directly — it evaluates whatever
 * thresholds are present on the derrotero entries it receives.
 *
 * Inventario and Necesidades consume the canonical distribution service
 * (store-distribution-service.ts → resolveThresholds → findApplicableRule),
 * which reads persisted store overrides from Prisma via a different path.
 *
 * Measures how well a store's actual inventory matches the expected derrotero.
 *
 * Five independent dimensions per entry:
 *   1. Coverage:    is the entry present? (≥ minimumCoverageReferences refs with stock > 0)
 *   2. Ref count:   how many distinct refs match this entry
 *   3. Per-ref qty: each ref classified as BAJO_MINIMO / SALUDABLE / SOBRE_MAXIMO
 *   4. Variety:     NOT_EVALUATED (until tenant defines variety limits)
 *   5. Total units: aggregate units across all matched refs
 *
 * Pure function — no DB, no side effects.
 * Input: derrotero + StoreDistributionItem[] (already computed by distribution service).
 */

import type { StoreDistributionItem } from "./store-distribution-types";
import type {
  StoreDerrotero,
  StoreDerroteroEntry,
  StoreDerroteroGroup,
  StoreDerroteroLine,
  StoreDerroteroCoverageItem,
  StoreLineCoverageResult,
  StoreDerroteroCoverageResult,
  DerroteroEntryCoverageStatus,
  DerroteroReferenceDetail,
  ReferenceHealthStatus,
  VarietyStatus,
} from "./store-derrotero-types";

// ── Main coverage evaluator ─────────────────────────────────────────────────

export function evaluateStoreDerroteroCoverage(
  storeId: string,
  storeName: string,
  derrotero: StoreDerrotero,
  storeItems: StoreDistributionItem[],
  mainWarehouseStockByRef: Map<string, number>,
): StoreDerroteroCoverageResult {
  // Build lookup indexes from store inventory
  const storeRefsByGroupSubgroup = buildStoreRefIndex(storeItems, "GROUP_AND_SUBGROUP");
  const storeRefsBySubgroup = buildStoreRefIndex(storeItems, "SUBGROUP");
  const storeRefsBySizeClass = buildStoreRefIndex(storeItems, "SIZE_CLASS");

  // Consolidate units per reference in this store
  const storeUnitsByRef = new Map<string, number>();
  for (const item of storeItems) {
    storeUnitsByRef.set(
      item.referenceCode,
      (storeUnitsByRef.get(item.referenceCode) ?? 0) + item.currentUnits,
    );
  }

  const castillitos = evaluateLineCoverage(
    "CASTILLITOS",
    derrotero.lines.castillitos,
    storeRefsByGroupSubgroup,
    storeUnitsByRef,
    mainWarehouseStockByRef,
  );

  const latinKids = evaluateLineCoverage(
    "LATIN_KIDS",
    derrotero.lines.latinKids,
    storeRefsBySubgroup,
    storeUnitsByRef,
    mainWarehouseStockByRef,
  );

  const accessories = evaluateLineCoverage(
    "ACCESSORIES",
    derrotero.lines.accessories,
    storeRefsBySizeClass,
    storeUnitsByRef,
    mainWarehouseStockByRef,
  );

  const totalEntries = castillitos.totalEntries + latinKids.totalEntries + accessories.totalEntries;
  const totalCovered = castillitos.covered + latinKids.covered + accessories.covered;
  const totalUncovered = castillitos.uncovered + latinKids.uncovered + accessories.uncovered;
  const overallCoveragePercent = totalEntries > 0
    ? Math.round((totalCovered / totalEntries) * 100)
    : 0;

  return {
    storeId,
    storeName,
    derrotero,
    castillitos,
    latinKids,
    accessories,
    overallCoveragePercent,
    totalEntries,
    totalCovered,
    totalUncovered,
    computedAt: new Date().toISOString(),
  };
}

// ── Per-line coverage ───────────────────────────────────────────────────────

function evaluateLineCoverage(
  line: StoreDerroteroLine,
  groups: readonly StoreDerroteroGroup[],
  storeRefIndex: Map<string, Set<string>>,
  storeUnitsByRef: Map<string, number>,
  mainWarehouseStockByRef: Map<string, number>,
): StoreLineCoverageResult {
  const items: StoreDerroteroCoverageItem[] = [];

  for (const group of groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      items.push(evaluateEntryCoverage(entry, storeRefIndex, storeUnitsByRef, mainWarehouseStockByRef));
    }
  }

  const covered = items.filter(i => i.coverageStatus === "COVERED").length;
  const uncovered = items.filter(i => i.coverageStatus === "UNCOVERED").length;
  const totalEntries = items.length;
  const coveragePercent = totalEntries > 0 ? Math.round((covered / totalEntries) * 100) : 0;

  // Aggregate per-reference health across all entries
  let totalReferences = 0;
  let belowMinimumTotal = 0;
  let healthyTotal = 0;
  let overMaximumTotal = 0;
  for (const item of items) {
    totalReferences += item.referenceCount;
    belowMinimumTotal += item.belowMinimumReferenceCount;
    healthyTotal += item.healthyReferenceCount;
    overMaximumTotal += item.overMaximumReferenceCount;
  }

  return {
    line,
    totalEntries,
    covered,
    uncovered,
    coveragePercent,
    totalReferences,
    belowMinimumTotal,
    healthyTotal,
    overMaximumTotal,
    items,
  };
}

// ── Per-entry coverage ──────────────────────────────────────────────────────

function evaluateEntryCoverage(
  entry: StoreDerroteroEntry,
  storeRefIndex: Map<string, Set<string>>,
  storeUnitsByRef: Map<string, number>,
  mainWarehouseStockByRef: Map<string, number>,
): StoreDerroteroCoverageItem {
  const indexKey = buildIndexKey(entry);
  const matchedRefSet = storeRefIndex.get(indexKey) ?? new Set<string>();
  const matchedRefs = [...matchedRefSet];
  const referenceCount = matchedRefs.length;

  // Build per-reference details
  const referenceDetails: DerroteroReferenceDetail[] = [];
  let totalUnits = 0;
  let totalUnitsInMainWarehouse = 0;
  let mainWarehouseCandidateCount = 0;
  let belowMinimumReferenceCount = 0;
  let healthyReferenceCount = 0;
  let overMaximumReferenceCount = 0;

  for (const ref of matchedRefs) {
    const unitsInStore = storeUnitsByRef.get(ref) ?? 0;
    const unitsInMainWarehouse = mainWarehouseStockByRef.get(ref) ?? 0;
    const healthStatus = classifyReferenceHealth(unitsInStore, entry);

    totalUnits += unitsInStore;
    totalUnitsInMainWarehouse += unitsInMainWarehouse;
    if (unitsInMainWarehouse > 0) mainWarehouseCandidateCount++;

    switch (healthStatus) {
      case "BAJO_MINIMO": belowMinimumReferenceCount++; break;
      case "SALUDABLE": healthyReferenceCount++; break;
      case "SOBRE_MAXIMO": overMaximumReferenceCount++; break;
    }

    referenceDetails.push({ referenceCode: ref, unitsInStore, unitsInMainWarehouse, healthStatus });
  }

  // 1. Coverage: binary
  const coverageStatus = resolveCoverageStatus(referenceCount, entry.minimumCoverageReferences);

  // 4. Variety: NOT_EVALUATED until tenant defines limits
  const varietyStatus: VarietyStatus = "NOT_EVALUATED";

  return {
    entry,
    coverageStatus,
    referenceCount,
    matchedRefs,
    totalUnits,
    belowMinimumReferenceCount,
    healthyReferenceCount,
    overMaximumReferenceCount,
    referenceDetails,
    varietyStatus,
    totalUnitsInMainWarehouse,
    mainWarehouseCandidateCount,
  };
}

// ── Coverage status resolution ──────────────────────────────────────────────

function resolveCoverageStatus(
  matchedCount: number,
  minimumCoverageReferences: number,
): DerroteroEntryCoverageStatus {
  if (matchedCount >= minimumCoverageReferences) return "COVERED";
  return "UNCOVERED";
}

// ── Per-reference health classification ─────────────────────────────────────

function classifyReferenceHealth(
  unitsInStore: number,
  entry: StoreDerroteroEntry,
): ReferenceHealthStatus {
  if (unitsInStore < entry.minUnitsPerRef) return "BAJO_MINIMO";
  if (unitsInStore > entry.maxUnitsPerRef) return "SOBRE_MAXIMO";
  return "SALUDABLE";
}

// ── Index key builders ──────────────────────────────────────────────────────

function buildIndexKey(entry: StoreDerroteroEntry): string {
  switch (entry.matchMode) {
    case "GROUP_AND_SUBGROUP": {
      const grupo = entry.sagGrupo ?? "";
      const subgrupo = normalizeSagSubgrupo(entry.sagSubgrupo);
      return `${grupo}|${subgrupo}`;
    }
    case "SUBGROUP": {
      const subgrupo = normalizeSagSubgrupo(entry.sagSubgrupo);
      return subgrupo;
    }
    case "SIZE_CLASS":
      return entry.sizeClass ?? "";
  }
}

function normalizeSagSubgrupo(sagSubgrupo: string | string[] | null): string {
  if (!sagSubgrupo) return "";
  if (Array.isArray(sagSubgrupo)) return sagSubgrupo[0] ?? "";
  return sagSubgrupo;
}

// ── Store inventory index builder ───────────────────────────────────────────

type IndexMode = "GROUP_AND_SUBGROUP" | "SUBGROUP" | "SIZE_CLASS";

function buildStoreRefIndex(
  items: StoreDistributionItem[],
  mode: IndexMode,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const item of items) {
    if (item.currentUnits <= 0) continue;

    let key: string | null = null;
    switch (mode) {
      case "GROUP_AND_SUBGROUP":
        if (item.group && item.group !== "SIN_GRUPO_SAG" && item.subgroup && item.subgroup !== "SIN_SUBGRUPO_SAG") {
          key = `${item.group}|${item.subgroup}`;
        }
        break;
      case "SUBGROUP":
        if (item.subgroup && item.subgroup !== "SIN_SUBGRUPO_SAG") {
          key = item.subgroup;
        }
        break;
      case "SIZE_CLASS":
        if (item.sizeClass) {
          key = item.sizeClass;
        }
        break;
    }

    if (key) {
      if (!index.has(key)) index.set(key, new Set());
      index.get(key)!.add(item.referenceCode);
    }
  }

  return index;
}

// ── Coverage gap extraction (UNDÉCIMO) ──────────────────────────────────────

import type {
  DerroteroCoverageGap,
  DerroteroCoverageGapSummary,
  CoverageGapStoreVariant,
} from "./store-derrotero-types";

/**
 * Store variant record for gap extraction.
 * Matches the shape of StoreInventoryVariant from store-replenishment-types.
 */
export interface StoreVariantForGap {
  referenceCode: string;
  size: string;
  color: string;
  currentUnits: number;
}

/**
 * Extract all uncovered entries as coverage gaps with full context.
 * Each gap carries a coverageGapId for needs integration traceability.
 *
 * When storeVariantRecords are provided (SEGUNDO), each gap includes
 * the variants currently present in the store for matched references.
 */
export function extractCoverageGaps(
  coverage: StoreDerroteroCoverageResult,
  storeVariantRecords?: StoreVariantForGap[],
): DerroteroCoverageGapSummary {
  // Build variant index: referenceCode → variants[]
  const variantsByRef = new Map<string, StoreVariantForGap[]>();
  if (storeVariantRecords) {
    for (const sv of storeVariantRecords) {
      const existing = variantsByRef.get(sv.referenceCode);
      if (existing) existing.push(sv);
      else variantsByRef.set(sv.referenceCode, [sv]);
    }
  }

  const gaps: DerroteroCoverageGap[] = [];

  const allItems = [
    ...coverage.castillitos.items,
    ...coverage.latinKids.items,
    ...coverage.accessories.items,
  ];

  for (const item of allItems) {
    if (item.coverageStatus !== "UNCOVERED") continue;

    const coverageGapId = `${coverage.storeId}:${item.entry.line}:${item.entry.entryCode}`;
    const refShortage = Math.max(0, item.entry.minimumCoverageReferences - item.referenceCount);

    // Collect store variants for all matched refs in this entry
    const storeVariants: CoverageGapStoreVariant[] = [];
    if (storeVariantRecords) {
      for (const ref of item.matchedRefs) {
        const variants = variantsByRef.get(ref) ?? [];
        for (const v of variants) {
          if (v.currentUnits <= 0) continue;
          const key = `${v.size}|${v.color}`;
          // Consolidate by size|color
          const existing = storeVariants.find(sv => sv.variantKey === key);
          if (existing) {
            (existing as { qty: number }).qty += v.currentUnits;
          } else {
            storeVariants.push({
              variantKey: key,
              size: v.size === "SIN_TALLA" ? null : v.size,
              color: v.color === "SIN_COLOR" ? null : v.color,
              qty: v.currentUnits,
            });
          }
        }
      }
    }

    gaps.push({
      coverageGapId,
      storeSlug: coverage.storeId,
      storeName: coverage.storeName,
      entry: item.entry,
      currentRefCount: item.referenceCount,
      refShortage,
      totalUnits: item.totalUnits,
      mainWarehouseCandidateCount: item.mainWarehouseCandidateCount,
      totalMainWarehouseUnits: item.totalUnitsInMainWarehouse,
      rule36Blocked: false,
      storeVariants,
    });
  }

  const coverableGaps = gaps.filter(g => g.mainWarehouseCandidateCount > 0).length;

  return {
    storeSlug: coverage.storeId,
    storeName: coverage.storeName,
    gaps,
    totalGaps: gaps.length,
    coverableGaps,
    rule36BlockedGaps: 0,
  };
}

// ── Exported for testing ────────────────────────────────────────────────────

export { buildIndexKey, buildStoreRefIndex, resolveCoverageStatus, classifyReferenceHealth };
