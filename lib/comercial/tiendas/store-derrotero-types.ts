/**
 * lib/comercial/tiendas/store-derrotero-types.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01
 *
 * Canonical types for the Store Derrotero — the expected assortment composition
 * of each physical store. Reuses the Maletas derrotero taxonomy
 * (grupo + subgrupo for Castillitos, subgrupo for Latin Kids, sizeClass for Accessories)
 * but applies store-specific quantity rules (8/10/12 textile, 6/4/1 accessory).
 *
 * Five independent concepts:
 *   1. Derrotero coverage:  does this subgroup have ≥1 reference with stock?
 *   2. Reference count:     how many distinct refs cover this entry?
 *   3. Units per reference: per-ref health (BAJO_MINIMO / SALUDABLE / SOBRE_MAXIMO)
 *   4. Variety status:      NOT_EVALUATED until tenant defines variety limits
 *   5. Total units:         aggregate units across all matched refs
 *
 * Pure types — no runtime logic, no Prisma, no UI imports.
 */

import type { StoreSizeClass } from "./store-policy-types";

// ── Commercial line identifiers (store context) ─────────────────────────────

export type StoreDerroteroLine = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES";

// ── Match mode (how entries match inventory) ────────────────────────────────

export type DerroteroMatchMode =
  | "GROUP_AND_SUBGROUP"   // Castillitos textile: grupo + subgrupo
  | "SUBGROUP"             // Latin Kids textile: subgrupo only
  | "SIZE_CLASS";          // Accessories/import: sizeClass

// ── Coverage status per entry (does the subgroup exist in the store?) ──────

export type DerroteroEntryCoverageStatus =
  | "COVERED"              // ≥ minimumCoverageReferences refs with stock > 0
  | "UNCOVERED";           // 0 refs with stock > 0

// ── Per-reference health (8-12 rule for textile, target for accessories) ───

export type ReferenceHealthStatus =
  | "BAJO_MINIMO"          // units < minUnitsPerRef
  | "SALUDABLE"            // minUnitsPerRef ≤ units ≤ maxUnitsPerRef
  | "SOBRE_MAXIMO";        // units > maxUnitsPerRef

// ── Variety status (requires explicit tenant policy to evaluate) ────────────

export type VarietyStatus =
  | "NOT_EVALUATED"        // no variety policy defined — default
  | "WITHIN_POLICY"        // ref count within configured variety limits
  | "EXCESS_VARIETY"       // too many distinct refs for this entry
  | "INSUFFICIENT_VARIETY"; // too few distinct refs (when policy requires > 1)

// ── Single derrotero entry (one subgroup target) ────────────────────────────

export interface StoreDerroteroEntry {
  /** Internal entry code (e.g. "PIJAMA_CL", "PEQUENO") */
  readonly entryCode: string;
  /** Human-readable name */
  readonly entryName: string;
  /** Commercial line this entry belongs to */
  readonly line: StoreDerroteroLine;
  /** SAG grupo for Castillitos matching (null for LT/Import) */
  readonly sagGrupo: string | null;
  /** SAG subgrupo(s) for matching */
  readonly sagSubgrupo: string | string[] | null;
  /** Size class for accessory matching (null for textile) */
  readonly sizeClass: StoreSizeClass | null;
  /** How this entry matches inventory */
  readonly matchMode: DerroteroMatchMode;

  // ── Coverage threshold ──
  /** Minimum refs with stock > 0 to consider this entry "COVERED" (default 1) */
  readonly minimumCoverageReferences: number;

  // ── Units per reference (the 8-12 rule for textile) ──
  /** Minimum units per reference */
  readonly minUnitsPerRef: number;
  /** Ideal units per reference */
  readonly idealUnitsPerRef: number;
  /** Maximum units per reference */
  readonly maxUnitsPerRef: number;

  /** Priority for triage (lower = higher priority, from maletas catalog) */
  readonly priority: number;
  /** Whether this entry is active */
  readonly active: boolean;
  /** Source catalog this entry was adapted from */
  readonly sourceEvidence: string;
}

// ── Derrotero entry group (grouping of entries by SAG grupo) ───────────────

export interface StoreDerroteroGroup {
  readonly groupCode: string;
  readonly groupName: string;
  readonly line: StoreDerroteroLine;
  readonly sagGrupo: string | null;
  readonly entries: readonly StoreDerroteroEntry[];
}

// ── Full store derrotero (all expected entries for a store) ──────────────────

export interface StoreDerrotero {
  readonly tenantId: string;
  readonly version: string;
  readonly lines: {
    readonly castillitos: StoreDerroteroGroup[];
    readonly latinKids: StoreDerroteroGroup[];
    readonly accessories: StoreDerroteroGroup[];
  };
  readonly totalEntries: number;
  readonly sourceEvidence: string;
  readonly builtAt: string;
}

