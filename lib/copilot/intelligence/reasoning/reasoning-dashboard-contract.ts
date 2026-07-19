/**
 * lib/copilot/intelligence/reasoning/reasoning-dashboard-contract.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Dashboard Contract
 *
 * Prepares reasoning metrics for future dashboard consumption.
 * No UI. No React. Pure data contracts.
 *
 * No server-only — pure domain data (no DB, no AI, no server deps).
 */

import type {
  ReasoningConclusion,
  ReasoningCategory,
  ExecutiveImpactLevel,
  ReasoningConfidence,
} from "./reasoning-types";
import { EXECUTIVE_IMPACT_RANK } from "./reasoning-types";

// ── Dashboard payload ──────────────────────────────────────────────────────────

export interface ReasoningDashboardPayload {
  orgSlug:            string;
  generatedAt:        string;
  overallScore:       number;
  confidence:         ReasoningConfidence;
  executiveImpact:    ExecutiveImpactLevel;
  insightCount:       number;
  hypothesisCount:    number;
  evidenceCount:      number;
  contradictionCount: number;
  domainCoverage:     DomainCoverageMetric[];
  topInsights:        InsightMetric[];
  requiresAttention:  boolean;
  isMultiDomain:      boolean;
  traceabilityScore:  number;
}

export interface DomainCoverageMetric {
  domain:          ReasoningCategory;
  signalCount:     number;
  hasInsights:     boolean;
  topImpact:       ExecutiveImpactLevel;
}

export interface InsightMetric {
  id:          string;
  title:       string;
  type:        string;
  impact:      ExecutiveImpactLevel;
  confidence:  ReasoningConfidence;
  actionable:  boolean;
  domains:     ReasoningCategory[];
}

// ── buildReasoningDashboard ───────────────────────────────────────────────────

/**
 * buildReasoningDashboard — produce a dashboard payload from a conclusion.
 */
export function buildReasoningDashboard(
  conclusion: ReasoningConclusion,
): ReasoningDashboardPayload {
  const nonMultiDomains = conclusion.domains.filter(d => d !== "MULTI_DOMAIN");

  const domainCoverage: DomainCoverageMetric[] = nonMultiDomains.map(domain => {
    const domainInsights = conclusion.insights.filter(i => i.domains.includes(domain));
    const domainEvidence = conclusion.evidence.filter(e => e.category === domain);

    const topImpact = domainInsights.reduce<ExecutiveImpactLevel>(
      (max, i) =>
        EXECUTIVE_IMPACT_RANK[i.executiveImpact] > EXECUTIVE_IMPACT_RANK[max]
          ? i.executiveImpact
          : max,
      "LOW",
    );

    return {
      domain,
      signalCount:  domainEvidence.reduce((sum, e) => sum + e.signalIds.length, 0),
      hasInsights:  domainInsights.length > 0,
      topImpact,
    };
  });

  const topInsights: InsightMetric[] = conclusion.insights
    .slice(0, 5)
    .map(i => ({
      id:         i.id,
      title:      i.title,
      type:       i.type,
      impact:     i.executiveImpact,
      confidence: i.confidence,
      actionable: i.actionable,
      domains:    i.domains,
    }));

  // Traceability score
  const traceable = conclusion.insights.filter(
    i => i.evidenceIds.length > 0 && i.hypothesisIds.length > 0,
  ).length;
  const traceabilityScore = conclusion.insights.length > 0
    ? Math.round((traceable / conclusion.insights.length) * 100)
    : 100;

  return {
    orgSlug:            conclusion.orgSlug,
    generatedAt:        conclusion.generatedAt,
    overallScore:       conclusion.overallConfidenceScore,
    confidence:         conclusion.overallConfidence,
    executiveImpact:    conclusion.executiveImpact,
    insightCount:       conclusion.insights.length,
    hypothesisCount:    conclusion.hypotheses.length,
    evidenceCount:      conclusion.evidence.length,
    contradictionCount: conclusion.contradictions.length,
    domainCoverage,
    topInsights,
    requiresAttention:  conclusion.executiveImpact === "CRITICAL" || conclusion.executiveImpact === "HIGH",
    isMultiDomain:      nonMultiDomains.length >= 2,
    traceabilityScore,
  };
}

// ── buildEmptyReasoningDashboard ──────────────────────────────────────────────

/**
 * buildEmptyReasoningDashboard — empty state for when no reasoning has run.
 */
export function buildEmptyReasoningDashboard(
  orgSlug: string,
): ReasoningDashboardPayload {
  return {
    orgSlug,
    generatedAt:        new Date().toISOString(),
    overallScore:       0,
    confidence:         "LOW",
    executiveImpact:    "LOW",
    insightCount:       0,
    hypothesisCount:    0,
    evidenceCount:      0,
    contradictionCount: 0,
    domainCoverage:     [],
    topInsights:        [],
    requiresAttention:  false,
    isMultiDomain:      false,
    traceabilityScore:  100,
  };
}
