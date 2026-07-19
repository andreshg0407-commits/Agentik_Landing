/**
 * lib/comercial/maletas/maletas-live-bag-engine.ts
 *
 * Live Bag Engine — bridges the new maleta-centric domain with the existing
 * SAG inventory adapter and coverage-rule engine.
 *
 * Priority chain for computing coverage minimums:
 *   1. MaletaReferenceTarget.minQty (specific target for this ref in this maleta)
 *   2. CommercialCoverageRule matching by reference (exact)
 *   3. CommercialCoverageRule matching by line + category + productType
 *   4. Fallback: 0 (no minimum — reference is informational only)
 *
 * Does NOT modify or replace:
 *   - reference-decision-engine.ts
 *   - production-alert-engine.ts
 *   - case-status-engine.ts
 *   - maletas-engine.ts
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-LIVE-BAG-ARCHITECTURE-01
 */

import type { SagInventoryItem }          from "./sag-inventory-adapter";
import type { CommercialCoverageRule }    from "./coverage-rule-types";
import type {
  MaletaTemplate,
  MaletaAssignment,
  MaletaReferenceTarget,
  MaletaCoverageState,
  MaletaOperationalPressure,
  MaletaOperationalState,
  PressureUrgency,
} from "./live-bag-types";

// ─── Coverage state computation ─────────────────────────────────────────────────

function resolveMinQty(
  reference: string,
  line:      string,
  category:  string,
  productType: string,
  targets:   MaletaReferenceTarget[],
  rules:     CommercialCoverageRule[],
): { minQty: number; suggestedQty: number } {
  // 1. Specific target in this maleta
  const target = targets.find(t => t.reference.toUpperCase() === reference.toUpperCase() && t.active);
  if (target) return { minQty: target.minQty, suggestedQty: target.targetQty };

  // 2. Rule matching exact reference
  const refRule = rules.find(r => r.active && r.reference?.toUpperCase() === reference.toUpperCase());
  if (refRule) return { minQty: refRule.minWarehouseQty, suggestedQty: refRule.suggestedProductionQty };

  // 3. Rule matching line + category + productType
  const typeRule = rules.find(r =>
    r.active &&
    !r.reference &&
    r.line === line &&
    r.category.toUpperCase() === category.toUpperCase() &&
    r.productType.toUpperCase() === productType.toUpperCase(),
  );
  if (typeRule) return { minQty: typeRule.minWarehouseQty, suggestedQty: typeRule.suggestedProductionQty };

  // 4. Fallback
  return { minQty: 0, suggestedQty: 0 };
}

function toOperationalState(
  available: number,
  pendingPD: number,
  minQty:    number,
  hasSag:    boolean,
): MaletaOperationalState {
  if (!hasSag) return "sin_datos";
  if (available <= 0 && pendingPD > 0) return "critico";
  if (available <= 0) return "critico";
  if (available <= minQty && pendingPD > 0) return "critico";
  if (available <= minQty) return "presion";
  return "ok";
}

/**
 * Compute coverage states for all SAG inventory items within a maleta context.
 * Items not in SAG inventory are skipped (no data to cross).
 */
export function computeMaletaCoverageStates(
  maleta:      MaletaTemplate,
  assignments: MaletaAssignment[],
  targets:     MaletaReferenceTarget[],
  sagInventory: SagInventoryItem[],
  rules:       CommercialCoverageRule[],
): MaletaCoverageState[] {
  const salesRepIds = assignments
    .filter(a => a.maletaId === maleta.id && a.active)
    .map(a => a.salesRepId);

  return sagInventory.map((item): MaletaCoverageState => {
    const { minQty, suggestedQty } = resolveMinQty(
      item.reference, item.line, item.category, item.productType, targets, rules,
    );
    const available = item.availableForCases;
    const coveragePct = minQty > 0
      ? Math.min(100, Math.round(available / minQty * 100))
      : available > 0 ? 100 : 0;
    const state = toOperationalState(available, item.pendingPDQty, minQty, true);
    const suggestedProductionQty = state === "critico" || state === "presion"
      ? Math.max(suggestedQty, minQty - available)
      : 0;

    return {
      maletaId: maleta.id,
      reference: item.reference,
      availableQty: available,
      pendingPDQty: item.pendingPDQty,
      targetQty: suggestedQty,
      minQty,
      coveragePct,
      operationalState: state,
      suggestedProductionQty,
      affectedSalesRepIds: salesRepIds,
    };
  });
}

// ─── Operational pressure computation ──────────────────────────────────────────

function toUrgency(state: MaletaOperationalState, pendingPD: number, available: number): PressureUrgency {
  if (state === "critico") return "alta";
  if (state === "presion" && pendingPD > 0) return "media";
  if (state === "presion") return "baja";
  if (available === 0) return "alta";
  return "estable";
}

/**
 * Build operational pressure across all active maletas.
 * Returns one pressure item per reference that needs attention,
 * aggregating all affected maletas and sales reps.
 */
