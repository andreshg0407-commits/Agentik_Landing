/**
 * lib/comercial/maletas/supply-plan-engine.ts
 *
 * AGENTIK-SALES-PORTFOLIO-SUPPLY-PLAN-02
 *
 * Builds a supply plan for vendor maletas driven by Derrotero evaluation.
 * Primary entity = MISSING DERROTERO POSITION (not reference).
 *
 * Supply cascade per position:
 *   1. REEMPLAZAR_BODEGA     — central warehouse has eligible refs
 *   2. COMPLETAR_DESDE_OP    — active OP has pending production
 *   3. PRODUCCION_SUGERIDA   — textile: suggest new production
 *   4. RECOMPRA_SUGERIDA     — import: suggest repurchase
 *   5. RETIRAR_MOSTRARIO     — excess positions that should be removed
 *
 * Pure computation — no Prisma, no UI, no side effects.
 */

import type {
  VendorAssortmentResult,
  CatalogEvaluation,
  AssortmentEntryEval,
  BusinessCoverageResult,
  TextileCoverageOpportunity,
  ImportCoverageOpportunity,
  UrgentProductionNeed,
} from "./maletas-functional-evaluation";

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
}

/**
 * A missing derrotero position — the primary entity of the supply plan.
 * Each position represents one subgroup entry in the derrotero that is not
 * fully covered for a specific vendor.
 */
export interface SupplyPosition {
  // Derrotero identity
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

  // All candidates (sorted by cascade priority)
  candidates: SupplyCandidate[];
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
// Engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds the supply plan from Derrotero evaluations + coverage opportunities.
 *
 * Consumes:
 *   - evaluations: per-vendor assortment evaluation from evaluateVendorAssortment()
 *   - coverageResult: grouped coverage from findBusinessCoverageOpportunities()
 *   - vendorNames: map of vendorId → display name (for labels)
 */
export function buildSalesPortfolioSupplyPlan(
  evaluations: VendorAssortmentResult[],
  coverageResult: BusinessCoverageResult,
  vendorNames: Map<string, string>,
): SalesPortfolioSupplyPlan {
  const vendorPlans: VendorSupplyPlan[] = [];

  // Index coverage by subgroup for fast lookup
  const textileCoverageIndex = indexTextileCoverage(coverageResult.textileCoverage);
  const importCoverageIndex = indexImportCoverage(coverageResult.importCoverage);
  const urgentProductionIndex = indexUrgentProduction(coverageResult.urgentProductionNeeds);

  for (const vendorEval of evaluations) {
    const plan = buildVendorPlan(
      vendorEval,
      vendorNames.get(vendorEval.vendorId) ?? vendorEval.vendorId,
      textileCoverageIndex,
      importCoverageIndex,
      urgentProductionIndex,
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
  textileCoverage: TextileCoverageIndex,
  importCoverage: ImportCoverageIndex,
  urgentProduction: UrgentProductionIndex,
): VendorSupplyPlan {
  const positions: SupplyPosition[] = [];
  const excessPositions: ExcessPosition[] = [];
  let totalEntries = 0;
  let completeEntries = 0;
  let missingEntries = 0;
  let excessEntries = 0;

  for (const catalog of vendorEval.catalogs) {
    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        totalEntries++;

        if (entry.complete) {
          completeEntries++;
          // Check for excess even if complete
          if (entry.excess) {
            excessEntries++;
            excessPositions.push(buildExcessPosition(catalog, group.groupName, entry));
          }
          continue;
        }

        // Missing position
        missingEntries++;
        const position = buildMissingPosition(
          catalog,
          group.groupName,
          entry,
          vendorEval.vendorId,
          textileCoverage,
          importCoverage,
          urgentProduction,
        );
        positions.push(position);
      }
    }
  }

  // Sort positions: SIN_COBERTURA first (most urgent), then by missing count DESC
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
  groupName: string,
  entry: AssortmentEntryEval,
  vendorId: string,
  textileCoverage: TextileCoverageIndex,
  importCoverage: ImportCoverageIndex,
  urgentProduction: UrgentProductionIndex,
): SupplyPosition {
  const isImport = catalog.commercialWorld === "IMPORTACION";
  const missing = entry.targetReferences - entry.currentReferences;

  // Resolve candidates from coverage results
  const candidates: SupplyCandidate[] = [];

  if (isImport) {
    // Import: BODEGA only, then RECOMPRA_SUGERIDA
    const importCandidates = findImportCandidates(entry, vendorId, importCoverage);
    candidates.push(...importCandidates);

    if (candidates.length === 0) {
      candidates.push({
        reference: "",
        description: `Recompra sugerida: ${entry.subgroupName}`,
        action: "RECOMPRA_SUGERIDA",
        source: "RECOMPRA",
        availableQty: null,
        pendingQty: null,
        opNumber: null,
        confidence: "BAJA",
        explanation: `Sin stock en bodega para ${entry.subgroupName}. Evaluar recompra en proximo contenedor.`,
      });
    }
  } else {
    // Textile: BODEGA → OP → PRODUCCION_SUGERIDA
    const textileCandidates = findTextileCandidates(
      entry, vendorId, catalog.brand, groupName, textileCoverage,
    );
    candidates.push(...textileCandidates);

    // Check urgent production needs
    const urgentKey = buildUrgentKey(catalog.brand, groupName, entry.subgroupName);
    const urgent = urgentProduction.get(urgentKey);
    if (urgent && candidates.length === 0) {
      candidates.push({
        reference: "",
        description: `Produccion sugerida: ${entry.subgroupName}`,
        action: "PRODUCCION_SUGERIDA",
        source: "PRODUCCION",
        availableQty: null,
        pendingQty: null,
        opNumber: null,
        confidence: "BAJA",
        explanation: urgent.explanation,
      });
    }

    if (candidates.length === 0) {
      candidates.push({
        reference: "",
        description: `Sin cobertura: ${entry.subgroupName}`,
        action: "PRODUCCION_SUGERIDA",
        source: "PRODUCCION",
        availableQty: null,
        pendingQty: null,
        opNumber: null,
        confidence: "BAJA",
        explanation: `Faltante de ${missing} ref(s) en ${entry.subgroupName}. No hay stock en bodega ni OP activa. Sugerir produccion.`,
      });
    }
  }

  // Sort candidates by cascade priority
  candidates.sort((a, b) => ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action]);

