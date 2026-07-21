/**
 * maletas-functional-evaluation.ts
 *
 * MALLETS-FUNCTIONAL-RECOVERY-01
 *
 * Server-side evaluation logic for:
 * 1. Assortment catalog evaluation (derrotero) per vendor
 * 2. Production threshold decision (brand+subgrupo, NOT per-ref)
 * 3. Recompra/baja rotación for import refs
 * 4. Coverage opportunities derived from derrotero faltantes
 *
 * Pure computation — no Prisma, no UI imports.
 */

import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "./assortment-catalog/castillitos-mallet-assortment-catalog";
import type {
  MalletAssortmentCatalog,
  MalletAssortmentGroup,
} from "./assortment-catalog/mallet-assortment-types";
import type { VendorSampleRef, VendorSampleSnapshot } from "./vendor-sample-types";

// ══════════════════════════════════════════════════════════════════════════════
// 1. ASSORTMENT EVALUATION — per vendor, per catalog
// ══════════════════════════════════════════════════════════════════════════════

export interface AssortmentGroupEval {
  groupCode: string;
  groupName: string;
  sagGrupo: string | null;
  entries: AssortmentEntryEval[];
  completeEntries: number;
  missingEntries: number;
  excessEntries: number;
  groupCompletion: number;
}

export interface AssortmentEntryEval {
  subgroupCode: string | null;
  subgroupName: string;
  sagSubgrupos: string[];     // SAG sc_detalle_subgrupo values for matching
  targetUnits: number;        // idealEffective (customIdeal ?? officialIdeal)
  officialIdeal: number;      // original value from catalog code
  isCustomIdeal: boolean;     // true when a custom override is active
  currentUnits: number;
  delta: number;
  complete: boolean;
  excess: boolean;
  matchedReferences: string[];
}

export interface CatalogEvaluation {
  catalogId: string;
  catalogName: string;
  catalogVersion: string;
  commercialWorld: string;
  brand: string | null;
  groups: AssortmentGroupEval[];
  overallCompletion: number;
  totalComplete: number;
  totalMissing: number;
  totalExcess: number;
  totalEntries: number;
}

// MALLETS-DERROTERO-DATA-SOURCE-HOTFIX-01: typed unresolved reasons
export type UnresolvedReason =
  | "PRODUCT_NOT_RESOLVED"
  | "SIZECLASS_MISSING_IN_SAG"
  | "SIZECLASS_UNMAPPED"
  | "HISTORICAL_REFERENCE"
  | "NOT_IMPORT_PRODUCT";

export interface UnresolvedRef {
  reference: string;
  description: string;
  line: string;
  reason: UnresolvedReason;
  reasonLabel: string;
}

export interface UnresolvedSummary {
  total: number;
  sinSizeClassEnSag: number;
  productoNoResuelto: number;
  valorNoHomologado: number;
  noEsImportacion: number;
}

export interface VendorAssortmentResult {
  vendorId: string;
  catalogs: CatalogEvaluation[];
  unresolvedRefs: UnresolvedRef[];
  unresolvedSummary: UnresolvedSummary;
}

/**
 * Map of ideal overrides: key = "catalogId|groupCode|subgroupCode" → idealUnits.
 * MALETAS-DERROTERO-IDEALES-EDITABLES-01
 */
export type IdealOverrideMap = Map<string, number>;

export function idealOverrideKey(catalogId: string, groupCode: string, subgroupCode: string): string {
  return `${catalogId}|${groupCode}|${subgroupCode}`;
}

/**
 * Evaluate a vendor's refs against all applicable catalogs.
 */
