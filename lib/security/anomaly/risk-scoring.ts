/**
 * lib/security/anomaly/risk-scoring.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Risk Scoring Engine — 0–100 Composite Score
 *
 * No server-only. Pure domain logic.
 *
 * Score boundaries:
 *   0–24  → LOW
 *   25–49 → MEDIUM
 *   50–74 → HIGH
 *   75+   → CRITICAL
 */

import type { AnomalySignal, AnomalySeverity } from "./anomaly-types";
import {
  ANOMALY_RISK_THRESHOLD_LOW,
  ANOMALY_RISK_THRESHOLD_MEDIUM,
  ANOMALY_RISK_THRESHOLD_HIGH,
} from "./anomaly-types";

// ── Score Result ──────────────────────────────────────────────────────────────

export interface RiskScoreResult {
  score:    number;       // 0–100
  severity: AnomalySeverity;
  reasons:  string[];
  breakdown: {
    type:     string;
    weight:   number;
    count:    number;
    contribution: number;
  }[];
}

// ── computeRiskScore ──────────────────────────────────────────────────────────

/**
 * computeRiskScore — produce a composite 0–100 risk score from signals.
 *
 * Algorithm:
 *   1. Group signals by type
 *   2. For each type, take the max weight (not sum) to prevent inflation
 *   3. Apply severity multipliers
 *   4. Cap at 100
 *   5. Escalate to 100 if CROSS_TENANT_ATTEMPT present
 */
export function computeRiskScore(signals: AnomalySignal[]): RiskScoreResult {
  if (!signals.length) {
    return { score: 0, severity: "LOW", reasons: ["no_signals"], breakdown: [] };
  }

  const reasons: string[]  = [];
  const breakdown: RiskScoreResult["breakdown"] = [];

  // Group by type
  const byType = new Map<string, AnomalySignal[]>();
  for (const signal of signals) {
    const existing = byType.get(signal.type) ?? [];
    existing.push(signal);
    byType.set(signal.type, existing);
  }

  let rawScore = 0;

  for (const [type, typedSignals] of byType.entries()) {
    // For each type, use the max weight signal (prevents artificial inflation from same event repeated)
    const maxWeight = Math.max(...typedSignals.map(s => s.weight));
    const count     = typedSignals.length;

    // Slight bonus for multiple unique signals of same type (but diminishing)
    const countBonus = Math.min(count - 1, 3) * 5;  // max +15 bonus
    const contribution = Math.min(maxWeight + countBonus, 100);

    rawScore += contribution;
    breakdown.push({ type, weight: maxWeight, count, contribution });
    reasons.push(`${type}:weight=${maxWeight}:count=${count}`);
  }

  // Normalize — if multiple types, use diminishing returns
  let score = rawScore;
  if (byType.size > 1) {
    // Apply diminishing returns: each additional type contributes less
    const sorted = breakdown
      .map(b => b.contribution)
      .sort((a, b) => b - a);

    score = sorted.reduce((acc, contrib, idx) => {
      const factor = 1 / (1 + idx * 0.5);  // 1.0, 0.67, 0.5, 0.4...
      return acc + contrib * factor;
    }, 0);
  }

  // Hard escalation for CRITICAL types
  const hasCrossTenant = signals.some(s => s.type === "CROSS_TENANT_ATTEMPT");
  if (hasCrossTenant) {
    score = 100;
    reasons.push("cross_tenant_force_critical");
  }

  const finalScore = Math.min(100, Math.round(score));
  const severity   = _scoreToSeverity(finalScore);

  return { score: finalScore, severity, reasons, breakdown };
}

// ── scoreToSeverity ───────────────────────────────────────────────────────────

export function scoreToSeverity(score: number): AnomalySeverity {
  return _scoreToSeverity(score);
}

function _scoreToSeverity(score: number): AnomalySeverity {
  if (score >= ANOMALY_RISK_THRESHOLD_HIGH)   return "CRITICAL";
  if (score >= ANOMALY_RISK_THRESHOLD_MEDIUM) return "HIGH";
  if (score >= ANOMALY_RISK_THRESHOLD_LOW)    return "MEDIUM";
  return "LOW";
}

// ── aggregateScores ───────────────────────────────────────────────────────────

/**
 * aggregateScores — produce a tenant-level risk score from multiple evaluations.
 */
export function aggregateScores(scores: number[]): number {
  if (!scores.length) return 0;
  const max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Weighted: 70% max + 30% avg
  return Math.min(100, Math.round(max * 0.7 + avg * 0.3));
}
