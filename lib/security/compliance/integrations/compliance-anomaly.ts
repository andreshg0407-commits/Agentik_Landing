/**
 * lib/security/compliance/integrations/compliance-anomaly.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — Anomaly Detection
 *
 * Converts anomaly detection data into ComplianceEvidence for
 * CTRL_ANOMALY_DETECTION and CTRL_INCIDENT_TRACKING.
 *
 * No server-only. Pure domain adapter.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildAnomalyEvidence } from "../evidence-engine";
import { CTRL_ANOMALY_DETECTION, CTRL_INCIDENT_TRACKING } from "../control-catalog";

// ── AnomalyComplianceInput ────────────────────────────────────────────────────

export interface AnomalyComplianceInput {
  orgSlug:               string;
  detectorCount:         number;
  openAlerts:            number;
  criticalAlerts:        number;
  isMonitoringActive:    boolean;
  /** Number of alerts resolved in the last 30 days. */
  resolvedIn30Days?:     number;
  /** Average resolution time in hours (0 = unknown). */
  avgResolutionHours?:   number;
  /** True if any critical alert has been open >24 hours. */
  hasStaleCritical?:     boolean;
}

// ── anomalyToComplianceEvidence ───────────────────────────────────────────────

/**
 * anomalyToComplianceEvidence — convert anomaly detection stats to compliance evidence.
 * Returns evidence for CTRL_ANOMALY_DETECTION and CTRL_INCIDENT_TRACKING.
 */
export function anomalyToComplianceEvidence(
  input: AnomalyComplianceInput,
): ComplianceEvidence[] {
  try {
    const anomalyEvidence = buildAnomalyEvidence({
      orgSlug:            input.orgSlug,
      controlId:          CTRL_ANOMALY_DETECTION,
      detectorCount:      input.detectorCount,
      openAlerts:         input.openAlerts,
      criticalAlerts:     input.criticalAlerts,
      isMonitoringActive: input.isMonitoringActive,
    });

    const incidentCompliant =
      input.isMonitoringActive &&
      !input.hasStaleCritical &&
      (input.resolvedIn30Days ?? 0) >= 0;

    const incidentEvidence: ComplianceEvidence = {
      id:           `cev_anom_inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgSlug:      input.orgSlug,
      controlId:    CTRL_INCIDENT_TRACKING,
      source:       "ANOMALY_DETECTION",
      isSupporting: incidentCompliant,
      summary:      incidentCompliant
        ? `Incident tracking active: ${input.resolvedIn30Days ?? 0} incidents resolved in last 30 days, avg resolution ${input.avgResolutionHours ?? 0}h`
        : `Incident gap: stale critical=${input.hasStaleCritical ?? false}, monitoring=${input.isMonitoringActive}`,
      data: {
        openAlerts:          input.openAlerts,
        criticalAlerts:      input.criticalAlerts,
        resolvedIn30Days:    input.resolvedIn30Days ?? 0,
        avgResolutionHours:  input.avgResolutionHours ?? 0,
        hasStaleCritical:    input.hasStaleCritical ?? false,
      },
      collectedAt:  new Date().toISOString(),
      expiresAt:    new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };

    return [anomalyEvidence, incidentEvidence];
  } catch {
    return [];
  }
}

// ── isAnomalyCompliant ────────────────────────────────────────────────────────

/**
 * isAnomalyCompliant — quick check: monitoring active with ≥5 detectors and no stale criticals.
 */
export function isAnomalyCompliant(input: AnomalyComplianceInput): boolean {
  return (
    input.isMonitoringActive &&
    input.detectorCount >= 5 &&
    !input.hasStaleCritical
  );
}
