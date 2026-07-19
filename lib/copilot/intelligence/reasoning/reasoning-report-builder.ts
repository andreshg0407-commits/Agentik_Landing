/**
 * lib/copilot/intelligence/reasoning/reasoning-report-builder.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Report Builder
 *
 * Generates structured reports from reasoning conclusions:
 *   - ExecutiveInsightReport  — top insights for C-level
 *   - MultiDomainAnalysis     — cross-domain breakdown
 *   - ReasoningTraceReport    — full traceability report
 *   - HypothesisReport        — hypothesis inventory
 *
 * Server-only — imports server-only guard.
 * No Prisma. No DB calls. Pure domain logic.
 */

import "server-only";

import type {
  ReasoningConclusion,
  ReasoningInsight,
  ReasoningHypothesis,
  ReasoningCategory,
  ExecutiveImpactLevel,
} from "./reasoning-types";
import { EXECUTIVE_IMPACT_RANK } from "./reasoning-types";

// ── Report types ───────────────────────────────────────────────────────────────

export interface ExecutiveInsightReport {
  orgSlug:         string;
  queryId:         string;
  generatedAt:     string;
  executiveImpact: ExecutiveImpactLevel;
  overallScore:    number;
  confidence:      string;
  topInsights:     Array<{
    title:       string;
    summary:     string;
    type:        string;
    impact:      ExecutiveImpactLevel;
    domains:     string[];
    actionable:  boolean;
  }>;
  requiresAttention: boolean;
  domainsAffected:   string[];
}

export interface MultiDomainAnalysis {
  orgSlug:      string;
  queryId:      string;
  generatedAt:  string;
  isMultiDomain: boolean;
  domains:      Array<{
    domain:          ReasoningCategory;
    insightCount:    number;
    evidenceCount:   number;
    hypothesisCount: number;
    topInsight?:     string;
  }>;
  crossDomainInsights: Array<{
    title:   string;
    domains: string[];
    impact:  string;
  }>;
  overallConfidence: string;
}

export interface ReasoningTraceReport {
  orgSlug:          string;
  queryId:          string;
  generatedAt:      string;
  insightTraces:    Array<{
    insightId:     string;
    insightTitle:  string;
    hypothesisIds: string[];
    evidenceIds:   string[];
    isTraceable:   boolean;
    explanation:   string;
  }>;
  hypothesisTraces: Array<{
    hypothesisId:  string;
    title:         string;
    patternKey:    string;
    evidenceCount: number;
    status:        string;
  }>;
  traceabilityScore:  number;
  isFullyTraceable:   boolean;
}

export interface HypothesisReport {
  orgSlug:         string;
  queryId:         string;
  generatedAt:     string;
  hypotheses:      Array<{
    title:              string;
    description:        string;
    status:             string;
    confidence:         string;
    confidenceScore:    number;
    patternKey:         string;
    domains:            string[];
    supportingCount:    number;
    contradictingCount: number;
  }>;
  supportedCount:  number;
  weakenedCount:   number;
  refutedCount:    number;
}

// ── Report builders ────────────────────────────────────────────────────────────

/**
 * buildExecutiveInsightReport — top insights for C-level consumption.
 * Max 5 insights, sorted by impact then confidence.
 */
export function buildExecutiveInsightReport(
  conclusion: ReasoningConclusion,
): ExecutiveInsightReport {
  const topInsights = [...conclusion.insights]
    .sort((a, b) => {
      const impactDiff = EXECUTIVE_IMPACT_RANK[b.executiveImpact] - EXECUTIVE_IMPACT_RANK[a.executiveImpact];
      return impactDiff !== 0 ? impactDiff : b.confidenceScore - a.confidenceScore;
    })
    .slice(0, 5);

  return {
    orgSlug:         conclusion.orgSlug,
    queryId:         conclusion.queryId,
    generatedAt:     new Date().toISOString(),
    executiveImpact: conclusion.executiveImpact,
    overallScore:    conclusion.overallConfidenceScore,
    confidence:      conclusion.overallConfidence,
    topInsights:     topInsights.map(i => ({
      title:      i.title,
      summary:    i.summary,
      type:       i.type,
      impact:     i.executiveImpact,
      domains:    i.domains,
      actionable: i.actionable,
    })),
    requiresAttention: conclusion.executiveImpact === "CRITICAL" || conclusion.executiveImpact === "HIGH",
    domainsAffected:   conclusion.domains,
  };
}

