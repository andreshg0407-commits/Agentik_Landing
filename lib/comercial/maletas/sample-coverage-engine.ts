/**
 * lib/comercial/maletas/sample-coverage-engine.ts
 *
 * MALETAS-COBERTURA-MOSTRARIO-08B2
 *
 * Resolves how to cover each missing derrotero position in a vendor's
 * sample bag (mostrario) with wholesale-eligible references.
 *
 * A maleta is a SAMPLE BAG for wholesale selling. The derrotero defines
 * the ideal composition. Each missing position needs a SAMPLE of a reference
 * that has enough wholesale inventory to be sellable.
 *
 * Thresholds (100/200/10) prove wholesale availability — the bag receives
 * only a sample, not the threshold quantity.
 *
 * Coverage cascade per slot:
 *   1. B01_AVAILABLE        — B01 has eligible wholesale ref
 *   2. OP_INCOMING          — active OP has eligible ref in production
 *   3. PRODUCTION_REQUIRED  — textile: no ref exists, needs new production
 *   4. IMPORT_UNAVAILABLE   — import: no ref available
 *   5. DATA_UNVERIFIED      — source data not certified
 *
 * Invariants:
 *   - B01 + OP + PRODUCTION + IMPORT_UNAVAILABLE + DATA_UNVERIFIED = total faltantes
 *   - Each reference assigned at most once per vendor evaluation
 *   - No reference already in the bag can be suggested
 *   - PRODUCTION_REQUIRED only after certified absence in B01 AND OP
 *   - Deterministic: ties broken by disponible DESC, reference ASC
 *
 * Pure computation — no Prisma, no UI, no side effects.
 */

import { MALETA_COVERAGE_MINIMUMS } from "./maletas-canonical-inventory";
import type {
  VendorAssortmentResult,
  CatalogEvaluation,
  AssortmentEntryEval,
  AssortmentGroupEval,
  OpCoverageCandidate,
} from "./maletas-functional-evaluation";

import { checkOpEligibility } from "./maletas-functional-evaluation";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type CoverageStatus =
  | "B01_AVAILABLE"
  | "OP_INCOMING"
  | "PRODUCTION_REQUIRED"
  | "IMPORT_UNAVAILABLE"
  | "DATA_UNVERIFIED";

/**
 * A single candidate that can fill a missing derrotero position slot.
 */
export interface CoverageCandidate {
  reference: string;
  description: string;
  status: CoverageStatus;
  source: "BODEGA" | "OP_ACTIVA" | "PRODUCCION" | "IMPORTACION";
  availableQty: number | null;
  pendingQty: number | null;
  opNumber: string | null;
  threshold: number;
  explanation: string;
}

/**
 * A missing derrotero position — the primary entity.
 * Each position represents one subgroup entry in the derrotero that is not
 * fully covered for a specific vendor.
 */
export interface CoveragePosition {
  // Derrotero identity (canonical rule ID)
  positionId: string;
  catalogId: string;
  catalogName: string;
  commercialWorld: string;
  brand: string | null;
  groupCode: string;
  groupName: string;
  subgroupCode: string | null;
  subgroupName: string;
  sagSubgrupos: string[];

  // Gap measurement
  targetReferences: number;
  currentReferences: number;
  missingReferences: number;
  matchedReferences: string[];

  // Resolution
  status: CoverageStatus;
  statusExplanation: string;

  // Selected candidates (one per missing reference slot)
  candidates: CoverageCandidate[];

  // Production metadata (only for PRODUCTION_REQUIRED)
  minWholesaleLot: number | null;
  productionReason: string | null;
}

/**
 * A position that has excess references beyond the derrotero target.
 */
export interface ExcessPosition {
  catalogId: string;
  catalogName: string;
  commercialWorld: string;
  brand: string | null;
  groupName: string;
  subgroupName: string;
  targetReferences: number;
  currentReferences: number;
  excessReferences: number;
  matchedReferences: string[];
}

