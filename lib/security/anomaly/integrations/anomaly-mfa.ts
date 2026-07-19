/**
 * lib/security/anomaly/integrations/anomaly-mfa.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly ← MFA Integration
 *
 * Server-only. Consumes MFA events and converts them to AnomalyContext.
 * Bridges MFA audit events into the anomaly detection pipeline.
 */

import "server-only";

import type { AnomalyContext } from "../anomaly-types";

// ── MFA Event Input ───────────────────────────────────────────────────────────

export interface MfaAnomalyEventInput {
  orgSlug:     string;
  userId:      string;
  sessionId?:  string;
  ipAddress?:  string;
  userAgent?:  string;
  method?:     string;
  outcome:     "SUCCESS" | "FAILED" | "LOCKED" | "NOT_ENROLLED";
  reason?:     string;
  resource?:   string;
  timestamp?:  string;
}

// ── mfaEventToAnomalyContext ──────────────────────────────────────────────────

/**
 * mfaEventToAnomalyContext — convert an MFA audit event to an AnomalyContext.
 * Detectors consume the context to evaluate for MFA_FAILURE_SPIKE.
 * Never includes raw OTP codes or TOTP secrets.
 */
export function mfaEventToAnomalyContext(input: MfaAnomalyEventInput): AnomalyContext {
  return {
    orgSlug:    input.orgSlug,
    userId:     input.userId,
    sessionId:  input.sessionId,
    ipAddress:  input.ipAddress,
    userAgent:  input.userAgent,
    timestamp:  input.timestamp ?? new Date().toISOString(),
    eventData:  {
      eventType:    input.outcome === "FAILED" ? "MFA_FAILED" : `MFA_${input.outcome}`,
      isMfaFailure: input.outcome === "FAILED" || input.outcome === "LOCKED",
      mfaOutcome:   input.outcome,
      method:       input.method,
      resource:     input.resource,
      // Never include: code, otpCode, secretBase32, totpSecret
    },
  };
}

/**
 * mfaRecoveryEventToAnomalyContext — convert an MFA recovery code usage event.
 * Recovery code usage is anomaly-relevant (may indicate account recovery abuse).
 */
export function mfaRecoveryEventToAnomalyContext(input: {
  orgSlug:    string;
  userId:     string;
  sessionId?: string;
  success:    boolean;
  remaining:  number;
  timestamp?: string;
}): AnomalyContext {
  return {
    orgSlug:    input.orgSlug,
    userId:     input.userId,
    sessionId:  input.sessionId,
    timestamp:  input.timestamp ?? new Date().toISOString(),
    eventData:  {
      eventType:              "MFA_RECOVERY_CODE_USED",
      isMfaFailure:           !input.success,
      recoveryCodeSuccess:    input.success,
      recoveryCodesRemaining: input.remaining,
      isLowRecoveryCodes:     input.remaining <= 2,
    },
  };
}
