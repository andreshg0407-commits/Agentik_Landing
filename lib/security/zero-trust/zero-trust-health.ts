/**
 * lib/security/zero-trust/zero-trust-health.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust Health Monitor — HEALTHY / DEGRADED / UNAVAILABLE
 *
 * No server-only. No Prisma. Pure domain logic.
 *
 * Monitors runtime health of the Zero Trust system based on recent events.
 * Unlike the readiness scanner (static config checks), this monitors
 * operational signals: deny rates, critical event spikes, blocked agents.
 *
 * Status:
 *   HEALTHY    — normal operation, no critical spikes
 *   DEGRADED   — elevated deny rate or high-risk events above threshold
 *   UNAVAILABLE — evaluation errors or critical subsystem failure
 */

import type { ZeroTrustRiskLevel } from "./zero-trust-types";
import type { SecurityEvent }      from "./security-events";

// ── Health Types ───────────────────────────────────────────────────────────────

export type ZeroTrustHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ZeroTrustHealthSignal {
  name:        string;
  status:      ZeroTrustHealthStatus;
  value:       number | string;
  threshold?:  number | string;
  message:     string;
  riskLevel:   ZeroTrustRiskLevel;
}

export interface ZeroTrustHealthReport {
  status:       ZeroTrustHealthStatus;
  signals:      ZeroTrustHealthSignal[];
  orgSlug:      string;
  checkedAt:    string;
  version:      string;
  summary:      string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Deny rate above this percentage triggers DEGRADED. */
const DENY_RATE_DEGRADED_THRESHOLD   = 20;
/** Deny rate above this percentage triggers UNAVAILABLE. */
const DENY_RATE_UNAVAILABLE_THRESHOLD = 60;

/** Critical event count above this triggers DEGRADED. */
const CRITICAL_EVENT_DEGRADED_THRESHOLD = 5;
/** Critical event count above this triggers UNAVAILABLE. */
const CRITICAL_EVENT_UNAVAILABLE_THRESHOLD = 20;

/** Cross-tenant attempts above this triggers DEGRADED. */
const CROSS_TENANT_DEGRADED_THRESHOLD = 3;

/** Agent scope violations above this triggers DEGRADED. */
const AGENT_SCOPE_DEGRADED_THRESHOLD = 10;

// ── evaluateZeroTrustHealth ────────────────────────────────────────────────────

/**
 * evaluateZeroTrustHealth — compute health status from recent security events.
 *
 * Pass events from a sliding window (e.g. last 15 minutes) for real-time health.
 */
export function evaluateZeroTrustHealth(params: {
  orgSlug:        string;
  recentEvents:   SecurityEvent[];
  evaluationErrors?: number;
}): ZeroTrustHealthReport {
  const { orgSlug, recentEvents, evaluationErrors = 0 } = params;

  const orgEvents = recentEvents.filter(e => e.orgSlug === orgSlug);

  const signals: ZeroTrustHealthSignal[] = [
    checkEvaluationErrors(evaluationErrors),
    checkDenyRate(orgEvents),
    checkCriticalEvents(orgEvents),
    checkCrossTenantAttempts(orgEvents),
    checkAgentScopeViolations(orgEvents),
    checkIntegrationBlocks(orgEvents),
    checkSecretAccessDenials(orgEvents),
    checkSessionHijackSignals(orgEvents),
  ];

  const overallStatus = deriveHealthStatus(signals);

  return {
    status:    overallStatus,
    signals,
    orgSlug,
    checkedAt: new Date().toISOString(),
    version:   "AGENTIK-SECURITY-ZERO-TRUST-01",
    summary:   buildSummary(overallStatus, signals),
  };
}

// ── Signal Checks ─────────────────────────────────────────────────────────────

function checkEvaluationErrors(errorCount: number): ZeroTrustHealthSignal {
  if (errorCount === 0) {
    return healthy("evaluation_errors", errorCount, 0, "No evaluation errors");
  }
  if (errorCount < 3) {
    return degraded("evaluation_errors", errorCount, 0, `${errorCount} evaluation error(s) detected`, "HIGH");
  }
  return unavailable("evaluation_errors", errorCount, 0, `Critical: ${errorCount} evaluation errors — fail-closed active`);
}

function checkDenyRate(events: SecurityEvent[]): ZeroTrustHealthSignal {
  if (events.length === 0) {
    return healthy("deny_rate", 0, DENY_RATE_DEGRADED_THRESHOLD, "No events in window");
  }

  const denied   = events.filter(e => e.decision === "DENY").length;
  const denyRate = Math.round((denied / events.length) * 100);

  if (denyRate >= DENY_RATE_UNAVAILABLE_THRESHOLD) {
    return unavailable("deny_rate", denyRate, DENY_RATE_UNAVAILABLE_THRESHOLD, `Deny rate ${denyRate}% — system under attack or misconfigured`);
  }
  if (denyRate >= DENY_RATE_DEGRADED_THRESHOLD) {
    return degraded("deny_rate", denyRate, DENY_RATE_DEGRADED_THRESHOLD, `Deny rate ${denyRate}% above threshold`, "HIGH");
  }
  return healthy("deny_rate", denyRate, DENY_RATE_DEGRADED_THRESHOLD, `Deny rate ${denyRate}% within normal range`);
}

function checkCriticalEvents(events: SecurityEvent[]): ZeroTrustHealthSignal {
  const criticalCount = events.filter(e => e.riskLevel === "CRITICAL").length;

  if (criticalCount >= CRITICAL_EVENT_UNAVAILABLE_THRESHOLD) {
    return unavailable("critical_events", criticalCount, CRITICAL_EVENT_UNAVAILABLE_THRESHOLD, `${criticalCount} critical events — system requires immediate attention`);
  }
  if (criticalCount >= CRITICAL_EVENT_DEGRADED_THRESHOLD) {
    return degraded("critical_events", criticalCount, CRITICAL_EVENT_DEGRADED_THRESHOLD, `${criticalCount} critical events detected`, "CRITICAL");
  }
  return healthy("critical_events", criticalCount, CRITICAL_EVENT_DEGRADED_THRESHOLD, `${criticalCount} critical events — within threshold`);
}

function checkCrossTenantAttempts(events: SecurityEvent[]): ZeroTrustHealthSignal {
  const count = events.filter(e => e.eventType === "CROSS_TENANT_BLOCKED").length;

  if (count >= CROSS_TENANT_DEGRADED_THRESHOLD) {
    return degraded("cross_tenant_attempts", count, CROSS_TENANT_DEGRADED_THRESHOLD, `${count} cross-tenant access attempts — potential intrusion`, "CRITICAL");
  }
  return healthy("cross_tenant_attempts", count, CROSS_TENANT_DEGRADED_THRESHOLD, `${count} cross-tenant attempts`);
}

function checkAgentScopeViolations(events: SecurityEvent[]): ZeroTrustHealthSignal {
  const count = events.filter(e => e.eventType === "AGENT_SCOPE_BLOCKED").length;

  if (count >= AGENT_SCOPE_DEGRADED_THRESHOLD) {
    return degraded("agent_scope_violations", count, AGENT_SCOPE_DEGRADED_THRESHOLD, `${count} agent scope violations — agent behavior anomaly`, "HIGH");
  }
  return healthy("agent_scope_violations", count, AGENT_SCOPE_DEGRADED_THRESHOLD, `${count} agent scope violations`);
}

function checkIntegrationBlocks(events: SecurityEvent[]): ZeroTrustHealthSignal {
  const count = events.filter(e => e.eventType === "INTEGRATION_BLOCKED").length;
  if (count > 0) {
    return degraded("integration_blocks", count, 0, `${count} integration access attempts blocked`, "HIGH");
  }
  return healthy("integration_blocks", count, 0, "No integration blocks");
}

function checkSecretAccessDenials(events: SecurityEvent[]): ZeroTrustHealthSignal {
  const count = events.filter(e => e.eventType === "SECRET_ACCESS_DENIED").length;
  if (count > 0) {
    return degraded("secret_access_denials", count, 0, `${count} secret access denials — possible credential attack`, "CRITICAL");
  }
  return healthy("secret_access_denials", count, 0, "No secret access denials");
}

function checkSessionHijackSignals(events: SecurityEvent[]): ZeroTrustHealthSignal {
  const count = events.filter(e => e.eventType === "SESSION_HIJACK_DETECTED").length;
  if (count > 0) {
    return degraded("session_hijack_signals", count, 0, `${count} session hijack signal(s) — immediate investigation required`, "CRITICAL");
  }
  return healthy("session_hijack_signals", count, 0, "No hijack signals");
}

// ── Status Derivation ─────────────────────────────────────────────────────────

function deriveHealthStatus(signals: ZeroTrustHealthSignal[]): ZeroTrustHealthStatus {
  if (signals.some(s => s.status === "UNAVAILABLE")) return "UNAVAILABLE";
  if (signals.some(s => s.status === "DEGRADED"))    return "DEGRADED";
  return "HEALTHY";
}

function buildSummary(status: ZeroTrustHealthStatus, signals: ZeroTrustHealthSignal[]): string {
  const degraded  = signals.filter(s => s.status === "DEGRADED").length;
  const unavail   = signals.filter(s => s.status === "UNAVAILABLE").length;

  if (status === "HEALTHY")     return "Zero Trust system operating normally";
  if (status === "UNAVAILABLE") return `Zero Trust UNAVAILABLE — ${unavail} critical signal(s) require immediate action`;
  return `Zero Trust DEGRADED — ${degraded} signal(s) above threshold`;
}

// ── Signal factories ──────────────────────────────────────────────────────────

function healthy(
  name:      string,
  value:     number,
  threshold: number,
  message:   string,
): ZeroTrustHealthSignal {
  return { name, status: "HEALTHY", value, threshold, message, riskLevel: "LOW" };
}

function degraded(
  name:      string,
  value:     number,
  threshold: number,
  message:   string,
  riskLevel: ZeroTrustRiskLevel,
): ZeroTrustHealthSignal {
  return { name, status: "DEGRADED", value, threshold, message, riskLevel };
}

function unavailable(
  name:      string,
  value:     number,
  threshold: number,
  message:   string,
): ZeroTrustHealthSignal {
  return { name, status: "UNAVAILABLE", value, threshold, message, riskLevel: "CRITICAL" };
}

// ── Quick helpers ─────────────────────────────────────────────────────────────

/**
 * isZeroTrustHealthy — returns true if health status is HEALTHY.
 */
export function isZeroTrustHealthy(report: ZeroTrustHealthReport): boolean {
  return report.status === "HEALTHY";
}

/**
 * getUnhealthySignals — returns all signals that are not HEALTHY.
 */
export function getUnhealthySignals(report: ZeroTrustHealthReport): ZeroTrustHealthSignal[] {
  return report.signals.filter(s => s.status !== "HEALTHY");
}
