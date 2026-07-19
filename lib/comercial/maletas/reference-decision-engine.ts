/**
 * lib/comercial/maletas/reference-decision-engine.ts
 *
 * Reference-Level Operational Decision Engine
 *
 * Elevates decisions from line-level (LT/CS) to individual SAG reference level.
 * Crosses: disponible + PD pressure + vendor case exposure + production rules.
 *
 * Operational states (most severe wins):
 *   agotado          — disponible <= 0
 *   producir_urgente — 0 < disponible <= minRequired * 0.25
 *   reponer_maletas  — depletedRepCount > 0 AND disponible > 0
 *   riesgo_pd        — disponible >= min BUT netAfterPD < min
 *   bajo_minimo      — 0 < disponible < min
 *   monitoreo        — disponible >= min AND pdPressureRatio > 0.3
 *   estable          — all clear
 *
 * Scoring (0–100):
 *   shortageScore (0–40): how far below minimum
 *   pdScore       (0–30): PD pressure ratio
 *   vendorScore   (0–20): fraction of reps with depleted cases
 *   depletionBonus (0–10): hard zero disponible bonus
 *
 * Pure computation — no Prisma, no UI, no SAG adapter changes.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-REFERENCE-DECISION-ENGINE-01
 */

import type { CommercialCaseLine, SalesRep } from "./maletas-types";
import type { SagInventoryItem }              from "./sag-inventory-adapter";
import type { CommercialCoverageRule }        from "./coverage-rule-types";
import type { CommercialCaseAssignment }      from "./case-assignment-types";

// ─── Output types ─────────────────────────────────────────────────────────────

export type ReferenceOpState =
  | "estable"
  | "monitoreo"
  | "bajo_minimo"
  | "riesgo_pd"
  | "agotado"
  | "reponer_maletas"
  | "producir_urgente";

export interface ReferenceOperationalState {
  // ── Identity ──────────────────────────────────────────────────────────────
  reference:            string;
  description:          string;
  line:                 CommercialCaseLine;
  category:             string;
  productType:          string;
  size?:                string;
  color?:               string;

  // ── Inventory fields ─────────────────────────────────────────────────────
  /** bodega inicial = disponible + pedidos */
  bodegaInicial:        number;
  /** disponible operativo (from SAG: inventario − reservas) */
  disponible:           number;
  /** SAG PD pending demand */
  pdPending:            number;
  /** disponible − pdPending — net after absorbing PD demand */
  netAfterPD:           number;
  /** pdPending / max(1, bodegaInicial) */
  pdPressureRatio:      number;

  // ── Rule fields ───────────────────────────────────────────────────────────
  minRequired:          number;
  idealQty:             number;
  /** min(100, round(disponible / max(1, min) * 100)) */
  coveragePct:          number;

  // ── Vendor exposure ───────────────────────────────────────────────────────
  /** All rep IDs that carry this reference */
  affectedRepIds:       string[];
  affectedRepNames:     string[];
  affectedRepCount:     number;
  /** Rep IDs whose case currentQty <= 0 for this reference */
  depletedRepIds:       string[];
  depletedRepCount:     number;
  /** References that can be replenished now (warehouse has stock) */
  replenishmentCandidates: string[];

  // ── Decision output ───────────────────────────────────────────────────────
  opState:              ReferenceOpState;
  /** 0–100: higher = more urgent */
  operationalScore:     number;

  // ── Production suggestion ─────────────────────────────────────────────────
  /** max(0, idealQty − disponible) — never negative */
  suggestedProductionQty: number;
  /** Structural field: batch label if production rule carries a name */
  suggestedBatchLabel?:   string;

  // ── Future automation anchors (structural) ────────────────────────────────
  /** Sales rep IDs to notify for replenishment */
  affectedSalesReps:    string[];
}

export interface ReferenceDecisionSummary {
  states:                  ReferenceOperationalState[];
  /** Top 5 by operationalScore among agotado/producir_urgente/riesgo_pd */
  topCriticalReferences:   ReferenceOperationalState[];
  /** Top 5 by pdPressureRatio */
  topPdPressureReferences: ReferenceOperationalState[];
  /** Top 5 by depletedRepCount */
  topVendorRiskReferences: ReferenceOperationalState[];
  stats: {
    totalRefs:          number;
    agotadoCount:       number;
    producirCount:      number;
    reponerCount:       number;
    riesgoPdCount:      number;
    estableCount:       number;
    totalSuggestedQty:  number;
  };
}

