/**
 * lib/security/anomaly/integrations/anomaly-executive-brain.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly → Executive Brain Integration
 *
 * Server-only. Converts critical anomaly alerts into executive signals.
 * Does NOT send notifications — only builds serializable signal structures.
 */

import "server-only";

import type { AnomalyAlert, AnomalySeverity } from "../anomaly-types";

// ── ExecutiveBrainSignal ──────────────────────────────────────────────────────

export interface ExecutiveBrainSignal {
  type:        "SECURITY_ANOMALY";
  orgSlug:     string;
  severity:    AnomalySeverity;
  headline:    string;
  detail:      string;
  alertId:     string;
  riskScore:   number;
  generatedAt: string;
}

// ── buildExecutiveBrainSignals ────────────────────────────────────────────────

/**
 * buildExecutiveBrainSignals — convert critical/high alerts to executive signals.
 *
 * Only HIGH and CRITICAL alerts produce executive signals.
 * Returns serializable structures — does NOT call Executive Brain APIs.
 */
export function buildExecutiveBrainSignals(
  alerts:  AnomalyAlert[],
  orgSlug: string,
): ExecutiveBrainSignal[] {
  try {
    return alerts
      .filter(a => a.orgSlug === orgSlug && (a.severity === "CRITICAL" || a.severity === "HIGH"))
      .map(a => ({
        type:        "SECURITY_ANOMALY" as const,
        orgSlug:     a.orgSlug,
        severity:    a.severity,
        headline:    a.title,
        detail:      a.description,
        alertId:     a.id,
        riskScore:   a.riskScore,
        generatedAt: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

/**
 * formatExecutiveMessage — format a signal as a human-readable executive message.
 * Example: "Se detectaron 12 intentos fallidos MFA para tenant X."
 */
export function formatExecutiveMessage(signal: ExecutiveBrainSignal): string {
  return `[${signal.severity}] ${signal.headline} — Risk Score: ${signal.riskScore}/100. ${signal.detail}`;
}