export function evaluateVendorAssortment(
  vendor: VendorSampleSnapshot,
  idealOverrides?: IdealOverrideMap,
  /** COMERCIAL-MALETAS-DERROTERO-EXCLUDE-RETIRO-01: optional filter to exclude RETIRO refs */
  refFilter?: (ref: VendorSampleRef) => boolean,
): VendorAssortmentResult {
  const catalogs: CatalogEvaluation[] = [];
  const unresolvedRefs: UnresolvedRef[] = [];

  // COMERCIAL-MALETAS-DERROTERO-EXCLUDE-RETIRO-01: only derrotero-eligible refs.
  // RETIRO candidates are excluded from coverage, completion, and faltantes.
  const presentRefs = refFilter ? vendor.refs.filter(refFilter) : vendor.refs;

  // Castillitos Textil
  const csRefs = presentRefs.filter((r) => r.brand === "Castillitos" && r.line !== "IMPORT");
  const csCatalog = buildCastillitosTextilCatalog();
  if (csRefs.length > 0 || vendor.lines.includes("CS")) {
    catalogs.push(evaluateCatalog(csCatalog, csRefs, "TEXTIL", idealOverrides));
  }

  // Latin Kids Textil
  const ltRefs = presentRefs.filter((r) => r.brand === "Latin Kids" && r.line !== "IMPORT");
  const ltCatalog = buildLatinKidsTextilCatalog();
  if (ltRefs.length > 0 || vendor.lines.includes("LT")) {
    catalogs.push(evaluateCatalog(ltCatalog, ltRefs, "TEXTIL", idealOverrides));
  }

  // Import/Accesorios
  const importRefs = presentRefs.filter((r) => r.line === "IMPORT" || r.isAccessory);
  const importCatalog = buildImportAccesoriosCatalog();
  if (importRefs.length > 0 || vendor.lines.includes("IMPORT")) {
    catalogs.push(evaluateCatalog(importCatalog, importRefs, "IMPORTACION", idealOverrides));
  }

  // Unresolved: import/accessory refs without sizeClass
  // MALLETS-DERROTERO-DATA-SOURCE-HOTFIX-01: typed classification
  for (const ref of presentRefs) {
    if (ref.line === "IMPORT" || ref.isAccessory) {
      if (!ref.sizeClass) {
        let reason: UnresolvedReason;
        let reasonLabel: string;
        if (!ref.brand && !ref.group) {
          reason = "PRODUCT_NOT_RESOLVED";
          reasonLabel = "Producto no resuelto en dominio de producto";
        } else {
          // IMPORT-SIZECLASS-FROM-SAG-01: sizeClass comes from handlingUnit
          reason = "SIZECLASS_MISSING_IN_SAG";
          reasonLabel = "Sin Unidad de manejo en SAG (campo requerido para derrotero Import)";
        }
        unresolvedRefs.push({
          reference: ref.reference,
          description: ref.description,
          line: ref.line,
          reason,
          reasonLabel,
        });
      }
    }
    // Textil refs without group are not unresolved for derrotero — they still match by subgrupoSag
  }

  const unresolvedSummary: UnresolvedSummary = {
    total: unresolvedRefs.length,
    sinSizeClassEnSag: unresolvedRefs.filter((r) => r.reason === "SIZECLASS_MISSING_IN_SAG").length,
    productoNoResuelto: unresolvedRefs.filter((r) => r.reason === "PRODUCT_NOT_RESOLVED").length,
    valorNoHomologado: unresolvedRefs.filter((r) => r.reason === "SIZECLASS_UNMAPPED").length,
    noEsImportacion: unresolvedRefs.filter((r) => r.reason === "NOT_IMPORT_PRODUCT").length,
  };

  return { vendorId: vendor.vendorId, catalogs, unresolvedRefs, unresolvedSummary };
}

function evaluateCatalog(
  catalog: MalletAssortmentCatalog,
  refs: VendorSampleRef[],
  world: string,
  idealOverrides?: IdealOverrideMap,
): CatalogEvaluation {
  const groups: AssortmentGroupEval[] = [];
  let totalComplete = 0;
  let totalMissing = 0;
  let totalExcess = 0;
  let totalEntries = 0;

  for (const group of catalog.groups) {
    const entryResults: AssortmentEntryEval[] = [];
    let gc = 0, gm = 0, ge = 0;

    for (const entry of group.entries) {
      if (!entry.active) continue;
      const matched = matchRefs(refs, group, entry, world);
      const currentUnits = matched.length;

      // MALETAS-DERROTERO-IDEALES-EDITABLES-01: idealEffective = customIdeal ?? officialIdeal
      const overrideKey = entry.subgroupCode ? idealOverrideKey(catalog.catalogId, group.groupCode, entry.subgroupCode) : null;
      const idealEffective = (overrideKey ? idealOverrides?.get(overrideKey) : undefined) ?? entry.targetUnits;

      const delta = currentUnits - idealEffective;
      const complete = currentUnits >= idealEffective;
      const excess = currentUnits > idealEffective;

      entryResults.push({
        subgroupCode: entry.subgroupCode,
        subgroupName: entry.subgroupName,
        sagSubgrupos: entry.sagSubgrupo
          ? (Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo : [entry.sagSubgrupo])
          : [],
        targetUnits: idealEffective,
        officialIdeal: entry.targetUnits,
        isCustomIdeal: idealEffective !== entry.targetUnits,
        currentUnits,
        delta,
        complete,
        excess,
        matchedReferences: matched.map((r) => r.reference),
      });

      if (complete) gc++;
      else gm++;
      if (excess) ge++;
      totalEntries++;
    }

    totalComplete += gc;
    totalMissing += gm;
    totalExcess += ge;

    const activeEntries = group.entries.filter((e) => e.active).length;
    groups.push({
      groupCode: group.groupCode,
      groupName: group.groupName,
      sagGrupo: group.sagGrupo ?? null,
      entries: entryResults,
      completeEntries: gc,
      missingEntries: gm,
      excessEntries: ge,
      groupCompletion: activeEntries > 0 ? Math.round((gc / activeEntries) * 100) : 100,
    });
  }

  const overallCompletion = totalEntries > 0
    ? Math.round((totalComplete / totalEntries) * 100)
    : 0;

  return {
    catalogId: catalog.catalogId,
    catalogName: catalog.name,
    catalogVersion: catalog.version,
    commercialWorld: catalog.commercialWorld,
    brand: catalog.brand,
    groups,
    overallCompletion,
    totalComplete,
    totalMissing,
    totalExcess,
    totalEntries,
  };
}

