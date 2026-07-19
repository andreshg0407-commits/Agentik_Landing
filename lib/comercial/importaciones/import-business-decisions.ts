/**
 * lib/comercial/importaciones/import-business-decisions.ts
 *
 * Bridges Import Decision Engine results to BusinessDecision universal contract.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  BusinessDecisionEvidence,
} from "@/lib/comercial/business-policy/business-decision-types";

import type {
  LowRotationResult,
  RepurchaseResult,
  NextContainerItem,
  InventoryAgingResult,
  ImportEvidenceItem,
} from "./import-policy-types";

// ── ID generator ────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `bd-import-${Date.now()}-${++counter}`;
}

// ── Evidence bridge ─────────────────────────────────────────────────────────

function bridgeEvidence(ev: ImportEvidenceItem): BusinessDecisionEvidence {
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

// ── Low rotation → BusinessDecision ─────────────────────────────────────────

export function buildLowRotationDecisions(
  results: LowRotationResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.isLowRotation)
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "IMPORTACIONES" as const,
      engine: "ImportPolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: (r.daysSinceLastEntry ?? 0) > 365 ? "HIGH" as const : "MEDIUM" as const,
      title: `Baja rotacion: ${r.description}`,
      summary: `${r.currentInventory} uds. ${r.monthsSinceLastEntry ?? "—"} meses sin entrada.`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Repurchase → BusinessDecision ───────────────────────────────────────────

export function buildRepurchaseDecisions(
  results: RepurchaseResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.decision === "REBUY" || r.decision === "WATCH")
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "IMPORTACIONES" as const,
      engine: "ImportPolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: r.decision === "REBUY" ? "HIGH" as const : "MEDIUM" as const,
      title: `${r.decision === "REBUY" ? "Recomprar" : "Vigilar"}: ${r.description}`,
      summary: `Score: ${r.totalScore}. Inventario: ${r.currentInventory}. Ventas 6m: ${r.sales6m}. Sugerido: ${r.suggestedQty ?? "—"} uds`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Next container → BusinessDecision ───────────────────────────────────────

export function buildNextContainerDecisions(
  items: NextContainerItem[],
  tenantId: string,
): BusinessDecision[] {
  return items
    .filter(i => i.priority === "HIGH" || i.priority === "MEDIUM")
    .map(i => ({
      decisionId: nextId(),
      tenantId,
      domain: "IMPORTACIONES" as const,
      engine: "ImportPolicyPack",
      policy: i.evidence.policyId,
      severity: i.evidence.severity,
      priority: i.priority === "HIGH" ? "HIGH" as const : "MEDIUM" as const,
      title: `Proximo contenedor: ${i.description}`,
      summary: `Prioridad ${i.priority}. Score: ${i.priorityScore}. Inventario: ${i.currentInventory}. Sugerido: ${i.suggestedQty ?? "—"} uds`,
      recommendedAction: i.evidence.recommendedAction,
      status: "pending" as const,
      confidence: i.confidence,
      evidence: bridgeEvidence(i.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Inventory aging → BusinessDecision ──────────────────────────────────────

export function buildAgingDecisions(
  results: InventoryAgingResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.agingStatus === "AGING" || r.agingStatus === "LOW_ROTATION" || r.agingStatus === "OBSOLETE_CANDIDATE")
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "IMPORTACIONES" as const,
      engine: "ImportPolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: r.agingStatus === "OBSOLETE_CANDIDATE" ? "CRITICAL" as const
        : r.agingStatus === "LOW_ROTATION" ? "HIGH" as const : "MEDIUM" as const,
      title: `Envejecimiento: ${r.description} (${r.agingStatus})`,
      summary: `${r.currentInventory} uds. ${r.daysSinceLastEntry ?? "—"} dias. Ventas 6m: ${r.sales6m}`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Build all import BusinessDecisions ──────────────────────────────────────

export function buildAllImportBusinessDecisions(
  tenantId: string,
  lowRotation: LowRotationResult[],
  repurchase: RepurchaseResult[],
  containerItems: NextContainerItem[],
  aging: InventoryAgingResult[],
): BusinessDecision[] {
  return [
    ...buildLowRotationDecisions(lowRotation, tenantId),
    ...buildRepurchaseDecisions(repurchase, tenantId),
    ...buildNextContainerDecisions(containerItems, tenantId),
    ...buildAgingDecisions(aging, tenantId),
  ];
}
