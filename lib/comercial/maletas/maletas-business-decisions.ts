/**
 * lib/comercial/maletas/maletas-business-decisions.ts
 *
 * Bridges Maletas Decision Engine results to BusinessDecision universal contract.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  BusinessDecisionEvidence,
  BusinessDecisionPriority,
} from "@/lib/comercial/business-policy/business-decision-types";

import type { CommercialDecision } from "./maletas-decision-engine";

// ── ID generator ────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `bd-maletas-${Date.now()}-${++counter}`;
}

// ── Severity mapping ────────────────────────────────────────────────────────

function mapSeverity(s: CommercialDecision["severity"]): BusinessDecisionEvidence["severity"] {
  switch (s) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
  }
}

function mapPriority(s: CommercialDecision["severity"]): BusinessDecisionPriority {
  switch (s) {
    case "critical": return "CRITICAL";
    case "high": return "HIGH";
    case "medium": return "MEDIUM";
    case "low": return "LOW";
  }
}

// ── Bridge a single CommercialDecision → BusinessDecision ───────────────────

export function bridgeMaletasDecision(
  decision: CommercialDecision,
  tenantId: string,
): BusinessDecision {
  const evidence: BusinessDecisionEvidence = {
    policyId: `maletas-${decision.type}`,
    policyName: decision.title,
    activationReason: decision.summary,
    dataUsed: {
      reference: decision.reference ?? null,
      line: decision.line ?? null,
      affectedSalesReps: decision.affectedSalesReps,
      affectedCases: decision.affectedCases,
      pendingOrdersQty: decision.pendingOrdersQty,
    },
    recommendedAction: decision.title,
    actionRationale: decision.summary,
    confidence: 0.8,
    severity: mapSeverity(decision.severity),
    evaluatedAt: new Date().toISOString(),
  };

  return {
    decisionId: nextId(),
    tenantId,
    domain: "MALETAS",
    engine: "MaletasPolicyPack",
    policy: `maletas-${decision.type}`,
    severity: mapSeverity(decision.severity),
    priority: mapPriority(decision.severity),
    title: decision.title,
    summary: decision.summary,
    recommendedAction: decision.title,
    status: "pending",
    confidence: 0.8,
    evidence,
    generatedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// ── Build all maletas BusinessDecisions ──────────────────────────────────────

export function buildAllMaletasBusinessDecisions(
  decisions: CommercialDecision[],
  tenantId: string,
): BusinessDecision[] {
  return decisions.map(d => bridgeMaletasDecision(d, tenantId));
}