// ── Per-reference detail within a coverage item ─────────────────────────────

export interface DerroteroReferenceDetail {
  readonly referenceCode: string;
  readonly unitsInStore: number;
  readonly unitsInMainWarehouse: number;
  readonly healthStatus: ReferenceHealthStatus;
}

// ── Coverage measurement per entry ──────────────────────────────────────────

export interface StoreDerroteroCoverageItem {
  /** The derrotero entry being evaluated */
  readonly entry: StoreDerroteroEntry;

  // ── 1. Coverage (binary: covered or not) ──
  readonly coverageStatus: DerroteroEntryCoverageStatus;

  // ── 2. Reference count ──
  readonly referenceCount: number;
  readonly matchedRefs: string[];

  // ── 3. Units per reference (8-12 rule) ──
  readonly totalUnits: number;
  readonly belowMinimumReferenceCount: number;
  readonly healthyReferenceCount: number;
  readonly overMaximumReferenceCount: number;
  readonly referenceDetails: DerroteroReferenceDetail[];

  // ── 4. Variety status ──
  readonly varietyStatus: VarietyStatus;

  // ── 5. Main warehouse ──
  readonly totalUnitsInMainWarehouse: number;
  readonly mainWarehouseCandidateCount: number;
}

// ── Coverage result per line ────────────────────────────────────────────────

export interface StoreLineCoverageResult {
  readonly line: StoreDerroteroLine;
  readonly totalEntries: number;
  readonly covered: number;
  readonly uncovered: number;
  readonly coveragePercent: number;
  // Aggregate per-reference health across all entries in this line
  readonly totalReferences: number;
  readonly belowMinimumTotal: number;
  readonly healthyTotal: number;
  readonly overMaximumTotal: number;
  readonly items: StoreDerroteroCoverageItem[];
}

// ── Coverage result per store ───────────────────────────────────────────────

export interface StoreDerroteroCoverageResult {
  readonly storeId: string;
  readonly storeName: string;
  readonly derrotero: StoreDerrotero;
  readonly castillitos: StoreLineCoverageResult;
  readonly latinKids: StoreLineCoverageResult;
  readonly accessories: StoreLineCoverageResult;
  readonly overallCoveragePercent: number;
  readonly totalEntries: number;
  readonly totalCovered: number;
  readonly totalUncovered: number;
  readonly computedAt: string;
}

// ── Coverage matrix (all stores) ────────────────────────────────────────────

export interface StoreDerroteroCoverageMatrix {
  readonly tenantId: string;
  readonly stores: StoreDerroteroCoverageResult[];
  readonly derrotero: StoreDerrotero;
  readonly computedAt: string;
}

// ── Warehouse candidate variant (OCTAVO) ────────────────────────────────────

export type WarehouseVariantStockQuality =
  | "OPERATIONAL_CONFIRMED"   // qty - reserved
  | "PHYSICAL_ONLY"           // qty only, no reserved
  | "UNKNOWN";                // no data

export interface WarehouseCandidateVariant {
  readonly variantKey: string;       // "size|color"
  readonly size: string | null;
  readonly color: string | null;
  readonly physicalQty: number;
  readonly operationalAvailableQty: number | null;
  readonly stockQuality: WarehouseVariantStockQuality;
}

export type WarehouseVariantDataQuality =
  | "CONSISTENT"        // sum(variants.physicalQty) === mainWarehouseStock
  | "INCONSISTENT"      // sum differs
  | "NO_VARIANT_DATA";  // no variants found

// ── Main warehouse coverage candidate (extended) ────────────────────────────

export interface MainWarehouseCoverageCandidate {
  readonly referenceCode: string;
  readonly productName: string;
  readonly line: StoreDerroteroLine;
  readonly group: string;
  readonly subgroup: string;
  readonly sizeClass: StoreSizeClass | null;
  readonly mainWarehouseStock: number;
  readonly coverableStores: string[];
  readonly rule36BlockedStores: string[];
  readonly distributableUnits: number;
  // Variant detail (OCTAVO)
  readonly variants: WarehouseCandidateVariant[];
  readonly totalVariantCount: number;
  readonly totalVariantUnits: number;
  readonly variantDataQuality: WarehouseVariantDataQuality;
  readonly snapshotAt: string;
}

// ── Main warehouse inverse matrix ───────────────────────────────────────────

export interface MainWarehouseCoverageMatrix {
  readonly tenantId: string;
  readonly candidates: MainWarehouseCoverageCandidate[];
  readonly totalCandidates: number;
  readonly totalCoverableGaps: number;
  readonly totalRule36Blocked: number;
  readonly computedAt: string;
}

