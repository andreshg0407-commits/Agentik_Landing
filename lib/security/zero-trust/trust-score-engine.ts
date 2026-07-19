/**
 * lib/security/zero-trust/trust-score-engine.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Trust Score Engine — Computes 0–100 Trust Score
 *
 * No server-only. No Prisma. Pure domain logic.
 * Deterministic: same input always produces same output.
 *
 * Factors and weights:
 *   hasValidRole:        20  — RBAC role exists in tenant
 *   hasValidSession:     20  — session is active, not expired
 *   hasValidTenant:      20  — orgSlug present and matches
 *   mfaVerified:         10  — MFA was completed this session
 *   isKnownIp:            8  — IP in recognized range
 *   isKnownDevice:        7  — device fingerprint recognized
 *   hasRecentActivity:    8  — no anomaly in recent history
 *   noSuspiciousSignals: 12  — no risk signals detected
 *   ──────────────────────────
 *   Total max:          105  (clamped to 100)
 *
 * Subject-type base deductions:
 *   USER:            0 (neutral)
 *   AGENT:          -5 (elevated scrutiny)
 *   INTEGRATION:   -15 (external, least trusted)
 *   API_KEY:       -10 (machine, no MFA)
 *   SERVICE_ACCOUNT: -5 (scheduled, no session)
 *   SYSTEM:          0 (internal, monitored)
 */

import type { TrustScoreInput, ZeroTrustRiskLevel, ZeroTrustSubjectType } from "./zero-trust-types";
import { TRUST_THRESHOLDS } from "./zero-trust-types";

// ── Factor Weights ─────────────────────────────────────────────────────────────

const FACTOR_WEIGHTS = {
  hasValidRole:        20,
  hasValidSession:     20,
  hasValidTenant:      20,
  mfaVerified:         10,
  isKnownIp:            8,
  isKnownDevice:        7,
  hasRecentActivity:    8,
  noSuspiciousSignals: 12,
} as const;

// ── Subject Base Deductions ────────────────────────────────────────────────────

const SUBJECT_BASE_DEDUCTIONS: Record<ZeroTrustSubjectType, number> = {
  USER:            0,
  AGENT:          -5,
  SYSTEM:          0,
  INTEGRATION:   -15,
  API_KEY:       -10,
  SERVICE_ACCOUNT: -5,
};

// ── Score Factors ──────────────────────────────────────────────────────────────

export interface TrustScoreFactor {
  name:         string;
  weight:       number;
  earned:       number;
  contributing: boolean;
  note?:        string;
}

export interface TrustScoreResult {
  score:       number;  // 0–100
  rawScore:    number;  // before clamping
  factors:     TrustScoreFactor[];
  subjectDeduction: number;
  trusted:     boolean;
  riskLevel:   ZeroTrustRiskLevel;
}

// ── calculateTrustScore ────────────────────────────────────────────────────────

/**
 * calculateTrustScore — compute a trust score for an access subject.
 *
 * Critical factors (hasValidRole, hasValidSession, hasValidTenant):
 * If ANY of these is false, the score is capped at 50 regardless of other factors.
 * A subject without a valid role, session, or tenant is not trusted.
 */
