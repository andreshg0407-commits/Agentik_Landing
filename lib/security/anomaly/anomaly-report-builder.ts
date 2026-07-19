/**
 * lib/security/anomaly/anomaly-report-builder.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Report Builder — Serializable Security Reports
 *
 * Server-only. No Prisma. Pure domain functions.
 */

import "server-only";

import type { AnomalyAlert, AnomalySignal, AnomalyType, AnomalySeverity } from "./anomaly-types";
import { getAnomalyCounts, getTenantRiskScore } from "./anomaly-query";

// ── SecurityRiskReport ────────────────────────────────────────────────────────

export interface SecurityRiskReport {
  orgSlug:      string;
  generatedAt:  string;
  overallRisk:  number;    // 0–100
  severity:     AnomalySeverity;
  openAlerts:   number;
  criticalAlerts: number;
  highAlerts:   number;
  resolvedLast24h: number;
  topAnomalyTypes: { type: AnomalyType; count: number }[];
}

// ── AnomalyTrendReport ────────────────────────────────────────────────────────

export interface AnomalyTrendReport {
  orgSlug:     string;
  generatedAt: string;
  period:      string;
  totalSignals: number;
  totalAlerts:  number;
  byType:       Record<string, number>;
  bySeverity:   Record<AnomalySeverity, number>;
  riskTrend:    "IMPROVING" | "STABLE" | "WORSENING";
}

// ── TenantRiskReport ──────────────────────────────────────────────────────────

export interface TenantRiskReport {
  orgSlug:       string;
  generatedAt:   string;
  riskScore:     number;
  riskLevel:     AnomalySeverity;
  openCritical:  number;
  openHigh:      number;
  affectedUsers: string[];
  topDetectors:  string[];
}

// ── AgentRiskReport ───────────────────────────────────────────────────────────

export interface AgentRiskReport {
  orgSlug:           string;
  generatedAt:       string;
  agentViolations:   { agentId: string; count: number; severity: AnomalySeverity }[];
  totalViolations:   number;
  mostRiskyAgent:    string | null;
}

// ── buildSecurityRiskReport ───────────────────────────────────────────────────

export function buildSecurityRiskReport(
  alerts:  AnomalyAlert[],
  orgSlug: string,
): SecurityRiskReport {
  const now         = new Date().toISOString();
  const counts      = getAnomalyCounts(alerts, orgSlug);
  const riskScore   = getTenantRiskScore(alerts, orgSlug);
  const cutoff24h   = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const resolved24h = alerts.filter(a =>
    a.orgSlug === orgSlug && a.status === "RESOLVED" && (a.resolvedAt ?? "") >= cutoff24h,
  ).length;

  const typeCounts  = new Map<AnomalyType, number>();
  for (const a of alerts.filter(a => a.orgSlug === orgSlug && a.status === "OPEN")) {
    typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
  }
  const topTypes = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const severity: AnomalySeverity =
    riskScore >= 90 ? "CRITICAL" :
    riskScore >= 75 ? "HIGH" :
    riskScore >= 50 ? "MEDIUM" : "LOW";

  return {
    orgSlug,
    generatedAt:     now,
    overallRisk:     riskScore,
    severity,
    openAlerts:      counts.open,
    criticalAlerts:  counts.critical,
    highAlerts:      counts.high,
    resolvedLast24h: resolved24h,
    topAnomalyTypes: topTypes,
  };
}

// ── buildAnomalyTrendReport ───────────────────────────────────────────────────

export function buildAnomalyTrendReport(
  signals:  AnomalySignal[],
  alerts:   AnomalyAlert[],
  orgSlug:  string,
  periodHours: number = 24,
): AnomalyTrendReport {
  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() - periodHours * 3600 * 1000).toISOString();

  const orgSignals = signals.filter(s => s.orgSlug === orgSlug && s.occurredAt >= cutoff);
  const orgAlerts  = alerts.filter(a =>  a.orgSlug === orgSlug && a.createdAt  >= cutoff);

  const byType: Record<string, number> = {};
  for (const s of orgSignals) {
    byType[s.type] = (byType[s.type] ?? 0) + 1;
  }

  const bySeverity: Record<AnomalySeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const a of orgAlerts) {
    bySeverity[a.severity]++;
  }

  // Simple trend: more critical/high in recent period = worsening
  const criticalHigh = (bySeverity.CRITICAL + bySeverity.HIGH);
  const riskTrend: AnomalyTrendReport["riskTrend"] =
    criticalHigh >= 5 ? "WORSENING" :
    criticalHigh >= 2 ? "STABLE" : "IMPROVING";

  return {
    orgSlug,
    generatedAt:  now,
    period:       `${periodHours}h`,
    totalSignals: orgSignals.length,
    totalAlerts:  orgAlerts.length,
    byType,
    bySeverity,
    riskTrend,
  };
}

// ── buildTenantRiskReport ─────────────────────────────────────────────────────

export function buildTenantRiskReport(
  alerts:  AnomalyAlert[],
  orgSlug: string,
): TenantRiskReport {
  const now        = new Date().toISOString();
  const riskScore  = getTenantRiskScore(alerts, orgSlug);
  const orgAlerts  = alerts.filter(a => a.orgSlug === orgSlug && a.status === "OPEN");

  const users = new Set<string>();
  const detectors = new Map<string, number>();
  for (const a of orgAlerts) {
    for (const s of a.signals) {
      if (s.userId) users.add(s.userId);
      if (s.detectorId) detectors.set(s.detectorId, (detectors.get(s.detectorId) ?? 0) + 1);
    }
  }

  const topDetectors = Array.from(detectors.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  const riskLevel: AnomalySeverity =
    riskScore >= 90 ? "CRITICAL" :
    riskScore >= 75 ? "HIGH" :
    riskScore >= 50 ? "MEDIUM" : "LOW";

  return {
    orgSlug,
    generatedAt:   now,
    riskScore,
    riskLevel,
    openCritical:  orgAlerts.filter(a => a.severity === "CRITICAL").length,
    openHigh:      orgAlerts.filter(a => a.severity === "HIGH").length,
    affectedUsers: [...users],
    topDetectors,
  };
}

// ── buildAgentRiskReport ──────────────────────────────────────────────────────

export function buildAgentRiskReport(
  alerts:  AnomalyAlert[],
  orgSlug: string,
): AgentRiskReport {
  const now = new Date().toISOString();

  const agentMap = new Map<string, { count: number; severity: AnomalySeverity }>();

  for (const a of alerts.filter(al => al.orgSlug === orgSlug)) {
    for (const s of a.signals) {
      if (!s.agentId) continue;
      const existing = agentMap.get(s.agentId);
      const severity = _maxSeverity(existing?.severity ?? "LOW", s.severity);
      agentMap.set(s.agentId, {
        count:    (existing?.count ?? 0) + 1,
        severity,
      });
    }
  }

  const agentViolations = Array.from(agentMap.entries())
    .map(([agentId, data]) => ({ agentId, count: data.count, severity: data.severity }))
    .sort((a, b) => b.count - a.count);

  const mostRiskyAgent = agentViolations[0]?.agentId ?? null;

  return {
    orgSlug,
    generatedAt:     now,
    agentViolations,
    totalViolations: agentViolations.reduce((acc, a) => acc + a.count, 0),
    mostRiskyAgent,
  };
}

function _maxSeverity(a: AnomalySeverity, b: AnomalySeverity): AnomalySeverity {
  const order: AnomalySeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
