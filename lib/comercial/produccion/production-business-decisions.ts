/**
 * lib/comercial/produccion/production-business-decisions.ts
 *
 * Bridges Production Planning Engine results to shared BusinessDecision contract.
 * Re-exports from production-read-models.ts mapped to the shared type.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  BusinessDecisionEvidence,
} from "@/lib/comercial/business-policy/business-decision-types";

import type {
  ProductionNeedResult,
  ProductionPriorityResult,
  ProductionEvidenceItem,
} from "./production-planning-types";

// ── ID generator ────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `bd-prod-${Date.now()}-${++counter}`;
}

// ── Evidence bridge ─────────────────────────────────────────────────────────

function bridgeEvidence(ev: ProductionEvidenceItem): BusinessDecisionEvidence {
  return {
    policyId: ev.policyId,
    policyName: ev.policyName,
    activationReason: ev.activationReason,
    dataUsed: ev.dataUsed,
    recommendedAction: ev.recommendedAction,
    actionRationale: ev.actionRationale,
    confidence: ev.confidence,
    severity: ev.severity,
    evaluatedAt: ev.evaluatedAt,
    missingData: ev.missingData,
    traceId: ev.traceId,
  };
}

// ── Build shared BusinessDecision from production need ───────────────────────

export function buildProductionBusinessDecision(
  need: ProductionNeedResult,
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  tenantId: string,
): BusinessDecision {
  return {
    decisionId: nextId(),
    tenantId,
    domain: "PRODUCCION",
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
    evidence: bridgeEvidence(need.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// ── Build all production BusinessDecisions ───────────────────────────────────

export function buildAllProductionBusinessDecisions(
  needs: ProductionNeedResult[],
  priorities: ProductionPriorityResult[],
  tenantId: string,
): BusinessDecision[] {
  const priorityMap = new Map(priorities.map(p => [p.subgroup, p.priority]));

  return needs
    .filter(n => n.decision === "PRODUCE" || n.decision === "WAIT_EXISTING_OP")
    .map(n => buildProductionBusinessDecision(
      n,
      priorityMap.get(n.subgroup) ?? "LOW",
      tenantId,
    ));
}
