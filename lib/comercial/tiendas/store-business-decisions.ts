/**
 * lib/comercial/tiendas/store-business-decisions.ts
 *
 * Bridges Store Decision Engine results to BusinessDecision universal contract.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  BusinessDecisionEvidence,
  BusinessDecisionPriority,
} from "@/lib/comercial/business-policy/business-decision-types";

import type {
  TextileCoverageResult,
  GlobalLowStockResult,
  AccessoryCoverageResult,
  AutomaticMarkdownResult,
  SlowRotationResult,
  StoreDecisionEvaluationResult,
  StorePolicyEvidenceItem,
} from "./store-decision-types";

// ── ID generator ────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `bd-store-${Date.now()}-${++counter}`;
}

// ── Evidence bridge ─────────────────────────────────────────────────────────

function bridgeEvidence(ev: StorePolicyEvidenceItem): BusinessDecisionEvidence {
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

// ── Textile coverage → BusinessDecision ─────────────────────────────────────

function priorityFromCoverageGap(gap: number, min: number): BusinessDecisionPriority {
  const pct = min > 0 ? gap / min : 0;
  if (pct >= 1) return "CRITICAL";
  if (pct >= 0.5) return "HIGH";
  if (pct >= 0.25) return "MEDIUM";
  return "LOW";
}

export function buildTextileCoverageDecisions(
  results: TextileCoverageResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.status === "below_minimum" || r.status === "below_ideal")
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "TIENDAS" as const,
      engine: "StorePolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: priorityFromCoverageGap(Math.abs(r.gap), r.minimumUnits),
      title: `Cobertura textil baja: ${r.productName} en ${r.storeName}`,
      summary: `${r.currentUnits} uds vs min ${r.minimumUnits}. Gap: ${r.gap}`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.evidence.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Global low stock (Rule 36) → BusinessDecision ───────────────────────────

export function buildGlobalLowStockDecisions(
  results: GlobalLowStockResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.transferOutStores.length > 0)
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "TIENDAS" as const,
      engine: "StorePolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: "HIGH" as const,
      title: `Regla 36: consolidar ${r.productName}`,
      summary: `${r.totalUnitsAllWarehouses} uds totales, umbral ${r.threshold}. ${r.transferOutStores.length} tiendas deben transferir.`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.evidence.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Accessory coverage → BusinessDecision ───────────────────────────────────

export function buildAccessoryCoverageDecisions(
  results: AccessoryCoverageResult[],
  tenantId: string,
): BusinessDecision[] {
  return results
    .filter(r => r.status === "below")
    .map(r => ({
      decisionId: nextId(),
      tenantId,
      domain: "TIENDAS" as const,
      engine: "StorePolicyPack",
      policy: r.evidence.policyId,
      severity: r.evidence.severity,
      priority: Math.abs(r.gap) >= r.idealUnits ? "HIGH" as const : "MEDIUM" as const,
      title: `Cobertura accesorio baja: ${r.productName} en ${r.storeName}`,
      summary: `${r.currentUnits} uds vs ideal ${r.idealUnits}. Gap: ${r.gap}`,
      recommendedAction: r.evidence.recommendedAction,
      status: "pending" as const,
      confidence: r.evidence.confidence,
      evidence: bridgeEvidence(r.evidence),
      generatedAt: new Date().toISOString(),
      expiresAt: null,
    }));
}

// ── Markdown → BusinessDecision ─────────────────────────────────────────────

export function buildMarkdownDecisions(
  results: AutomaticMarkdownResult[],
  tenantId: string,
): BusinessDecision[] {
  return results.map(r => ({
    decisionId: nextId(),
    tenantId,
    domain: "TIENDAS" as const,
    engine: "StorePolicyPack",
    policy: r.evidence.policyId,
    severity: r.evidence.severity,
    priority: r.suggestedDiscountPct >= 50 ? "HIGH" as const : "MEDIUM" as const,
    title: `Descuento sugerido: ${r.suggestedDiscountPct}% para ${r.productName}`,
    summary: `${r.daysInStore} dias en ${r.storeName}. ${r.currentUnits} uds restantes.`,
    recommendedAction: r.evidence.recommendedAction,
    status: "pending" as const,
    confidence: r.evidence.confidence,
    evidence: bridgeEvidence(r.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  }));
}

// ── Slow rotation → BusinessDecision ────────────────────────────────────────

export function buildSlowRotationDecisions(
  results: SlowRotationResult[],
  tenantId: string,
): BusinessDecision[] {
  return results.map(r => ({
    decisionId: nextId(),
    tenantId,
    domain: "TIENDAS" as const,
    engine: "StorePolicyPack",
    policy: r.evidence.policyId,
    severity: r.evidence.severity,
    priority: r.daysInStore >= 180 ? "HIGH" as const : "MEDIUM" as const,
    title: `Rotacion lenta: ${r.productName} en ${r.storeName}`,
    summary: `${r.daysInStore} dias, ${r.currentUnits} uds. Descuento sugerido: ${r.suggestedDiscountPct}%`,
    recommendedAction: r.evidence.recommendedAction,
    status: "pending" as const,
    confidence: r.evidence.confidence,
    evidence: bridgeEvidence(r.evidence),
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  }));
}

// ── Build all store BusinessDecisions from evaluation result ─────────────────

export function buildAllStoreBusinessDecisions(
  evaluation: StoreDecisionEvaluationResult,
): BusinessDecision[] {
  const tid = evaluation.tenantId;
  return [
    ...buildTextileCoverageDecisions(evaluation.textileCoverage, tid),
    ...buildGlobalLowStockDecisions(evaluation.globalLowStock, tid),
    ...buildAccessoryCoverageDecisions(evaluation.accessoryCoverage, tid),
    ...buildMarkdownDecisions(evaluation.automaticMarkdowns, tid),
    ...buildSlowRotationDecisions(evaluation.slowRotation, tid),
  ];
}
