/**
 * lib/security/mfa/mfa-types.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Domain Types — Core Primitives
 *
 * No server-only. No Prisma. Pure domain contracts.
 * All types are JSON-serializable.
 * Never include secret material in any type.
 * Never include OTP codes in any type meant for persistence.
 */

// ── MFA Method ────────────────────────────────────────────────────────────────

/**
 * MfaMethod — the second factor mechanism used.
 *
 * TOTP          — Time-based One-Time Password (RFC 6238, e.g. Authenticator apps)
 * EMAIL         — One-time code delivered via email
 * SMS           — One-time code delivered via SMS
 * PASSKEY       — FIDO2 Passkey (platform authenticator)
 * WEBAUTHN      — WebAuthn hardware security key
 * RECOVERY_CODE — Single-use emergency recovery code
 */
export type MfaMethod =
  | "TOTP"
  | "EMAIL"
  | "SMS"
  | "PASSKEY"
  | "WEBAUTHN"
  | "RECOVERY_CODE";

// ── MFA Status ────────────────────────────────────────────────────────────────

/**
 * MfaStatus — lifecycle state of an MFA enrollment.
 *
 * DISABLED  — MFA not enrolled or explicitly disabled
 * PENDING   — Enrollment started, not yet verified
 * ENABLED   — MFA active and verified
 * LOCKED    — Too many failed attempts; requires unlock
 */
export type MfaStatus = "DISABLED" | "PENDING" | "ENABLED" | "LOCKED";

// ── MFA Risk Level ────────────────────────────────────────────────────────────

/**
 * MfaRiskLevel — risk tier that determines whether MFA is required.
 */
export type MfaRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── MFA Challenge Type ────────────────────────────────────────────────────────

/**
 * MfaChallengeType — what triggered this MFA challenge.
 */
export type MfaChallengeType =
  | "STEP_UP"           // Explicit step-up before critical operation
  | "ADAPTIVE"          // Triggered by risk signals (new device, location, etc.)
  | "POLICY"            // Required by resource access policy
  | "MANUAL"            // Explicitly requested by user
  | "ZERO_TRUST";       // Required by Zero Trust evaluation

// ── MFA Verification Result ───────────────────────────────────────────────────

/**
 * MfaVerificationResult — outcome of an MFA challenge attempt.
 *
 * SUCCESS      — code verified, session trust elevated
 * FAILED       — wrong code or code expired
 * LOCKED       — too many failures; enrollment locked
 * EXPIRED      — challenge window expired
 * NOT_ENROLLED — user has no active MFA enrollment
 * UNSUPPORTED  — requested method not supported
 */
export type MfaVerificationOutcome =
  | "SUCCESS"
  | "FAILED"
  | "LOCKED"
  | "EXPIRED"
  | "NOT_ENROLLED"
  | "UNSUPPORTED";

export interface MfaVerificationResult {
  outcome:     MfaVerificationOutcome;
  method:      MfaMethod;
  orgSlug:     string;
  userId:      string;
  challengeId: string;
  verifiedAt:  string;        // ISO 8601
  reasons:     string[];
  /** Trust score delta to apply to the session after verification. */
  trustDelta:  number;
}

// ── MFA Enrollment ────────────────────────────────────────────────────────────

/**
 * MfaEnrollment — metadata record for an active MFA enrollment.
 * NEVER includes secret material.
 */
export interface MfaEnrollment {
  id:          string;
  orgSlug:     string;
  userId:      string;
  method:      MfaMethod;
  status:      MfaStatus;
  /** Encrypted secret reference (never the raw secret). */
  secretRef:   string;
  createdAt:   string;        // ISO 8601
  enabledAt?:  string;        // ISO 8601
  lastUsedAt?: string;        // ISO 8601
  /** Number of consecutive failed verification attempts. */
  failCount:   number;
}

// ── MFA Enrollment Input ──────────────────────────────────────────────────────

export interface MfaEnrollmentInput {
  orgSlug: string;
  userId:  string;
  method:  MfaMethod;
}

// ── MFA Challenge ─────────────────────────────────────────────────────────────

/**
 * MfaChallenge — an active challenge waiting for verification.
 * Created when a step-up or policy challenge is initiated.
 */
export interface MfaChallenge {
  id:          string;
  orgSlug:     string;
  userId:      string;
  method:      MfaMethod;
  type:        MfaChallengeType;
  /** ISO 8601 timestamp when challenge expires. */
  expiresAt:   string;
  createdAt:   string;
  resolved:    boolean;
  /** Optional reference to the resource/operation that triggered the challenge. */
  resource?:   string;
  operation?:  string;
}

// ── MFA Audit Event Types ─────────────────────────────────────────────────────

export type MfaAuditEventType =
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_ENROLLMENT_STARTED"
  | "MFA_ENROLLMENT_CONFIRMED"
  | "MFA_ENROLLMENT_CANCELLED"
  | "MFA_CHALLENGE_CREATED"
  | "MFA_VERIFIED"
  | "MFA_FAILED"
  | "MFA_LOCKED"
  | "MFA_UNLOCKED"
  | "RECOVERY_CODE_USED"
  | "RECOVERY_CODES_REGENERATED"
  | "MFA_ACCESS_DENIED";

// ── MFA Health Status ─────────────────────────────────────────────────────────

export type MfaHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

// ── MFA Result ────────────────────────────────────────────────────────────────

/**
 * MfaResult<T> — standard wrapper for MFA operation results.
 * Fail-closed: error branch always carries riskLevel.
 */
export type MfaResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string; riskLevel?: MfaRiskLevel };

// ── MFA Operation ─────────────────────────────────────────────────────────────

export type MfaOperation =
  | "ENROLL"
  | "VERIFY"
  | "DISABLE"
  | "ROTATE"
  | "ADMIN_DISABLE"
  | "AUDIT_READ";

// ── MFA Constants ─────────────────────────────────────────────────────────────

/** Maximum failed attempts before enrollment is locked. */
export const MFA_MAX_FAIL_COUNT = 5;

/** TOTP window tolerance in steps (1 = ±30s). */
export const MFA_TOTP_WINDOW = 1;

/** TOTP step size in seconds (RFC 6238 default). */
export const MFA_TOTP_STEP_SECONDS = 30;

/** Default MFA challenge TTL in seconds (5 minutes). */
export const MFA_CHALLENGE_TTL_SECONDS = 300;

/** Recovery code count per enrollment. */
export const MFA_RECOVERY_CODE_COUNT = 10;

/** Recovery code length in characters (before hashing). */
export const MFA_RECOVERY_CODE_LENGTH = 12;

/** MFA operation → risk level mapping. */
export const MFA_OPERATION_RISK: Record<MfaOperation, MfaRiskLevel> = {
  ENROLL:         "HIGH",
  VERIFY:         "MEDIUM",
  DISABLE:        "HIGH",
  ROTATE:         "HIGH",
  ADMIN_DISABLE:  "CRITICAL",
  AUDIT_READ:     "LOW",
};
