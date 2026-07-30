/**
 * lib/comercial/tiendas/store-coverage-service.ts
 *
 * AGENTIK-STORES-COVERAGE-TAB-01 — Two-Dimension Coverage Service
 * AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01 — unit-based measurement
 *
 * Two independent dimensions per structure:
 *
 *   1. Structural coverage: ¿Tiene al menos una referencia activa?
 *      CUBIERTA / SIN_COBERTURA
 *
 *   2. Quantitative health — CERTIFIED LAW (DERROTERO-MEASUREMENT-SEMANTICS-01):
 *      TIENDAS se mide en UNIDADES TOTALES de la estructura, nunca por
 *      referencia. Regla 8/10/12 sobre el TOTAL del grupo:
 *      5 refs × 2 uds = 10 unidades → SALUDABLE (deficit 0).
 *      Los conteos por referencia se conservan como dato informativo.
 *
 * ACC: aggregate per sizeClass (small=6, medium=4, large=1 total units).
 * Reglas especiales (BANERA/CUNA_COLECHO/CORRAL): objetivo de unidades por
 * tienda; presencia con ideal=0 es NO_AUTORIZADA (severidad alta).
 *
 * Data source: getCanonicalStoreDetail() (cached 2min, zero new DB queries).
 * Expected universe: castillitos-mallet-assortment-catalog (32 CS + 11 LK + 3 ACC = 46).
 *
 * Pure function over cached data. Zero N+1. Zero SOAP.
 */

import "server-only";

import {
  getCanonicalStoreDetail,
  loadDistributionData,
  buildMainStockIndex,
  buildSubstitutionIndex,
  loadHeroImageMap,
  getScarcityParams,
} from "./store-distribution-service";
import type {
  MainStockIndex,
  SubstitutionIndex,
  ScarcityParams,
} from "./store-distribution-service";
import type { StoreDistributionItem } from "./store-distribution-types";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "../maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import {
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_ACCESSORY_COVERAGE,
  CASTILLITOS_SPECIAL_PRODUCTS,
} from "./store-policy-pack-config";
import {
  evaluateUnitStructureCoverage,
  evaluateSpecialRules,
  type UnitsRuleEvaluation,
  type SpecialRuleEvaluation,
} from "./store-unit-coverage-engine";
import {
  resolveCatalogInfo,
  findCompatibleRefs,
  type StructureCatalogInfo,
} from "./store-structure-availability-service";

// ── Output types ──────────────────────────────────────────────────────────

export type CoverageLineName = "CASTILLITOS" | "LATIN_KIDS" | "ACCESORIOS";

/** Dimension 1: structural presence */
export type StructuralCoverageStatus = "CUBIERTA" | "SIN_COBERTURA";

/** Dimension 2: per-reference quantitative health */
export type QuantitativeHealthStatus =
  | "SALUDABLE"
  | "CON_REFERENCIAS_BAJO_MINIMO"
  | "SIN_REFERENCIAS";

/** Per-reference state (maps to Inventory: BAJO_MINIMO/EN_RANGO/EXCESO) */
export type ReferenceHealthState = "BAJO_MINIMO" | "SALUDABLE" | "SOBRE_MAXIMO";

// Legacy alias for API/client backward compat
export type CoverageStatus = "CUBIERTA" | "SIN_COBERTURA" | "CON_REFERENCIAS_BAJO_MINIMO";

export interface StoreCoverageStructure {
  structureKey: string;
  label: string;
  groupLabel: string | null;
  subgroupLabel: string;
  line: CoverageLineName;

  // Dimension 1: structural
  structuralCoverageStatus: StructuralCoverageStatus;

  // Reference counts
  activeReferenceCount: number;
  totalStoreUnits: number;

  // Dimension 2: quantitative health (CS/LK = per-reference; ACC = aggregate)
  healthyReferenceCount: number;
  belowMinimumReferenceCount: number;
  overMaximumReferenceCount: number;

  // Structure-level rule thresholds in UNITS (CS/LK: 8/10/12; ACC: per sizeClass)
  minimumUnits: number;
  targetUnits: number;
  maximumUnits: number | null;

  // AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01:
  // Shortage = STRUCTURE-LEVEL unit deficit (certified STORE=UNITS law):
  //   totalShortageToTarget  = max(0, ideal - totalStoreUnits)
  //   totalShortageToMinimum = max(0, min   - totalStoreUnits)
  totalShortageToTarget: number;
  totalShortageToMinimum: number;