// ─── Rule matcher ──────────────────────────────────────────────────────────────
//
// Priority: exact ref match > line+category+productType > line+category > line-only fallback.
// Inactive rules are skipped.

function findMatchingRule(
  inv:   SagInventoryItem,
  rules: CommercialCoverageRule[],
): CommercialCoverageRule | null {
  const activeRules = rules.filter(r => r.active);

  // 1. Exact reference match (highest specificity)
  const exactRef = activeRules.find(r =>
    r.reference &&
    r.reference.toUpperCase() === inv.reference.toUpperCase() &&
    r.line === inv.line,
  );
  if (exactRef) return exactRef;

  // 2. line + category + productType
  const fullMatch = activeRules.find(r =>
    !r.reference &&
    r.line        === inv.line &&
    r.category    === inv.category &&
    r.productType === inv.productType,
  );
  if (fullMatch) return fullMatch;

  // 3. line + category (partial match)
  const catMatch = activeRules.find(r =>
    !r.reference &&
    r.line     === inv.line &&
    r.category === inv.category,
  );
  if (catMatch) return catMatch;

  // 4. line-only fallback
  const lineMatch = activeRules.find(r =>
    !r.reference &&
    r.line === inv.line,
  );
  return lineMatch ?? null;
}

// ─── State resolver ────────────────────────────────────────────────────────────

function resolveOpState(
  disponible:       number,
  minRequired:      number,
  netAfterPD:       number,
  pdPressureRatio:  number,
  depletedRepCount: number,
): ReferenceOpState {
  // Most severe wins — evaluated in descending severity order
  if (disponible <= 0) return "agotado";
  if (minRequired > 0 && disponible <= minRequired * 0.25) return "producir_urgente";
  if (depletedRepCount > 0 && disponible > 0) return "reponer_maletas";
  if (minRequired > 0 && disponible >= minRequired && netAfterPD < minRequired) return "riesgo_pd";
  if (minRequired > 0 && disponible < minRequired) return "bajo_minimo";
  if (pdPressureRatio > 0.3) return "monitoreo";
  return "estable";
}

// ─── Score calculator ─────────────────────────────────────────────────────────

