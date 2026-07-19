/**
 * lib/security/mfa/mfa-provider.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Provider Contract — Universal Interface
 *
 * No server-only. No Prisma. Pure interface contract.
 *
 * All MFA providers (TOTP, Email, SMS, WebAuthn, Passkey) MUST implement
 * this interface. The MFA engine operates exclusively through this contract.
 *
 * CRITICAL CONSTRAINTS:
 *   - generateChallenge() never returns secret material
 *   - verifyChallenge() never logs the code
 *   - enroll() returns only metadata — never the raw secret
 *   - All operations are tenant-scoped via orgSlug
 */

import type { MfaMethod, MfaResult, MfaHealthStatus, MfaEnrollment } from "./mfa-types";

// ── Enroll ────────────────────────────────────────────────────────────────────

export interface MfaEnrollParams {
  orgSlug: string;
  userId:  string;
}

export interface MfaEnrollOutput {
  /** Enrollment metadata (no secret material). */
  enrollment:      MfaEnrollment;
  /**
   * Setup payload for the user (e.g., QR URI for TOTP).
   * Never includes the raw secret in structured fields — only as part of otpauth URI.
   */
  setupPayload:    string;
  /** One-time encrypted secret reference for storage. Never the raw bytes. */
  encryptedSecret: string;
}

// ── Challenge ─────────────────────────────────────────────────────────────────

export interface MfaChallengeParams {
  orgSlug:    string;
  userId:     string;
  /** Optional context label for audit. */
  resource?:  string;
  operation?: string;
}

export interface MfaChallengeOutput {
  challengeId: string;
  method:      MfaMethod;
  expiresAt:   string;
  /** Hint to the user (e.g., "Enter the 6-digit code from your authenticator app"). */
  hint:        string;
}

// ── Verify ────────────────────────────────────────────────────────────────────

export interface MfaVerifyParams {
  orgSlug:         string;
  userId:          string;
  challengeId:     string;
  /** The user-provided code. NEVER log this value. */
  code:            string;
  /** The encrypted secret reference retrieved from storage. */
  encryptedSecret: string;
}

export interface MfaVerifyOutput {
  valid:      boolean;
  reasons:    string[];
  trustDelta: number;
}

// ── Disable ───────────────────────────────────────────────────────────────────

export interface MfaDisableParams {
  orgSlug: string;
  userId:  string;
  reason?: string;
}

// ── Rotate Secret ─────────────────────────────────────────────────────────────

export interface MfaRotateSecretOutput {
  encryptedSecret: string;
  setupPayload:    string;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface MfaProviderHealthResult {
  status:    MfaHealthStatus;
  method:    MfaMethod;
  latencyMs: number;
  details:   string;
  checkedAt: string;
}

// ── Provider Interface ────────────────────────────────────────────────────────

/**
 * MfaProvider — universal contract for all MFA implementations.
 */
export interface MfaProvider {
  /** The MFA method this provider implements. */
  readonly method: MfaMethod;

  /**
   * enroll — initialize a new MFA enrollment for a user.
   * Returns setup payload (e.g., QR URI) and encrypted secret reference.
   * Never returns raw secret material.
   */
  enroll(params: MfaEnrollParams): Promise<MfaResult<MfaEnrollOutput>>;

  /**
   * generateChallenge — create a challenge for the user to solve.
   * For TOTP: just returns a hint (no server-side challenge state needed).
   * For Email/SMS: sends the code and returns a challenge ID.
   */
  generateChallenge(params: MfaChallengeParams): Promise<MfaResult<MfaChallengeOutput>>;

  /**
   * verifyChallenge — verify user's response to a challenge.
   * NEVER log the code parameter.
   */
  verifyChallenge(params: MfaVerifyParams): Promise<MfaResult<MfaVerifyOutput>>;

  /**
   * disableMethod — deactivate MFA for a user.
   */
  disableMethod(params: MfaDisableParams): Promise<MfaResult<{ disabled: boolean }>>;

  /**
   * rotateSecret — generate a new secret, invalidating the old one.
   * Returns new encrypted secret reference and setup payload.
   */
  rotateSecret(params: MfaEnrollParams): Promise<MfaResult<MfaRotateSecretOutput>>;

  /**
   * healthCheck — verify the provider is operational.
   */
  healthCheck(): Promise<MfaProviderHealthResult>;
}
