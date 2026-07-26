/**
 * lib/comercial/tiendas/store-derrotero-warehouse-matrix.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01 — SÉPTIMO + OCTAVO
 *
 * Builds the inverse matrix from main warehouse:
 *   - For each reference with stock > 0 in main warehouse,
 *   - Find which stores have uncovered entries it could fill,
 *   - Apply compatibility rules per line,
 *   - Apply Rule 36 blocking,
 *   - Include variant detail (size/color/qty) per candidate,
 *   - Return prioritized candidates.
 *
 * Pure function — no DB, no side effects.
 */

import type {
  StoreDerroteroCoverageResult,
  StoreDerroteroCoverageItem,
  MainWarehouseCoverageCandidate,
  MainWarehouseCoverageMatrix,
  StoreDerroteroLine,
  WarehouseCandidateVariant,
  WarehouseVariantDataQuality,
  WarehouseVariantStockQuality,
} from "./store-derrotero-types";
import type { StoreSizeClass } from "./store-policy-types";
import type { GlobalLowStockConfig } from "./store-policy-pack-config";
import { CASTILLITOS_GLOBAL_LOW_STOCK } from "./store-policy-pack-config";

// ── Reference metadata for matching ─────────────────────────────────────────

export interface MainWarehouseRefMeta {
  referenceCode: string;
  productName: string;
  canonicalLine: string;   // "castillitos" | "latin_kids" | "accesorios_importacion"
  group: string;
  subgroup: string;
  sizeClass: StoreSizeClass | null;
  mainWarehouseStock: number;
}

// ── Variant-level data for warehouse refs ───────────────────────────────────