  /** Certified unit evaluation (measurementUnit=UNITS) for this structure. */
  unitRule: UnitsRuleEvaluation;

  quantitativeHealthStatus: QuantitativeHealthStatus;

  priority: number;
  solutionSummary: SolutionSummary | null;
}

export interface SolutionSummary {
  sameReferenceCandidates: number;
  compatibleReferenceCandidates: number;
  eligibleCandidates: number;
  blockedCandidates: number;
  totalWarehouseUnits: number;
}

export interface StoreCoverageLineSummary {
  line: CoverageLineName;
  expected: number;
  covered: number;
  withBelowMinimum: number;
  gaps: number;
  coveragePercent: number;
  /** Quantitative: healthy refs / total active refs for this line */
  healthPercent: number;
}

export interface StoreCoverageResponse {
  storeId: string;
  storeName: string;
  totalExpected: number;
  totalCovered: number;
  totalWithBelowMinimum: number;
  totalGaps: number;
  overallCoveragePercent: number;
  /** Healthy refs / total active refs evaluated */
  overallHealthPercent: number;
  lineSummaries: StoreCoverageLineSummary[];
  structures: StoreCoverageStructure[];
  /**
   * AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01:
   * reglas especiales por tienda (BANERA/CUNA_COLECHO/CORRAL) — objetivo de
   * unidades por tienda; NO_AUTORIZADA cuando ideal=0 y hay unidades.
   */
  specialRules: SpecialRuleEvaluation[];
  computedAt: string;
}

// ── Per-reference detail index ────────────────────────────────────────────

interface RefDetail {
  referenceCode: string;
  productName: string;
  totalQty: number;
  variantCount: number;
  minUnits: number;
  idealUnits: number;
  maxUnits: number;
}

type IndexMode = "GROUP_AND_SUBGROUP" | "SUBGROUP" | "SIZE_CLASS";

function resolveItemKey(item: StoreDistributionItem, mode: IndexMode): string | null {
  switch (mode) {
    case "GROUP_AND_SUBGROUP":
      if (item.group && item.group !== "SIN_GRUPO_SAG" && item.subgroup && item.subgroup !== "SIN_SUBGRUPO_SAG") {
        return `${item.group.toUpperCase()}|${item.subgroup.toUpperCase()}`;
      }
      return null;
    case "SUBGROUP":
      if (item.subgroup && item.subgroup !== "SIN_SUBGRUPO_SAG") {
        return item.subgroup.toUpperCase();
      }
      return null;
    case "SIZE_CLASS":
      return item.sizeClass ?? null;
  }
}

/** Build per-reference detail grouped by structure key */
function buildRefDetailIndex(
  items: StoreDistributionItem[],
  mode: IndexMode,
): Map<string, Map<string, RefDetail>> {
  // structureKey → referenceCode → RefDetail
  const index = new Map<string, Map<string, RefDetail>>();

  for (const item of items) {
    if (item.currentUnits <= 0) continue;

    const structKey = resolveItemKey(item, mode);
    if (!structKey) continue;

    if (!index.has(structKey)) index.set(structKey, new Map());
    const refMap = index.get(structKey)!;

    const existing = refMap.get(item.referenceCode);
    if (existing) {
      existing.totalQty += item.currentUnits;
      existing.variantCount += 1;
      // Use max of thresholds (same as inventory-by-line consolidation)
      existing.minUnits = Math.max(existing.minUnits, item.minUnits);
      existing.idealUnits = Math.max(existing.idealUnits, item.idealUnits);
      existing.maxUnits = Math.max(existing.maxUnits, item.maxUnits);
    } else {
      refMap.set(item.referenceCode, {
        referenceCode: item.referenceCode,
        productName: item.productName ?? item.referenceCode,
        totalQty: item.currentUnits,
        variantCount: 1,
        minUnits: item.minUnits,
        idealUnits: item.idealUnits,
        maxUnits: item.maxUnits,
      });
    }
  }

  return index;
}

/** Derive health state for a single reference (coherent with Inventory) */
function deriveReferenceHealthState(qty: number, min: number, max: number): ReferenceHealthState {
  if (qty < min) return "BAJO_MINIMO";
  if (qty > max) return "SOBRE_MAXIMO";
  return "SALUDABLE";
}

// ── Match key builder ─────────────────────────────────────────────────────