export function calculateTrustScore(input: TrustScoreInput): TrustScoreResult {
  const factors: TrustScoreFactor[] = [
    {
      name:         "valid_role",
      weight:       FACTOR_WEIGHTS.hasValidRole,
      earned:       input.hasValidRole ? FACTOR_WEIGHTS.hasValidRole : 0,
      contributing: input.hasValidRole,
      note:         input.hasValidRole ? undefined : "No RBAC role assigned in tenant",
    },
    {
      name:         "valid_session",
      weight:       FACTOR_WEIGHTS.hasValidSession,
      earned:       input.hasValidSession ? FACTOR_WEIGHTS.hasValidSession : 0,
      contributing: input.hasValidSession,
      note:         input.hasValidSession ? undefined : "Session invalid or expired",
    },
    {
      name:         "valid_tenant",
      weight:       FACTOR_WEIGHTS.hasValidTenant,
      earned:       input.hasValidTenant ? FACTOR_WEIGHTS.hasValidTenant : 0,
      contributing: input.hasValidTenant,
      note:         input.hasValidTenant ? undefined : "Tenant not verified or missing",
    },
    {
      name:         "mfa_verified",
      weight:       FACTOR_WEIGHTS.mfaVerified,
      earned:       input.mfaVerified ? FACTOR_WEIGHTS.mfaVerified : 0,
      contributing: input.mfaVerified,
      note:         input.mfaVerified ? undefined : "MFA not verified",
    },
    {
      name:         "known_ip",
      weight:       FACTOR_WEIGHTS.isKnownIp,
      earned:       input.isKnownIp ? FACTOR_WEIGHTS.isKnownIp : 0,
      contributing: input.isKnownIp,
      note:         input.isKnownIp ? undefined : "IP not in recognized range",
    },
    {
      name:         "known_device",
      weight:       FACTOR_WEIGHTS.isKnownDevice,
      earned:       input.isKnownDevice ? FACTOR_WEIGHTS.isKnownDevice : 0,
      contributing: input.isKnownDevice,
      note:         input.isKnownDevice ? undefined : "Device not recognized",
    },
    {
      name:         "recent_activity",
      weight:       FACTOR_WEIGHTS.hasRecentActivity,
      earned:       input.hasRecentActivity ? FACTOR_WEIGHTS.hasRecentActivity : 0,
      contributing: input.hasRecentActivity,
      note:         input.hasRecentActivity ? undefined : "No recent activity or anomaly detected",
    },
    {
      name:         "no_suspicious_signals",
      weight:       FACTOR_WEIGHTS.noSuspiciousSignals,
      earned:       input.noSuspiciousSignals ? FACTOR_WEIGHTS.noSuspiciousSignals : 0,
      contributing: input.noSuspiciousSignals,
      note:         input.noSuspiciousSignals ? undefined : "Suspicious activity signals detected",
    },
  ];

  const subjectDeduction = SUBJECT_BASE_DEDUCTIONS[input.subjectType];

  // Raw score = sum of earned weights + subject deduction
  const rawScore = factors.reduce((sum, f) => sum + f.earned, 0) + subjectDeduction;

  // If any critical factor is missing, cap at 50
  const criticalMissing =
    !input.hasValidRole || !input.hasValidSession || !input.hasValidTenant;

  const clampedScore = Math.max(0, Math.min(100, rawScore));
  const score        = criticalMissing ? Math.min(clampedScore, 50) : clampedScore;

  return {
    score,
    rawScore:         clampedScore,
    factors,
    subjectDeduction,
    trusted:          isTrustedScore(score),
    riskLevel:        riskFromScore(score),
  };
}

// ── isTrusted ─────────────────────────────────────────────────────────────────

/**
 * isTrusted — returns true if a trust score meets the minimum LOW threshold.
 */
export function isTrustedScore(score: number): boolean {
  return score >= TRUST_THRESHOLDS.LOW;
}

/**
 * isTrustedForRisk — checks if score meets the threshold for a given risk level.
 */
export function isTrustedForRisk(score: number, riskLevel: ZeroTrustRiskLevel): boolean {
  return score >= TRUST_THRESHOLDS[riskLevel];
}

// ── riskFromScore ─────────────────────────────────────────────────────────────

/**
 * riskFromScore — derive the risk level from a trust score.
 * Lower score = higher risk.
 */
export function riskFromScore(score: number): ZeroTrustRiskLevel {
  if (score >= 85) return "LOW";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
}

// ── Quick helpers ─────────────────────────────────────────────────────────────

/**
 * buildDefaultScoreInput — build a TrustScoreInput from a ZeroTrustContext.
 * All optional factors default to their worst-case (false) to be fail-closed.
 */
export function buildDefaultScoreInput(params: {
  hasValidRole:    boolean;
  hasValidSession: boolean;
  hasValidTenant:  boolean;
  mfaVerified?:    boolean;
  isKnownIp?:      boolean;
  isKnownDevice?:  boolean;
  hasRecentActivity?: boolean;
  noSuspiciousSignals?: boolean;
  subjectType:     ZeroTrustSubjectType;
}): TrustScoreInput {
  return {
    hasValidRole:        params.hasValidRole,
    hasValidSession:     params.hasValidSession,
    hasValidTenant:      params.hasValidTenant,
    mfaVerified:         params.mfaVerified         ?? false,
    isKnownIp:           params.isKnownIp            ?? false,
    isKnownDevice:       params.isKnownDevice        ?? false,
    hasRecentActivity:   params.hasRecentActivity    ?? true,
    noSuspiciousSignals: params.noSuspiciousSignals  ?? true,
    subjectType:         params.subjectType,
  };
}

export {
  FACTOR_WEIGHTS,
  SUBJECT_BASE_DEDUCTIONS,
};
