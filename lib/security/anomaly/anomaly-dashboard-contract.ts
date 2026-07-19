/**
 * lib/security/anomaly/anomaly-dashboard-contract.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Dashboard Contract — Serializable Metrics Payload
 *
 * No server-only. Pure domain. No UI.
 */

import type { AnomalyAlert, AnomalySignal, AnomalySeverity } from "./anomaly-types";
import { getAnomalyCounts, getTenantRiskScore } from "./anomaly-query";

// ── AnomalyDashboardPayload ───────────────────────────────────────────────────

export interface AnomalyDashboardPayload {
  orgSlug:          string;
  generatedAt:      string;
  openAnomalies:    number;
  criticalAnomalies: number;
  highAnomalies:    number;
  resolvedAnomalies: number;
  ignoredAnomalies: number;
  tenantRisk:       number;    // 0–100
  riskLevel:        AnomalySeverity;
  agentRisk:        number;    // 0–100 composite for all agents
  riskTrend:        "IMPROVING" | "STABLE" | "WORSENING";
  signalCount24h:   number;
  topDetectors:     string[];
  lastDetectedAt:   string | null;
}

// ── buildAnomalyDashboard ─────────────────────────────────────────────────────

export function buildAnomalyDashboard(
  alerts:  AnomalyAlert[],
  signals: AnomalySignal[],
  orgSlug: string,
): AnomalyDashboardPayload {
  const now        = new Date().toISOString();
  const counts     = getAnomalyCounts(alerts, orgSlug);
  const tenantRisk = getTenantRiskScore(alerts, orgSlug);
  const cutoff24h  = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const signals24h = signals.filter(s => s.orgSlug === orgSlug && s.occurredAt >= cutoff24h);

  // Agent risk: max weight across agent-related signals
  const agentSignals = signals.filter(s =>
    s.orgSlug === orgSlug &&
    (s.type === "AGENT_PERMISSION_VIOLATION" || s.agentId !== undefined),
  );
  const agentRisk = agentSignals.length > 0
    ? Math.min(100, Math.max(...agentSignals.map(s => s.weight)))
    : 0;

  // Top detectors by signal count
  const detectorCounts = new Map<string, number>();
  for (const s of signals24h) {
    detectorCounts.set(s.detectorId, (detectorCounts.get(s.detectorId) ?? 0) + 1);
  }
  const topDetectors = Array.from(detectorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  // Risk trend heuristic
  const halfCutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const recentHalf = signals24h.filter(s => s.occurredAt >= halfCutoff).length;
  const olderHalf  = signals24h.length - recentHalf;
  const riskTrend: AnomalyDashboardPayload["riskTrend"] =
    recentHalf > olderHalf * 1.3 ? "WORSENING" :
    recentHalf < olderHalf * 0.7 ? "IMPROVING" : "STABLE";

  const lastSignal = signals24h.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];

  const riskLevel: AnomalySeverity =
    tenantRisk >= 90 ? "CRITICAL" :
    tenantRisk >= 75 ? "HIGH" :
    tenantRisk >= 50 ? "MEDIUM" : "LOW";

  return {
    orgSlug,
    generatedAt:       now,
    openAnomalies:     counts.open,
    criticalAnomalies: counts.critical,
    highAnomalies:     counts.high,
    resolvedAnomalies: counts.resolved,
    ignoredAnomalies:  counts.ignored,
    tenantRisk,
    riskLevel,
    agentRisk,
    riskTrend,
    signalCount24h:    signals24h.length,
    topDetectors,
    lastDetectedAt:    lastSignal?.occurredAt ?? null,
  };
}

// ── buildEmptyAnomalyDashboard ────────────────────────────────────────────────

export function buildEmptyAnomalyDashboard(orgSlug: string = ""): AnomalyDashboardPayload {
  const now = new Date().toISOString();
  return {
    orgSlug,
    generatedAt:       now,
    openAnomalies:     0,
    criticalAnomalies: 0,
    highAnomalies:     0,
    resolvedAnomalies: 0,
    ignoredAnomalies:  0,
    tenantRisk:        0,
    riskLevel:         "LOW",
    agentRisk:         0,
    riskTrend:         "STABLE",
    signalCount24h:    0,
    topDetectors:      [],
    lastDetectedAt:    null,
  };
}