function matchRefs(
  refs: VendorSampleRef[],
  group: MalletAssortmentGroup,
  entry: { subgroupCode: string | null; sagSubgrupo: string | string[] | null },
  world: string,
): VendorSampleRef[] {
  if (world === "IMPORTACION") {
    // Import: match by sizeClass (handlingUnit). Unchanged.
    return refs.filter(
      (r) => r.sizeClass !== null && r.sizeClass === entry.subgroupCode,
    );
  }

  // Textil: match by SAG keys (MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01)
  // If no sagSubgrupo mapping exists, this entry has no confirmed SAG match → return empty.
  if (entry.sagSubgrupo == null) return [];

  const sagValues = Array.isArray(entry.sagSubgrupo)
    ? entry.sagSubgrupo
    : [entry.sagSubgrupo];

  if (group.sagGrupo != null) {
    // Castillitos: must match grupo SAG + subgrupo SAG
    return refs.filter(
      (r) => r.grupoSag === group.sagGrupo && sagValues.includes(r.subgrupoSag),
    );
  }

  // Latin Kids: match by subgrupo SAG only (no grupo constraint)
  return refs.filter(
    (r) => sagValues.includes(r.subgrupoSag),
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PRODUCTION THRESHOLD DECISION — by brand + subgrupo
// ══════════════════════════════════════════════════════════════════════════════

// Threshold = activation trigger, NOT batch minimum
const PRODUCTION_THRESHOLD: Record<string, number> = {
  Castillitos: 100,
  "Latin Kids": 200,
};

/**
 * Build the composite key for production stock/OP lookups.
 * Castillitos: grupoSag|subgrupoSag (same subgrupo in different grupos = different decision units)
 * Latin Kids: subgrupoSag only (no grupo constraint per spec)
 */
export function productionStockKey(
  brand: string,
  grupoSag: string | null,
  subgrupoSag: string,
): string {
  if (brand === "Castillitos" && grupoSag) {
    return `${grupoSag}|${subgrupoSag}`;
  }
  return subgrupoSag;
}

export type ProductionDecision =
  | "PRODUCIR"
  | "ESPERAR_OP"
  | "SIN_ACCION"
  | "DATOS_INSUFICIENTES"
  | "EN_VALIDACION";

/** Data quality state for a production decision unit */
export type ProductionDataState =
  | "STOCK_REAL_CERO"         // Valid rows exist, sum = 0
  | "STOCK_REAL_POSITIVO"     // Valid rows exist, sum > 0
  | "SIN_CORRESPONDENCIA"    // No matching key between stock map and ref grouping
  | "DATO_DESACTUALIZADO"    // Source exceeds freshness limit
  | "SIN_DATOS";             // Source has no data for this brand

export interface SubgroupProductionEval {
  brand: string;
  group: string | null;
  subgrupoSag: string;
  stockDisponible: number;
  umbral: number;
  tieneOpActiva: boolean;
  decision: ProductionDecision;
  dataState: ProductionDataState;
  evidenceRefs: Array<{ reference: string; description: string; available: number }>;
}

/**
 * Evaluate production thresholds by brand + subgrupo.
 * Groups inventory by brand+subgrupo, checks against threshold, checks OP.
 *
 * @param snapshotIsStale — true when the coverage snapshot exceeds the freshness limit.
 *   Stale data gates all decisions to EN_VALIDACION (never PRODUCIR).
 */
export function evaluateProductionThresholds(
  vendors: VendorSampleSnapshot[],
  centralStockBySubgrupo: Map<string, number>,
  opActiveBySubgrupo: Set<string>,
  snapshotIsStale = false,
): SubgroupProductionEval[] {
  // Collect all unique brand+grupo+subgrupo combinations from active vendor refs
  // Castillitos: grupo+subgrupo = decision unit (same subgrupo in different grupos → different units)
  // Latin Kids: subgrupo only = decision unit
  const subgrupoMap = new Map<string, {
    brand: string;
    group: string | null;
    grupoSag: string | null;
    subgrupoSag: string;
    refs: Array<{ reference: string; description: string; available: number }>;
  }>();

  for (const vendor of vendors) {
    if (!vendor.isActive) continue;
    for (const ref of vendor.refs) {
      if (ref.line === "IMPORT" || ref.isAccessory) continue;
      // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01: exclude unresolved lines from production decisions
      if (ref.line !== "CS" && ref.line !== "LT") continue;
      if (!ref.brand) continue;
      const key = `${ref.brand}|${productionStockKey(ref.brand, ref.grupoSag, ref.subgrupoSag)}`;
      if (!subgrupoMap.has(key)) {
        subgrupoMap.set(key, {
          brand: ref.brand,
          group: ref.group,
          grupoSag: ref.grupoSag,
          subgrupoSag: ref.subgrupoSag,
          refs: [],
        });
      }
      const entry = subgrupoMap.get(key)!;
      if (!entry.refs.some((r) => r.reference === ref.reference)) {
        entry.refs.push({
          reference: ref.reference,
          description: ref.description,
          available: ref.centralAvailable,
        });
      }
    }
  }

  const results: SubgroupProductionEval[] = [];

  for (const [, data] of Array.from(subgrupoMap)) {
    const umbral = PRODUCTION_THRESHOLD[data.brand];
    if (umbral === undefined) {
      results.push({
        brand: data.brand,
        group: data.grupoSag,
        subgrupoSag: data.subgrupoSag,
        stockDisponible: 0,
        umbral: 0,
        tieneOpActiva: false,
        decision: "DATOS_INSUFICIENTES",
        dataState: "SIN_DATOS",
        evidenceRefs: data.refs.slice(0, 5),
      });
      continue;
    }

    const stockKey = productionStockKey(data.brand, data.grupoSag, data.subgrupoSag);
    const stockValue = centralStockBySubgrupo.get(stockKey);

    // Missing stock data → SIN_CORRESPONDENCIA (never treat missing as zero)
    if (stockValue === undefined) {
      results.push({
        brand: data.brand,
        group: data.grupoSag,
        subgrupoSag: data.subgrupoSag,
        stockDisponible: 0,
        umbral,
        tieneOpActiva: false,
        decision: "EN_VALIDACION",
        dataState: "SIN_CORRESPONDENCIA",
        evidenceRefs: data.refs.slice(0, 5),
      });
      continue;
    }

    const stock = stockValue;
    const hasOp = opActiveBySubgrupo.has(stockKey);
    const dataState: ProductionDataState = stock === 0
      ? "STOCK_REAL_CERO"
      : "STOCK_REAL_POSITIVO";

    // Stale snapshot → EN_VALIDACION (never auto-suggest production from old data)
    if (snapshotIsStale) {
      results.push({
        brand: data.brand,
        group: data.grupoSag,
        subgrupoSag: data.subgrupoSag,
        stockDisponible: stock,
        umbral,
        tieneOpActiva: hasOp,
        decision: "EN_VALIDACION",
        dataState: "DATO_DESACTUALIZADO",
        evidenceRefs: data.refs.slice(0, 5),
      });
      continue;
    }

    let decision: ProductionDecision;
    if (stock <= umbral) {
      decision = hasOp ? "ESPERAR_OP" : "PRODUCIR";
    } else {
      decision = "SIN_ACCION";
    }

    results.push({
      brand: data.brand,
      group: data.grupoSag,
      subgrupoSag: data.subgrupoSag,
      stockDisponible: stock,
      umbral,
      tieneOpActiva: hasOp,
      decision,
      dataState,
      evidenceRefs: data.refs.slice(0, 5),
    });
  }

  // Sort: PRODUCIR first, then ESPERAR_OP, then validation, then others
  const ORDER: Record<ProductionDecision, number> = {
    PRODUCIR: 0,
    ESPERAR_OP: 1,
    EN_VALIDACION: 2,
    DATOS_INSUFICIENTES: 3,
    SIN_ACCION: 4,
  };
  results.sort((a, b) => ORDER[a.decision] - ORDER[b.decision] || a.stockDisponible - b.stockDisponible);

  return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. RECOMPRA / BAJA ROTACION for import refs
// ══════════════════════════════════════════════════════════════════════════════

export type RebuyDecision = "REBUY" | "WATCH" | "DO_NOT_REBUY" | "INSUFFICIENT_DATA";
export type ImportRefDecision = RebuyDecision | "LOW_ROTATION";

export interface ImportRefEvaluation {
  reference: string;
  description: string;
  group: string | null;
  subgrupoSag: string;
  sizeClass: string | null;
  price: number | null;
  inventario: number;
  ultimoIngreso: string | null;
  mesesSinIngreso: number | null;
  velocidadVenta: number | null;
  decision: ImportRefDecision;
  motivo: string;
}

export interface ImportDiagnostic {
  evaluadas: number;
  sinFechaIngreso: number;
  sinVentas: number;
  sinTamano: number;
  sinInventario: number;
  watch: number;
  doNotRebuy: number;
  rebuy: number;
  lowRotation: number;
}

export interface ImportEvaluationResult {
  evaluations: ImportRefEvaluation[];
  diagnostic: ImportDiagnostic;
}

const LOW_ROTATION_MONTHS = 8;

/**
 * Evaluate import refs for recompra and baja rotacion.
 * Uses available data from vendor refs — velocity and ingreso date may be null.
 */
export function evaluateImportRefs(
  vendors: VendorSampleSnapshot[],
  now: Date = new Date(),
): ImportEvaluationResult {
  // Collect unique import refs across active vendors
  const refMap = new Map<string, VendorSampleRef>();
  for (const vendor of vendors) {
    if (!vendor.isActive) continue;
    for (const ref of vendor.refs) {
      if (!ref.isAccessory && ref.line !== "IMPORT") continue;
      if (!refMap.has(ref.reference)) {
        refMap.set(ref.reference, ref);
      }
    }
  }

  const evaluations: ImportRefEvaluation[] = [];
  const diag: ImportDiagnostic = {
    evaluadas: 0,
    sinFechaIngreso: 0,
    sinVentas: 0,
    sinTamano: 0,
    sinInventario: 0,
    watch: 0,
    doNotRebuy: 0,
    rebuy: 0,
    lowRotation: 0,
  };

  for (const [, ref] of Array.from(refMap)) {
    // COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 2:
    // Skip refs with no availability data — absence ≠ zero.
    if (ref.state === "sin_datos") continue;
    diag.evaluadas++;
    const inventario = ref.centralAvailable;
    const ultimoIngreso = ref.lastTransferDate ?? null;
    const sizeClass = ref.sizeClass ?? null;
    // velocity: we don't have direct sales velocity data in VendorSampleRef
    // Use centralAvailable as proxy — lower stock = faster consumption
    const velocidadVenta: number | null = null;

    if (!sizeClass) diag.sinTamano++;
    if (!ultimoIngreso) diag.sinFechaIngreso++;
    if (inventario <= 0) diag.sinInventario++;

    let mesesSinIngreso: number | null = null;
    if (ultimoIngreso) {
      const ingresoDate = new Date(ultimoIngreso);
      mesesSinIngreso = Math.floor(
        (now.getTime() - ingresoDate.getTime()) / (1000 * 60 * 60 * 24 * 30),
      );
    }

    let decision: ImportRefDecision;
    let motivo: string;

    if (inventario <= 0) {
      decision = "DO_NOT_REBUY";
      motivo = "Sin inventario disponible";
      diag.doNotRebuy++;
    } else if (!ultimoIngreso) {
      decision = "INSUFFICIENT_DATA";
      motivo = "Sin fecha de ultimo ingreso — no se puede calcular rotacion";
      diag.sinVentas++;
    } else if (mesesSinIngreso !== null && mesesSinIngreso >= LOW_ROTATION_MONTHS) {
      decision = "LOW_ROTATION";
      motivo = `${mesesSinIngreso} meses sin reingreso (umbral: ${LOW_ROTATION_MONTHS})`;
      diag.lowRotation++;
    } else if (inventario <= 5) {
      decision = "REBUY";
      motivo = `Inventario bajo (${inventario} unidades) con rotacion activa`;
      diag.rebuy++;
    } else if (inventario <= 15) {
      decision = "WATCH";
      motivo = `Inventario moderado (${inventario} unidades) — monitorear`;
      diag.watch++;
    } else {
      decision = "DO_NOT_REBUY";
      motivo = `Inventario suficiente (${inventario} unidades)`;
      diag.doNotRebuy++;
    }

    evaluations.push({
      reference: ref.reference,
      description: ref.description,
      group: ref.group,
      subgrupoSag: ref.subgrupoSag,
      sizeClass,
      price: null, // no price in VendorSampleRef
      inventario,
      ultimoIngreso,
      mesesSinIngreso,
      velocidadVenta,
      decision,
      motivo,
    });
  }

  // Sort: REBUY first, then LOW_ROTATION, WATCH, INSUFFICIENT_DATA, DO_NOT_REBUY
  const ORDER: Record<ImportRefDecision, number> = {
    REBUY: 0,
    LOW_ROTATION: 1,
    WATCH: 2,
    INSUFFICIENT_DATA: 3,
    DO_NOT_REBUY: 4,
  };
  evaluations.sort((a, b) => ORDER[a.decision] - ORDER[b.decision]);

  return { evaluations, diagnostic: diag };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. COVERAGE THRESHOLDS & OPPORTUNITIES — derived from derrotero faltantes
// ══════════════════════════════════════════════════════════════════════════════

// ── COVERAGE ELIGIBILITY THRESHOLDS ─────────────────────────────────────────
// Per-reference candidate eligibility: a replacement ref must have
// disponible STRICTLY GREATER than its line exit threshold.
//
// These match SAMPLE_MINIMUM_RULES (vendor-sample-types.ts):
//   Castillitos (CS): candidate disponible > 20
//   Latin Kids  (LT): candidate disponible > 30
//   Import/Acc:       candidate disponible > 10
//
// NOTE: 100/200 are PRODUCTION_THRESHOLD values for subgroup-aggregate
// decisions. They must NOT be reused as per-ref coverage eligibility.

export const COVERAGE_ELIGIBILITY_THRESHOLDS: Readonly<Record<string, number>> = {
  Castillitos: 20,
  "Latin Kids": 30,
  IMPORTACION: 10,
};

// ── OP Coverage Freshness ────────────────────────────────────────────────────

export const OP_COVERAGE_MAX_AGE_DAYS = 60;

export type OpExclusionReason =
  | "OP_STALE"
  | "OP_NO_OPERATIONAL_DATE"
  | "OP_BELOW_THRESHOLD"
  | "OP_CLASSIFICATION_MISMATCH";

/** OP candidate passed to the coverage engine from vendor-sample-loader */
export interface OpCoverageCandidate {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;
  grupoSag: string | null;
  pendingQty: number;
  opNumber: string;
  createdAt: string;
  lastEventDate: string | null;
}

function getOpOperationalDate(op: OpCoverageCandidate): Date | null {
  const raw = op.lastEventDate ?? op.createdAt ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export type OpEligibilityResult =
  | { eligible: true; operationalDate: Date; ageDays: number }
  | { eligible: false; reason: OpExclusionReason };

export function checkOpEligibility(
  op: OpCoverageCandidate,
  now: Date,
): OpEligibilityResult {
  if (op.pendingQty <= 0) {
    return { eligible: false, reason: "OP_BELOW_THRESHOLD" };
  }
  const operationalDate = getOpOperationalDate(op);
  if (!operationalDate) {
    return { eligible: false, reason: "OP_NO_OPERATIONAL_DATE" };
  }
  const ageDays = (now.getTime() - operationalDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > OP_COVERAGE_MAX_AGE_DAYS) {
    return { eligible: false, reason: "OP_STALE" };
  }
  return { eligible: true, operationalDate, ageDays };
}

// ── Matching helpers ────────────────────────────────────────────────────────

function matchesTextilEntry(
  candidateLine: string,
  candidateSubgrupoSag: string | null,
  candidateGrupoSag: string | null,
  requiredLine: string,
  sagGrupo: string | null,
  sagSubgrupos: string[],
): boolean {
  if (candidateLine !== requiredLine) return false;
  if (!candidateSubgrupoSag) return false;
  if (!sagSubgrupos.includes(candidateSubgrupoSag)) return false;
  if (sagGrupo && candidateGrupoSag !== sagGrupo) return false;
  return true;
}

// ── Coverage Output Types ───────────────────────────────────────────────────

export type CoverageSource = "BODEGA" | "OP_ACTIVA";

/** A target bag need that a replacement can serve */
export interface CoverageTarget {
  vendorId: string;
  vendorName?: string;
  catalogName: string;
  groupName: string;
  subgroupName: string;
  faltante: number;
}

/** Textile coverage opportunity (BODEGA or OP_ACTIVA — never PRODUCCION_URGENTE) */
export interface TextileCoverageOpportunity {
  replacementReference: string;
  replacementDescription: string;
  source: CoverageSource;
  line: string;
  brand: string;
  group: string;
  subgroup: string;
  availableNow: number | null;
  incomingUnits: number | null;
  opNumber: string | null;
  operationalDate: string | null;
  ageDays: number | null;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  explanation: string;
  targets: CoverageTarget[];
}

/** Import coverage opportunity (BODEGA only — no OP, no production) */
export interface ImportCoverageOpportunity {
  replacementReference: string;
  replacementDescription: string;
  source: "BODEGA";
  sizeClass: string;
  availableNow: number;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  explanation: string;
  targets: CoverageTarget[];
}

/** Textile gap with no coverage — routes to production section */
export interface UrgentProductionNeed {
  line: string;
  brand: string;
  group: string;
  subgroup: string;
  sagGrupo: string | null;
  sagSubgrupos: string[];
  totalFaltante: number;
  affectedVendors: string[];
  explanation: string;
}

/** Grouped coverage result — COMERCIAL-MALETAS-COVERAGE-BUSINESS-VIEW-08 */
export interface BusinessCoverageResult {
  textileCoverage: TextileCoverageOpportunity[];
  importCoverage: ImportCoverageOpportunity[];
  urgentProductionNeeds: UrgentProductionNeed[];
}

// ── Legacy compat type (kept for backward compatibility during migration) ──
export type CoverageOpportunity = TextileCoverageOpportunity | ImportCoverageOpportunity;

/**
 * Business Coverage Engine — COMERCIAL-MALETAS-COVERAGE-BUSINESS-VIEW-08
 *
 * Produces three separate outputs:
 *   textileCoverage:        real replacement opportunities (BODEGA or OP_ACTIVA)
 *   importCoverage:         import replacements (BODEGA only, no OP)
 *   urgentProductionNeeds:  textile gaps with no coverage (routed to production)
 *
 * Textile rules:
 *   CS: line + grupoSag + subgrupoSag
 *   LT: line + subgrupoSag
 *   Waterfall: bodega → OP activa (60d) → urgentProductionNeeds
 *
 * Import rules:
 *   sizeClass match only
 *   Bodega only — no OP, no production suggestions in Maletas
 *
 * Grouped by replacementReference+source: one row per replacement, N targets.
 */
export function findBusinessCoverageOpportunities(
  evaluations: VendorAssortmentResult[],
  allCentralRefs: Array<{
    reference: string;
    description: string;
    line: string;
    grupoSag: string | null;
    subgrupoSag: string | null;
    sizeClass: string | null;
    disponible: number;
  }>,
  opCandidates: OpCoverageCandidate[],
  vendorRefSets: Map<string, Set<string>>,
): BusinessCoverageResult {
  const now = new Date();

  // Pre-filter OP candidates
  const freshOpCandidates = opCandidates.filter((op) => checkOpEligibility(op, now).eligible);

  // Accumulators grouped by replacementRef+source
  const textileMap = new Map<string, TextileCoverageOpportunity>();
  const importMap = new Map<string, ImportCoverageOpportunity>();
  const urgentMap = new Map<string, UrgentProductionNeed>();

  for (const vendorEval of evaluations) {
    const vendorRefs = vendorRefSets.get(vendorEval.vendorId) ?? new Set<string>();

    for (const catalog of vendorEval.catalogs) {
      const isImport = catalog.commercialWorld === "IMPORTACION";

      const threshold = isImport
        ? COVERAGE_ELIGIBILITY_THRESHOLDS.IMPORTACION
        : (catalog.brand ? COVERAGE_ELIGIBILITY_THRESHOLDS[catalog.brand] : undefined);
      if (threshold === undefined) continue;

      const requiredLine = isImport ? null : (
        catalog.brand === "Castillitos" ? "CS" :
        catalog.brand === "Latin Kids" ? "LT" : null
      );

      for (const group of catalog.groups) {
        for (const entry of group.entries) {
          if (entry.complete) continue;
          const needed = entry.targetUnits - entry.currentUnits;
          if (needed <= 0) continue;

          const target: CoverageTarget = {
            vendorId: vendorEval.vendorId,
            catalogName: catalog.catalogName,
            groupName: group.groupName,
            subgroupName: entry.subgroupName,
            faltante: needed,
          };

          if (isImport) {
            // ── IMPORT: bodega only, no OP ────────────────────────────────
            const candidates = allCentralRefs.filter((r) => {
              if (vendorRefs.has(r.reference)) return false;
              if (r.disponible <= 0) return false;
              if (r.sizeClass !== entry.subgroupCode) return false;
              if (!(r.disponible > threshold)) return false;
              return true;
            });
            candidates.sort((a, b) => b.disponible - a.disponible);

            if (candidates.length > 0) {
              const best = candidates[0];
              const key = `${best.reference}|BODEGA`;
              const existing = importMap.get(key);
              if (existing) {
                existing.targets.push(target);
              } else {
                const ratio = best.disponible / threshold;
                importMap.set(key, {
                  replacementReference: best.reference,
                  replacementDescription: best.description,
                  source: "BODEGA",
                  sizeClass: entry.subgroupCode ?? "",
                  availableNow: best.disponible,
                  confidence: ratio > 3 ? "ALTA" : ratio > 1.5 ? "MEDIA" : "BAJA",
                  explanation: `Disponible en bodegas de importacion: ${best.disponible} unidades`,
                  targets: [target],
                });
              }
            }
            // Import without coverage → silent (not shown in Maletas, belongs to Importaciones)
            continue;
          }

          // ── TEXTILE: bodega → OP → urgentProductionNeeds ──────────────
          if (!requiredLine) continue;

          // STEP 1: Bodega principal
          const bodegaCandidates = allCentralRefs.filter((r) => {
            if (vendorRefs.has(r.reference)) return false;
            if (r.disponible <= 0) return false;
            if (!matchesTextilEntry(
              r.line, r.subgrupoSag, r.grupoSag,
              requiredLine, group.sagGrupo, entry.sagSubgrupos,
            )) return false;
            if (!(r.disponible > threshold)) return false;
            return true;
          });
          bodegaCandidates.sort((a, b) => b.disponible - a.disponible);

          if (bodegaCandidates.length > 0) {
            const best = bodegaCandidates[0];
            const key = `${best.reference}|BODEGA`;
            const existing = textileMap.get(key);
            if (existing) {
              existing.targets.push(target);
            } else {
              const ratio = best.disponible / threshold;
              textileMap.set(key, {
                replacementReference: best.reference,
                replacementDescription: best.description,
                source: "BODEGA",
                line: requiredLine,
                brand: catalog.brand ?? "",
                group: group.groupName,
                subgroup: entry.subgroupName,
                availableNow: best.disponible,
                incomingUnits: null,
                opNumber: null,
                operationalDate: null,
                ageDays: null,
                confidence: ratio > 3 ? "ALTA" : ratio > 1.5 ? "MEDIA" : "BAJA",
                explanation: `Disponible en bodega principal: ${best.disponible} unidades`,
                targets: [target],
              });
            }
            continue;
          }

          // STEP 2: OP Activa (textile only, ≤60d)
          const opMatches = freshOpCandidates.filter((op) => {
            if (vendorRefs.has(op.reference)) return false;
            if (!matchesTextilEntry(
              op.line, op.subgrupoSag, op.grupoSag,
              requiredLine, group.sagGrupo, entry.sagSubgrupos,
            )) return false;
            if (op.pendingQty <= 0) return false;
            return true;
          });
          opMatches.sort((a, b) => b.pendingQty - a.pendingQty);

          if (opMatches.length > 0) {
            const best = opMatches[0];
            const eligibility = checkOpEligibility(best, now);
            const bestOpDate = best.lastEventDate ?? best.createdAt;
            const bestAgeDays = eligibility.eligible ? Math.round(eligibility.ageDays) : null;
            const key = `${best.reference}|OP_ACTIVA|${best.opNumber}`;
            const existing = textileMap.get(key);
            if (existing) {
              existing.targets.push(target);
            } else {
              textileMap.set(key, {
                replacementReference: best.reference,
                replacementDescription: best.description,
                source: "OP_ACTIVA",
                line: requiredLine,
                brand: catalog.brand ?? "",
                group: group.groupName,
                subgroup: entry.subgroupName,
                availableNow: null,
                incomingUnits: best.pendingQty,
                opNumber: best.opNumber,
                operationalDate: bestOpDate,
                ageDays: bestAgeDays,
                confidence: "MEDIA",
                explanation: `OP #${best.opNumber}: ${best.pendingQty} unidades pendientes`,
                targets: [target],
              });
            }
            continue;
          }

          // STEP 3: No coverage → urgentProductionNeeds
          const urgentKey = `${requiredLine}|${group.sagGrupo ?? ""}|${entry.sagSubgrupos.join(",")}`;
          const existingUrgent = urgentMap.get(urgentKey);
          if (existingUrgent) {
            existingUrgent.totalFaltante += needed;
            if (!existingUrgent.affectedVendors.includes(vendorEval.vendorId)) {
              existingUrgent.affectedVendors.push(vendorEval.vendorId);
            }
          } else {
            urgentMap.set(urgentKey, {
              line: requiredLine,
              brand: catalog.brand ?? "",
              group: group.groupName,
              subgroup: entry.subgroupName,
              sagGrupo: group.sagGrupo,
              sagSubgrupos: entry.sagSubgrupos,
              totalFaltante: needed,
              affectedVendors: [vendorEval.vendorId],
              explanation: `No existe cobertura en bodega ni OP vigente`,
            });
          }
        }
      }
    }
  }

  // Sort textile: BODEGA first, then OP; within each, more targets first, then higher qty
  const textileCoverage = [...textileMap.values()].sort((a, b) => {
    const sa = a.source === "BODEGA" ? 0 : 1;
    const sb = b.source === "BODEGA" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    if (a.targets.length !== b.targets.length) return b.targets.length - a.targets.length;
    const qa = a.availableNow ?? a.incomingUnits ?? 0;
    const qb = b.availableNow ?? b.incomingUnits ?? 0;
    return qb - qa;
  });

  // Sort import: more targets first, then higher qty
  const importCoverage = [...importMap.values()].sort((a, b) => {
    if (a.targets.length !== b.targets.length) return b.targets.length - a.targets.length;
    return b.availableNow - a.availableNow;
  });

  // Sort urgent: higher totalFaltante first
  const urgentProductionNeeds = [...urgentMap.values()].sort(
    (a, b) => b.totalFaltante - a.totalFaltante,
  );

  return { textileCoverage, importCoverage, urgentProductionNeeds };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. VENDOR MALLET BASE METRICS (MALETAS-PANEL-BASE-METRICAS-OPERATIVAS-01)
// ══════════════════════════════════════════════════════════════════════════════

export interface VendorMalletBaseMetrics {
  /** References with net_qty > 0 in vendor bodega */
  activeReferenceCount: number;
  /** SUM(idealEffective) across all active derrotero entries */
  effectiveIdealTotal: number;
  /** Derrotero entries where currentUnits >= idealEffective */
  completedRouteEntries: number;
  /** Total active derrotero entries */
  totalRouteEntries: number;
  /** completedRouteEntries / totalRouteEntries × 100 */
  routeCoveragePct: number;
}

/**
 * Single source of truth for vendor mallet base metrics.
 * Consumed by VendorCard and executive summary.
 */
export function getVendorMalletBaseMetrics(
  vendor: VendorSampleSnapshot,
  assortmentEval: VendorAssortmentResult | undefined,
): VendorMalletBaseMetrics {
  const activeReferenceCount = vendor.totalRefs;

  if (!assortmentEval || assortmentEval.catalogs.length === 0) {
    return {
      activeReferenceCount,
      effectiveIdealTotal: 0,
      completedRouteEntries: 0,
      totalRouteEntries: 0,
      routeCoveragePct: 0,
    };
  }

  let effectiveIdealTotal = 0;
  let completedRouteEntries = 0;
  let totalRouteEntries = 0;

  for (const cat of assortmentEval.catalogs) {
    totalRouteEntries += cat.totalEntries;
    completedRouteEntries += cat.totalComplete;
    for (const grp of cat.groups) {
      for (const entry of grp.entries) {
        effectiveIdealTotal += entry.targetUnits; // targetUnits = idealEffective
      }
    }
  }

  const routeCoveragePct = totalRouteEntries > 0
    ? Math.round((completedRouteEntries / totalRouteEntries) * 100)
    : 0;

  return {
    activeReferenceCount,
    effectiveIdealTotal,
    completedRouteEntries,
    totalRouteEntries,
    routeCoveragePct,
  };
}