// ── Store variant for coverage gap (SEGUNDO) ────────────────────────────────

export interface CoverageGapStoreVariant {
  readonly variantKey: string;       // "size|color"
  readonly size: string | null;
  readonly color: string | null;
  readonly qty: number;
}

// ── Coverage gap (UNDÉCIMO) ─────────────────────────────────────────────────

export interface DerroteroCoverageGap {
  readonly coverageGapId: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly entry: StoreDerroteroEntry;
  readonly currentRefCount: number;
  readonly refShortage: number;
  readonly totalUnits: number;
  readonly mainWarehouseCandidateCount: number;
  readonly totalMainWarehouseUnits: number;
  readonly rule36Blocked: boolean;
  // Store variants currently in this gap (SEGUNDO)
  readonly storeVariants: CoverageGapStoreVariant[];
}

// ── Coverage gap summary ────────────────────────────────────────────────────

export interface DerroteroCoverageGapSummary {
  readonly storeSlug: string;
  readonly storeName: string;
  readonly gaps: DerroteroCoverageGap[];
  readonly totalGaps: number;
  readonly coverableGaps: number;
  readonly rule36BlockedGaps: number;
}

// ── Variant allocation suggestion for derrotero (TERCERO) ───────────────────

export interface DerroteroVariantAllocation {
  readonly variantKey: string;
  readonly size: string | null;
  readonly color: string | null;
  readonly storeQtyBefore: number;
  readonly warehouseQty: number;
  readonly suggestedQty: number;
  readonly storeQtyAfter: number;
  readonly reason: string;
}

export type DerroteroAllocationQuality =
  | "BALANCED"
  | "PARTIAL"
  | "INSUFFICIENT_STOCK"
  | "INCOMPLETE_VARIANT_DATA"
  | "NOT_APPLICABLE";

export interface DerroteroVariantAllocationSuggestion {
  readonly totalRequestedQty: number;
  readonly totalAllocatedQty: number;
  readonly unallocatedQty: number;
  readonly allocations: DerroteroVariantAllocation[];
  readonly quality: DerroteroAllocationQuality;
}

// ── Store coverage priority (CUARTO) ────────────────────────────────────────

export interface StoreCoveragePriority {
  readonly storeId: string;
  readonly storeName: string;
  readonly coverageGapId: string;
  readonly priorityScore: number;
  readonly priorityReasons: string[];
  readonly blocked: boolean;
  readonly blockedReason: string | null;
}

// ── Warehouse allocation simulation (QUINTO) ────────────────────────────────

export interface StoreAllocationEntry {
  readonly storeId: string;
  readonly storeName: string;
  readonly coverageGapId: string;
  readonly referenceCode: string;
  readonly allocatedQty: number;
  readonly variantAllocations: DerroteroVariantAllocation[];
  readonly priorityScore: number;
  readonly priorityReasons: string[];
}

export interface WarehouseAllocationSimulation {
  readonly allocationByStore: Map<string, StoreAllocationEntry[]>;
  readonly totalAllocated: number;
  readonly remainingWarehouseQty: number;
  readonly uncoveredGaps: string[];
  readonly blockedAllocations: Array<{
    storeId: string;
    coverageGapId: string;
    reason: string;
  }>;
  readonly evidence: string[];
}

// ── Store priority config (SÉPTIMO) ─────────────────────────────────────────

export interface StorePriorityConfig {
  readonly storePriorityOrder: string[];
}

// ── Needs contract extension (DUODÉCIMO) ────────────────────────────────────

export interface DerroteroNeedContract {
  readonly coverageGapId: string;
  readonly expectedCoverage: number;
  readonly currentCoverage: number;
  readonly shortageQty: number;
  readonly warehouseCandidates: MainWarehouseCoverageCandidate[];
  readonly allocationSuggestion: DerroteroVariantAllocationSuggestion | null;
  readonly priorityScore: number;
  readonly blockedReason: string | null;
}

// ── Effective config per store (QUINTO) ─────────────────────────────────────

export type DerroteroConfigSource =
  | "TENANT_DEFAULT"
  | "DERROTERO_CATALOG"
  | "STORE_OVERRIDE"
  | "TEMPORAL_OVERRIDE";

export interface EffectiveDerroteroConfig {
  readonly storeSlug: string;
  readonly storeName: string;
  readonly minimumCoverageReferences: number;
  readonly castillitosTextile: { min: number; ideal: number; max: number };
  readonly latinKidsTextile: { min: number; ideal: number; max: number };
  readonly accessoryIdealBySize: Record<string, number>;
  readonly storePriorityOrder: string[];
  readonly source: DerroteroConfigSource;
  readonly overrideReason: string | null;
}