function buildMatchKeys(sagGrupo: string | null, sagSubgrupo: string | string[] | null): string[] {
  if (!sagGrupo || !sagSubgrupo) return [];
  const grupo = sagGrupo.toUpperCase();
  if (Array.isArray(sagSubgrupo)) {
    return sagSubgrupo.map(s => `${grupo}|${s.toUpperCase()}`);
  }
  return [`${grupo}|${sagSubgrupo.toUpperCase()}`];
}

// ── Build expected structures with two-dimension evaluation ──────────────

function buildExpectedStructures(
  csRefIndex: Map<string, Map<string, RefDetail>>,
  lkRefIndex: Map<string, Map<string, RefDetail>>,
  accRefIndex: Map<string, Map<string, RefDetail>>,
): StoreCoverageStructure[] {
  const structures: StoreCoverageStructure[] = [];

  const csRule = CASTILLITOS_TEXTILE_COVERAGE;
  const lkRule = LATIN_KIDS_TEXTILE_COVERAGE;
  const accRule = CASTILLITOS_ACCESSORY_COVERAGE;

  // ── CS: per-reference evaluation using GROUP_AND_SUBGROUP ──
  const csCatalog = buildCastillitosTextilCatalog();
  for (const group of csCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const keys = buildMatchKeys(group.sagGrupo, entry.sagSubgrupo);

      // Collect all refs across matching keys (BUZO/CAMIBUSO merge)
      const mergedRefs = new Map<string, RefDetail>();
      for (const key of keys) {
        const refMap = csRefIndex.get(key);
        if (refMap) {
          for (const [ref, detail] of refMap) {
            const existing = mergedRefs.get(ref);
            if (existing) {
              existing.totalQty += detail.totalQty;
              existing.variantCount += detail.variantCount;
            } else {
              mergedRefs.set(ref, { ...detail });
            }
          }
        }
      }

      structures.push(evaluateTextileStructure(
        `CS|${group.sagGrupo}|${entry.subgroupName}`,
        entry.subgroupName,
        group.groupName,
        "CASTILLITOS",
        mergedRefs,
        csRule,
        entry.priority,
      ));
    }
  }

  // ── LK: per-reference evaluation using SUBGROUP ──
  const lkCatalog = buildLatinKidsTextilCatalog();
  for (const group of lkCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const subKey = typeof entry.sagSubgrupo === "string" ? entry.sagSubgrupo.toUpperCase() : null;
      const refMap = subKey ? lkRefIndex.get(subKey) ?? new Map() : new Map();

      structures.push(evaluateTextileStructure(
        `LK|${entry.subgroupName}`,
        entry.subgroupName,
        null,
        "LATIN_KIDS",
        refMap,
        lkRule,
        entry.priority,
      ));
    }
  }

  // ── ACC: aggregate evaluation using SIZE_CLASS ──
  const accCatalog = buildImportAccesoriosCatalog();
  const sizeClassMap: Record<string, string> = { PEQUENO: "small", MEDIANO: "medium", GRANDE: "large" };
  for (const group of accCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      const sc = entry.subgroupCode ? sizeClassMap[entry.subgroupCode.toUpperCase()] ?? null : null;
      const refMap = sc ? accRefIndex.get(sc) ?? new Map() : new Map();

      const target = sc ? (accRule.idealBySize[sc as keyof typeof accRule.idealBySize] ?? 0) : 0;

      structures.push(evaluateAccessoryStructure(
        `ACC|${entry.subgroupName}`,
        entry.subgroupName,
        "ACCESORIOS",
        refMap,
        target,
        entry.priority,
      ));
    }
  }

  return structures;
}