export function buildLiveBagPressure(
  templates:    MaletaTemplate[],
  assignments:  MaletaAssignment[],
  targets:      MaletaReferenceTarget[],
  sagInventory: SagInventoryItem[],
  rules:        CommercialCoverageRule[],
): MaletaOperationalPressure[] {
  const active = templates.filter(t => t.status === "activa");
  if (active.length === 0 || sagInventory.length === 0) return [];

  // ref → aggregated pressure
  const map = new Map<string, MaletaOperationalPressure>();

  for (const maleta of active) {
    const maletaAssignments = assignments.filter(a => a.maletaId === maleta.id && a.active);
    const states = computeMaletaCoverageStates(maleta, maletaAssignments, targets, sagInventory, rules);

    for (const state of states) {
      if (state.operationalState === "ok" || state.operationalState === "sin_datos") continue;

      const invItem = sagInventory.find(i => i.reference === state.reference);
      if (!invItem) continue;

      const urgency = toUrgency(state.operationalState, state.pendingPDQty, state.availableQty);

      const existing = map.get(state.reference);
      if (existing) {
        // Aggregate — merge maleta/rep context
        if (!existing.affectedMaletaIds.includes(maleta.id)) {
          existing.affectedMaletaIds.push(maleta.id);
          existing.affectedMaletaNames.push(maleta.name);
        }
        for (const repId of state.affectedSalesRepIds) {
          const asgn = maletaAssignments.find(a => a.salesRepId === repId);
          if (!existing.affectedSalesRepIds.includes(repId)) {
            existing.affectedSalesRepIds.push(repId);
            if (asgn) existing.affectedSalesRepNames.push(asgn.salesRepName);
          }
        }
        // Take highest urgency
        const order: PressureUrgency[] = ["alta", "media", "baja", "estable"];
        if (order.indexOf(urgency) < order.indexOf(existing.urgency)) {
          existing.urgency = urgency;
        }
        existing.suggestedProductionQty = Math.max(existing.suggestedProductionQty, state.suggestedProductionQty);
      } else {
        const repNames = maletaAssignments
          .filter(a => state.affectedSalesRepIds.includes(a.salesRepId))
          .map(a => a.salesRepName);

        map.set(state.reference, {
          reference:              state.reference,
          description:            invItem.description,
          line:                   invItem.line,
          suggestedProductionQty: state.suggestedProductionQty,
          urgency,
          affectedMaletaIds:      [maleta.id],
          affectedMaletaNames:    [maleta.name],
          affectedSalesRepIds:    [...state.affectedSalesRepIds],
          affectedSalesRepNames:  repNames,
          availableQty:           state.availableQty,
          pendingPDQty:           state.pendingPDQty,
          coveragePct:            state.coveragePct,
          reason:                 state.operationalState === "critico"
            ? "Stock crítico — produce o reabastece urgente"
            : "Cobertura por debajo del mínimo configurado",
          nextAction:             urgency === "estable" ? "sin_accion" : urgency === "baja" ? "monitorear" : "preparar_produccion",
        });
      }
    }
  }

  // Sort: alta → media → baja
  const order: PressureUrgency[] = ["alta", "media", "baja", "estable"];
  return Array.from(map.values()).sort((a, b) => order.indexOf(a.urgency) - order.indexOf(b.urgency));
}

// ─── Maleta summary stats (for card display) ───────────────────────────────────

export interface MaletaSummaryStats {
  maletaId:               string;
  totalRefs:              number;
  criticalRefs:           number;
  coveragePct:            number;  // weighted average
  suggestedProductionQty: number;
}

export function computeMaletaSummaryStats(
  maleta:      MaletaTemplate,
  assignments: MaletaAssignment[],
  targets:     MaletaReferenceTarget[],
  sagInventory: SagInventoryItem[],
  rules:       CommercialCoverageRule[],
): MaletaSummaryStats {
  if (sagInventory.length === 0) {
    return { maletaId: maleta.id, totalRefs: targets.filter(t => t.maletaId === maleta.id).length, criticalRefs: 0, coveragePct: 0, suggestedProductionQty: 0 };
  }
  const maletaAssignments = assignments.filter(a => a.maletaId === maleta.id && a.active);
  const states = computeMaletaCoverageStates(maleta, maletaAssignments, targets, sagInventory, rules);
  const critical = states.filter(s => s.operationalState === "critico").length;
  const avgCoverage = states.length > 0
    ? Math.round(states.reduce((s, st) => s + st.coveragePct, 0) / states.length)
    : 0;
  const totalProd = states.reduce((s, st) => s + st.suggestedProductionQty, 0);
  return {
    maletaId:               maleta.id,
    totalRefs:              states.length,
    criticalRefs:           critical,
    coveragePct:            avgCoverage,
    suggestedProductionQty: totalProd,
  };
}
