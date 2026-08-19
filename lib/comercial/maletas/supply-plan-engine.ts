/**
 * lib/comercial/maletas/supply-plan-engine.ts
 *
 * MALETAS-PLAN-SURTIDO-08B1
 *
 * Builds actionable supply plans for vendor maletas driven by Derrotero evaluation.
 * Primary entity = MISSING DERROTERO POSITION (not reference).
 *
 * Supply cascade per position:
 *   1. REEMPLAZAR_BODEGA     — central warehouse has eligible refs (threshold: CS>100, LT>200, IMP>10)
 *   2. COMPLETAR_DESDE_OP    — active OP has pending production
 *   3. PRODUCCION_SUGERIDA   — textile: suggest new production
 *   4. RECOMPRA_SUGERIDA     — import: suggest repurchase
 *
 * Invariants:
 *   - Each reference used at most once per vendor plan (deduplication)
 *   - Each candidate meets threshold individually (no aggregation)
 *   - Positions cascade fully: BODEGA → OP → PRODUCCION (never skips)
 *   - Position identity = catalogId|groupCode|subgroupCode (canonical rule ID)
 *   - Multi-reference needs: N missing = N distinct candidates
 *
 * Pure computation — no Prisma, no UI, no side effects.
 */

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

export type SupplyAction =
  | "REEMPLAZAR_BODEGA"
  | "COMPLETAR_DESDE_OP"
  | "PRODUCCION_SUGERIDA"
  | "RECOMPRA_SUGERIDA"
  | "SIN_COBERTURA";

/**
 * A single candidate that can fill a missing derrotero position.
 */
export interface SupplyCandidate {
  reference: string;
  description: string;
  action: SupplyAction;
  source: "BODEGA" | "OP_ACTIVA" | "PRODUCCION" | "RECOMPRA";
  availableQty: number | null;
  pendingQty: number | null;
  opNumber: string | null;
  confidence: "ALTA" | "MEDIA" | "BAJA";
  explanation: string;
  /** Threshold applied to this candidate */
  threshold: number;
  /** Whether this candidate was selected as the best for this slot */
  selected: boolean;
}

/**
 * A missing derrotero position — the primary entity of the supply plan.
 * Each position represents one subgroup entry in the derrotero that is not
 * fully covered for a specific vendor.
 */
export interface SupplyPosition {
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

  // Best action from cascade
  bestAction: SupplyAction;
  bestActionExplanation: string;

  // Selected candidates (one per missing reference slot)
  candidates: SupplyCandidate[];

  // Minimum production quantity if PRODUCCION_SUGERIDA
  minProductionQty: number | null;
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
 * Supply plan for a single vendor.
 */
export interface VendorSupplyPlan {
  vendorId: string;
  vendorName: string;

  // Missing positions — the work to do
  positions: SupplyPosition[];

  // Excess positions — candidates for removal
  excessPositions: ExcessPosition[];

  // KPIs
  totalDerroteroEntries: number;
  completeEntries: number;
  missingEntries: number;
  excessEntries: number;
  completionPct: number;

  // Action summary
  bodegaCandidates: number;
  opCandidates: number;
  produccionSugerida: number;
  recompraSugerida: number;
  sinCobertura: number;
}

/**
 * Full supply plan across all vendors.
 */
export interface SalesPortfolioSupplyPlan {
  vendorPlans: VendorSupplyPlan[];

