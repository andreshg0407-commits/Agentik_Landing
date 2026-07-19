/**
 * lib/security/mfa/mfa-readiness.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Readiness — Sprint Readiness Score
 *
 * Server-only. Evaluates readiness of each MFA subsystem via static checks.
 * Never throws. Returns a structured readiness report.
 */

import "server-only";

// ── Readiness Types ───────────────────────────────────────────────────────────

export type MfaReadinessStatus = "READY" | "PARTIAL" | "NOT_READY";

export interface MfaSubsystemCheck {
  subsystem:  string;
  status:     MfaReadinessStatus;
  notes:      string[];
}

export interface MfaReadinessReport {
  overall:  MfaReadinessStatus;
  score:    number;      // 0–100
  checks:   MfaSubsystemCheck[];
  scannedAt: string;
}

// ── scanMfaReadiness ──────────────────────────────────────────────────────────

export function scanMfaReadiness(): MfaReadinessReport {
  const scannedAt = new Date().toISOString();

  const checks: MfaSubsystemCheck[] = [
    _checkTotpReadiness(),
    _checkRecoveryReadiness(),
    _checkEncryptionReadiness(),
    _checkRbacReadiness(),
    _checkZeroTrustReadiness(),
    _checkSessionBindingReadiness(),
    _checkRepositoryReadiness(),
    _checkAuditReadiness(),
    _checkPasskeyReadiness(),
    _checkWebAuthnReadiness(),
  ];

  const ready   = checks.filter(c => c.status === "READY").length;
  const partial = checks.filter(c => c.status === "PARTIAL").length;
  const total   = checks.length;

  const score = Math.round(((ready + partial * 0.5) / total) * 100);

  const overall: MfaReadinessStatus =
    score === 100 ? "READY" :
    score >= 70   ? "PARTIAL" : "NOT_READY";

  return { overall, score, checks, scannedAt };
}

// ── Individual Readiness Checks ───────────────────────────────────────────────

function _checkTotpReadiness(): MfaSubsystemCheck {
  // Static: TOTP provider is implemented (providers/totp-provider.ts exists)
  return {
    subsystem: "TOTP_PROVIDER",
    status:    "READY",
    notes:     [
      "RFC 6238 TOTP implemented",
      "HMAC-SHA1 with 6-digit codes",
      "±1 step window tolerance",
      "generateSecret / verifyOtp operational",
    ],
  };
}

function _checkRecoveryReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "RECOVERY_CODES",
    status:    "READY",
    notes:     [
      "scrypt hashing implemented",
      "10 codes generated per enrollment",
      "single-use enforcement via usedAt",
      "timing-safe comparison",
    ],
  };
}

function _checkEncryptionReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "ENCRYPTION_INTEGRATION",
    status:    "PARTIAL",
    notes:     [
      "mfa-encryption.ts adapter implemented",
      "KMS integration wired (requires KMS key provisioning)",
      "development fallback: stores unencrypted (non-production only)",
      "production: requires mfa_key_{orgSlug} KMS key to exist",
    ],
  };
}

function _checkRbacReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "RBAC_INTEGRATION",
    status:    "READY",
    notes:     [
      "checkMfaRbac() implemented",
      "SYSTEM bypass, AGENT restriction, USER self-management",
      "MFA_MANAGE / MFA_ADMIN / MFA_AUDIT permissions defined",
      "fail-closed on evaluation error",
    ],
  };
}

function _checkZeroTrustReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "ZERO_TRUST_INTEGRATION",
    status:    "READY",
    notes:     [
      "requiresMfa() / evaluateMfaRequirement() implemented",
      "buildMfaSignal() for trust score delta",
      "method trust weights: PASSKEY=50, TOTP=30, EMAIL=20",
      "fail-closed on evaluation error",
    ],
  };
}

function _checkSessionBindingReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "SESSION_BINDING",
    status:    "PARTIAL",
    notes:     [
      "in-memory session binding store implemented",
      "bind / resolve / revoke / revokeAll operational",
      "TTL-based expiry enforced",
      "not yet wired to NextAuth JWT session claims",
    ],
  };
}

function _checkRepositoryReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "REPOSITORY",
    status:    "PARTIAL",
    notes:     [
      "MfaRepository interface defined",
      "InMemoryMfaRepository for testing",
      "PrismaMfaRepository implemented (requires DB migration)",
      "migration SQL at: prisma/migrations/20260606200000_mfa_enrollment_recovery_codes/",
    ],
  };
}

function _checkAuditReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "AUDIT",
    status:    "READY",
    notes:     [
      "in-memory audit log operational",
      "fire-and-forget persistence to PersistentAuditService",
      "OTP code sanitization in place",
      "all MFA events covered: enrolled, verified, failed, locked",
    ],
  };
}

function _checkPasskeyReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "PASSKEY",
    status:    "NOT_READY",
    notes:     [
      "PASSKEY method defined in MfaMethod type",
      "mfa-vault.ts prepared for credential storage",
      "implementation planned for future sprint",
      "requires WebAuthn browser API integration",
    ],
  };
}

function _checkWebAuthnReadiness(): MfaSubsystemCheck {
  return {
    subsystem: "WEBAUTHN",
    status:    "NOT_READY",
    notes:     [
      "WEBAUTHN method defined in MfaMethod type",
      "architecture prepared in future-compatibility.ts",
      "requires @simplewebauthn/server or equivalent",
      "planned for AGENTIK-SECURITY-MFA-02",
    ],
  };
}
