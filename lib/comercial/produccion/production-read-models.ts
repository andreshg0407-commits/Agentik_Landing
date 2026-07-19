/**
 * lib/comercial/produccion/production-read-models.ts
 *
 * FASE 12 — Planning read models + Production Queue assembler.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

import type {
  ProductionPlanningContext,
  ProductionNeedResult,
  ProductionPriorityResult,
  ShortageResult,
  ProductionHealthSummary,
  ProductionAlert,
  ProductionQueue,
  BusinessDecision,
  ProductionPriority,
} from "./production-planning-types";

// ── Production Planning State ───────────────────────────────────────────────

export interface ProductionPlanningState {
  tenantId: string;
  productionNeeds: ProductionNeedResult[];
  priorities: ProductionPriorityResult[];
  shortages: ShortageResult[];
  health: ProductionHealthSummary;
  alerts: ProductionAlert[];
  queue: ProductionQueue;
  generatedAt: string;
}

export function buildProductionPlanningState(
  ctx: ProductionPlanningContext,
  productionNeeds: ProductionNeedResult[],
  priorities: ProductionPriorityResult[],
  shortages: ShortageResult[],
  health: ProductionHealthSummary,
  alerts: ProductionAlert[],
  queue: ProductionQueue,
): ProductionPlanningState {
  return {
    tenantId: ctx.tenantId,
    productionNeeds,
    priorities,
    shortages,
    health,
    alerts,
    queue,
    generatedAt: new Date().toISOString(),
  };
}

// ── BusinessDecision universal contract builder ─────────────────────────────

let decisionCounter = 0;

function nextDecisionId(): string {
  return `bd-prod-${++decisionCounter}`;
}

export function buildBusinessDecision(
  need: ProductionNeedResult,
  priority: ProductionPriority,
  tenantId: string,
): BusinessDecision {
  return {
    decisionId: nextDecisionId(),
    tenantId,
    engine: "ProductionPlanningPack",
    policy: need.evidence.policyId,
    severity: need.evidence.severity,
    priority,
    title: need.decision === "PRODUCE"
      ? `Produccion requerida: ${need.subgroup}`
      : need.decision === "WAIT_EXISTING_OP"
        ? `Esperando OP: ${need.subgroup}`
        : need.decision === "SUFFICIENT_STOCK"
          ? `Stock suficiente: ${need.subgroup}`
          : `Datos insuficientes: ${need.subgroup}`,
    summary: need.reason,
    recommendedAction: need.evidence.recommendedAction,
    status: "pending",
    confidence: need.confidence,
    evidence: need.evidence,
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

export function buildAllBusinessDecisions(
  needs: ProductionNeedResult[],
  priorities: ProductionPriorityResult[],
  tenantId: string,
): BusinessDecision[] {
  const priorityMap = new Map(priorities.map(p => [p.subgroup, p.priority]));

  return needs
    .filter(n => n.decision === "PRODUCE" || n.decision === "WAIT_EXISTING_OP")
    .map(n => buildBusinessDecision(n, priorityMap.get(n.subgroup) ?? "LOW", tenantId));
}
