/**
 * lib/security/anomaly/alert-builder.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Alert Builder — Converts Signals Into Actionable Alerts
 *
 * Server-only. No Prisma. No external side effects.
 * Only generates alert structures — never sends notifications.
 */

import "server-only";

import type { AnomalySignal, AnomalyAlert, AnomalyType, AnomalySeverity } from "./anomaly-types";
import { computeRiskScore } from "./risk-scoring";

let _idCounter = 0;
function _alertId(): string { return `alert-${Date.now()}-${++_idCounter}`; }

// ── buildAlert ────────────────────────────────────────────────────────────────

/**
 * buildAlert — create an AnomalyAlert from a set of signals.
 * Never throws. Returns null if no signals provided.
 */
export function buildAlert(
  signals:    AnomalySignal[],
  sourceRule: string,
): AnomalyAlert | null {
  try {
    if (!signals.length) return null;

    const orgSlug  = signals[0].orgSlug;
    const now      = new Date().toISOString();
    const scored   = computeRiskScore(signals);

    // Determine the dominant type (highest-weight signal)
    const dominant = signals.reduce((acc, s) => s.weight > acc.weight ? s : acc, signals[0]);
    const type     = dominant.type;
    const severity = scored.severity;

    return {
      id:           _alertId(),
      type,
      orgSlug,
      severity,
      status:       "OPEN",
      title:        _buildTitle(type, severity, signals),
      description:  _buildDescription(type, signals, scored.score),
      signals,
      riskScore:    scored.score,
      createdAt:    now,
      updatedAt:    now,
      metadata:     {
        signalCount:  signals.length,
        detectorIds:  [...new Set(signals.map(s => s.detectorId))],
        scoreBreakdown: scored.breakdown,
      },
      isCorrelated: signals.length > 1,
      sourceRule,
    };
  } catch {
    return null;
  }
}

// ── buildAlertsFromEvaluation ─────────────────────────────────────────────────

/**
 * buildAlertsFromEvaluation — group signals by type and build one alert per group.
 */
export function buildAlertsFromSignals(
  signals: AnomalySignal[],
  orgSlug: string,
): AnomalyAlert[] {
  try {
    if (!signals.length) return [];

    const byType = new Map<AnomalyType, AnomalySignal[]>();
    for (const s of signals.filter(sig => sig.orgSlug === orgSlug)) {
      const existing = byType.get(s.type) ?? [];
      existing.push(s);
      byType.set(s.type, existing);
    }

    const alerts: AnomalyAlert[] = [];
    for (const [, typedSignals] of byType.entries()) {
      const alert = buildAlert(typedSignals, typedSignals[0].detectorId);
      if (alert) alerts.push(alert);
    }

    return alerts;
  } catch {
    return [];
  }
}

// ── updateAlertStatus ─────────────────────────────────────────────────────────

export function updateAlertStatus(
  alert:    AnomalyAlert,
  status:   "ACKNOWLEDGED" | "RESOLVED" | "IGNORED",
  actorId:  string,
): AnomalyAlert {
  const now = new Date().toISOString();
  return {
    ...alert,
    status,
    updatedAt:       now,
    resolvedAt:      status === "RESOLVED" ? now : alert.resolvedAt,
    acknowledgedBy:  status === "ACKNOWLEDGED" ? actorId : alert.acknowledgedBy,
    resolvedBy:      status === "RESOLVED" ? actorId : alert.resolvedBy,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildTitle(
  type:     AnomalyType,
  severity: AnomalySeverity,
  signals:  AnomalySignal[],
): string {
  const label: Record<AnomalyType, string> = {
    LOGIN_FAILURE_SPIKE:       "Login Failure Spike",
    MFA_FAILURE_SPIKE:         "MFA Failure Spike",
    NEW_DEVICE:                "New Device Detected",
    NEW_COUNTRY:               "Login From New Country",
    NEW_IP:                    "Login From New IP",
    VAULT_ACCESS_SPIKE:        "Vault Access Spike",
    KMS_USAGE_SPIKE:           "KMS Usage Spike",
    SECRET_ROTATION_SPIKE:     "Secret Rotation Spike",
    PRIVILEGE_ESCALATION:      "Privilege Escalation Attempt",
    CROSS_TENANT_ATTEMPT:      "CRITICAL: Cross-Tenant Access Attempt",
    AGENT_PERMISSION_VIOLATION:"Agent Permission Violation",
    UNUSUAL_ACTIVITY:          "Unusual Activity Detected",
    HIGH_RISK_SESSION:         "High-Risk Session",
    UNKNOWN:                   "Unknown Anomaly",
  };
  const base   = label[type] ?? type;
  const userId = signals.find(s => s.userId)?.userId;
  return userId ? `[${severity}] ${base} — ${userId}` : `[${severity}] ${base}`;
}

function _buildDescription(
  type:     AnomalyType,
  signals:  AnomalySignal[],
  score:    number,
): string {
  const count  = signals.length;
  const org    = signals[0]?.orgSlug ?? "unknown";
  const reason = signals[0]?.reason ?? "no reason";
  return `${count} signal(s) in org ${org}. Risk score: ${score}/100. Primary signal: ${reason}`;
}