function computeScore(
  disponible:       number,
  minRequired:      number,
  pdPressureRatio:  number,
  affectedRepCount: number,
  totalRepCount:    number,
): number {
  const shortageScore = minRequired > 0
    ? Math.min(40, (Math.max(0, minRequired - disponible) / minRequired) * 40)
    : 0;
  const pdScore      = Math.min(30, pdPressureRatio * 30);
  const vendorScore  = totalRepCount > 0
    ? (affectedRepCount / totalRepCount) * 20
    : 0;
  const depletionBonus = disponible <= 0 ? 10 : 0;

  return Math.round(shortageScore + pdScore + vendorScore + depletionBonus);
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Build per-reference operational decisions.
 *
 * @param inventory   SagInventoryItem[] — live SAG view (one item per ref)
 * @param rules       CommercialCoverageRule[] — active coverage rules
 * @param assignments CommercialCaseAssignment[] — current vendor cases
 * @param salesReps   SalesRep[] — for name resolution and total rep count
 */
export function buildReferenceDecisions(
  inventory:   SagInventoryItem[],
  rules:       CommercialCoverageRule[],
  assignments: CommercialCaseAssignment[],
  salesReps:   SalesRep[],
): ReferenceDecisionSummary {
  const totalRepCount = salesReps.filter(r => r.active).length;

  // Build assignment maps per reference
  const repsByRef     = new Map<string, Set<string>>(); // ref → repIds that carry it
  const depletedByRef = new Map<string, Set<string>>(); // ref → repIds with case qty <= 0

  for (const a of assignments) {
    const key = a.reference.toUpperCase();
    if (!repsByRef.has(key)) repsByRef.set(key, new Set());
    repsByRef.get(key)!.add(a.salesRepId);

    if (a.currentQty <= 0) {
      if (!depletedByRef.has(key)) depletedByRef.set(key, new Set());
      depletedByRef.get(key)!.add(a.salesRepId);
    }
  }

  // Rep name lookup
  const repNameById = new Map(salesReps.map(r => [r.id, r.name]));

  const states: ReferenceOperationalState[] = [];

  for (const inv of inventory) {
    const refKey  = inv.reference.toUpperCase();
    const rule    = findMatchingRule(inv, rules);

    const disponible     = Math.max(0, inv.availableForCases);
    const pdPending      = Math.max(0, inv.pendingPDQty);
    const bodegaInicial  = inv.initialWarehouseQty;
    const netAfterPD     = Math.max(0, disponible - pdPending);
    const pdPressureRatio = bodegaInicial > 0 ? Math.min(1, pdPending / bodegaInicial) : 0;

    const minRequired = rule?.minWarehouseQty ?? 0;
    const idealQty    = rule?.idealWarehouseQty ?? 0;
    const coveragePct = minRequired > 0
      ? Math.min(100, Math.round((disponible / minRequired) * 100))
      : 0;

    const affectedRepSet  = repsByRef.get(refKey) ?? new Set<string>();
    const depletedRepSet  = depletedByRef.get(refKey) ?? new Set<string>();

    const affectedRepIds  = Array.from(affectedRepSet);
    const depletedRepIds  = Array.from(depletedRepSet);
    const affectedRepCount = affectedRepIds.length;
    const depletedRepCount = depletedRepIds.length;

    const affectedRepNames = affectedRepIds
      .map(id => repNameById.get(id) ?? id)
      .filter(Boolean);

    const opState = resolveOpState(
      disponible, minRequired, netAfterPD, pdPressureRatio, depletedRepCount,
    );

    const operationalScore = computeScore(
      disponible, minRequired, pdPressureRatio, affectedRepCount, totalRepCount,
    );

    const suggestedProductionQty = idealQty > 0
      ? Math.max(0, idealQty - disponible)
      : rule?.suggestedProductionQty ?? 0;

    // Replenishment candidates: this reference can supply vendor cases when warehouse has stock
    const replenishmentCandidates: string[] = disponible > 0 && depletedRepCount > 0
      ? depletedRepIds
      : [];

    states.push({
      reference:            inv.reference,
      description:          inv.description,
      line:                 inv.line,
      category:             inv.category,
      productType:          inv.productType,
      size:                 inv.size,
      color:                inv.color,
      bodegaInicial,
      disponible,
      pdPending,
      netAfterPD,
      pdPressureRatio,
      minRequired,
      idealQty,
      coveragePct,
      affectedRepIds,
      affectedRepNames,
      affectedRepCount,
      depletedRepIds,
      depletedRepCount,
      replenishmentCandidates,
      opState,
      operationalScore,
      suggestedProductionQty,
      suggestedBatchLabel: rule ? `${inv.line}-${inv.category}-${inv.productType}`.toLowerCase() : undefined,
      affectedSalesReps: affectedRepIds,
    });
  }

  // Sort: highest score first
  states.sort((a, b) => b.operationalScore - a.operationalScore);

  // Build top lists
  const CRITICAL_STATES = new Set<ReferenceOpState>(["agotado", "producir_urgente", "riesgo_pd"]);

  const topCriticalReferences = states
    .filter(s => CRITICAL_STATES.has(s.opState))
    .slice(0, 5);

  const topPdPressureReferences = [...states]
    .sort((a, b) => b.pdPressureRatio - a.pdPressureRatio)
    .filter(s => s.pdPressureRatio > 0)
    .slice(0, 5);

  const topVendorRiskReferences = [...states]
    .sort((a, b) => b.depletedRepCount - a.depletedRepCount)
    .filter(s => s.depletedRepCount > 0)
    .slice(0, 5);

  // Stats
  const agotadoCount  = states.filter(s => s.opState === "agotado").length;
  const producirCount = states.filter(s => s.opState === "producir_urgente").length;
  const reponerCount  = states.filter(s => s.opState === "reponer_maletas").length;
  const riesgoPdCount = states.filter(s => s.opState === "riesgo_pd").length;
  const estableCount  = states.filter(s => s.opState === "estable").length;
  const totalSuggestedQty = states.reduce((sum, s) => sum + s.suggestedProductionQty, 0);

  return {
    states,
    topCriticalReferences,
    topPdPressureReferences,
    topVendorRiskReferences,
    stats: {
      totalRefs:         states.length,
      agotadoCount,
      producirCount,
      reponerCount,
      riesgoPdCount,
      estableCount,
      totalSuggestedQty,
    },
  };
}
