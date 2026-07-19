/**
 * lib/security/mfa/mfa-report-builder.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Report Builder — Serializable Report Structures
 *
 * No server-only. Pure domain functions.
 * All outputs are fully JSON-serializable.
 */

import type { MfaEnrollment, MfaMethod, MfaAuditEventType } from "./mfa-types";
import type { MfaAuditEvent } from "./mfa-audit";

// ── Coverage Report ────────────────────────────────────────────────────────────

export interface MfaCoverageReport {
  orgSlug:          string;
  generatedAt:      string;
  totalEnrollments: number;
  enabledCount:     number;
  pendingCount:     number;
  lockedCount:      number;
  disabledCount:    number;
  coveragePercent:  number;
  byMethod:         Record<MfaMethod, number>;
}

export function buildMfaCoverageReport(
  orgSlug:     string,
  enrollments: MfaEnrollment[],
): MfaCoverageReport {
  const now      = new Date().toISOString();
  const total    = enrollments.length;
  const enabled  = enrollments.filter(e => e.status === "ENABLED").length;
  const pending  = enrollments.filter(e => e.status === "PENDING").length;
  const locked   = enrollments.filter(e => e.status === "LOCKED").length;
  const disabled = enrollments.filter(e => e.status === "DISABLED").length;

  const byMethod: Record<MfaMethod, number> = {
    TOTP: 0, EMAIL: 0, SMS: 0, PASSKEY: 0, WEBAUTHN: 0, RECOVERY_CODE: 0,
  };
  for (const e of enrollments.filter(x => x.status === "ENABLED")) {
    byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
  }

  return {
    orgSlug,
    generatedAt:      now,
    totalEnrollments: total,
    enabledCount:     enabled,
    pendingCount:     pending,
    lockedCount:      locked,
    disabledCount:    disabled,
    coveragePercent:  total > 0 ? Math.round((enabled / total) * 100) : 0,
    byMethod,
  };
}

// ── Enrollment Report ──────────────────────────────────────────────────────────

export interface MfaEnrollmentReport {
  orgSlug:          string;
  generatedAt:      string;
  enrollments:      Array<{
    userId:      string;
    method:      MfaMethod;
    status:      string;
    enabledAt?:  string;
    lastUsedAt?: string;
    failCount:   number;
  }>;
}

export function buildEnrollmentReport(
  orgSlug:     string,
  enrollments: MfaEnrollment[],
): MfaEnrollmentReport {
  return {
    orgSlug,
    generatedAt: new Date().toISOString(),
    enrollments: enrollments.map(e => ({
      userId:     e.userId,
      method:     e.method,
      status:     e.status,
      enabledAt:  e.enabledAt,
      lastUsedAt: e.lastUsedAt,
      failCount:  e.failCount,
    })),
  };
}

// ── Compliance Report ──────────────────────────────────────────────────────────

export interface MfaComplianceReport {
  orgSlug:          string;
  generatedAt:      string;
  complianceScore:  number;  // 0–100
  passedChecks:     string[];
  failedChecks:     Array<{ check: string; severity: string; detail: string }>;
  recommendations:  string[];
}

export function buildComplianceReport(
  orgSlug:     string,
  enrollments: MfaEnrollment[],
  auditEvents: MfaAuditEvent[],
): MfaComplianceReport {
  const now         = new Date().toISOString();
  const passed:     string[] = [];
  const failed:     Array<{ check: string; severity: string; detail: string }> = [];
  const recs:       string[] = [];

  const enabled = enrollments.filter(e => e.status === "ENABLED");
  const locked  = enrollments.filter(e => e.status === "LOCKED");

  // Check: at least one user has MFA enabled
  if (enabled.length > 0) {
    passed.push("at_least_one_mfa_enabled");
  } else {
    failed.push({ check: "at_least_one_mfa_enabled", severity: "HIGH", detail: "No enabled MFA enrollments found" });
    recs.push("Enable MFA for at least one user account");
  }

  // Check: no locked enrollments (indicates attack or user issues)
  if (locked.length === 0) {
    passed.push("no_locked_enrollments");
  } else {
    failed.push({ check: "no_locked_enrollments", severity: "MEDIUM", detail: `${locked.length} locked enrollment(s) — possible brute-force attack` });
    recs.push("Review and unlock or investigate locked MFA enrollments");
  }

  // Check: TOTP coverage
  const totpEnabled = enabled.filter(e => e.method === "TOTP").length;
  if (totpEnabled > 0) {
    passed.push("totp_method_in_use");
  } else {
    failed.push({ check: "totp_method_in_use", severity: "LOW", detail: "No TOTP enrollments active" });
    recs.push("Encourage users to enroll TOTP authenticator");
  }

  // Check: excessive MFA failures in last 24h
  const cutoff    = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const failures  = auditEvents.filter(e =>
    !e.success && e.orgSlug === orgSlug && e.occurredAt >= cutoff,
  );
  if (failures.length < 10) {
    passed.push("low_mfa_failure_rate_24h");
  } else {
    failed.push({ check: "low_mfa_failure_rate_24h", severity: "HIGH", detail: `${failures.length} MFA failures in last 24h` });
    recs.push("Investigate high MFA failure rate — possible credential stuffing");
  }

  // Check: no enrollments with high fail count
  const highFail = enrollments.filter(e => e.failCount >= 3);
  if (highFail.length === 0) {
    passed.push("no_high_fail_count_enrollments");
  } else {
    failed.push({ check: "no_high_fail_count_enrollments", severity: "MEDIUM", detail: `${highFail.length} enrollment(s) with ≥3 failures` });
  }

  const total = passed.length + failed.length;
  const score = total > 0 ? Math.round((passed.length / total) * 100) : 0;

  return {
    orgSlug,
    generatedAt:     now,
    complianceScore: score,
    passedChecks:    passed,
    failedChecks:    failed,
    recommendations: recs,
  };
}

// ── Risk Report ────────────────────────────────────────────────────────────────

export interface MfaRiskReport {
  orgSlug:        string;
  generatedAt:    string;
  overallRisk:    "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors:    Array<{ factor: string; weight: number; detail: string }>;
  totalRiskScore: number;
}

export function buildRiskReport(
  orgSlug:     string,
  enrollments: MfaEnrollment[],
  auditEvents: MfaAuditEvent[],
): MfaRiskReport {
  const now     = new Date().toISOString();
  const factors: Array<{ factor: string; weight: number; detail: string }> = [];
  let   total   = 0;

  const enabled = enrollments.filter(e => e.status === "ENABLED");
  const locked  = enrollments.filter(e => e.status === "LOCKED");

  if (enabled.length === 0) {
    factors.push({ factor: "no_mfa_enabled", weight: 40, detail: "No users have MFA enabled" });
    total += 40;
  }

  if (locked.length > 0) {
    factors.push({ factor: "locked_enrollments", weight: 20 * locked.length, detail: `${locked.length} locked` });
    total += 20 * locked.length;
  }

  const cutoff   = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const failures = auditEvents.filter(e => !e.success && e.orgSlug === orgSlug && e.occurredAt >= cutoff);
  if (failures.length >= 5) {
    factors.push({ factor: "high_failure_rate", weight: 25, detail: `${failures.length} failures/24h` });
    total += 25;
  }

  const score     = Math.min(100, total);
  const riskLevel = score >= 70 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";

  return {
    orgSlug,
    generatedAt:    now,
    overallRisk:    riskLevel,
    riskFactors:    factors,
    totalRiskScore: score,
  };
}
