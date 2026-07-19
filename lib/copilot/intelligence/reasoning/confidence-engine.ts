/**
 * lib/copilot/intelligence/reasoning/confidence-engine.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Confidence Engine
 *
 * Calculates 0–100 confidence scores for reasoning artifacts.
 * Score is based on:
 *   - Evidence quantity (more evidence = higher base)
 *   - Evidence quality (HIGH confidence signals score more)
 *   - Evidence consistency (all signals agree = boost)
 *   - Contradictions (contradicting evidence = penalty)
 *   - Coverage (more domains = broader confidence)
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningEvidence,
  ReasoningHypothesis,
  ReasoningInsight,
  ReasoningConfidence,
  ContradictionRecord,
} from "./reasoning-types";
import { scoreToConfidence } from "./reasoning-types";

// ── Confidence weights ─────────────────────────────────────────────────────────

const CONFIDENCE_WEIGHTS = {
  evidenceQuality: {
    HIGH:   1.0,
    MEDIUM: 0.6,
    LOW:    0.3,
  },
  basePerEvidence:     8,    // base score added per piece of evidence
  maxBaseFromEvidence: 60,   // cap on evidence-quantity contribution
  consistencyBonus:    15,   // bonus when all evidence is consistent (no contradictions)
  contradictionPenalty: 12,  // penalty per contradiction
  coverageBonus:        5,   // bonus per domain covered (max 3 bonuses)
  maxCoverageBonus:     15,
} as const;

// ── calculateEvidenceConfidence ────────────────────────────────────────────────

/**
 * calculateEvidenceConfidence — score 0–100 for a set of evidence.
 *
 * Factors:
 *   - Quantity: more evidence → higher floor
 *   - Quality:  HIGH confidence evidence counts more
 *   - Consistency: no contradictions → bonus
 *   - Contradictions: each one reduces score
 */
