/**
 * lib/copilot/cross-module-reasoning/confidence-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Confidence Engine
 *
 * Calculates confidence levels based on evidence quantity, quality,
 * consistency and correlation. Deterministic. No AI.
 */

import type {
  ReasoningEvidence,
  ReasoningConfidence,
  ReasoningConfidenceScore,
} from "./cross-module-types";

// ── Confidence thresholds ─────────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLDS = {
  VERY_HIGH: 0.85,
  HIGH:      0.60,
  MEDIUM:    0.30,
  LOW:       0.00,
} as const;

export function scoreToConfidenceLevel(score: number): ReasoningConfidence {
  if (score >= CONFIDENCE_THRESHOLDS.VERY_HIGH) return "VERY_HIGH";
  if (score >= CONFIDENCE_THRESHOLDS.HIGH)      return "HIGH";
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM)    return "MEDIUM";
  return "LOW";
}

// ── Evidence count factor ─────────────────────────────────────────────────────

export function evidenceCountFactor(count: number): number {
  if (count === 0) return 0.0;
  if (count === 1) return 0.2;
  if (count <= 3)  return 0.5;
  if (count <= 5)  return 0.7;
  return 1.0;
}

// ── Quality factor ────────────────────────────────────────────────────────────

export function evidenceQualityFactor(evidence: ReasoningEvidence[]): number {
  if (evidence.length === 0) return 0;
  const total = evidence.reduce((sum, e) => sum + e.reliability, 0);
  return total / evidence.length;
}

// ── Consistency factor ────────────────────────────────────────────────────────

export function evidenceConsistencyFactor(evidence: ReasoningEvidence[]): number {
  if (evidence.length <= 1) return evidence.length === 1 ? 0.5 : 0;
  // Consistency: proportion of evidence with strength > 0.5
  const strong = evidence.filter(e => e.strength >= 0.5).length;
  return strong / evidence.length;
}

// ── Correlation factor ────────────────────────────────────────────────────────

export function evidenceCorrelationFactor(evidence: ReasoningEvidence[]): number {
  if (evidence.length <= 1) return 0.2;
  // Measure domain diversity (multiple domains = stronger signal)
  const domains = new Set(evidence.map(e => e.domain));
  const diversityBonus = Math.min(domains.size / 4, 1.0) * 0.3;
  // Measure type diversity
  const types = new Set(evidence.map(e => e.type));
  const typeBonus = Math.min(types.size / 4, 1.0) * 0.3;
  return Math.min(0.4 + diversityBonus + typeBonus, 1.0);
}

// ── Primary confidence calculation ────────────────────────────────────────────

export function calculateConfidence(
  evidence: ReasoningEvidence[],
): ReasoningConfidenceScore {
  const count       = evidence.length;
  const countFactor = evidenceCountFactor(count);
  const quality     = evidenceQualityFactor(evidence);
  const consistency = evidenceConsistencyFactor(evidence);
  const correlation = evidenceCorrelationFactor(evidence);

  const score = (
    countFactor  * 0.30 +
    quality      * 0.30 +
    consistency  * 0.20 +
    correlation  * 0.20
  );

  const level = scoreToConfidenceLevel(score);

  const explanation = _buildExplanation(level, count, quality, consistency, correlation);

  return {
    level,
    score:            Math.min(score, 1),
    evidenceCount:    count,
    qualityScore:     quality,
    consistencyScore: consistency,
    correlationScore: correlation,
    explanation,
  };
}

// ── Confidence for a signal set ───────────────────────────────────────────────

export function calculateSignalConfidence(
  signalConfidences: number[],
): ReasoningConfidenceScore {
  if (signalConfidences.length === 0) {
    return {
      level:            "LOW",
      score:            0,
      evidenceCount:    0,
      qualityScore:     0,
      consistencyScore: 0,
      correlationScore: 0,
      explanation:      "No signals provided.",
    };
  }

  const avg = signalConfidences.reduce((a, b) => a + b, 0) / signalConfidences.length;
  const level = scoreToConfidenceLevel(avg);

  return {
    level,
    score:            avg,
    evidenceCount:    signalConfidences.length,
    qualityScore:     avg,
    consistencyScore: avg,
    correlationScore: avg,
    explanation:      `Averaged confidence from ${signalConfidences.length} signals.`,
  };
}

// ── Merge confidence scores ───────────────────────────────────────────────────

export function mergeConfidenceScores(
  scores: ReasoningConfidenceScore[],
): ReasoningConfidenceScore {
  if (scores.length === 0) {
    return {
      level: "LOW", score: 0, evidenceCount: 0,
      qualityScore: 0, consistencyScore: 0, correlationScore: 0,
      explanation: "No confidence scores to merge.",
    };
  }

  const avgScore = scores.reduce((s, c) => s + c.score, 0) / scores.length;
  const totalEvidence = scores.reduce((s, c) => s + c.evidenceCount, 0);
  const level = scoreToConfidenceLevel(avgScore);

  return {
    level,
    score:            avgScore,
    evidenceCount:    totalEvidence,
    qualityScore:     scores.reduce((s, c) => s + c.qualityScore, 0) / scores.length,
    consistencyScore: scores.reduce((s, c) => s + c.consistencyScore, 0) / scores.length,
    correlationScore: scores.reduce((s, c) => s + c.correlationScore, 0) / scores.length,
    explanation:      `Merged confidence from ${scores.length} score(s). Overall: ${level}.`,
  };
}

// ── Explanation builder ───────────────────────────────────────────────────────

function _buildExplanation(
  level: ReasoningConfidence,
  count: number,
  quality: number,
  consistency: number,
  correlation: number,
): string {
  const parts: string[] = [];

  if (count === 0) return "No evidence found. Confidence cannot be established.";
  parts.push(`${count} evidence item(s) collected.`);

  if (quality >= 0.8)       parts.push("Evidence quality is high.");
  else if (quality >= 0.5)  parts.push("Evidence quality is moderate.");
  else                      parts.push("Evidence quality is low.");

  if (consistency >= 0.8)       parts.push("Evidence is highly consistent.");
  else if (consistency >= 0.5)  parts.push("Evidence is moderately consistent.");
  else                          parts.push("Evidence shows low consistency.");

  if (correlation >= 0.6)  parts.push("Cross-domain correlation detected.");

  parts.push(`Overall confidence: ${level}.`);
  return parts.join(" ");
}
