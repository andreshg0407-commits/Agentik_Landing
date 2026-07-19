/**
 * lib/comercial/sales-reps/sales-rep-business-decisions.ts
 *
 * Bridges SalesRep Decision Engine results to BusinessDecision universal contract.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  BusinessDecisionEvidence,
} from "@/lib/comercial/business-policy/business-decision-types";

import type {
  MalletOutOfStockResult,
  OverdueReceivableResult,
  InactiveCustomerResult,
  SalesRepDailyState,
  SalesRepEvidenceItem,
} from "./sales-rep-decision-types";

// ── ID generator ────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `bd-rep-${Date.now()}-${++counter}`;
}

// ── Evidence bridge ─────────────────────────────────────────────────────────

function bridgeEvidence(ev: SalesRepEvidenceItem): BusinessDecisionEvidence {
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

// ── Out of stock → BusinessDecision ─────────────────────────────────────────

export function buildOutOfStockDecisions(
  results: MalletOutOfStockResult[],
  tenantId: string,
): BusinessDecision[] {
  return results.map(r => ({
    decisionId: nextId(),
    tenantId,
    domain: "VENDEDORES" as const,
    engine: "SalesRepPolicyPack",
    policy: r.evidence.policyId,
    severity: r.evidence.severity,
    priority: r.availableInventory <= 0 ? "CRITICAL" as const : "HIGH" as const,
    title: `Agotado en maleta: ${r.productName}`,
    summary: `Vendedor ${r.salesRepId}. Maleta ${r.malletId}. Inventario central: ${r.availableInventory}`,
    recommendedAction: r.evidence.recommendedAction,
    status: "pending" as const,
    confidence: r.confidence,
    evidence: bridgeEvidence(r.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  }));
}

// ── Overdue receivable → BusinessDecision ───────────────────────────────────

export function buildOverdueReceivableDecisions(
  results: OverdueReceivableResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.alertSeverity !== "info")
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "VENDEDORES" as const,
      engine: "SalesRepPolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: r.alertSeverity === "critical" ? "CRITICAL" as const : "HIGH" as const,
      title: `Cartera vencida: ${r.customerName}`,
      summary: `$${r.overdueReceivable.toLocaleString()} vencidos, ${r.maxDaysPastDue} dias. Vendedor ${r.salesRepId}`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Inactive customer → BusinessDecision ────────────────────────────────────

export function buildInactiveCustomerDecisions(
  results: InactiveCustomerResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.activityStatus === "INACTIVE" || r.activityStatus === "AT_RISK")
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "VENDEDORES" as const,
      engine: "SalesRepPolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: r.activityStatus === "INACTIVE" ? "HIGH" as const : "MEDIUM" as const,
      title: `Cliente ${r.activityStatus === "INACTIVE" ? "inactivo" : "en riesgo"}: ${r.customerName}`,
      summary: `${r.inactiveDays ?? "—"} dias sin compra. ${r.purchaseCount} compras historicas.`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Build all SalesRep BusinessDecisions from daily state ────────────────────

export function buildAllSalesRepBusinessDecisions(
  state: SalesRepDailyState,
): BusinessDecision[] {
  const tid = state.tenantId;
  return [
    ...buildOutOfStockDecisions(state.outOfStockAlerts, tid),
    ...buildOverdueReceivableDecisions(state.overdueReceivableAlerts, tid),
    ...buildInactiveCustomerDecisions(state.inactiveCustomers, tid),
  ];
}
