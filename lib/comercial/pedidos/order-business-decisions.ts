/**
 * lib/comercial/pedidos/order-business-decisions.ts
 *
 * Bridges Order Decision Engine results to BusinessDecision universal contract.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  BusinessDecisionEvidence,
} from "@/lib/comercial/business-policy/business-decision-types";

import type {
  CustomerCreditResult,
  PartialDeliveryResult,
  OrderReadinessResult,
  OrderDecisionEvaluationResult,
  OrderPolicyEvidenceItem,
} from "./order-decision-types";

// ── ID generator ────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `bd-order-${Date.now()}-${++counter}`;
}

// ── Evidence bridge ─────────────────────────────────────────────────────────

function bridgeEvidence(ev: OrderPolicyEvidenceItem): BusinessDecisionEvidence {
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
  };
}

// ── Credit → BusinessDecision ───────────────────────────────────────────────

export function buildCreditDecision(
  result: CustomerCreditResult,
  tenantId: string,
): BusinessDecision | null {
  if (result.creditStatus === "approved") return null;

  return {
    decisionId: nextId(),
    tenantId,
    domain: "PEDIDOS",
    engine: "OrderPolicyPack",
    policy: result.evidence.policyId,
    severity: result.creditStatus === "blocked" ? "critical" : "high",
    priority: result.creditStatus === "blocked" ? "CRITICAL" : "HIGH",
    title: `Cartera ${result.creditStatus}: ${result.customerName}`,
    summary: `Vencido: $${result.overdueReceivable.toLocaleString()}. Max dias: ${result.maxDaysPastDue}`,
    recommendedAction: result.evidence.recommendedAction,
    status: "pending",
    confidence: result.evidence.confidence,
    evidence: bridgeEvidence(result.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// ── Partial delivery → BusinessDecision ─────────────────────────────────────

export function buildDeliveryDecision(
  result: PartialDeliveryResult,
  tenantId: string,
): BusinessDecision | null {
  if (result.deliveryStatus === "COMPLETE") return null;

  return {
    decisionId: nextId(),
    tenantId,
    domain: "PEDIDOS",
    engine: "OrderPolicyPack",
    policy: result.evidence.policyId,
    severity: result.deliveryStatus === "BACKORDER" ? "high" : "medium",
    priority: result.deliveryStatus === "BACKORDER" ? "HIGH" : "MEDIUM",
    title: `Despacho ${result.deliveryStatus === "BACKORDER" ? "pendiente" : "parcial"}: pedido ${result.orderId}`,
    summary: `${result.fulfillableLines}/${result.totalLines} lineas cumplibles. ${result.backorderLines} en backorder.`,
    recommendedAction: result.evidence.recommendedAction,
    status: "pending",
    confidence: result.evidence.confidence,
    evidence: bridgeEvidence(result.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// ── Readiness → BusinessDecision ────────────────────────────────────────────

export function buildReadinessDecision(
  result: OrderReadinessResult,
  tenantId: string,
): BusinessDecision | null {
  if (result.status === "READY") return null;

  const blockedChecks = result.checks.filter(c => c.status === "blocked");
  const warningChecks = result.checks.filter(c => c.status === "warning");

  return {
    decisionId: nextId(),
    tenantId,
    domain: "PEDIDOS",
    engine: "OrderPolicyPack",
    policy: result.evidence.policyId,
    severity: result.status === "BLOCKED" ? "critical" : "medium",
    priority: result.status === "BLOCKED" ? "CRITICAL" : "MEDIUM",
    title: `Pedido ${result.status === "BLOCKED" ? "bloqueado" : "con advertencias"}: ${result.orderId}`,
    summary: `${blockedChecks.length} bloqueantes, ${warningChecks.length} advertencias.`,
    recommendedAction: result.evidence.recommendedAction,
    status: "pending",
    confidence: result.evidence.confidence,
    evidence: bridgeEvidence(result.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// ── Build all order BusinessDecisions from evaluation result ─────────────────

export function buildAllOrderBusinessDecisions(
  evaluation: OrderDecisionEvaluationResult,
): BusinessDecision[] {
  const tid = evaluation.tenantId;
  const decisions: BusinessDecision[] = [];

  const credit = buildCreditDecision(evaluation.credit, tid);
  if (credit) decisions.push(credit);

  const delivery = buildDeliveryDecision(evaluation.delivery, tid);
  if (delivery) decisions.push(delivery);

  const readiness = buildReadinessDecision(evaluation.readiness, tid);
  if (readiness) decisions.push(readiness);

  return decisions;
}
