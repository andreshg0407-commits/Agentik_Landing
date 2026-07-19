/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-audit.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Audit Adapter — creates audit-compatible records from reasoning operations.
 * No DB. No server-only.
 */

import type { ReasoningResult, ReasoningContext } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Audit record types ────────────────────────────────────────────────────────

export type ReasoningAuditAction =
  | "REASONING_STARTED"
  | "REASONING_COMPLETED"
  | "REASONING_FAILED"
  | "HYPOTHESIS_GENERATED"
  | "RISK_DETECTED"
  | "OPPORTUNITY_IDENTIFIED"
  | "RECOMMENDATION_ISSUED"
  | "CHAIN_BUILT"
  | "NARRATIVE_GENERATED";

export interface ReasoningAuditRecord {
  id:          string;
  orgSlug:     string;
  action:      ReasoningAuditAction;
  executionId: string | null;
  actor:       string;
  details:     Record<string, unknown>;
  timestamp:   string;
}

// ── Build audit records from reasoning lifecycle ──────────────────────────────

export function auditReasoningStarted(
  ctx: ReasoningContext,
  executionId: string,
): ReasoningAuditRecord {
  return {
    id:          generateCmrId("aud"),
    orgSlug:     ctx.orgSlug,
    action:      "REASONING_STARTED",
    executionId,
    actor:       "cross-module-engine",
    details:     {
      signalCount:    ctx.signals.length,
      domainCoverage: ctx.domains,
    },
    timestamp:   new Date().toISOString(),
  };
}

export function auditReasoningCompleted(
  result: ReasoningResult,
): ReasoningAuditRecord {
  return {
    id:          generateCmrId("aud"),
    orgSlug:     result.orgSlug,
    action:      "REASONING_COMPLETED",
    executionId: result.id,
    actor:       "cross-module-engine",
    details:     {
      status:              result.status,
      confidenceLevel:     result.confidence.level,
      confidenceScore:     result.confidence.score,
      hypothesisCount:     result.hypothesisCount,
      riskCount:           result.riskCount,
      opportunityCount:    result.opportunityCount,
      recommendationCount: result.recommendationCount,
      durationMs:          result.durationMs,
    },
    timestamp:   result.completedAt,
  };
}

export function auditReasoningFailed(
  orgSlug:     string,
  executionId: string,
  error:       string,
): ReasoningAuditRecord {
  return {
    id:          generateCmrId("aud"),
    orgSlug,
    action:      "REASONING_FAILED",
    executionId,
    actor:       "cross-module-engine",
    details:     { error },
    timestamp:   new Date().toISOString(),
  };
}

export function auditHypothesisGenerated(
  orgSlug:     string,
  executionId: string,
  count:       number,
  supported:   number,
): ReasoningAuditRecord {
  return {
    id:          generateCmrId("aud"),
    orgSlug,
    action:      "HYPOTHESIS_GENERATED",
    executionId,
    actor:       "hypothesis-engine",
    details:     { count, supported, contradicted: count - supported },
    timestamp:   new Date().toISOString(),
  };
}

export function auditRiskDetected(
  orgSlug:       string,
  executionId:   string,
  count:         number,
  criticalCount: number,
): ReasoningAuditRecord {
  return {
    id:          generateCmrId("aud"),
    orgSlug,
    action:      "RISK_DETECTED",
    executionId,
    actor:       "risk-engine",
    details:     { count, criticalCount },
    timestamp:   new Date().toISOString(),
  };
}

export function auditRecommendationIssued(
  orgSlug:     string,
  executionId: string,
  count:       number,
  urgentCount: number,
): ReasoningAuditRecord {
  return {
    id:          generateCmrId("aud"),
    orgSlug,
    action:      "RECOMMENDATION_ISSUED",
    executionId,
    actor:       "recommendation-engine",
    details:     { count, urgentCount },
    timestamp:   new Date().toISOString(),
  };
}

// ── Audit log builder ─────────────────────────────────────────────────────────

export interface ReasoningAuditLog {
  orgSlug:     string;
  executionId: string;
  records:     ReasoningAuditRecord[];
  summary:     string;
}

export function buildReasoningAuditLog(
  result: ReasoningResult,
  ctx:    ReasoningContext,
): ReasoningAuditLog {
  const records: ReasoningAuditRecord[] = [
    auditReasoningStarted(ctx, result.id),
  ];

  if (result.chain.hypotheses.length > 0) {
    const supported = result.chain.hypotheses.filter(h => h.supported && !h.contradicted).length;
    records.push(auditHypothesisGenerated(result.orgSlug, result.id, result.chain.hypotheses.length, supported));
  }

  if (result.chain.risks.length > 0) {
    const critical = result.chain.risks.filter(r => r.severity === "CRITICAL").length;
    records.push(auditRiskDetected(result.orgSlug, result.id, result.chain.risks.length, critical));
  }

  if (result.chain.recommendations.length > 0) {
    const urgent = result.chain.recommendations.filter(r => r.priority === "URGENT" || r.priority === "HIGH").length;
    records.push(auditRecommendationIssued(result.orgSlug, result.id, result.chain.recommendations.length, urgent));
  }

  records.push(auditReasoningCompleted(result));

  return {
    orgSlug:     result.orgSlug,
    executionId: result.id,
    records,
    summary:     `${records.length} audit events for execution ${result.id} (${result.status})`,
  };
}