  // Global KPIs
  totalMissingPositions: number;
  totalExcessPositions: number;
  globalCompletionPct: number;
  coverageSummary: {
    bodega: number;
    op: number;
    produccion: number;
    recompra: number;
    sinCobertura: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Supply plan thresholds — MALETAS-PLAN-SURTIDO-08B1
// These are the WHOLESALE thresholds for the supply plan.
// Independent of coverage opportunity thresholds (which are informational).
// ═══════════════════════════════════════════════════════════════════════════

export const SUPPLY_PLAN_THRESHOLDS: Readonly<Record<string, number>> = {
  CS: 100,     // Castillitos: disponible individual > 100
  LT: 200,     // Latin Kids: disponible individual > 200
  IMPORT_SM: 10, // Accesorios pequeños/medianos: disponible individual > 10
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
// Engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds the supply plan from Derrotero evaluations + raw inventory data.
 *
 * MALETAS-PLAN-SURTIDO-08B1: Direct matching against allCentralRefs and
 * opCandidates with proper wholesale thresholds. Does NOT rely on pre-grouped
 * BusinessCoverageResult (which uses different thresholds and grouping).
 */
export function buildSalesPortfolioSupplyPlan(
  evaluations: VendorAssortmentResult[],
  allCentralRefs: CentralRef[],
  opCandidates: OpCoverageCandidate[],
  vendorRefSets: Map<string, Set<string>>,
  vendorNames: Map<string, string>,
): SalesPortfolioSupplyPlan {
  const now = new Date();
  const freshOps = opCandidates.filter((op) => checkOpEligibility(op, now).eligible);

  const vendorPlans: VendorSupplyPlan[] = [];

  for (const vendorEval of evaluations) {
    const plan = buildVendorPlan(
      vendorEval,
      vendorNames.get(vendorEval.vendorId) ?? vendorEval.vendorId,
      allCentralRefs,
      freshOps,
      vendorRefSets.get(vendorEval.vendorId) ?? new Set(),
    );
    vendorPlans.push(plan);
  }

  // Global KPIs
  const totalMissing = vendorPlans.reduce((s, p) => s + p.positions.length, 0);
  const totalExcess = vendorPlans.reduce((s, p) => s + p.excessPositions.length, 0);
  const totalEntries = vendorPlans.reduce((s, p) => s + p.totalDerroteroEntries, 0);
  const totalComplete = vendorPlans.reduce((s, p) => s + p.completeEntries, 0);

  return {
    vendorPlans,
    totalMissingPositions: totalMissing,
    totalExcessPositions: totalExcess,
    globalCompletionPct: totalEntries > 0 ? Math.round((totalComplete / totalEntries) * 100) : 0,
    coverageSummary: {
      bodega: vendorPlans.reduce((s, p) => s + p.bodegaCandidates, 0),
      op: vendorPlans.reduce((s, p) => s + p.opCandidates, 0),
      produccion: vendorPlans.reduce((s, p) => s + p.produccionSugerida, 0),
      recompra: vendorPlans.reduce((s, p) => s + p.recompraSugerida, 0),
      sinCobertura: vendorPlans.reduce((s, p) => s + p.sinCobertura, 0),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-vendor plan builder
// ═══════════════════════════════════════════════════════════════════════════

function buildVendorPlan(
  vendorEval: VendorAssortmentResult,
  vendorName: string,
  allCentralRefs: CentralRef[],
  freshOps: OpCoverageCandidate[],
  vendorRefs: Set<string>,
): VendorSupplyPlan {
  const positions: SupplyPosition[] = [];
  const excessPositions: ExcessPosition[] = [];
  let totalEntries = 0;
  let completeEntries = 0;
  let missingEntries = 0;
  let excessEntries = 0;

  // Track references already selected for this vendor's plan (deduplication)
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

        // Missing position
        missingEntries++;
        const position = buildMissingPosition(
          catalog,
          group,
          entry,
          allCentralRefs,
          freshOps,
          vendorRefs,
          usedReferences,
        );
        positions.push(position);
      }
    }
  }

  // Sort positions: BODEGA first (actionable), then OP, then PRODUCCION
  positions.sort((a, b) => {
    const actionRank = ACTION_PRIORITY[a.bestAction] - ACTION_PRIORITY[b.bestAction];
    if (actionRank !== 0) return actionRank;
    return b.missingReferences - a.missingReferences;
  });

  // Action counts
  let bodegaCandidates = 0;
  let opCandidates = 0;
  let produccionSugerida = 0;
  let recompraSugerida = 0;
  let sinCobertura = 0;

  for (const p of positions) {
    switch (p.bestAction) {
      case "REEMPLAZAR_BODEGA": bodegaCandidates++; break;
      case "COMPLETAR_DESDE_OP": opCandidates++; break;
      case "PRODUCCION_SUGERIDA": produccionSugerida++; break;
      case "RECOMPRA_SUGERIDA": recompraSugerida++; break;
      case "SIN_COBERTURA": sinCobertura++; break;
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
    bodegaCandidates,
    opCandidates,
    produccionSugerida,
    recompraSugerida,
    sinCobertura,
  };
}

// ── Position builders ────────────────────────────────────────────────────

function buildMissingPosition(
  catalog: CatalogEvaluation,
  group: AssortmentGroupEval,
  entry: AssortmentEntryEval,
  allCentralRefs: CentralRef[],
  freshOps: OpCoverageCandidate[],
  vendorRefs: Set<string>,
  usedReferences: Set<string>,
): SupplyPosition {
  const isImport = catalog.commercialWorld === "IMPORTACION";
  const missing = entry.targetReferences - entry.currentReferences;
  const positionId = `${catalog.catalogId}|${group.groupCode}|${entry.subgroupCode ?? entry.subgroupName}`;

  // Resolve line code for threshold lookup
  const lineCode = isImport ? "IMPORT_SM" : (
    catalog.brand === "Castillitos" ? "CS" :
    catalog.brand === "Latin Kids" ? "LT" : null
  );
  const threshold = lineCode ? (SUPPLY_PLAN_THRESHOLDS[lineCode] ?? 0) : 0;

  // Resolve line filter for SAG matching
  const requiredLine = isImport ? null : (
    catalog.brand === "Castillitos" ? "CS" :
    catalog.brand === "Latin Kids" ? "LT" : null
  );

  const allCandidates: SupplyCandidate[] = [];

  if (isImport) {
    // Import: bodega match by sizeClass, then RECOMPRA
    const sizeClass = entry.subgroupCode?.toUpperCase() ?? "";
    // Import grandes are excluded
    if (sizeClass === "GRANDE") {
      // No candidates — large accessories fully excluded
    } else {
      const bodegaMatches = allCentralRefs
        .filter((r) => {
          if (vendorRefs.has(r.reference.trim().toUpperCase())) return false;
          if (usedReferences.has(r.reference.trim().toUpperCase())) return false;
          if (r.disponible <= 0) return false;
          if (r.sizeClass !== entry.subgroupCode) return false;
          if (!(r.disponible > threshold)) return false;
          return true;
        })
        .sort((a, b) => b.disponible - a.disponible);

      for (const ref of bodegaMatches.slice(0, missing)) {
        const ratio = ref.disponible / Math.max(threshold, 1);
        allCandidates.push({
          reference: ref.reference,
          description: ref.description,
          action: "REEMPLAZAR_BODEGA",
          source: "BODEGA",
          availableQty: ref.disponible,
          pendingQty: null,
          opNumber: null,
          confidence: ratio > 3 ? "ALTA" : ratio > 1.5 ? "MEDIA" : "BAJA",
          explanation: `Disponible B01: ${ref.disponible} · Umbral importacion: >${threshold}`,
          threshold,
          selected: true,
        });
        usedReferences.add(ref.reference.trim().toUpperCase());
      }
    }

    // If not enough bodega candidates → RECOMPRA for remaining slots
    const filled = allCandidates.length;
    if (filled < missing && sizeClass !== "GRANDE") {
      for (let i = 0; i < missing - filled; i++) {
        allCandidates.push({
          reference: "",
          description: `Recompra sugerida: ${entry.subgroupName}`,
          action: "RECOMPRA_SUGERIDA",
          source: "RECOMPRA",
          availableQty: null,
          pendingQty: null,
          opNumber: null,
          confidence: "BAJA",
          explanation: `Sin stock en bodega para ${entry.subgroupName}. Evaluar recompra.`,
          threshold,
          selected: true,
        });
      }
    }
  } else if (requiredLine) {
    // Textile: BODEGA → OP → PRODUCCION cascade
    // Each missing slot is filled independently with deduplication

    for (let slot = 0; slot < missing; slot++) {
      let slotFilled = false;

      // STEP 1: Bodega principal
      const bodegaMatch = allCentralRefs.find((r) => {
        if (vendorRefs.has(r.reference.trim().toUpperCase())) return false;
        if (usedReferences.has(r.reference.trim().toUpperCase())) return false;
        if (r.disponible <= 0) return false;
        if (!(r.disponible > threshold)) return false;
        if (!matchesTextilEntry(
          r.line, r.subgrupoSag, r.grupoSag,
          requiredLine, group.sagGrupo, entry.sagSubgrupos,
        )) return false;
        return true;
      });

      if (bodegaMatch) {
        const ratio = bodegaMatch.disponible / Math.max(threshold, 1);
        allCandidates.push({
          reference: bodegaMatch.reference,
          description: bodegaMatch.description,
          action: "REEMPLAZAR_BODEGA",
          source: "BODEGA",
          availableQty: bodegaMatch.disponible,
          pendingQty: null,
          opNumber: null,
          confidence: ratio > 3 ? "ALTA" : ratio > 1.5 ? "MEDIA" : "BAJA",
          explanation: `Disponible B01: ${bodegaMatch.disponible} · Umbral ${requiredLine}: >${threshold} · No en maleta`,
          threshold,
          selected: true,
        });
        usedReferences.add(bodegaMatch.reference.trim().toUpperCase());
        slotFilled = true;
        continue;
      }

      // STEP 2: OP Activa (<=60d)
      const opMatch = freshOps.find((op) => {
        if (vendorRefs.has(op.reference.trim().toUpperCase())) return false;
        if (usedReferences.has(op.reference.trim().toUpperCase())) return false;
        if (op.pendingQty <= 0) return false;
        if (!matchesTextilEntry(
          op.line, op.subgrupoSag, op.grupoSag,
          requiredLine, group.sagGrupo, entry.sagSubgrupos,
        )) return false;
        return true;
      });

      if (opMatch) {
        allCandidates.push({
          reference: opMatch.reference,
          description: opMatch.description,
          action: "COMPLETAR_DESDE_OP",
          source: "OP_ACTIVA",
          availableQty: null,
          pendingQty: opMatch.pendingQty,
          opNumber: opMatch.opNumber,
          confidence: "MEDIA",
          explanation: `OP #${opMatch.opNumber}: ${opMatch.pendingQty} pendientes · Umbral ${requiredLine}: >${threshold}`,
          threshold,
          selected: true,
        });
        usedReferences.add(opMatch.reference.trim().toUpperCase());
        slotFilled = true;
        continue;
      }

      // STEP 3: No coverage → PRODUCCION_SUGERIDA
      if (!slotFilled) {
        allCandidates.push({
          reference: "",
          description: `Produccion sugerida: ${entry.subgroupName}`,
          action: "PRODUCCION_SUGERIDA",
          source: "PRODUCCION",
          availableQty: null,
          pendingQty: null,
          opNumber: null,
          confidence: "BAJA",
          explanation: `Sin referencia elegible en B01 ni OP activa`,
          threshold,
          selected: true,
        });
      }
    }
  }

  // Determine best action (highest-priority candidate wins)
  allCandidates.sort((a, b) => ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action]);
  const bestAction = allCandidates[0]?.action ?? "SIN_COBERTURA";
  const bestExplanation = allCandidates[0]?.explanation ?? `Sin opciones de abastecimiento para ${entry.subgroupName}`;

  // Production minimum quantity
  let minProductionQty: number | null = null;
  let productionReason: string | null = null;
  if (bestAction === "PRODUCCION_SUGERIDA" || allCandidates.some((c) => c.action === "PRODUCCION_SUGERIDA")) {
    minProductionQty = threshold > 0 ? threshold : null;
    productionReason = `Sin referencia elegible en B01 ni OP activa`;
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
    bestAction,
    bestActionExplanation: bestExplanation,
    candidates: allCandidates,
    minProductionQty,
    productionReason,
  };
}

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
// Textile matching — uses SAG codes, not display names
// ═══════════════════════════════════════════════════════════════════════════

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
  // Match any of the entry's SAG subgrupos (e.g., ["BUZO", "CAMIBUSO"])
  const normalizedCandidate = candidateSubgrupoSag.trim().toUpperCase();
  const matches = sagSubgrupos.some((s) => s.trim().toUpperCase() === normalizedCandidate);
  if (!matches) return false;
  // For CS: also match grupo (required)
  if (sagGrupo && candidateGrupoSag) {
    if (candidateGrupoSag.trim().toUpperCase() !== sagGrupo.trim().toUpperCase()) return false;
  }
  return true;
}

// ── Action priority (lower = higher priority in cascade) ────────────────

const ACTION_PRIORITY: Record<SupplyAction, number> = {
  REEMPLAZAR_BODEGA: 1,
  COMPLETAR_DESDE_OP: 2,
  PRODUCCION_SUGERIDA: 3,
  RECOMPRA_SUGERIDA: 4,
  SIN_COBERTURA: 5,
};

// ═══════════════════════════════════════════════════════════════════════════
// Copilot readiness — structured accessors for agent consumption
// ═══════════════════════════════════════════════════════════════════════════

/** Attention evidence type for copilot agents to emit when supply gaps exist. */
export const PORTFOLIO_SUPPLY_REQUIRED = "PORTFOLIO_SUPPLY_REQUIRED" as const;

/**
 * Returns derrotero coverage summary per vendor.
 * Copilot contract: structured, no LLM.
 */
export function getSalesPortfolioDerroteroCoverage(
  plan: SalesPortfolioSupplyPlan,
): Array<{
  vendorId: string;
  vendorName: string;
  completionPct: number;
  totalEntries: number;
  completeEntries: number;
  missingEntries: number;
  excessEntries: number;
}> {
  return plan.vendorPlans.map((v) => ({
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    completionPct: v.completionPct,
    totalEntries: v.totalDerroteroEntries,
    completeEntries: v.completeEntries,
    missingEntries: v.missingEntries,
    excessEntries: v.excessEntries,
  }));
}

/**
 * Returns all missing positions across vendors, sorted by urgency.
 * Copilot contract: structured, no LLM.
 */
export function getSalesPortfolioSupplyNeeds(
  plan: SalesPortfolioSupplyPlan,
): Array<{
  vendorId: string;
  vendorName: string;
  subgroupName: string;
  brand: string | null;
  missingReferences: number;
  bestAction: SupplyAction;
  bestActionExplanation: string;
  candidateCount: number;
}> {
  const needs: Array<{
    vendorId: string;
    vendorName: string;
    subgroupName: string;
    brand: string | null;
    missingReferences: number;
    bestAction: SupplyAction;
    bestActionExplanation: string;
    candidateCount: number;
  }> = [];

  for (const vp of plan.vendorPlans) {
    for (const pos of vp.positions) {
      needs.push({
        vendorId: vp.vendorId,
        vendorName: vp.vendorName,
        subgroupName: pos.subgroupName,
        brand: pos.brand,
        missingReferences: pos.missingReferences,
        bestAction: pos.bestAction,
        bestActionExplanation: pos.bestActionExplanation,
        candidateCount: pos.candidates.length,
      });
    }
  }

  // Sort: SIN_COBERTURA first, then by missing count
  needs.sort((a, b) => {
    const ar = ACTION_PRIORITY[a.bestAction] ?? 5;
    const br = ACTION_PRIORITY[b.bestAction] ?? 5;
    if (ar !== br) return br - ar;
    return b.missingReferences - a.missingReferences;
  });

  return needs;
}

/**
 * Returns all supply candidates for a specific vendor and position.
 * Copilot contract: structured, no LLM.
 */
export function getSalesPortfolioSupplyCandidates(
  plan: SalesPortfolioSupplyPlan,
  vendorId: string,
  positionIdOrSubgroupName: string,
): SupplyCandidate[] {
  const vp = plan.vendorPlans.find((v) => v.vendorId === vendorId);
  if (!vp) return [];
  // Match by positionId first, then fallback to subgroupName (copilot compat)
  const pos = vp.positions.find((p) => p.positionId === positionIdOrSubgroupName)
    ?? vp.positions.find((p) => p.subgroupName === positionIdOrSubgroupName);
  return pos?.candidates ?? [];
}
