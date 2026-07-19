/**
 * lib/security/anomaly/integrations/anomaly-zero-trust.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly → Zero Trust Integration
 *
 * Server-only. Maps anomaly risk score to a Zero Trust trust penalty.
 *
 * Critical constraint:
 *   Does NOT block users or sessions.
 *   Only produces a trust penalty signal that Zero Trust can apply.
 */

import "server-only";

import type { AnomalyAlert, AnomalySignal, AnomalySeverity } from "../anomaly-types";

// ── ZeroTrustPenalty ──────────────────────────────────────────────────────────

export interface ZeroTrustPenalty {
  orgSlug:     string;
  userId?:     string;
  sessionId?:  string;
  penalty:     number;   // 0–100 — amount to deduct from trust score
  reason:      string;
  alertId?:    string;
  severity:    AnomalySeverity;
  appliedAt:   string;   // ISO 8601
}

// ── Penalty Weights ───────────────────────────────────────────────────────────

const SEVERITY_PENALTY: Record<AnomalySeverity, number> = {
  LOW:      5,
  MEDIUM:   15,
  HIGH:     30,
  CRITICAL: 50,
};

// ── buildZeroTrustPenalty ─────────────────────────────────────────────────────

/**
 * buildZeroTrustPenalty — compute a trust penalty from an anomaly alert.
 *
 * Returns a penalty signal for Zero Trust to consume.
 * Does NOT revoke sessions or block users.
 */
export function buildZeroTrustPenalty(alert: AnomalyAlert): ZeroTrustPenalty {
  const basePenalty = SEVERITY_PENALTY[alert.severity];
  // Scale with risk score: higher score = higher penalty within severity band
  const scaledPenalty = Math.round(basePenalty * (alert.riskScore / 100) * 2);
  const penalty = Math.min(100, Math.max(basePenalty, scaledPenalty));

  const userId   = alert.signals.find(s => s.userId)?.userId;
  const sessionId = alert.signals.find(s => s.sessionId)?.sessionId;

  return {
    orgSlug:    alert.orgSlug,
    userId,
    sessionId,
    penalty,
    reason:     `Anomaly detected: ${alert.title} (score: ${alert.riskScore}/100)`,
    alertId:    alert.id,
    severity:   alert.severity,
    appliedAt:  new Date().toISOString(),
  };
}

/**
 * buildZeroTrustPenalties — compute penalties for multiple alerts.
 */
export function buildZeroTrustPenalties(alerts: AnomalyAlert[]): ZeroTrustPenalty[] {
  try {
    return alerts.map(a => buildZeroTrustPenalty(a));
  } catch {
    return [];
  }
}

/**
 * anomalySignalToZeroTrustWeight — map a signal to a raw trust weight.
 * Used when individual signals need to contribute to Zero Trust evaluation.
 */
export function anomalySignalToZeroTrustWeight(signal: AnomalySignal): number {
  return SEVERITY_PENALTY[signal.severity] ?? 5;
}