function evaluateTextileStructure(
  structureKey: string,
  label: string,
  groupLabel: string | null,
  line: CoverageLineName,
  refs: Map<string, RefDetail>,
  rule: { minimumUnits: number; idealUnits: number; maximumUnits: number },
  priority: number,
): StoreCoverageStructure {
  const activeRefCount = refs.size;

  // ── AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01 ──
  // Certified law (STORE=UNITS): the rule applies to the TOTAL units of the
  // structure. Per-reference states remain as INFORMATIONAL data only.
  const refQtys = [...refs.values()].map(r => r.totalQty);
  const coverage = evaluateUnitStructureCoverage(refQtys, {
    minUnits: rule.minimumUnits,
    idealUnits: rule.idealUnits,
    maxUnits: rule.maximumUnits,
  });

  const totalStoreUnits = coverage.unitRule.totalUnits;
  let healthyCount = 0;
  let belowMinCount = 0;
  let overMaxCount = 0;
  for (const ref of refs.values()) {
    const state = deriveReferenceHealthState(ref.totalQty, rule.minimumUnits, rule.maximumUnits);
    if (state === "SALUDABLE") healthyCount++;
    else if (state === "BAJO_MINIMO") belowMinCount++;
    else overMaxCount++;
  }

  const structuralCoverageStatus: StructuralCoverageStatus = coverage.structuralStatus;
  const quantitativeHealthStatus: QuantitativeHealthStatus = coverage.quantitativeStatus;

  return {
    structureKey,
    label,
    groupLabel,
    subgroupLabel: label,
    line,
    structuralCoverageStatus,
    activeReferenceCount: activeRefCount,
    totalStoreUnits,
    healthyReferenceCount: healthyCount,
    belowMinimumReferenceCount: belowMinCount,
    overMaximumReferenceCount: overMaxCount,
    minimumUnits: rule.minimumUnits,
    targetUnits: rule.idealUnits,
    maximumUnits: rule.maximumUnits,
    totalShortageToTarget: coverage.unitRule.deficitToIdeal,
    totalShortageToMinimum: coverage.unitRule.deficitToMin,
    unitRule: coverage.unitRule,
    quantitativeHealthStatus,
    priority,
    solutionSummary: null,
  };
}

