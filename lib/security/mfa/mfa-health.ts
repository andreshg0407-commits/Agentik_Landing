/**
 * lib/security/mfa/mfa-health.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Health — Subsystem Health Evaluation
 *
 * Server-only. Checks all MFA subsystems and reports aggregate health.
 * Never throws.
 */

import "server-only";

import type { MfaHealthStatus } from "./mfa-types";

// ── Health Result ─────────────────────────────────────────────────────────────

export interface MfaSubsystemHealth {
  subsystem: string;
  status:    MfaHealthStatus;
  latencyMs: number;
  details:   string;
  checkedAt: string;
}

export interface MfaHealthReport {
  overall:    MfaHealthStatus;
  score:      number;      // 0–100: percentage of healthy subsystems
  subsystems: MfaSubsystemHealth[];
  checkedAt:  string;
}

// ── evaluateMfaHealth ─────────────────────────────────────────────────────────

export async function evaluateMfaHealth(): Promise<MfaHealthReport> {
  const now      = new Date().toISOString();
  const results  = await Promise.allSettled([
    _checkTotpProvider(),
    _checkRecoveryCodes(),
    _checkEncryption(),
    _checkAudit(),
    _checkRbac(),
    _checkZeroTrust(),
    _checkSessionBinding(),
    _checkRepository(),
  ]);

  const subsystems = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return _unavailable(SUBSYSTEM_NAMES[i], String(r.reason));
  });

  const healthy  = subsystems.filter(s => s.status === "HEALTHY").length;
  const total    = subsystems.length;
  const score    = Math.round((healthy / total) * 100);

  const overall: MfaHealthStatus =
    score === 100 ? "HEALTHY" :
    score >= 60   ? "DEGRADED" : "UNAVAILABLE";

  return { overall, score, subsystems, checkedAt: now };
}

// ── Individual Checks ──────────────────────────────────────────────────────────

const SUBSYSTEM_NAMES = [
  "TOTP_PROVIDER",
  "RECOVERY_CODES",
  "ENCRYPTION",
  "AUDIT",
  "RBAC",
  "ZERO_TRUST",
  "SESSION_BINDING",
  "REPOSITORY",
];

async function _checkTotpProvider(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { totpProvider } = await import("./providers/totp-provider");
    const result = await totpProvider.healthCheck();
    return {
      subsystem: "TOTP_PROVIDER",
      status:    result.status,
      latencyMs: Date.now() - t0,
      details:   result.details,
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("TOTP_PROVIDER", String(e));
  }
}

async function _checkRecoveryCodes(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { generateRecoveryCodes, hashRecoveryCode, verifyRecoveryCode } = await import("./recovery-codes");
    const codes = generateRecoveryCodes(1);
    const hash  = await hashRecoveryCode(codes[0]);
    const valid = await verifyRecoveryCode(codes[0], hash);
    return {
      subsystem: "RECOVERY_CODES",
      status:    valid ? "HEALTHY" : "DEGRADED",
      latencyMs: Date.now() - t0,
      details:   valid ? "recovery_codes_operational" : "verify_failed",
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("RECOVERY_CODES", String(e));
  }
}

async function _checkEncryption(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    // Verify mfa-encryption module loads without error
    await import("./integrations/mfa-encryption");
    return {
      subsystem: "ENCRYPTION",
      status:    "HEALTHY",
      latencyMs: Date.now() - t0,
      details:   "mfa_encryption_adapter_loaded",
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("ENCRYPTION", String(e));
  }
}

async function _checkAudit(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { mfaAuditLog } = await import("./mfa-audit");
    const count = mfaAuditLog.count();
    return {
      subsystem: "AUDIT",
      status:    "HEALTHY",
      latencyMs: Date.now() - t0,
      details:   `audit_operational:${count}_events`,
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("AUDIT", String(e));
  }
}

async function _checkRbac(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { checkMfaRbac } = await import("./integrations/mfa-rbac");
    const r = checkMfaRbac({
      subjectId: "health-check", subjectType: "SYSTEM",
      orgSlug: "health-check", operation: "VERIFY",
    });
    return {
      subsystem: "RBAC",
      status:    r.allowed ? "HEALTHY" : "DEGRADED",
      latencyMs: Date.now() - t0,
      details:   r.allowed ? "rbac_system_bypass_operational" : "rbac_check_failed",
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("RBAC", String(e));
  }
}

async function _checkZeroTrust(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { evaluateMfaRequirement } = await import("./integrations/mfa-zero-trust");
    const r = evaluateMfaRequirement({
      orgSlug: "health-check", userId: "health-check",
      resource: "MARKETING_DATA", mfaVerified: true,
    });
    return {
      subsystem: "ZERO_TRUST",
      status:    "HEALTHY",
      latencyMs: Date.now() - t0,
      details:   `zero_trust_eval_ok:${r.riskLevel}`,
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("ZERO_TRUST", String(e));
  }
}

async function _checkSessionBinding(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { mfaSessionStore } = await import("./session-binding");
    const count = mfaSessionStore.count();
    return {
      subsystem: "SESSION_BINDING",
      status:    "HEALTHY",
      latencyMs: Date.now() - t0,
      details:   `session_store_operational:${count}_tokens`,
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("SESSION_BINDING", String(e));
  }
}

async function _checkRepository(): Promise<MfaSubsystemHealth> {
  const t0  = Date.now();
  const now = new Date().toISOString();
  try {
    const { inMemoryMfaRepository } = await import("./mfa-repository");
    const count = await inMemoryMfaRepository.countEnrollments("health-check");
    return {
      subsystem: "REPOSITORY",
      status:    "HEALTHY",
      latencyMs: Date.now() - t0,
      details:   `repository_operational:${count}_enrollments`,
      checkedAt: now,
    };
  } catch (e) {
    return _unavailable("REPOSITORY", String(e));
  }
}

function _unavailable(subsystem: string, error: string): MfaSubsystemHealth {
  return {
    subsystem,
    status:    "UNAVAILABLE",
    latencyMs: 0,
    details:   `${subsystem.toLowerCase()}_unavailable:${error.slice(0, 80)}`,
    checkedAt: new Date().toISOString(),
  };
}
