/**
 * lib/security/mfa/mfa-dashboard-contract.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Dashboard Contract — Serializable Metrics Payload
 *
 * No server-only. Pure domain functions. No UI.
 * Produces serializable payloads for dashboard rendering.
 */

import type { MfaEnrollment, MfaMethod, MfaHealthStatus } from "./mfa-types";
import type { MfaAuditEvent } from "./mfa-audit";

// ── Dashboard Payload ──────────────────────────────────────────────────────────

export interface MfaDashboardPayload {
  orgSlug:                  string;
  generatedAt:              string;
  enabledUsers:             number;
  disabledUsers:            number;
  pendingUsers:             number;
  lockedUsers:              number;
  coveragePercent:          number;
  totalEnrollments:         number;
  failedChallenges24h:      number;
  recoveryUsage24h:         number;
  byMethod:                 Record<MfaMethod, number>;
  healthStatus:             MfaHealthStatus;
  lastCheckedAt:            string;
  highRiskActionsProtected: number;
}

// ── buildMfaDashboard ─────────────────────────────────────────────────────────

export function buildMfaDashboard(
  orgSlug:      string,
  enrollments:  MfaEnrollment[],
  auditEvents:  MfaAuditEvent[],
  healthStatus: MfaHealthStatus,
  generatedAt:  string,
  lastCheckedAt: string,
): MfaDashboardPayload {
  const enabled  = enrollments.filter(e => e.status === "ENABLED");
  const disabled = enrollments.filter(e => e.status === "DISABLED");
  const pending  = enrollments.filter(e => e.status === "PENDING");
  const locked   = enrollments.filter(e => e.status === "LOCKED");

  const cutoff24h  = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const orgEvents  = auditEvents.filter(e => e.orgSlug === orgSlug);

  const failed24h  = orgEvents.filter(e =>
    !e.success && e.occurredAt >= cutoff24h,
  ).length;

  const recovery24h = orgEvents.filter(e =>
    e.eventType === "RECOVERY_CODE_USED" && e.occurredAt >= cutoff24h,
  ).length;

  const byMethod: Record<MfaMethod, number> = {
    TOTP: 0, EMAIL: 0, SMS: 0, PASSKEY: 0, WEBAUTHN: 0, RECOVERY_CODE: 0,
  };
  for (const e of enabled) {
    byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
  }

  // Count critical resources that have at least one MFA-enabled user
  // (simplified: count of VAULT + KMS + SECRET_ROTATION audit events with MFA_VERIFIED)
  const highRiskProtected = orgEvents.filter(e =>
    e.eventType === "MFA_VERIFIED" && e.resource &&
    ["VAULT", "ENCRYPTION_KEY", "SECRET_ROTATION"].includes(e.resource),
  ).length;

  const coverage = enrollments.length > 0
    ? Math.round((enabled.length / enrollments.length) * 100)
    : 0;

  return {
    orgSlug,
    generatedAt,
    enabledUsers:             enabled.length,
    disabledUsers:            disabled.length,
    pendingUsers:             pending.length,
    lockedUsers:              locked.length,
    coveragePercent:          coverage,
    totalEnrollments:         enrollments.length,
    failedChallenges24h:      failed24h,
    recoveryUsage24h:         recovery24h,
    byMethod,
    healthStatus,
    lastCheckedAt,
    highRiskActionsProtected: highRiskProtected,
  };
}

// ── buildEmptyMfaDashboard ────────────────────────────────────────────────────

export function buildEmptyMfaDashboard(orgSlug: string = ""): MfaDashboardPayload {
  const now = new Date().toISOString();
  return {
    orgSlug,
    generatedAt:              now,
    enabledUsers:             0,
    disabledUsers:            0,
    pendingUsers:             0,
    lockedUsers:              0,
    coveragePercent:          0,
    totalEnrollments:         0,
    failedChallenges24h:      0,
    recoveryUsage24h:         0,
    byMethod:                 { TOTP: 0, EMAIL: 0, SMS: 0, PASSKEY: 0, WEBAUTHN: 0, RECOVERY_CODE: 0 },
    healthStatus:             "UNAVAILABLE",
    lastCheckedAt:            now,
    highRiskActionsProtected: 0,
  };
}