function evaluateAccessoryStructure(
  structureKey: string,
  label: string,
  line: CoverageLineName,
  refs: Map<string, RefDetail>,
  target: number,
  priority: number,
): StoreCoverageStructure {
  const activeRefCount = refs.size;

  // ACC: same certified unit engine — target acts as min & ideal, no max cap.
  const refQtys = [...refs.values()].map(r => r.totalQty);
  const coverage = evaluateUnitStructureCoverage(refQtys, {
    minUnits: target,
    idealUnits: target,
    maxUnits: Number.MAX_SAFE_INTEGER,
  });
  const totalStoreUnits = coverage.unitRule.totalUnits;

  const structuralCoverageStatus: StructuralCoverageStatus = coverage.structuralStatus;
  const quantitativeHealthStatus: QuantitativeHealthStatus = coverage.quantitativeStatus;

  return {
    structureKey,
    label,
    groupLabel: null,
    subgroupLabel: label,
    line,
    structuralCoverageStatus,
    activeReferenceCount: activeRefCount,
    totalStoreUnits,
    // ACC: no per-reference health eval — counts reflect aggregate
    healthyReferenceCount: totalStoreUnits >= target ? activeRefCount : 0,
    belowMinimumReferenceCount: totalStoreUnits >= target ? 0 : activeRefCount,
    overMaximumReferenceCount: 0,
    minimumUnits: target,
    targetUnits: target,
    maximumUnits: null,
    totalShortageToTarget: coverage.unitRule.deficitToIdeal,
    totalShortageToMinimum: coverage.unitRule.deficitToMin,
    unitRule: coverage.unitRule,
    quantitativeHealthStatus,
    priority,
    solutionSummary: null,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function loadStoreCoverage(
  orgId: string,
  storeId: string,
): Promise<StoreCoverageResponse> {
  const detail = await getCanonicalStoreDetail(orgId, storeId);
  if (!detail) {
    return {
      storeId,
      storeName: storeId,
      totalExpected: 0,
      totalCovered: 0,
      totalWithBelowMinimum: 0,
      totalGaps: 0,
      overallCoveragePercent: 0,
      overallHealthPercent: 0,
      lineSummaries: [],
      structures: [],
      specialRules: [],
      computedAt: new Date().toISOString(),
    };
  }

  const items = detail.items;

  // Build per-reference detail indexes across ALL items.
  // canonicalLine classification can swap CS/LK items. Catalog keys discriminate.
  const csRefIndex = buildRefDetailIndex(items, "GROUP_AND_SUBGROUP");
  const lkRefIndex = buildRefDetailIndex(items, "SUBGROUP");
  const accRefIndex = buildRefDetailIndex(items, "SIZE_CLASS");

  const structures = buildExpectedStructures(csRefIndex, lkRefIndex, accRefIndex);

  // ── Reglas especiales por tienda (UNIT-BASED-COVERAGE-ENGINE-01) ──
  const specialRules = evaluateSpecialRules(
    storeId,
    items.map(i => ({
      referenceCode: i.referenceCode,
      productName: i.productName ?? "",
      currentUnits: i.currentUnits,
    })),
    CASTILLITOS_SPECIAL_PRODUCTS,
  );

  // Per-line summaries
  const lineSummaries: StoreCoverageLineSummary[] = [];
  for (const lineName of ["CASTILLITOS", "LATIN_KIDS", "ACCESORIOS"] as CoverageLineName[]) {
    const lineStructures = structures.filter(s => s.line === lineName);
    const expected = lineStructures.length;
    const covered = lineStructures.filter(s => s.structuralCoverageStatus === "CUBIERTA").length;
    const withBelowMinimum = lineStructures.filter(s => s.quantitativeHealthStatus === "CON_REFERENCIAS_BAJO_MINIMO").length;
    const gaps = lineStructures.filter(s => s.structuralCoverageStatus === "SIN_COBERTURA").length;
    const totalActiveRefs = lineStructures.reduce((s, st) => s + st.activeReferenceCount, 0);
    const totalHealthyRefs = lineStructures.reduce((s, st) => s + st.healthyReferenceCount, 0);
    lineSummaries.push({
      line: lineName,
      expected,
      covered,
      withBelowMinimum,
      gaps,
      coveragePercent: expected > 0 ? Math.round((covered / expected) * 100) : 0,
      healthPercent: totalActiveRefs > 0 ? Math.round((totalHealthyRefs / totalActiveRefs) * 100) : 0,
    });
  }

  const totalExpected = structures.length;
  const totalCovered = structures.filter(s => s.structuralCoverageStatus === "CUBIERTA").length;
  const totalWithBelowMinimum = structures.filter(s => s.quantitativeHealthStatus === "CON_REFERENCIAS_BAJO_MINIMO").length;
  const totalGaps = structures.filter(s => s.structuralCoverageStatus === "SIN_COBERTURA").length;
  const totalActiveRefs = structures.reduce((s, st) => s + st.activeReferenceCount, 0);
  const totalHealthyRefs = structures.reduce((s, st) => s + st.healthyReferenceCount, 0);

  return {
    storeId,
    storeName: detail.store.name,
    totalExpected,
    totalCovered,
    totalWithBelowMinimum,
    totalGaps,
    overallCoveragePercent: totalExpected > 0 ? Math.round((totalCovered / totalExpected) * 100) : 0,
    overallHealthPercent: totalActiveRefs > 0 ? Math.round((totalHealthyRefs / totalActiveRefs) * 100) : 0,
    lineSummaries,
    structures,
    specialRules,
    computedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CANDIDATE EXPANSION — warehouse references for non-healthy structures
// ═══════════════════════════════════════════════════════════════════════════

export type CoverageCandidateRule36 = "ELEGIBLE_CUATRO_TIENDAS" | "BLOQUEADA";
export type CoverageCandidateType =
  | "REPOSICION_MISMA_REFERENCIA"
  | "COMPLEMENTO_REFERENCIA_COMPATIBLE"
  | "REFERENCIA_NUEVA_COMPATIBLE";

export interface CoverageCandidateVariant {
  size: string;
  color: string;
  qty: number;
}

export interface CoverageCandidate {
  referenceCode: string;
  productName: string;
  imageUrl: string | null;
  mainWarehouseStock: number;
  variantCount: number;
  variants: CoverageCandidateVariant[];
  alreadyPresentInStore: boolean;
  storeQty: number;
  rule36Status: CoverageCandidateRule36;
  candidateType: CoverageCandidateType;
}

/** Active store reference with per-reference health evaluation */
export interface CoverageActiveRef {
  referenceCode: string;
  productName: string;
  imageUrl: string | null;
  storeQty: number;
  activeVariants: number;
  /** Per-reference rule */
  minimumUnits: number;
  targetUnits: number;
  maximumUnits: number;
  referenceShortageToTarget: number;
  referenceState: ReferenceHealthState;
}

export interface CoverageCandidatesResponse {
  structureKey: string;
  line: CoverageLineName;
  label: string;
  structuralCoverageStatus: StructuralCoverageStatus;
  quantitativeHealthStatus: QuantitativeHealthStatus;
  totalCompatible: number;
  activeStoreRefs: CoverageActiveRef[];
  eligible: CoverageCandidate[];
  blocked: CoverageCandidate[];
  solutionSummary: SolutionSummary;
  computedAt: string;
}

// AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01 (Ajuste 1): la resolución de
// catálogo y refs compatibles vive en el proveedor compartido; se re-exporta
// el tipo para compatibilidad de consumidores existentes.
export type CoverageCandidateInput = StructureCatalogInfo;

// ── Build candidates with candidate type classification ────────────────────

function buildCandidatesWithTypes(
  compatibleRefs: Set<string>,
  mainStockIndex: MainStockIndex,
  subIndex: SubstitutionIndex,
  storeRefsWithStock: Set<string>,
  storeStockByRef: Map<string, number>,
  scarcity: ScarcityParams,
  storeSlug: string,
  structuralStatus: StructuralCoverageStatus,
): { eligible: CoverageCandidate[]; blocked: CoverageCandidate[]; totalCompatible: number } {
  const eligible: CoverageCandidate[] = [];
  const blocked: CoverageCandidate[] = [];

  for (const ref of compatibleRefs) {
    const mainStock = mainStockIndex.byReference.get(ref) ?? 0;
    if (mainStock <= 0) continue;

    const meta = subIndex.refMeta.get(ref);
    if (!meta) continue;

    const variantRecords = mainStockIndex.byReferenceVariants.get(ref);
    const variantCount = variantRecords?.length ?? 0;
    const variants: CoverageCandidateVariant[] = (variantRecords ?? []).map(v => ({ size: v.size, color: v.color, qty: v.qty }));
    const isPresent = storeRefsWithStock.has(ref);
    const storeQty = storeStockByRef.get(ref) ?? 0;

    // Determine candidate type
    let candidateType: CoverageCandidateType;
    if (structuralStatus === "SIN_COBERTURA") {
      candidateType = "REFERENCIA_NUEVA_COMPATIBLE";
    } else if (isPresent && storeQty > 0) {
      candidateType = "REPOSICION_MISMA_REFERENCIA";
    } else {
      candidateType = "COMPLEMENTO_REFERENCIA_COMPATIBLE";
    }

    // Rule 36 eligibility
    let rule36Status: CoverageCandidateRule36;
    if (candidateType === "REPOSICION_MISMA_REFERENCIA") {
      if (mainStock > scarcity.threshold) {
        rule36Status = "ELEGIBLE_CUATRO_TIENDAS";
      } else if (scarcity.allowedIds.includes(storeSlug)) {
        rule36Status = "ELEGIBLE_CUATRO_TIENDAS";
      } else {
        rule36Status = "BLOQUEADA";
      }
    } else {
      rule36Status = mainStock > scarcity.threshold
        ? "ELEGIBLE_CUATRO_TIENDAS"
        : "BLOQUEADA";
    }

    const candidate: CoverageCandidate = {
      referenceCode: ref,
      productName: meta.productName,
      imageUrl: meta.imageUrl,
      mainWarehouseStock: mainStock,
      variantCount,
      variants,
      alreadyPresentInStore: isPresent,
      storeQty,
      rule36Status,
      candidateType,
    };

    if (rule36Status === "ELEGIBLE_CUATRO_TIENDAS") {
      eligible.push(candidate);
    } else {
      blocked.push(candidate);
    }
  }

  // Sort: reposition first, then by stock DESC
  const typePriority = (c: CoverageCandidate) =>
    c.candidateType === "REPOSICION_MISMA_REFERENCIA" ? 0
      : c.candidateType === "COMPLEMENTO_REFERENCIA_COMPATIBLE" ? 1
      : 2;

  const sortFn = (a: CoverageCandidate, b: CoverageCandidate) => {
    const tp = typePriority(a) - typePriority(b);
    if (tp !== 0) return tp;
    if (b.mainWarehouseStock !== a.mainWarehouseStock) return b.mainWarehouseStock - a.mainWarehouseStock;
    if (b.variantCount !== a.variantCount) return b.variantCount - a.variantCount;
    return a.referenceCode.localeCompare(b.referenceCode);
  };
  eligible.sort(sortFn);
  blocked.sort(sortFn);

  return { eligible, blocked, totalCompatible: eligible.length + blocked.length };
}

// ── Build active store refs with per-reference health ──────────────────────

function buildActiveStoreRefsWithHealth(
  items: StoreDistributionItem[],
  matchKeys: string[],
  mode: IndexMode,
  heroImageMap: Map<string, string>,
  refToProductId: Map<string, string>,
  rule: { minimumUnits: number; idealUnits: number; maximumUnits: number },
): CoverageActiveRef[] {
  // Group items by reference
  const byRef = new Map<string, {
    units: number; variants: number; productName: string;
    minUnits: number; idealUnits: number; maxUnits: number;
  }>();

  for (const item of items) {
    if (item.currentUnits <= 0) continue;

    const itemKey = resolveItemKey(item, mode);
    if (!itemKey || !matchKeys.includes(itemKey)) continue;

    const existing = byRef.get(item.referenceCode);
    if (existing) {
      existing.units += item.currentUnits;
      existing.variants += 1;
      existing.minUnits = Math.max(existing.minUnits, item.minUnits);
      existing.idealUnits = Math.max(existing.idealUnits, item.idealUnits);
      existing.maxUnits = Math.max(existing.maxUnits, item.maxUnits);
    } else {
      byRef.set(item.referenceCode, {
        units: item.currentUnits,
        variants: 1,
        productName: item.productName ?? item.referenceCode,
        minUnits: item.minUnits,
        idealUnits: item.idealUnits,
        maxUnits: item.maxUnits,
      });
    }
  }

  const result: CoverageActiveRef[] = [];
  for (const [ref, data] of byRef) {
    const pid = refToProductId.get(ref) ?? "";
    const min = rule.minimumUnits;
    const ideal = rule.idealUnits;
    const max = rule.maximumUnits;
    result.push({
      referenceCode: ref,
      productName: data.productName,
      imageUrl: heroImageMap.get(pid) ?? null,
      storeQty: data.units,
      activeVariants: data.variants,
      minimumUnits: min,
      targetUnits: ideal,
      maximumUnits: max,
      referenceShortageToTarget: Math.max(0, ideal - data.units),
      referenceState: deriveReferenceHealthState(data.units, min, max),
    });
  }

  // Sort: BAJO_MINIMO first, then by shortage DESC
  result.sort((a, b) => {
    const statePrio = (s: ReferenceHealthState) => s === "BAJO_MINIMO" ? 0 : s === "SALUDABLE" ? 1 : 2;
    const sp = statePrio(a.referenceState) - statePrio(b.referenceState);
    if (sp !== 0) return sp;
    return b.referenceShortageToTarget - a.referenceShortageToTarget;
  });

  return result;
}

// ── Resolve match keys for a structure ─────────────────────────────────────

function resolveMatchKeysForStructure(
  input: CoverageCandidateInput,
): { keys: string[]; mode: IndexMode } {
  if (input.line === "CASTILLITOS") {
    return { keys: buildMatchKeys(input.sagGrupo, input.sagSubgrupo), mode: "GROUP_AND_SUBGROUP" };
  }
  if (input.line === "LATIN_KIDS") {
    const sub = typeof input.sagSubgrupo === "string" ? input.sagSubgrupo.toUpperCase() : null;
    return { keys: sub ? [sub] : [], mode: "SUBGROUP" };
  }
  if (input.line === "ACCESORIOS") {
    return { keys: input.sizeClass ? [input.sizeClass] : [], mode: "SIZE_CLASS" };
  }
  return { keys: [], mode: "GROUP_AND_SUBGROUP" };
}

// ── Resolve rule for a structure ──────────────────────────────────────────

function resolveRuleForStructure(
  input: CoverageCandidateInput,
): { minimumUnits: number; idealUnits: number; maximumUnits: number } {
  if (input.line === "CASTILLITOS") return CASTILLITOS_TEXTILE_COVERAGE;
  if (input.line === "LATIN_KIDS") return LATIN_KIDS_TEXTILE_COVERAGE;
  if (input.line === "ACCESORIOS" && input.sizeClass) {
    const target = CASTILLITOS_ACCESSORY_COVERAGE.idealBySize[input.sizeClass as keyof typeof CASTILLITOS_ACCESSORY_COVERAGE.idealBySize] ?? 0;
    return { minimumUnits: target, idealUnits: target, maximumUnits: target };
  }
  return { minimumUnits: 0, idealUnits: 0, maximumUnits: 0 };
}

// ── Main candidate entry point ────────────────────────────────────────────

export async function loadStoreCoverageCandidates(
  orgId: string,
  storeId: string,
  structureKeys: string[],
  coverageStatuses?: Record<string, StructuralCoverageStatus>,
): Promise<CoverageCandidatesResponse[]> {
  const [distData, detail] = await Promise.all([
    loadDistributionData(orgId),
    getCanonicalStoreDetail(orgId, storeId),
  ]);

  if (!detail) return [];

  const mainStockIndex = buildMainStockIndex(distData.mainStock);
  const heroImageMap = await loadHeroImageMap(orgId);
  const subIndex = buildSubstitutionIndex(
    distData.storeInventory,
    mainStockIndex,
    distData.grupoByRef,
    heroImageMap,
    distData.refToProductId,
    distData.sizeClassByRef,
  );
  const scarcity = getScarcityParams();

  // Build store refs with stock
  const storeRefsWithStock = new Set<string>();
  const storeStockByRef = new Map<string, number>();
  for (const item of detail.items) {
    if (item.currentUnits > 0) {
      storeRefsWithStock.add(item.referenceCode);
      storeStockByRef.set(item.referenceCode, (storeStockByRef.get(item.referenceCode) ?? 0) + item.currentUnits);
    }
  }

  const results: CoverageCandidatesResponse[] = [];

  for (const structureKey of structureKeys) {
    const catalogInfo = resolveCatalogInfo(structureKey);
    const structStatus = coverageStatuses?.[structureKey] ?? "SIN_COBERTURA";

    if (!catalogInfo) {
      results.push({
        structureKey,
        line: "CASTILLITOS",
        label: structureKey,
        structuralCoverageStatus: structStatus,
        quantitativeHealthStatus: "SIN_REFERENCIAS",
        totalCompatible: 0,
        activeStoreRefs: [],
        eligible: [],
        blocked: [],
        solutionSummary: { sameReferenceCandidates: 0, compatibleReferenceCandidates: 0, eligibleCandidates: 0, blockedCandidates: 0, totalWarehouseUnits: 0 },
        computedAt: new Date().toISOString(),
      });
      continue;
    }

    const compatibleRefs = findCompatibleRefs(catalogInfo, subIndex);
    const { eligible, blocked, totalCompatible } = buildCandidatesWithTypes(
      compatibleRefs,
      mainStockIndex,
      subIndex,
      storeRefsWithStock,
      storeStockByRef,
      scarcity,
      storeId,
      structStatus,
    );

    // Build active store refs with per-reference health
    let activeStoreRefs: CoverageActiveRef[] = [];
    if (structStatus === "CUBIERTA") {
      const { keys, mode } = resolveMatchKeysForStructure(catalogInfo);
      const rule = resolveRuleForStructure(catalogInfo);
      activeStoreRefs = buildActiveStoreRefsWithHealth(detail.items, keys, mode, heroImageMap, distData.refToProductId, rule);
    }

    // Determine quantitative health from active refs
    const belowMinCount = activeStoreRefs.filter(r => r.referenceState === "BAJO_MINIMO").length;
    const qHealth: QuantitativeHealthStatus = structStatus === "SIN_COBERTURA"
      ? "SIN_REFERENCIAS"
      : belowMinCount > 0 ? "CON_REFERENCIAS_BAJO_MINIMO" : "SALUDABLE";

    // Solution summary
    const sameRefCount = [...eligible, ...blocked].filter(c => c.candidateType === "REPOSICION_MISMA_REFERENCIA").length;
    const compatRefCount = [...eligible, ...blocked].filter(c =>
      c.candidateType === "COMPLEMENTO_REFERENCIA_COMPATIBLE" || c.candidateType === "REFERENCIA_NUEVA_COMPATIBLE"
    ).length;
    const totalWarehouseUnits = eligible.reduce((s, c) => s + c.mainWarehouseStock, 0);

    results.push({
      structureKey,
      line: catalogInfo.line,
      label: structureKey,
      structuralCoverageStatus: structStatus,
      quantitativeHealthStatus: qHealth,
      totalCompatible,
      activeStoreRefs,
      eligible: eligible.slice(0, 10),
      blocked: blocked.slice(0, 5),
      solutionSummary: {
        sameReferenceCandidates: sameRefCount,
        compatibleReferenceCandidates: compatRefCount,
        eligibleCandidates: eligible.length,
        blockedCandidates: blocked.length,
        totalWarehouseUnits,
      },
      computedAt: new Date().toISOString(),
    });
  }

  return results;
}
