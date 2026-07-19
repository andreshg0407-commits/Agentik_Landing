/**
 * lib/copilot/intelligence/reasoning/reasoning-query.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Query Helpers
 *
 * Convenience functions for querying reasoning artifacts.
 * All functions are pure — they only read, never mutate.
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningConclusion,
  ReasoningInsight,
  ReasoningHypothesis,
  ReasoningEvidence,
  ContradictionRecord,
  ReasoningCategory,
  ExecutiveImpactLevel,
  ReasoningConfidence,
} from "./reasoning-types";
import { EXECUTIVE_IMPACT_RANK } from "./reasoning-types";

// ── Insight queries ────────────────────────────────────────────────────────────

/**
 * getInsights — return all insights from a conclusion, sorted by impact + confidence.
 */
export function getInsights(
  conclusion: ReasoningConclusion,
  opts?: {
    minImpact?:      ExecutiveImpactLevel;
    minConfidence?:  number;
    actionableOnly?: boolean;
    domain?:         ReasoningCategory;
    limit?:          number;
  },
): ReasoningInsight[] {
  let insights = [...conclusion.insights];

  if (opts?.minImpact) {
    insights = insights.filter(
      i => EXECUTIVE_IMPACT_RANK[i.executiveImpact] >= EXECUTIVE_IMPACT_RANK[opts.minImpact!],
    );
  }
  if (opts?.minConfidence !== undefined) {
    insights = insights.filter(i => i.confidenceScore >= opts.minConfidence!);
  }
  if (opts?.actionableOnly) {
    insights = insights.filter(i => i.actionable);
  }
  if (opts?.domain) {
    insights = insights.filter(i => i.domains.includes(opts.domain!));
  }
  if (opts?.limit !== undefined) {
    insights = insights.slice(0, opts.limit);
  }

  return insights;
}

// ── Hypothesis queries ────────────────────────────────────────────────────────

/**
 * getHypotheses — return hypotheses from a conclusion with optional filters.
 */
export function getHypotheses(
  conclusion: ReasoningConclusion,
  opts?: {
    status?:        "SUPPORTED" | "WEAKENED" | "REFUTED" | "CANDIDATE";
    minConfidence?: number;
    domain?:        ReasoningCategory;
    patternKey?:    string;
    limit?:         number;
  },
): ReasoningHypothesis[] {
  let hypotheses = [...conclusion.hypotheses];

  if (opts?.status) {
    hypotheses = hypotheses.filter(h => h.status === opts.status);
  }
  if (opts?.minConfidence !== undefined) {
    hypotheses = hypotheses.filter(h => h.confidenceScore >= opts.minConfidence!);
  }
  if (opts?.domain) {
    hypotheses = hypotheses.filter(h => h.domains.includes(opts.domain!));
  }
  if (opts?.patternKey) {
    hypotheses = hypotheses.filter(h => h.patternKey === opts.patternKey);
  }
  if (opts?.limit !== undefined) {
    hypotheses = hypotheses.slice(0, opts.limit);
  }

  return hypotheses;
}

// ── Evidence queries ───────────────────────────────────────────────────────────

/**
 * getEvidence — return evidence from a conclusion with optional filters.
 */
export function getEvidence(
  conclusion: ReasoningConclusion,
  opts?: {
    category?:       ReasoningCategory;
    isSupporting?:   boolean;
    minConfidence?:  number;
    source?:         string;
    limit?:          number;
  },
): ReasoningEvidence[] {
  let evidence = [...conclusion.evidence];

  if (opts?.category) {
    evidence = evidence.filter(e => e.category === opts.category);
  }
  if (opts?.isSupporting !== undefined) {
    evidence = evidence.filter(e => e.isSupporting === opts.isSupporting);
  }
  if (opts?.minConfidence !== undefined) {
    evidence = evidence.filter(e => e.confidenceScore >= opts.minConfidence!);
  }
  if (opts?.source) {
    evidence = evidence.filter(e => e.source.includes(opts.source!));
  }
  if (opts?.limit !== undefined) {
    evidence = evidence.slice(0, opts.limit);
  }

  return evidence;
}

// ── Confidence queries ────────────────────────────────────────────────────────

/**
 * getConfidence — return confidence information for a conclusion.
 */
export function getConfidence(conclusion: ReasoningConclusion): {
  score: number;
  level: ReasoningConfidence;
  isReliable: boolean;
  hasContradictions: boolean;
  contradictionSeverity: string;
} {
  const severeContradictions = conclusion.contradictions.filter(
    c => c.severity === "SEVERE" && c.resolution === "UNRESOLVED",
  );
  const hasContradictions = conclusion.contradictions.length > 0;

  return {
    score:                 conclusion.overallConfidenceScore,
    level:                 conclusion.overallConfidence,
    isReliable:            conclusion.overallConfidenceScore >= 60 && severeContradictions.length === 0,
    hasContradictions,
    contradictionSeverity: severeContradictions.length > 0 ? "SEVERE" :
                           hasContradictions ? "MODERATE" : "NONE",
  };
}

// ── Contradiction queries ──────────────────────────────────────────────────────

/**
 * getContradictions — return contradictions from a conclusion.
 */
export function getContradictions(
  conclusion: ReasoningConclusion,
  opts?: {
    severity?:    "SEVERE" | "MODERATE" | "MINOR";
    unresolvedOnly?: boolean;
  },
): ContradictionRecord[] {
  let contradictions = [...conclusion.contradictions];

  if (opts?.severity) {
    contradictions = contradictions.filter(c => c.severity === opts.severity);
  }
  if (opts?.unresolvedOnly) {
    contradictions = contradictions.filter(c => c.resolution === "UNRESOLVED");
  }

  return contradictions;
}

// ── Domain queries ─────────────────────────────────────────────────────────────

/**
 * getCoveredDomains — return all domains present in a conclusion.
 */
export function getCoveredDomains(conclusion: ReasoningConclusion): ReasoningCategory[] {
  return conclusion.domains;
}

/**
 * isMultiDomainConclusion — true if conclusion spans 2+ domains.
 */
export function isMultiDomainConclusion(conclusion: ReasoningConclusion): boolean {
  const nonMulti = conclusion.domains.filter(d => d !== "MULTI_DOMAIN");
  return nonMulti.length >= 2;
}

// ── Summary helpers ────────────────────────────────────────────────────────────

/**
 * getConclusionSummary — lightweight summary for display purposes.
 */
export function getConclusionSummary(conclusion: ReasoningConclusion): {
  title:          string;
  summary:        string;
  insightCount:   number;
  confidence:     ReasoningConfidence;
  impact:         ExecutiveImpactLevel;
  requiresAction: boolean;
  domains:        ReasoningCategory[];
} {
  return {
    title:          conclusion.title,
    summary:        conclusion.summary,
    insightCount:   conclusion.insights.length,
    confidence:     conclusion.overallConfidence,
    impact:         conclusion.executiveImpact,
    requiresAction: conclusion.executiveImpact === "CRITICAL" || conclusion.executiveImpact === "HIGH",
    domains:        conclusion.domains,
  };
}