  const bestAction = candidates[0]?.action ?? "SIN_COBERTURA";
  const bestExplanation = candidates[0]?.explanation ?? `Sin opciones de abastecimiento para ${entry.subgroupName}`;

  return {
    catalogId: catalog.catalogId,
    catalogName: catalog.catalogName,
    commercialWorld: catalog.commercialWorld,
    brand: catalog.brand,
    groupCode: "",
    groupName,
    subgroupCode: entry.subgroupCode,
    subgroupName: entry.subgroupName,
    sagSubgrupos: entry.sagSubgrupos,
    targetReferences: entry.targetReferences,
    currentReferences: entry.currentReferences,
    missingReferences: missing,
    matchedReferences: entry.matchedReferences,
    bestAction,
    bestActionExplanation: bestExplanation,
    candidates,
  };
}

function buildExcessPosition(
  catalog: CatalogEvaluation,
  groupName: string,
  entry: AssortmentEntryEval,
): ExcessPosition {
  return {
    catalogId: catalog.catalogId,
    catalogName: catalog.catalogName,
    commercialWorld: catalog.commercialWorld,
    brand: catalog.brand,
    groupName,
    subgroupName: entry.subgroupName,
    targetReferences: entry.targetReferences,
    currentReferences: entry.currentReferences,
    excessReferences: entry.currentReferences - entry.targetReferences,
    matchedReferences: entry.matchedReferences,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Candidate finders
// ═══════════════════════════════════════════════════════════════════════════

function findTextileCandidates(
  entry: AssortmentEntryEval,
  vendorId: string,
  brand: string | null,
  groupName: string,
  textileCoverage: TextileCoverageIndex,
): SupplyCandidate[] {
  const candidates: SupplyCandidate[] = [];

  // Look up coverage opportunities that match this entry's SAG subgrupos
  for (const sagSub of entry.sagSubgrupos) {
    const key = sagSub.toUpperCase();
    const opportunities = textileCoverage.get(key) ?? [];

    for (const opp of opportunities) {
      // Check this opportunity targets our vendor
      const targetsVendor = opp.targets.some((t) => t.vendorId === vendorId);
      if (!targetsVendor) continue;

      candidates.push({
        reference: opp.replacementReference,
        description: opp.replacementDescription,
        action: opp.source === "BODEGA" ? "REEMPLAZAR_BODEGA" : "COMPLETAR_DESDE_OP",
        source: opp.source,
        availableQty: opp.availableNow,
        pendingQty: opp.incomingUnits,
        opNumber: opp.opNumber ?? null,
        confidence: opp.confidence,
        explanation: opp.explanation,
      });
    }
  }

  return candidates;
}

function findImportCandidates(
  entry: AssortmentEntryEval,
  vendorId: string,
  importCoverage: ImportCoverageIndex,
): SupplyCandidate[] {
  const candidates: SupplyCandidate[] = [];

  // Import entries match by sizeClass (subgroupCode = PEQUENO/MEDIANO)
  const sizeClass = entry.subgroupCode?.toUpperCase() ?? "";
  const opportunities = importCoverage.get(sizeClass) ?? [];

  for (const opp of opportunities) {
    const targetsVendor = opp.targets.some((t) => t.vendorId === vendorId);
    if (!targetsVendor) continue;

    candidates.push({
      reference: opp.replacementReference,
      description: opp.replacementDescription,
      action: "REEMPLAZAR_BODEGA",
      source: "BODEGA",
      availableQty: opp.availableNow,
      pendingQty: null,
      opNumber: null,
      confidence: opp.confidence,
      explanation: opp.explanation,
    });
  }

  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════════
// Coverage indexes (avoid O(N*M) lookups)
// ═══════════════════════════════════════════════════════════════════════════

type TextileCoverageIndex = Map<string, TextileCoverageOpportunity[]>;
type ImportCoverageIndex = Map<string, ImportCoverageOpportunity[]>;
type UrgentProductionIndex = Map<string, UrgentProductionNeed>;

function indexTextileCoverage(items: TextileCoverageOpportunity[]): TextileCoverageIndex {
  const index = new Map<string, TextileCoverageOpportunity[]>();
  for (const item of items) {
    const key = item.subgroup.toUpperCase();
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(item);
  }
  return index;
}

function indexImportCoverage(items: ImportCoverageOpportunity[]): ImportCoverageIndex {
  const index = new Map<string, ImportCoverageOpportunity[]>();
  for (const item of items) {
    const key = item.sizeClass.toUpperCase();
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(item);
  }
  return index;
}

function indexUrgentProduction(items: UrgentProductionNeed[]): UrgentProductionIndex {
  const index = new Map<string, UrgentProductionNeed>();
  for (const item of items) {
    const key = buildUrgentKey(item.brand ?? null, item.group, item.subgroup);
    index.set(key, item);
  }
  return index;
}

function buildUrgentKey(brand: string | null, group: string, subgroup: string): string {
  return `${(brand ?? "").toUpperCase()}|${group.toUpperCase()}|${subgroup.toUpperCase()}`;
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
    // Invert: SIN_COBERTURA (5) is most urgent — show first
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
  subgroupName: string,
): SupplyCandidate[] {
  const vp = plan.vendorPlans.find((v) => v.vendorId === vendorId);
  if (!vp) return [];
  const pos = vp.positions.find((p) => p.subgroupName === subgroupName);
  return pos?.candidates ?? [];
}