export function calculateEvidenceConfidence(
  evidence:      ReasoningEvidence[],
  contradictions: ContradictionRecord[] = [],
): number {
  if (evidence.length === 0) return 0;

  const supporting    = evidence.filter(e => e.isSupporting);
  const contradicting = evidence.filter(e => !e.isSupporting);

  // Base from evidence quantity
  const quantityScore = Math.min(
    CONFIDENCE_WEIGHTS.maxBaseFromEvidence,
    supporting.length * CONFIDENCE_WEIGHTS.basePerEvidence,
  );

  // Quality score: weighted average of supporting evidence confidence
  const qualitySum = supporting.reduce(
    (sum, e) => sum + e.confidenceScore * (CONFIDENCE_WEIGHTS.evidenceQuality[e.confidence] ?? 0.5),
    0,
  );
  const qualityScore = supporting.length > 0
    ? Math.round((qualitySum / supporting.length) * 0.35) // 35% of score from quality
    : 0;

  // Consistency bonus
  const consistencyBonus = contradicting.length === 0 && contradictions.length === 0
    ? CONFIDENCE_WEIGHTS.consistencyBonus
    : 0;

  // Contradiction penalty
  const contradictionPenalty =
    contradictions.length * CONFIDENCE_WEIGHTS.contradictionPenalty +
    contradicting.length * CONFIDENCE_WEIGHTS.contradictionPenalty * 0.5;

  const raw = quantityScore + qualityScore + consistencyBonus - contradictionPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ── calculateHypothesisConfidence ─────────────────────────────────────────────

/**
 * calculateHypothesisConfidence — score 0–100 for a single hypothesis.
 *
 * Considers:
 *   - Supporting evidence scores
 *   - Contradicting evidence count
 *   - Domain coverage (multi-domain = higher confidence)
 */
export function calculateHypothesisConfidence(
  hypothesis: ReasoningHypothesis,
  evidence:   ReasoningEvidence[],
): number {
  const evidenceMap = new Map(evidence.map(e => [e.id, e]));

  const supporting = hypothesis.supportingEvidenceIds
    .map(id => evidenceMap.get(id))
    .filter(Boolean) as ReasoningEvidence[];

  const contradicting = hypothesis.contradictingEvidenceIds
    .map(id => evidenceMap.get(id))
    .filter(Boolean) as ReasoningEvidence[];

  const base = calculateEvidenceConfidence(
    [...supporting, ...contradicting.map(e => ({ ...e, isSupporting: false }))],
  );

  // Domain coverage bonus
  const domainCount = hypothesis.domains.length;
  const coverageBonus = Math.min(
    CONFIDENCE_WEIGHTS.maxCoverageBonus,
    (domainCount - 1) * CONFIDENCE_WEIGHTS.coverageBonus,
  );

  return Math.max(0, Math.min(100, Math.round(base + coverageBonus)));
}

// ── calculateInsightConfidence ────────────────────────────────────────────────

/**
 * calculateInsightConfidence — score 0–100 for a single insight.
 * Inherits from its hypothesis scores, adjusted for domain breadth.
 */
export function calculateInsightConfidence(
  insight:    ReasoningInsight,
  hypotheses: ReasoningHypothesis[],
  evidence:   ReasoningEvidence[],
): number {
  const hypMap = new Map(hypotheses.map(h => [h.id, h]));

  const relatedHypotheses = insight.hypothesisIds
    .map(id => hypMap.get(id))
    .filter(Boolean) as ReasoningHypothesis[];

  if (relatedHypotheses.length === 0) return insight.confidenceScore;

  // Average confidence of contributing hypotheses
  const avgHypScore = relatedHypotheses.reduce(
    (sum, h) => sum + h.confidenceScore,
    0,
  ) / relatedHypotheses.length;

  // Multi-hypothesis insights get a boost (convergence = stronger confidence)
  const convergenceBonus = relatedHypotheses.length > 1
    ? Math.min(10, (relatedHypotheses.length - 1) * 5)
    : 0;

  return Math.max(0, Math.min(100, Math.round(avgHypScore + convergenceBonus)));
}

// ── calculateOverallConfidence ────────────────────────────────────────────────

/**
 * calculateOverallConfidence — aggregate confidence score for a reasoning run.
 *
 * Combines:
 *   - Evidence quality
 *   - Hypothesis support
 *   - Insight coherence
 *   - Contradiction rate
 */
export function calculateOverallConfidence(params: {
  evidence:       ReasoningEvidence[];
  hypotheses:     ReasoningHypothesis[];
  insights:       ReasoningInsight[];
  contradictions: ContradictionRecord[];
}): { score: number; level: ReasoningConfidence } {
  const { evidence, hypotheses, insights, contradictions } = params;

  if (evidence.length === 0) return { score: 0, level: "LOW" };

  // Evidence score (40% weight)
  const evidenceScore = calculateEvidenceConfidence(evidence, contradictions);

  // Hypothesis score (35% weight): average of viable hypothesis scores
  const viableHyps = hypotheses.filter(
    h => h.status === "SUPPORTED" || h.status === "WEAKENED",
  );
  const hypothesisScore = viableHyps.length > 0
    ? viableHyps.reduce((sum, h) => sum + h.confidenceScore, 0) / viableHyps.length
    : 0;

  // Insight score (25% weight): average of insight confidence scores
  const insightScore = insights.length > 0
    ? insights.reduce((sum, i) => sum + i.confidenceScore, 0) / insights.length
    : hypothesisScore * 0.9; // fallback to hypothesis score

  const combined = Math.round(
    evidenceScore   * 0.40 +
    hypothesisScore * 0.35 +
    insightScore    * 0.25,
  );

  return {
    score: Math.max(0, Math.min(100, combined)),
    level: scoreToConfidence(combined),
  };
}

// ── getConfidenceSummary ───────────────────────────────────────────────────────

export interface ConfidenceSummary {
  overallScore:       number;
  overallLevel:       ReasoningConfidence;
  evidenceScore:      number;
  hypothesisScore:    number;
  insightScore:       number;
  contradictionCount: number;
  coveragePercent:    number;  // how many domains have evidence (0-100)
}

/**
 * getConfidenceSummary — full confidence breakdown for observability.
 */
export function getConfidenceSummary(params: {
  evidence:        ReasoningEvidence[];
  hypotheses:      ReasoningHypothesis[];
  insights:        ReasoningInsight[];
  contradictions:  ContradictionRecord[];
  totalDomains?:   number;
}): ConfidenceSummary {
  const { evidence, hypotheses, insights, contradictions, totalDomains = 7 } = params;

  const evidenceScore = calculateEvidenceConfidence(evidence, contradictions);

  const viableHyps = hypotheses.filter(h => h.status === "SUPPORTED" || h.status === "WEAKENED");
  const hypothesisScore = viableHyps.length > 0
    ? Math.round(viableHyps.reduce((sum, h) => sum + h.confidenceScore, 0) / viableHyps.length)
    : 0;

  const insightScore = insights.length > 0
    ? Math.round(insights.reduce((sum, i) => sum + i.confidenceScore, 0) / insights.length)
    : 0;

  const coveredDomains = new Set(evidence.map(e => e.category)).size;
  const coveragePercent = Math.round((coveredDomains / Math.max(1, totalDomains)) * 100);

  const overall = calculateOverallConfidence({ evidence, hypotheses, insights, contradictions });

  return {
    overallScore:       overall.score,
    overallLevel:       overall.level,
    evidenceScore,
    hypothesisScore,
    insightScore,
    contradictionCount: contradictions.length,
    coveragePercent,
  };
}
