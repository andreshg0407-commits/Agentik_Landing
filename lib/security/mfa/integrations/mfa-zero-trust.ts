/**
 * lib/security/mfa/integrations/mfa-zero-trust.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA → Zero Trust Integration
 *
 * Server-only. Bridges MFA state into the Zero Trust evaluation pipeline.
 *
 * Responsibilities:
 *   - Determine if a Zero Trust context requires MFA
 *   - Apply trust score delta when MFA is verified
 *   - Map MFA status to Zero Trust signals
 */

import "server-only";

import type { MfaMethod, MfaRiskLevel, MfaVerificationResult } from "../mfa-types";
import { getMfaPolicy, isMfaRequired, getMfaRiskLevel } from "../mfa-policy";

// ── Input / Output types ──────────────────────────────────────────────────────

export interface MfaZeroTrustInput {
  orgSlug:     string;
  userId:      string;
  resource:    string;
  operation?:  string;
  /** Current MFA verification state for the session (undefined = not verified). */
  mfaVerified: boolean;
  /** Which method was used for MFA, if verified. */
  mfaMethod?:  MfaMethod;
  /** Trust score delta from MFA verification. */
  mfaTrustDelta?: number;
}

export interface MfaZeroTrustEvaluation {
  requiresMfa:     boolean;
  mfaSatisfied:    boolean;
  trustDelta:      number;
  riskLevel:       MfaRiskLevel;
  reasons:         string[];
  recommendedMethod?: MfaMethod;
}

// ── requiresMfa ───────────────────────────────────────────────────────────────

/**
 * requiresMfa — check if MFA is required for a given resource access.
 * Returns true if policy mandates MFA.
 */
export function requiresMfa(resource: string): boolean {
  return isMfaRequired(resource);
}

// ── evaluateMfaRequirement ────────────────────────────────────────────────────

/**
 * evaluateMfaRequirement — full MFA evaluation for a Zero Trust context.
 *
 * Used by Zero Trust engine when deciding ALLOW/DENY/CHALLENGE.
 * - If MFA required and not verified: return CHALLENGE recommendation
 * - If MFA verified: apply trust delta to session score
 * - If MFA optional: no block, but note it for adaptive scoring
 */
export function evaluateMfaRequirement(input: MfaZeroTrustInput): MfaZeroTrustEvaluation {
  try {
    const policy    = getMfaPolicy(input.resource);
    const required  = policy?.required ?? false;
    const riskLevel = getMfaRiskLevel(input.resource);

    if (!required) {
      return {
        requiresMfa:  false,
        mfaSatisfied: true,
        trustDelta:   input.mfaVerified ? (input.mfaTrustDelta ?? 10) : 0,
        riskLevel,
        reasons:      ["mfa_not_required_for_resource"],
        recommendedMethod: policy?.allowedMethods[0],
      };
    }

    if (!input.mfaVerified) {
      return {
        requiresMfa:  true,
        mfaSatisfied: false,
        trustDelta:   -20,  // Trust penalty for not verifying MFA on required resource
        riskLevel,
        reasons:      ["mfa_required_not_verified"],
        recommendedMethod: policy?.allowedMethods[0] ?? "TOTP",
      };
    }

    // MFA verified
    const delta = input.mfaTrustDelta ?? _methodTrustDelta(input.mfaMethod);
    return {
      requiresMfa:  true,
      mfaSatisfied: true,
      trustDelta:   delta,
      riskLevel,
      reasons:      [`mfa_verified:${input.mfaMethod ?? "unknown"}`],
    };

  } catch {
    // Fail-closed: if evaluation fails, assume MFA not satisfied
    return {
      requiresMfa:  true,
      mfaSatisfied: false,
      trustDelta:   -30,
      riskLevel:    "CRITICAL",
      reasons:      ["mfa_zero_trust_eval_error_fail_closed"],
    };
  }
}

// ── buildMfaSignal ────────────────────────────────────────────────────────────

/**
 * buildMfaSignal — convert an MFA verification result into a Zero Trust signal.
 * Used by the Zero Trust engine to adjust session trust score.
 */
export function buildMfaSignal(result: MfaVerificationResult): {
  type:    string;
  weight:  number;
  reason:  string;
} {
  if (result.outcome === "SUCCESS") {
    return {
      type:   "MFA_VERIFIED",
      weight: result.trustDelta,
      reason: `mfa_success:${result.method}`,
    };
  }

  if (result.outcome === "LOCKED") {
    return {
      type:   "MFA_LOCKED",
      weight: -50,
      reason: "mfa_enrollment_locked",
    };
  }

  return {
    type:   "MFA_FAILED",
    weight: -20,
    reason: `mfa_failed:${result.outcome}`,
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _methodTrustDelta(method?: MfaMethod): number {
  switch (method) {
    case "PASSKEY":    return 50;
    case "WEBAUTHN":   return 50;
    case "TOTP":       return 30;
    case "EMAIL":      return 20;
    case "SMS":        return 15;
    case "RECOVERY_CODE": return 10;
    default:           return 20;
  }
}