/**
 * buildMultiDomainAnalysis — per-domain breakdown of findings.
 */
export function buildMultiDomainAnalysis(
  conclusion: ReasoningConclusion,
): MultiDomainAnalysis {
  const nonMultiDomains = conclusion.domains.filter(d => d !== "MULTI_DOMAIN");
  const domainData = nonMultiDomains.map(domain => {
    const domainInsights    = conclusion.insights.filter(i => i.domains.includes(domain));
    const domainEvidence    = conclusion.evidence.filter(e => e.category === domain);
    const domainHypotheses  = conclusion.hypotheses.filter(h => h.domains.includes(domain));
    const topInsight        = domainInsights[0];

    return {
      domain,
      insightCount:    domainInsights.length,
      evidenceCount:   domainEvidence.length,
      hypothesisCount: domainHypotheses.length,
      topInsight:      topInsight?.title,
    };
  });

  const crossDomainInsights = conclusion.insights
    .filter(i => i.domains.length >= 2)
    .map(i => ({ title: i.title, domains: i.domains, impact: i.executiveImpact }));

  return {
    orgSlug:             conclusion.orgSlug,
    queryId:             conclusion.queryId,
    generatedAt:         new Date().toISOString(),
    isMultiDomain:       nonMultiDomains.length >= 2,
    domains:             domainData,
    crossDomainInsights,
    overallConfidence:   conclusion.overallConfidence,
  };
}

/**
 * buildReasoningTraceReport — full traceability audit.
 */
export function buildReasoningTraceReport(
  conclusion: ReasoningConclusion,
): ReasoningTraceReport {
  const evidenceIds   = new Set(conclusion.evidence.map(e => e.id));
  const hypothesisIds = new Set(conclusion.hypotheses.map(h => h.id));

  const insightTraces = conclusion.insights.map(i => {
    const validEvIds = i.evidenceIds.filter(id => evidenceIds.has(id));
    const validHypIds = i.hypothesisIds.filter(id => hypothesisIds.has(id));
    return {
      insightId:     i.id,
      insightTitle:  i.title,
      hypothesisIds: validHypIds,
      evidenceIds:   validEvIds,
      isTraceable:   validEvIds.length > 0 && validHypIds.length > 0,
      explanation:   i.explanation,
    };
  });

  const hypothesisTraces = conclusion.hypotheses.map(h => ({
    hypothesisId:  h.id,
    title:         h.title,
    patternKey:    h.patternKey,
    evidenceCount: h.supportingEvidenceIds.length + h.contradictingEvidenceIds.length,
    status:        h.status,
  }));

  const traceableCount  = insightTraces.filter(t => t.isTraceable).length;
  const totalInsights   = insightTraces.length;
  const traceabilityScore = totalInsights > 0
    ? Math.round((traceableCount / totalInsights) * 100)
    : 100;

  return {
    orgSlug:             conclusion.orgSlug,
    queryId:             conclusion.queryId,
    generatedAt:         new Date().toISOString(),
    insightTraces,
    hypothesisTraces,
    traceabilityScore,
    isFullyTraceable:    traceabilityScore === 100,
  };
}

/**
 * buildHypothesisReport — hypothesis inventory with status breakdown.
 */
export function buildHypothesisReport(
  conclusion: ReasoningConclusion,
): HypothesisReport {
  return {
    orgSlug:     conclusion.orgSlug,
    queryId:     conclusion.queryId,
    generatedAt: new Date().toISOString(),
    hypotheses:  conclusion.hypotheses.map(h => ({
      title:              h.title,
      description:        h.description,
      status:             h.status,
      confidence:         h.confidence,
      confidenceScore:    h.confidenceScore,
      patternKey:         h.patternKey,
      domains:            h.domains,
      supportingCount:    h.supportingEvidenceIds.length,
      contradictingCount: h.contradictingEvidenceIds.length,
    })),
    supportedCount: conclusion.hypotheses.filter(h => h.status === "SUPPORTED").length,
    weakenedCount:  conclusion.hypotheses.filter(h => h.status === "WEAKENED").length,
    refutedCount:   conclusion.hypotheses.filter(h => h.status === "REFUTED").length,
  };
}