/**
 * Coverage result for a single vendor.
 */
export interface VendorSampleCoverage {
  vendorId: string;
  vendorName: string;

  // Missing positions — the work to do
  positions: CoveragePosition[];

  // Excess positions — candidates for removal
  excessPositions: ExcessPosition[];

  // KPIs
  totalDerroteroEntries: number;
  completeEntries: number;
  missingEntries: number;
  excessEntries: number;
  completionPct: number;

  // Coverage summary
  b01Available: number;
  opIncoming: number;
  productionRequired: number;
  importUnavailable: number;
  dataUnverified: number;
}

/**
 * Full coverage result across all vendors.
 */
export interface SampleCoverageResult {
  vendorCoverages: VendorSampleCoverage[];

  // Global KPIs
  totalMissingPositions: number;
  totalExcessPositions: number;
  globalCompletionPct: number;
  coverageSummary: {
    b01Available: number;
    opIncoming: number;
    productionRequired: number;
    importUnavailable: number;
    dataUnverified: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Wholesale thresholds — derived from MALETA_COVERAGE_MINIMUMS (canonical source).
// Both "Oportunidades de cobertura" and "Cobertura de mostrario" share
// the same eligibility rule: disponible strictly > threshold.
// The sample bag receives only a SAMPLE — not the threshold quantity.
// ═══════════════════════════════════════════════════════════════════════════

export const WHOLESALE_THRESHOLDS: Readonly<Record<string, number>> = {
  CS: MALETA_COVERAGE_MINIMUMS.CASTILLITOS,       // 100
  LT: MALETA_COVERAGE_MINIMUMS.LATIN_KIDS,        // 200
  IMPORT_SM: MALETA_COVERAGE_MINIMUMS.IMPORTACION, // 10
};

// ═══════════════════════════════════════════════════════════════════════════
// Central ref type — subset of allCentralRefs from loader
// ═══════════════════════════════════════════════════════════════════════════

export interface CentralRef {
  reference: string;
  description: string;
  line: string;
  grupoSag: string | null;
  subgrupoSag: string | null;
  sizeClass: string | null;
  disponible: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Data availability flag
// ═══════════════════════════════════════════════════════════════════════════

export interface CoverageDataAvailability {
  b01Available: boolean;
  opAvailable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine
// ═══════════════════════════════════════════════════════════════════════════

export function buildSampleCoverageResult(
  evaluations: VendorAssortmentResult[],
  allCentralRefs: CentralRef[],
  opCandidates: OpCoverageCandidate[],
  vendorRefSets: Map<string, Set<string>>,
  vendorNames: Map<string, string>,
  dataAvailability: CoverageDataAvailability,
): SampleCoverageResult {
  const now = new Date();
  const freshOps = opCandidates.filter((op) => checkOpEligibility(op, now).eligible);

  // Sort central refs by disponible DESC, reference ASC for deterministic selection
  const sortedCentralRefs = [...allCentralRefs].sort((a, b) => {
    if (b.disponible !== a.disponible) return b.disponible - a.disponible;
    return a.reference.localeCompare(b.reference);
  });

  // Sort OP by pendingQty DESC, reference ASC for deterministic selection
  const sortedOps = [...freshOps].sort((a, b) => {
    if (b.pendingQty !== a.pendingQty) return b.pendingQty - a.pendingQty;
    return a.reference.localeCompare(b.reference);
  });

  const vendorCoverages: VendorSampleCoverage[] = [];

  for (const vendorEval of evaluations) {
    const coverage = buildVendorCoverage(
      vendorEval,
      vendorNames.get(vendorEval.vendorId) ?? vendorEval.vendorId,
      sortedCentralRefs,
      sortedOps,
      vendorRefSets.get(vendorEval.vendorId) ?? new Set(),
      dataAvailability,
    );
    vendorCoverages.push(coverage);
  }

  // Global KPIs
  const totalMissing = vendorCoverages.reduce((s, p) => s + p.positions.length, 0);
  const totalExcess = vendorCoverages.reduce((s, p) => s + p.excessPositions.length, 0);
  const totalEntries = vendorCoverages.reduce((s, p) => s + p.totalDerroteroEntries, 0);
  const totalComplete = vendorCoverages.reduce((s, p) => s + p.completeEntries, 0);

  return {
    vendorCoverages,
    totalMissingPositions: totalMissing,
    totalExcessPositions: totalExcess,
    globalCompletionPct: totalEntries > 0 ? Math.round((totalComplete / totalEntries) * 100) : 0,
    coverageSummary: {
      b01Available: vendorCoverages.reduce((s, p) => s + p.b01Available, 0),
      opIncoming: vendorCoverages.reduce((s, p) => s + p.opIncoming, 0),
      productionRequired: vendorCoverages.reduce((s, p) => s + p.productionRequired, 0),
      importUnavailable: vendorCoverages.reduce((s, p) => s + p.importUnavailable, 0),
      dataUnverified: vendorCoverages.reduce((s, p) => s + p.dataUnverified, 0),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-vendor coverage builder
// ═══════════════════════════════════════════════════════════════════════════

function buildVendorCoverage(
  vendorEval: VendorAssortmentResult,
  vendorName: string,
  sortedCentralRefs: CentralRef[],
  sortedOps: OpCoverageCandidate[],
  vendorRefs: Set<string>,
  dataAvailability: CoverageDataAvailability,
): VendorSampleCoverage {
  const positions: CoveragePosition[] = [];
  const excessPositions: ExcessPosition[] = [];
  let totalEntries = 0;
  let completeEntries = 0;
  let missingEntries = 0;
  let excessEntries = 0;

  // Track references already assigned in this evaluation (no duplicates)
  const usedReferences = new Set<string>();

  for (const catalog of vendorEval.catalogs) {
    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        totalEntries++;

        if (entry.complete) {
          completeEntries++;
          if (entry.excess) {
            excessEntries++;
            excessPositions.push(buildExcessPosition(catalog, group, entry));
          }
          continue;
        }

        missingEntries++;
        const position = buildMissingPosition(
          catalog,
          group,
          entry,
          sortedCentralRefs,
          sortedOps,
          vendorRefs,
          usedReferences,
          dataAvailability,
        );
        positions.push(position);
      }
    }
  }

  // Sort: B01_AVAILABLE first (actionable), then OP, then PRODUCTION, etc.
  positions.sort((a, b) => {
    const statusRank = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusRank !== 0) return statusRank;
    return b.missingReferences - a.missingReferences;
  });

  // Status counts
  let b01Available = 0;
  let opIncoming = 0;
  let productionRequired = 0;
  let importUnavailable = 0;
  let dataUnverified = 0;

  for (const p of positions) {
    switch (p.status) {
      case "B01_AVAILABLE": b01Available++; break;
      case "OP_INCOMING": opIncoming++; break;
      case "PRODUCTION_REQUIRED": productionRequired++; break;
      case "IMPORT_UNAVAILABLE": importUnavailable++; break;
      case "DATA_UNVERIFIED": dataUnverified++; break;
    }
  }

  return {
    vendorId: vendorEval.vendorId,
    vendorName,
    positions,
    excessPositions,
    totalDerroteroEntries: totalEntries,
    completeEntries,
    missingEntries,
    excessEntries,
    completionPct: totalEntries > 0 ? Math.round((completeEntries / totalEntries) * 100) : 0,
    b01Available,
    opIncoming,
    productionRequired,
    importUnavailable,
    dataUnverified,
  };
}

// ── Position builders ────────────────────────────────────────────────────

function buildMissingPosition(
  catalog: CatalogEvaluation,
  group: AssortmentGroupEval,
  entry: AssortmentEntryEval,
  sortedCentralRefs: CentralRef[],
  sortedOps: OpCoverageCandidate[],
  vendorRefs: Set<string>,
  usedReferences: Set<string>,
  dataAvailability: CoverageDataAvailability,
): CoveragePosition {
  const isImport = catalog.commercialWorld === "IMPORTACION";
  const missing = entry.targetReferences - entry.currentReferences;
  const positionId = `${catalog.catalogId}|${group.groupCode}|${entry.subgroupCode ?? entry.subgroupName}`;

  // Resolve line code for threshold lookup
  const lineCode = isImport ? "IMPORT_SM" : (
    catalog.brand === "Castillitos" ? "CS" :
    catalog.brand === "Latin Kids" ? "LT" : null
  );
  const threshold = lineCode ? (WHOLESALE_THRESHOLDS[lineCode] ?? 0) : 0;

  // Resolve SAG line for matching
  const requiredLine = isImport ? null : (
    catalog.brand === "Castillitos" ? "CS" :
    catalog.brand === "Latin Kids" ? "LT" : null
  );

  const allCandidates: CoverageCandidate[] = [];

  if (isImport) {
    resolveImportSlots(entry, missing, sortedCentralRefs, sortedOps, vendorRefs, usedReferences, threshold, allCandidates, dataAvailability);
  } else if (requiredLine) {
    resolveTextileSlots(entry, missing, group, requiredLine, sortedCentralRefs, sortedOps, vendorRefs, usedReferences, threshold, allCandidates, dataAvailability);
  }

  // Determine position-level status (best candidate wins)
  allCandidates.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  const status = allCandidates[0]?.status ?? "DATA_UNVERIFIED";
  const statusExplanation = allCandidates[0]?.explanation ?? "Sin datos para evaluar cobertura";

  // Production metadata
  let minWholesaleLot: number | null = null;
  let productionReason: string | null = null;
  if (allCandidates.some((c) => c.status === "PRODUCTION_REQUIRED")) {
    minWholesaleLot = threshold > 0 ? threshold : null;
    productionReason = "Sin referencia mayorista disponible en B01 ni en OP activa";
  }

  return {
    positionId,
    catalogId: catalog.catalogId,
    catalogName: catalog.catalogName,
    commercialWorld: catalog.commercialWorld,
    brand: catalog.brand,
    groupCode: group.groupCode,
    groupName: group.groupName,
    subgroupCode: entry.subgroupCode,
    subgroupName: entry.subgroupName,
    sagSubgrupos: entry.sagSubgrupos,
    targetReferences: entry.targetReferences,
    currentReferences: entry.currentReferences,
    missingReferences: missing,
    matchedReferences: entry.matchedReferences,
    status,
    statusExplanation,
    candidates: allCandidates,
    minWholesaleLot,
    productionReason,
  };
}

// ── Textile slot resolution ─────────────────────────────────────────────

function resolveTextileSlots(
  entry: AssortmentEntryEval,
  missing: number,
  group: AssortmentGroupEval,
  requiredLine: string,
  sortedCentralRefs: CentralRef[],
  sortedOps: OpCoverageCandidate[],
  vendorRefs: Set<string>,
  usedReferences: Set<string>,
  threshold: number,
  candidates: CoverageCandidate[],
  dataAvailability: CoverageDataAvailability,
): void {
  // Build full grupo list: primary + additional (SAG cross-cutting grupos like "BASICAS BEBE")
  const sagGrupos: string[] = [];
  if (group.sagGrupo) sagGrupos.push(group.sagGrupo);
  if (group.additionalSagGrupos) sagGrupos.push(...group.additionalSagGrupos);

  for (let slot = 0; slot < missing; slot++) {
    // DATA_UNVERIFIED guard: if sources are not available, cannot certify absence
    if (!dataAvailability.b01Available) {
      candidates.push({
        reference: "",
        description: entry.subgroupName,
        status: "DATA_UNVERIFIED",
        source: "BODEGA",
        availableQty: null,
        pendingQty: null,
        opNumber: null,
        threshold,
        explanation: "No fue posible verificar completamente la disponibilidad. No se recomienda producir hasta certificar B01 y OP.",
      });
      continue;
    }

    // STEP 1: Bodega Principal
    const bodegaMatch = sortedCentralRefs.find((r) => {
      if (vendorRefs.has(r.reference.trim().toUpperCase())) return false;
      if (usedReferences.has(r.reference.trim().toUpperCase())) return false;
      if (r.disponible <= 0) return false;
      if (!(r.disponible > threshold)) return false;
      if (!matchesTextilEntry(
        r.line, r.subgrupoSag, r.grupoSag,
        requiredLine, sagGrupos, entry.sagSubgrupos,
      )) return false;
      return true;
    });

    if (bodegaMatch) {
      candidates.push({
        reference: bodegaMatch.reference,
        description: bodegaMatch.description,
        status: "B01_AVAILABLE",
        source: "BODEGA",
        availableQty: bodegaMatch.disponible,
        pendingQty: null,
        opNumber: null,
        threshold,
        explanation: `Disponible en Bodega Principal: ${bodegaMatch.disponible} · Umbral mayorista ${requiredLine}: >${threshold}`,
      });
      usedReferences.add(bodegaMatch.reference.trim().toUpperCase());
      continue;
    }

    // STEP 2: OP Activa
    if (!dataAvailability.opAvailable) {
      candidates.push({
        reference: "",
        description: entry.subgroupName,
        status: "DATA_UNVERIFIED",
        source: "OP_ACTIVA",
        availableQty: null,
        pendingQty: null,
        opNumber: null,
        threshold,
        explanation: "No fue posible verificar completamente la disponibilidad. No se recomienda producir hasta certificar B01 y OP.",
      });
      continue;
    }

    const opMatch = sortedOps.find((op) => {
      if (vendorRefs.has(op.reference.trim().toUpperCase())) return false;
      if (usedReferences.has(op.reference.trim().toUpperCase())) return false;
      if (op.pendingQty <= 0) return false;
      if (!matchesTextilEntry(
        op.line, op.subgrupoSag, op.grupoSag,
        requiredLine, sagGrupos, entry.sagSubgrupos,
      )) return false;
      return true;
    });

    if (opMatch) {
      candidates.push({
        reference: opMatch.reference,
        description: opMatch.description,
        status: "OP_INCOMING",
        source: "OP_ACTIVA",
        availableQty: null,
        pendingQty: opMatch.pendingQty,
        opNumber: opMatch.opNumber,
        threshold,
        explanation: `En camino por OP #${opMatch.opNumber}: ${opMatch.pendingQty} pendientes`,
      });
      usedReferences.add(opMatch.reference.trim().toUpperCase());
      continue;
    }

    // STEP 3: PRODUCTION_REQUIRED — certified absence in B01 AND OP
    candidates.push({
      reference: "",
      description: entry.subgroupName,
      status: "PRODUCTION_REQUIRED",
      source: "PRODUCCION",
      availableQty: null,
      pendingQty: null,
      opNumber: null,
      threshold,
      explanation: "Sin referencia mayorista disponible en B01 ni en OP activa",
    });
  }
}

// ── Import slot resolution ──────────────────────────────────────────────

function resolveImportSlots(
  entry: AssortmentEntryEval,
  missing: number,
  sortedCentralRefs: CentralRef[],
  sortedOps: OpCoverageCandidate[],
  vendorRefs: Set<string>,
  usedReferences: Set<string>,
  threshold: number,
  candidates: CoverageCandidate[],
  dataAvailability: CoverageDataAvailability,
): void {
  const sizeClass = entry.subgroupCode?.toUpperCase() ?? "";

  // Import grandes fully excluded
  if (sizeClass === "GRANDE") return;

  for (let slot = 0; slot < missing; slot++) {
    if (!dataAvailability.b01Available) {
      candidates.push({
        reference: "",
        description: entry.subgroupName,
        status: "DATA_UNVERIFIED",
        source: "IMPORTACION",
        availableQty: null,
        pendingQty: null,
        opNumber: null,
        threshold,
        explanation: "No fue posible verificar completamente la disponibilidad.",
      });
      continue;
    }

    // Import: match by sizeClass
    const bodegaMatch = sortedCentralRefs.find((r) => {
      if (vendorRefs.has(r.reference.trim().toUpperCase())) return false;
      if (usedReferences.has(r.reference.trim().toUpperCase())) return false;
      if (r.disponible <= 0) return false;
      if (r.sizeClass !== entry.subgroupCode) return false;
      if (!(r.disponible > threshold)) return false;
      return true;
    });

    if (bodegaMatch) {
      candidates.push({
        reference: bodegaMatch.reference,
        description: bodegaMatch.description,
        status: "B01_AVAILABLE",
        source: "BODEGA",
        availableQty: bodegaMatch.disponible,
        pendingQty: null,
        opNumber: null,
        threshold,
        explanation: `Disponible en Bodega Principal: ${bodegaMatch.disponible} · Umbral importacion: >${threshold}`,
      });
      usedReferences.add(bodegaMatch.reference.trim().toUpperCase());
      continue;
    }

    // Import: check OP for the same reference
    if (dataAvailability.opAvailable) {
      const opMatch = sortedOps.find((op) => {
        if (vendorRefs.has(op.reference.trim().toUpperCase())) return false;
        if (usedReferences.has(op.reference.trim().toUpperCase())) return false;
        if (op.pendingQty <= 0) return false;
        // Import OP: match by line IMPORT
        if (op.line !== "IMPORT") return false;
        return true;
      });

      if (opMatch) {
        candidates.push({
          reference: opMatch.reference,
          description: opMatch.description,
          status: "OP_INCOMING",
          source: "OP_ACTIVA",
          availableQty: null,
          pendingQty: opMatch.pendingQty,
          opNumber: opMatch.opNumber,
          threshold,
          explanation: `En camino por OP #${opMatch.opNumber}: ${opMatch.pendingQty} pendientes`,
        });
        usedReferences.add(opMatch.reference.trim().toUpperCase());
        continue;
      }
    }

    // IMPORT_UNAVAILABLE — no B01, no OP (never suggest textile production)
    candidates.push({
      reference: "",
      description: entry.subgroupName,
      status: "IMPORT_UNAVAILABLE",
      source: "IMPORTACION",
      availableQty: null,
      pendingQty: null,
      opNumber: null,
      threshold,
      explanation: "Sin disponibilidad en B01 ni en OP activa",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Textile matching — canonical SAG codes
// ═══════════════════════════════════════════════════════════════════════════

function matchesTextilEntry(
  candidateLine: string,
  candidateSubgrupoSag: string | null,
  candidateGrupoSag: string | null,
  requiredLine: string,
  sagGrupos: string[],
  sagSubgrupos: string[],
): boolean {
  if (candidateLine !== requiredLine) return false;
  if (!candidateSubgrupoSag) return false;
  const normalizedCandidate = candidateSubgrupoSag.trim().toUpperCase();
  const matches = sagSubgrupos.some((s) => s.trim().toUpperCase() === normalizedCandidate);
  if (!matches) return false;
  if (sagGrupos.length > 0 && candidateGrupoSag) {
    const normalizedGrupo = candidateGrupoSag.trim().toUpperCase();
    if (!sagGrupos.some((g) => g.trim().toUpperCase() === normalizedGrupo)) return false;
  }
  return true;
}

// ── Status priority (lower = higher priority / more actionable) ─────────

const STATUS_PRIORITY: Record<CoverageStatus, number> = {
  B01_AVAILABLE: 1,
  OP_INCOMING: 2,
  PRODUCTION_REQUIRED: 3,
  IMPORT_UNAVAILABLE: 4,
  DATA_UNVERIFIED: 5,
};

function buildExcessPosition(
  catalog: CatalogEvaluation,
  group: AssortmentGroupEval,
  entry: AssortmentEntryEval,
): ExcessPosition {
  return {
    catalogId: catalog.catalogId,
    catalogName: catalog.catalogName,
    commercialWorld: catalog.commercialWorld,
    brand: catalog.brand,
    groupName: group.groupName,
    subgroupName: entry.subgroupName,
    targetReferences: entry.targetReferences,
    currentReferences: entry.currentReferences,
    excessReferences: entry.currentReferences - entry.targetReferences,
    matchedReferences: entry.matchedReferences,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Copilot readiness — structured accessors for agent consumption
// ═══════════════════════════════════════════════════════════════════════════

export function getSampleCoverageSummary(
  result: SampleCoverageResult,
): Array<{
  vendorId: string;
  vendorName: string;
  completionPct: number;
  totalEntries: number;
  completeEntries: number;
  missingEntries: number;
  excessEntries: number;
}> {
  return result.vendorCoverages.map((v) => ({
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    completionPct: v.completionPct,
    totalEntries: v.totalDerroteroEntries,
    completeEntries: v.completeEntries,
    missingEntries: v.missingEntries,
    excessEntries: v.excessEntries,
  }));
}

export function getSampleCoverageNeeds(
  result: SampleCoverageResult,
): Array<{
  vendorId: string;
  vendorName: string;
  subgroupName: string;
  brand: string | null;
  missingReferences: number;
  status: CoverageStatus;
  statusExplanation: string;
  candidateCount: number;
}> {
  const needs: Array<{
    vendorId: string;
    vendorName: string;
    subgroupName: string;
    brand: string | null;
    missingReferences: number;
    status: CoverageStatus;
    statusExplanation: string;
    candidateCount: number;
  }> = [];

  for (const vc of result.vendorCoverages) {
    for (const pos of vc.positions) {
      needs.push({
        vendorId: vc.vendorId,
        vendorName: vc.vendorName,
        subgroupName: pos.subgroupName,
        brand: pos.brand,
        missingReferences: pos.missingReferences,
        status: pos.status,
        statusExplanation: pos.statusExplanation,
        candidateCount: pos.candidates.length,
      });
    }
  }

  needs.sort((a, b) => {
    const ar = STATUS_PRIORITY[a.status] ?? 5;
    const br = STATUS_PRIORITY[b.status] ?? 5;
    if (ar !== br) return br - ar;
    return b.missingReferences - a.missingReferences;
  });

  return needs;
}

export function getSampleCoverageCandidates(
  result: SampleCoverageResult,
  vendorId: string,
  positionIdOrSubgroupName: string,
): CoverageCandidate[] {
  const vc = result.vendorCoverages.find((v) => v.vendorId === vendorId);
  if (!vc) return [];
  const pos = vc.positions.find((p) => p.positionId === positionIdOrSubgroupName)
    ?? vc.positions.find((p) => p.subgroupName === positionIdOrSubgroupName);
  return pos?.candidates ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
// Backward compatibility — re-export old names during migration
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use CoverageStatus */
export type SupplyAction = CoverageStatus;
/** @deprecated Use CoveragePosition */
export type SupplyPosition = CoveragePosition;
/** @deprecated Use VendorSampleCoverage */
export type VendorSupplyPlan = VendorSampleCoverage;
/** @deprecated Use SampleCoverageResult */
export type SalesPortfolioSupplyPlan = SampleCoverageResult;
/** @deprecated Use CoverageCandidate */
export type SupplyCandidate = CoverageCandidate;
