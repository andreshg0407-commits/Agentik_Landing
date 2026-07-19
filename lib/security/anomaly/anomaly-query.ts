/**
 * lib/security/anomaly/anomaly-query.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Query Helpers — Read-Only Analytics
 *
 * Server-only. Works on in-memory signal/alert arrays.
 * Pure functions — no side effects.
 */

import "server-only";

import type { AnomalyAlert, AnomalySignal, AnomalyStatus, AnomalySeverity, AnomalyType } from "./anomaly-types";

// ── getOpenAnomalies ──────────────────────────────────────────────────────────

export function getOpenAnomalies(alerts: AnomalyAlert[], orgSlug: string): AnomalyAlert[] {
  return alerts.filter(a => a.orgSlug === orgSlug && a.status === "OPEN");
}

// ── getCriticalAnomalies ──────────────────────────────────────────────────────

export function getCriticalAnomalies(alerts: AnomalyAlert[], orgSlug: string): AnomalyAlert[] {
  return alerts.filter(a =>
    a.orgSlug === orgSlug &&
    a.severity === "CRITICAL" &&
    a.status === "OPEN",
  );
}

// ── getTenantAnomalies ────────────────────────────────────────────────────────

export function getTenantAnomalies(
  alerts:    AnomalyAlert[],
  orgSlug:   string,
  status?:   AnomalyStatus,
  severity?: AnomalySeverity,
): AnomalyAlert[] {
  return alerts.filter(a =>
    a.orgSlug === orgSlug &&
    (status   ? a.status   === status   : true) &&
    (severity ? a.severity === severity : true),
  );
}

// ── getAnomalyCounts ──────────────────────────────────────────────────────────

export interface AnomalyCounts {
  total:        number;
  open:         number;
  acknowledged: number;
  resolved:     number;
  ignored:      number;
  critical:     number;
  high:         number;
  medium:       number;
  low:          number;
}

export function getAnomalyCounts(alerts: AnomalyAlert[], orgSlug: string): AnomalyCounts {
  const orgAlerts = alerts.filter(a => a.orgSlug === orgSlug);
  return {
    total:        orgAlerts.length,
    open:         orgAlerts.filter(a => a.status === "OPEN").length,
    acknowledged: orgAlerts.filter(a => a.status === "ACKNOWLEDGED").length,
    resolved:     orgAlerts.filter(a => a.status === "RESOLVED").length,
    ignored:      orgAlerts.filter(a => a.status === "IGNORED").length,
    critical:     orgAlerts.filter(a => a.severity === "CRITICAL").length,
    high:         orgAlerts.filter(a => a.severity === "HIGH").length,
    medium:       orgAlerts.filter(a => a.severity === "MEDIUM").length,
    low:          orgAlerts.filter(a => a.severity === "LOW").length,
  };
}

// ── getSignalsByType ──────────────────────────────────────────────────────────

export function getSignalsByType(
  signals: AnomalySignal[],
  orgSlug: string,
  type:    AnomalyType,
): AnomalySignal[] {
  return signals.filter(s => s.orgSlug === orgSlug && s.type === type);
}

// ── getRecentAlerts ───────────────────────────────────────────────────────────

export function getRecentAlerts(
  alerts:      AnomalyAlert[],
  orgSlug:     string,
  withinHours: number,
): AnomalyAlert[] {
  const cutoff = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  return alerts.filter(a => a.orgSlug === orgSlug && a.createdAt >= cutoff);
}

// ── getAlertsByUser ───────────────────────────────────────────────────────────

export function getAlertsByUser(alerts: AnomalyAlert[], orgSlug: string, userId: string): AnomalyAlert[] {
  return alerts.filter(a =>
    a.orgSlug === orgSlug &&
    a.signals.some(s => s.userId === userId),
  );
}

// ── getAlertsByAgent ──────────────────────────────────────────────────────────

export function getAlertsByAgent(alerts: AnomalyAlert[], orgSlug: string, agentId: string): AnomalyAlert[] {
  return alerts.filter(a =>
    a.orgSlug === orgSlug &&
    a.signals.some(s => s.agentId === agentId),
  );
}

// ── getTenantRiskScore ────────────────────────────────────────────────────────

export function getTenantRiskScore(alerts: AnomalyAlert[], orgSlug: string): number {
  const openCritical = alerts.filter(a => a.orgSlug === orgSlug && a.severity === "CRITICAL" && a.status === "OPEN");
  const openHigh     = alerts.filter(a => a.orgSlug === orgSlug && a.severity === "HIGH"     && a.status === "OPEN");
  const openMedium   = alerts.filter(a => a.orgSlug === orgSlug && a.severity === "MEDIUM"   && a.status === "OPEN");
  if (openCritical.length > 0) return Math.min(100, 80 + openCritical.length * 5);
  if (openHigh.length > 0)     return Math.min(79, 50 + openHigh.length * 5);
  if (openMedium.length > 0)   return Math.min(49, 25 + openMedium.length * 3);
  return 0;
}
