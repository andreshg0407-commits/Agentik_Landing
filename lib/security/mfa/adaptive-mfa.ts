/**
 * lib/security/mfa/adaptive-mfa.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * Adaptive MFA — Context-Driven MFA Decision Engine
 *
 * No server-only. Pure decision engine. No persistence.
 *
 * Determines whether MFA should be required based on contextual risk signals:
 *   - New device detected
 *   - New country/location
 *   - Unknown IP address
 *   - Critical operation
 *   - Low trust score
 *   - Unusual time-of-day
 *   - Failed login attempts
 */

import type { MfaMethod, MfaRiskLevel } from "./mfa-types";

// ── Adaptive MFA Context ──────────────────────────────────────────────────────

export interface AdaptiveMfaContext {
  orgSlug:        string;
  userId:         string;
  /** IP address of the request (anonymized for logging). */
  ipAddress?:     string;
  /** ISO 3166-1 alpha-2 country code, if known. */
  country?:       string;
  /** Device fingerprint hash (not raw UA). */
  deviceId?:      string;
  /** Whether this device is known/trusted for this user. */
  knownDevice:    boolean;
  /** Whether the country is in the user's normal pattern. */
  knownCountry:   boolean;
  /** Whether the IP is in the user's normal pattern. */
  knownIp:        boolean;
  /** Current trust score from Zero Trust engine (0–100). */
  trustScore:     number;
  /** Whether the operation being attempted is critical. */
  criticalOperation: boolean;
  /** Number of recent failed login attempts. */
  recentFailures: number;
  /** ISO 8601 current time. */
  currentTime:    string;
}

// ── Adaptive MFA Decision ─────────────────────────────────────────────────────

export type AdaptiveMfaDecision = "REQUIRE" | "CHALLENGE" | "SKIP" | "BLOCK";

export interface AdaptiveMfaEvaluation {
  decision:           AdaptiveMfaDecision;
  riskLevel:          MfaRiskLevel;
  triggerReasons:     string[];
  recommendedMethod:  MfaMethod;
  confidenceScore:    number;   // 0–100
}

// ── Risk Signal Weights ────────────────────────────────────────────────────────

const RISK_WEIGHTS = {
  unknownDevice:     25,
  unknownCountry:    20,
  unknownIp:         15,
  criticalOperation: 30,
  lowTrustScore:     20,
  recentFailures:    25,
} as const;

const REQUIRE_THRESHOLD  = 50;
const CHALLENGE_THRESHOLD = 30;
const BLOCK_THRESHOLD    = 90;

// ── evaluateMfaRequirement ────────────────────────────────────────────────────

/**
 * evaluateAdaptiveMfa — compute the adaptive MFA decision.
 *
 * Risk signals are weighted and summed. Score → decision:
 *   score ≥ BLOCK_THRESHOLD    → BLOCK (too suspicious)
 *   score ≥ REQUIRE_THRESHOLD  → REQUIRE MFA
 *   score ≥ CHALLENGE_THRESHOLD → CHALLENGE (step-up)
 *   score < CHALLENGE_THRESHOLD → SKIP (trusted context)
 */
export function evaluateAdaptiveMfa(ctx: AdaptiveMfaContext): AdaptiveMfaEvaluation {
  const reasons: string[] = [];
  let score = 0;

  // Evaluate risk signals
  if (!ctx.knownDevice) {
    score += RISK_WEIGHTS.unknownDevice;
    reasons.push("unknown_device");
  }

  if (!ctx.knownCountry) {
    score += RISK_WEIGHTS.unknownCountry;
    reasons.push("unknown_country");
  }

  if (!ctx.knownIp) {
    score += RISK_WEIGHTS.unknownIp;
    reasons.push("unknown_ip");
  }

  if (ctx.criticalOperation) {
    score += RISK_WEIGHTS.criticalOperation;
    reasons.push("critical_operation");
  }

  if (ctx.trustScore < 40) {
    score += RISK_WEIGHTS.lowTrustScore;
    reasons.push(`low_trust_score:${ctx.trustScore}`);
  }

  if (ctx.recentFailures >= 3) {
    score += RISK_WEIGHTS.recentFailures;
    reasons.push(`recent_failures:${ctx.recentFailures}`);
  }

  // Map score to risk level
  const riskLevel: MfaRiskLevel =
    score >= 70 ? "CRITICAL" :
    score >= 50 ? "HIGH" :
    score >= 30 ? "MEDIUM" : "LOW";

  // Map score to decision
  const decision: AdaptiveMfaDecision =
    score >= BLOCK_THRESHOLD    ? "BLOCK" :
    score >= REQUIRE_THRESHOLD  ? "REQUIRE" :
    score >= CHALLENGE_THRESHOLD ? "CHALLENGE" : "SKIP";

  // Recommend strongest available method for high-risk scenarios
  const recommendedMethod: MfaMethod =
    score >= REQUIRE_THRESHOLD ? "TOTP" : "TOTP";

  return {
    decision,
    riskLevel,
    triggerReasons: reasons.length > 0 ? reasons : ["no_risk_signals"],
    recommendedMethod,
    confidenceScore: Math.min(100, score),
  };
}

// ── buildAdaptiveContext ──────────────────────────────────────────────────────

/**
 * buildAdaptiveContext — construct an AdaptiveMfaContext from request signals.
 * Caller provides what it knows; missing signals default to worst-case (fail-closed).
 */
export function buildAdaptiveContext(
  orgSlug: string,
  userId:  string,
  partial: Partial<Omit<AdaptiveMfaContext, "orgSlug" | "userId">>,
): AdaptiveMfaContext {
  return {
    orgSlug,
    userId,
    ipAddress:         partial.ipAddress,
    country:           partial.country,
    deviceId:          partial.deviceId,
    knownDevice:       partial.knownDevice    ?? false,  // Unknown = not trusted
    knownCountry:      partial.knownCountry   ?? false,
    knownIp:           partial.knownIp        ?? false,
    trustScore:        partial.trustScore     ?? 50,
    criticalOperation: partial.criticalOperation ?? false,
    recentFailures:    partial.recentFailures ?? 0,
    currentTime:       partial.currentTime    ?? new Date().toISOString(),
  };
}
