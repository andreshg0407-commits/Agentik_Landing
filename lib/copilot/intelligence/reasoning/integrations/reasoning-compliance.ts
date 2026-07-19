/**
 * lib/copilot/intelligence/reasoning/integrations/reasoning-compliance.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Integration — Compliance Layer
 *
 * Enables reasoning traceability through the Compliance layer.
 * Every reasoning conclusion can generate a compliance-compatible trace record
 * that demonstrates the reasoning was based on evidence, not hallucinations.
 *
 * Contract:
 *   - Takes a ReasoningConclusion
 *   - Produces a ReasoningTraceRecord suitable for compliance audit
 *   - Never modifies the conclusion
 *   - Never makes DB calls
 *   - Never exposes sensitive data
 *
 * No Prisma. No server-only. Pure adapter. Never throws.
 */

import type { ReasoningConclusion, ReasoningInsight, ReasoningEvidence } from "../reasoning-types";

// ── Compliance trace types ─────────────────────────────────────────────────────

/**
 * ReasoningTraceRecord — compliance-compatible trace of a reasoning run.
 * Suitable for inclusion in ComplianceEvidence (via the security compliance layer).
 */
export interface ReasoningTraceRecord {
  traceId:            string;
  orgSlug:            string;
  queryId:            string;
  conclusionId:       string;
  insightCount:       number;
  hypothesisCount:    number;
  evidenceCount:      number;
  contradictionCount: number;
  overallConfidence:  string;
  executiveImpact:    string;
  domains:            string[];
  evidenceSources:    string[];      // de-duplicated source identifiers
  generatedAt:        string;
  isTraceable:        boolean;       // true if all insights have evidence
  traceabilityScore:  number;        // 0–100: % of insights that are fully traceable
}

/**
 * ReasoningEvidenceTrace — per-insight traceability record.
 */
export interface ReasoningEvidenceTrace {
  insightId:    string;
  insightTitle: string;
  hasEvidence:  boolean;
  evidenceIds:  string[];
  hypothesisIds: string[];
  isTraceable:  boolean;
}

// ── buildReasoningTraceRecord ──────────────────────────────────────────────────

/**
 * buildReasoningTraceRecord — produce a compliance trace from a conclusion.
 *
 * Never exposes insight content (summaries, explanations) to avoid
 * leaking business intelligence through compliance records.
 * Only metadata is included.
 *
 * Never throws.
 */
export function buildReasoningTraceRecord(
  conclusion: ReasoningConclusion,
): ReasoningTraceRecord {
  try {
    const evidenceSources = Array.from(
      new Set(conclusion.evidence.map(e => e.source)),
    );

    const traceability = getEvidenceTraces(conclusion);
    const traceableCount = traceability.filter(t => t.isTraceable).length;
    const traceabilityScore = conclusion.insights.length > 0
      ? Math.round((traceableCount / conclusion.insights.length) * 100)
      : 100; // no insights = trivially traceable

    return {
      traceId:            `rtrace_${conclusion.id}`,
      orgSlug:            conclusion.orgSlug,
      queryId:            conclusion.queryId,
      conclusionId:       conclusion.id,
      insightCount:       conclusion.insights.length,
      hypothesisCount:    conclusion.hypotheses.length,
      evidenceCount:      conclusion.evidence.length,
      contradictionCount: conclusion.contradictions.length,
      overallConfidence:  conclusion.overallConfidence,
      executiveImpact:    conclusion.executiveImpact,
      domains:            conclusion.domains,
      evidenceSources,
      generatedAt:        conclusion.generatedAt,
      isTraceable:        traceabilityScore === 100,
      traceabilityScore,
    };
  } catch {
    return {
      traceId:            `rtrace_err_${Date.now()}`,
      orgSlug:            conclusion.orgSlug,
      queryId:            conclusion.queryId,
      conclusionId:       conclusion.id,
      insightCount:       0,
      hypothesisCount:    0,
      evidenceCount:      0,
      contradictionCount: 0,
      overallConfidence:  "UNKNOWN",
      executiveImpact:    "LOW",
      domains:            [],
      evidenceSources:    [],
      generatedAt:        new Date().toISOString(),
      isTraceable:        false,
      traceabilityScore:  0,
    };
  }
}

// ── getEvidenceTraces ──────────────────────────────────────────────────────────

/**
 * getEvidenceTraces — get per-insight traceability records.
 * Used for compliance audit of reasoning quality.
 */
export function getEvidenceTraces(
  conclusion: ReasoningConclusion,
): ReasoningEvidenceTrace[] {
  const evidenceIds = new Set(conclusion.evidence.map(e => e.id));
  const hypothesisIds = new Set(conclusion.hypotheses.map(h => h.id));

  return conclusion.insights.map(insight => {
    const validEvidenceIds = insight.evidenceIds.filter(id => evidenceIds.has(id));
    const validHypIds      = insight.hypothesisIds.filter(id => hypothesisIds.has(id));
    const hasEvidence      = validEvidenceIds.length > 0;
    const hasHypothesis    = validHypIds.length > 0;

    return {
      insightId:    insight.id,
      insightTitle: insight.title,
      hasEvidence,
      evidenceIds:  validEvidenceIds,
      hypothesisIds: validHypIds,
      isTraceable:  hasEvidence && hasHypothesis,
    };
  });
}

// ── validateReasoningCompliance ────────────────────────────────────────────────

/**
 * validateReasoningCompliance — verify the conclusion meets compliance standards.
 *
 * Checks:
 *   1. All insights have at least one evidence ID
 *   2. All insights have at least one hypothesis ID
 *   3. No cross-tenant data (all orgSlug fields match)
 *   4. All evidence is traceable to signals (signalIds not empty)
 */
export function validateReasoningCompliance(conclusion: ReasoningConclusion): {
  compliant: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Check tenant isolation
  for (const evidence of conclusion.evidence) {
    if (evidence.orgSlug !== conclusion.orgSlug) {
      violations.push(`Cross-tenant evidence: ${evidence.id} has orgSlug ${evidence.orgSlug}`);
    }
  }

  // Check insight traceability
  for (const insight of conclusion.insights) {
    if (insight.evidenceIds.length === 0) {
      violations.push(`Insight ${insight.id} has no evidence IDs (potential hallucination)`);
    }
    if (insight.hypothesisIds.length === 0) {
      violations.push(`Insight ${insight.id} has no hypothesis IDs (missing traceability)`);
    }
    if (!insight.explanation) {
      violations.push(`Insight ${insight.id} has no explanation`);
    }
  }

  // Check evidence traceability
  for (const evidence of conclusion.evidence) {
    if (evidence.signalIds.length === 0) {
      violations.push(`Evidence ${evidence.id} has no signal IDs (missing source trace)`);
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}