export interface MainWarehouseVariantRecord {
  referenceCode: string;
  size: string;
  color: string;
  physicalQty: number;
  reservedQty: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface WarehouseMatrixConfig {
  rule36: GlobalLowStockConfig;
}

const DEFAULT_CONFIG: WarehouseMatrixConfig = {
  rule36: CASTILLITOS_GLOBAL_LOW_STOCK,
};

// ── Variant consolidation ───────────────────────────────────────────────────

function consolidateVariants(
  records: MainWarehouseVariantRecord[],
  totalStock: number,
  snapshotAt: string,
): {
  variants: WarehouseCandidateVariant[];
  totalVariantCount: number;
  totalVariantUnits: number;
  variantDataQuality: WarehouseVariantDataQuality;
} {
  if (records.length === 0) {
    return {
      variants: [],
      totalVariantCount: 0,
      totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA",
    };
  }

  // Consolidate by reference + size + color
  const consolidated = new Map<string, {
    size: string;
    color: string;
    physicalQty: number;
    reservedQty: number;
  }>();

  for (const r of records) {
    const key = `${r.size}|${r.color}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.physicalQty += r.physicalQty;
      existing.reservedQty += r.reservedQty;
    } else {
      consolidated.set(key, {
        size: r.size,
        color: r.color,
        physicalQty: r.physicalQty,
        reservedQty: r.reservedQty,
      });
    }
  }

  const variants: WarehouseCandidateVariant[] = [];
  let totalVariantUnits = 0;

  for (const [key, v] of consolidated) {
    const hasReserved = v.reservedQty > 0;
    const operationalQty = hasReserved ? Math.max(0, v.physicalQty - v.reservedQty) : null;
    const stockQuality: WarehouseVariantStockQuality = hasReserved
      ? "OPERATIONAL_CONFIRMED"
      : v.physicalQty > 0
        ? "PHYSICAL_ONLY"
        : "UNKNOWN";

    variants.push({
      variantKey: key,
      size: v.size === "SIN_TALLA" ? null : v.size,
      color: v.color === "SIN_COLOR" ? null : v.color,
      physicalQty: v.physicalQty,
      operationalAvailableQty: operationalQty,
      stockQuality,
    });
    totalVariantUnits += v.physicalQty;
  }

  // Validate: sum(variants.physicalQty) === mainWarehouseStock
  const variantDataQuality: WarehouseVariantDataQuality =
    totalVariantUnits === totalStock ? "CONSISTENT" : "INCONSISTENT";

  return {
    variants,
    totalVariantCount: variants.length,
    totalVariantUnits,
    variantDataQuality,
  };
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildMainWarehouseCoverageMatrix(
  tenantId: string,
  storeCoverages: StoreDerroteroCoverageResult[],
  mainWarehouseRefs: MainWarehouseRefMeta[],
  config: WarehouseMatrixConfig = DEFAULT_CONFIG,
  variantRecords?: MainWarehouseVariantRecord[],
): MainWarehouseCoverageMatrix {
  const snapshotAt = new Date().toISOString();

  // Build variant index: referenceCode → records[]
  const variantsByRef = new Map<string, MainWarehouseVariantRecord[]>();
  if (variantRecords) {
    for (const vr of variantRecords) {
      const existing = variantsByRef.get(vr.referenceCode);
      if (existing) {
        existing.push(vr);
      } else {
        variantsByRef.set(vr.referenceCode, [vr]);
      }
    }
  }

  // Collect all uncovered entries across all stores
  const uncoveredByStore = new Map<string, StoreDerroteroCoverageItem[]>();
  for (const store of storeCoverages) {
    const uncovered = [
      ...store.castillitos.items,
      ...store.latinKids.items,
      ...store.accessories.items,
    ].filter(i => i.coverageStatus === "UNCOVERED");
    uncoveredByStore.set(store.storeId, uncovered);
  }

  const candidates: MainWarehouseCoverageCandidate[] = [];
  let totalCoverableGaps = 0;
  let totalRule36Blocked = 0;

  // Only process refs with stock > 0
  for (const ref of mainWarehouseRefs) {
    if (ref.mainWarehouseStock <= 0) continue;

    const line = resolveStoreLine(ref.canonicalLine);
    if (!line) continue;

    const coverableStores: string[] = [];
    const rule36BlockedStores: string[] = [];

    for (const store of storeCoverages) {
      const uncovered = uncoveredByStore.get(store.storeId) ?? [];

      const matches = uncovered.some(item =>
        isCompatible(ref, item, line),
      );

      if (!matches) continue;

      if (isRule36Blocked(ref, store.storeId, config.rule36)) {
        rule36BlockedStores.push(store.storeId);
        totalRule36Blocked++;
      } else {
        coverableStores.push(store.storeId);
        totalCoverableGaps++;
      }
    }

    if (coverableStores.length > 0 || rule36BlockedStores.length > 0) {
      // Consolidate variants for this reference
      const refVariants = variantsByRef.get(ref.referenceCode) ?? [];
      const variantDetail = consolidateVariants(refVariants, ref.mainWarehouseStock, snapshotAt);

      candidates.push({
        referenceCode: ref.referenceCode,
        productName: ref.productName,
        line,
        group: ref.group,
        subgroup: ref.subgroup,
        sizeClass: ref.sizeClass,
        mainWarehouseStock: ref.mainWarehouseStock,
        coverableStores,
        rule36BlockedStores,
        distributableUnits: ref.mainWarehouseStock,
        variants: variantDetail.variants,
        totalVariantCount: variantDetail.totalVariantCount,
        totalVariantUnits: variantDetail.totalVariantUnits,
        variantDataQuality: variantDetail.variantDataQuality,
        snapshotAt,
      });
    }
  }

  // Sort: most coverable stores first, then by stock descending
  candidates.sort((a, b) => {
    const storesDiff = b.coverableStores.length - a.coverableStores.length;
    if (storesDiff !== 0) return storesDiff;
    return b.mainWarehouseStock - a.mainWarehouseStock;
  });

  return {
    tenantId,
    candidates,
    totalCandidates: candidates.length,
    totalCoverableGaps,
    totalRule36Blocked,
    computedAt: snapshotAt,
  };
}

// ── Compatibility rules per line ────────────────────────────────────────────

function isCompatible(
  ref: MainWarehouseRefMeta,
  uncoveredItem: StoreDerroteroCoverageItem,
  refLine: StoreDerroteroLine,
): boolean {
  const entry = uncoveredItem.entry;
  if (entry.line !== refLine) return false;

  switch (entry.matchMode) {
    case "GROUP_AND_SUBGROUP":
      return matchesSagGrupo(ref.group, entry.sagGrupo)
        && matchesSagSubgrupo(ref.subgroup, entry.sagSubgrupo);

    case "SUBGROUP":
      return matchesSagSubgrupo(ref.subgroup, entry.sagSubgrupo);

    case "SIZE_CLASS":
      return ref.sizeClass === entry.sizeClass;
  }
}

function matchesSagGrupo(refGrupo: string, entryGrupo: string | null): boolean {
  if (!entryGrupo) return false;
  return refGrupo === entryGrupo;
}

function matchesSagSubgrupo(refSubgrupo: string, entrySagSubgrupo: string | string[] | null): boolean {
  if (!entrySagSubgrupo) return false;
  if (Array.isArray(entrySagSubgrupo)) {
    return entrySagSubgrupo.includes(refSubgrupo);
  }
  return refSubgrupo === entrySagSubgrupo;
}

// ── Rule 36 ─────────────────────────────────────────────────────────────────

function isRule36Blocked(
  ref: MainWarehouseRefMeta,
  storeId: string,
  rule36Config: GlobalLowStockConfig,
): boolean {
  if (rule36Config.allowedStoreIds.includes(storeId)) return false;
  return ref.mainWarehouseStock <= rule36Config.threshold;
}

// ── Line resolution ─────────────────────────────────────────────────────────

function resolveStoreLine(canonicalLine: string): StoreDerroteroLine | null {
  if (canonicalLine === "castillitos") return "CASTILLITOS";
  if (canonicalLine === "latin_kids") return "LATIN_KIDS";
  if (canonicalLine === "accesorios_importacion") return "ACCESSORIES";
  return null;
}
