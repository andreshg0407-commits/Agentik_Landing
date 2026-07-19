/**
 * lib/security/secret-rotation/rotation-policy-engine.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Policy Engine — Deterministic Rotation Rules
 *
 * Evaluates whether a secret should be rotated, can be rotated,
 * and what the risk level of the rotation is.
 *
 * Rules:
 *   - Expired: rotation required immediately
 *   - Near expiry: rotation recommended
 *   - Emergency: rotation required (compromise suspected)
 *   - Scheduled: rotation due per policy interval
 *
 * No AI. No randomness. Fully deterministic.
 * No Prisma. No server-only. Pure domain logic.
 */

import type { RotationRiskLevel, RotationStrategy } from "./rotation-types";
import type { SecretVersion } from "./secret-version";
import { isVersionExpired, versionAgeInDays } from "./secret-version";

// ── Policy Evaluation Result ──────────────────────────────────────────────────

export interface PolicyEvaluationResult {
  /** Whether rotation is allowed under current policy. */
  canRotate:        boolean;
  /** Whether rotation is required (vs recommended). */
  requiresRotation: boolean;
  /** Whether rotation is only recommended (not required). */
  isRecommended:    boolean;
  /** Risk level of performing the rotation. */
  riskLevel:        RotationRiskLevel;
  /** Machine-readable reason. */
  reason:           string;
  /** Human-readable summary. */
  summary:          string;
  /** Urgency score (0 = not urgent, 100 = immediate). */
  urgencyScore:     number;
  /** ISO 8601 timestamp of evaluation. */
  evaluatedAt:      string;
}

// ── Risk Assessment ───────────────────────────────────────────────────────────

export interface RotationRiskAssessment {
  riskLevel:     RotationRiskLevel;
  riskScore:     number; // 0-100
  factors:       RiskFactor[];
  mitigations:   string[];
  evaluatedAt:   string;
}

export interface RiskFactor {
  name:        string;
  severity:    RotationRiskLevel;
  description: string;
  score:       number; // contribution to total risk score
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPIRY_URGENT_DAYS        = 7;
const EXPIRY_WARNING_DAYS       = 30;
const AGE_WARNING_DAYS          = 90;
const AGE_REQUIRED_DAYS         = 180;
const MIN_ROTATION_INTERVAL_HRS = 1; // prevent rapid re-rotation

// ── canRotate ─────────────────────────────────────────────────────────────────

/**
 * canRotate — check if a rotation is allowed under current policy.
 *
 * Conditions that BLOCK rotation:
 *   - Another rotation is already active (unless emergency)
 *   - Last rotation was less than MIN_ROTATION_INTERVAL_HRS ago (unless emergency)
 */
export function canRotate(params: {
  secretId:            string;
  strategy:            RotationStrategy;
  hasActiveRotation:   boolean;
  lastRotationAt?:     string; // ISO 8601 or undefined if never rotated
}): { allowed: boolean; reason: string } {
  const { strategy, hasActiveRotation, lastRotationAt } = params;

  // Emergency always allowed
  if (strategy === "EMERGENCY") {
    return { allowed: true, reason: "emergency_bypass" };
  }

  if (hasActiveRotation) {
    return { allowed: false, reason: "active_rotation_in_progress" };
  }

  if (lastRotationAt) {
    const hoursSinceLastRotation =
      (Date.now() - new Date(lastRotationAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastRotation < MIN_ROTATION_INTERVAL_HRS) {
      return { allowed: false, reason: "minimum_rotation_interval_not_met" };
    }
  }

  return { allowed: true, reason: "policy_satisfied" };
}

// ── requiresRotation ──────────────────────────────────────────────────────────

/**
 * requiresRotation — evaluate whether a rotation is REQUIRED (not just recommended).
 */
export function requiresRotation(params: {
  currentVersion?:   SecretVersion;
  strategy?:         RotationStrategy;
  isCompromised?:    boolean;
}): PolicyEvaluationResult {
  const { currentVersion, strategy, isCompromised } = params;
  const now = new Date().toISOString();

  // Emergency always requires
  if (strategy === "EMERGENCY" || isCompromised) {
    return {
      canRotate:        true,
      requiresRotation: true,
      isRecommended:    false,
      riskLevel:        "CRITICAL",
      reason:           "emergency_or_compromise",
      summary:          "Immediate rotation required: emergency or compromise detected.",
      urgencyScore:     100,
      evaluatedAt:      now,
    };
  }

  // No current version — first rotation, recommended
  if (!currentVersion) {
    return {
      canRotate:        true,
      requiresRotation: false,
      isRecommended:    true,
      riskLevel:        "LOW",
      reason:           "no_version_exists",
      summary:          "No version found. Initial rotation recommended.",
      urgencyScore:     20,
      evaluatedAt:      now,
    };
  }

  // Expired version — required
  if (isVersionExpired(currentVersion)) {
    return {
      canRotate:        true,
      requiresRotation: true,
      isRecommended:    false,
      riskLevel:        "HIGH",
      reason:           "version_expired",
      summary:          "Current version has expired. Rotation required immediately.",
      urgencyScore:     90,
      evaluatedAt:      now,
    };
  }

  // Near expiry — required
  if (currentVersion.expiresAt) {
    const daysUntilExpiry =
      (new Date(currentVersion.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= EXPIRY_URGENT_DAYS) {
      return {
        canRotate:        true,
        requiresRotation: true,
        isRecommended:    false,
        riskLevel:        "HIGH",
        reason:           "expiry_imminent",
        summary:          `Version expires in ${Math.floor(daysUntilExpiry)} days. Rotation required.`,
        urgencyScore:     80,
        evaluatedAt:      now,
      };
    }
    if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
      return {
        canRotate:        true,
        requiresRotation: false,
        isRecommended:    true,
        riskLevel:        "MEDIUM",
        reason:           "expiry_warning",
        summary:          `Version expires in ${Math.floor(daysUntilExpiry)} days. Rotation recommended.`,
        urgencyScore:     60,
        evaluatedAt:      now,
      };
    }
  }

  // Old version — required
  const ageDays = versionAgeInDays(currentVersion);
  if (ageDays >= AGE_REQUIRED_DAYS) {
    return {
      canRotate:        true,
      requiresRotation: true,
      isRecommended:    false,
      riskLevel:        "HIGH",
      reason:           "version_age_exceeded",
      summary:          `Version is ${ageDays} days old (limit: ${AGE_REQUIRED_DAYS} days). Rotation required.`,
      urgencyScore:     75,
      evaluatedAt:      now,
    };
  }

  // Aging — recommended
  if (ageDays >= AGE_WARNING_DAYS) {
    return {
      canRotate:        true,
      requiresRotation: false,
      isRecommended:    true,
      riskLevel:        "MEDIUM",
      reason:           "version_age_warning",
      summary:          `Version is ${ageDays} days old. Rotation recommended before ${AGE_REQUIRED_DAYS} days.`,
      urgencyScore:     40,
      evaluatedAt:      now,
    };
  }

  // No rotation needed
  return {
    canRotate:        true,
    requiresRotation: false,
    isRecommended:    false,
    riskLevel:        "LOW",
    reason:           "policy_satisfied",
    summary:          `Version is ${ageDays} days old and healthy. No rotation needed.`,
    urgencyScore:     0,
    evaluatedAt:      now,
  };
}

// ── evaluateRotationRisk ──────────────────────────────────────────────────────

/**
 * evaluateRotationRisk — compute the risk of performing a rotation.
 *
 * Factors:
 *   - Strategy (emergency = higher risk of disruption)
 *   - Secret provider risk level
 *   - Whether there is an active version to replace
 *   - Whether a grace period will be used
 */
export function evaluateRotationRisk(params: {
  strategy:        RotationStrategy;
  providerRisk:    RotationRiskLevel;
  hasActiveVersion: boolean;
  gracePeriodSec?: number;
}): RotationRiskAssessment {
  const { strategy, providerRisk, hasActiveVersion, gracePeriodSec } = params;
  const factors: RiskFactor[] = [];
  let riskScore = 0;

  // Strategy risk
  if (strategy === "EMERGENCY") {
    factors.push({
      name: "emergency_strategy", severity: "HIGH",
      description: "Emergency rotation reduces validation time.",
      score: 30,
    });
    riskScore += 30;
  } else if (strategy === "SCHEDULED") {
    factors.push({
      name: "scheduled_strategy", severity: "LOW",
      description: "Scheduled rotation follows planned timeline.",
      score: 5,
    });
    riskScore += 5;
  } else {
    factors.push({
      name: "manual_strategy", severity: "LOW",
      description: "Manual rotation with human oversight.",
      score: 10,
    });
    riskScore += 10;
  }

  // Provider risk
  const providerScores: Record<RotationRiskLevel, number> = { LOW: 10, MEDIUM: 20, HIGH: 35, CRITICAL: 50 };
  factors.push({
    name: "provider_risk", severity: providerRisk,
    description: `Provider has ${providerRisk} inherent rotation risk.`,
    score: providerScores[providerRisk],
  });
  riskScore += providerScores[providerRisk];

  // Active version risk
  if (!hasActiveVersion) {
    factors.push({
      name: "no_active_version", severity: "LOW",
      description: "No active version to replace — lower disruption risk.",
      score: 0,
    });
  } else if (!gracePeriodSec || gracePeriodSec === 0) {
    factors.push({
      name: "no_grace_period", severity: "MEDIUM",
      description: "No grace period — instantaneous cutover.",
      score: 15,
    });
    riskScore += 15;
  } else {
    factors.push({
      name: "grace_period_configured", severity: "LOW",
      description: `Grace period of ${gracePeriodSec}s reduces disruption risk.`,
      score: -5,
    });
    riskScore = Math.max(0, riskScore - 5);
  }

  // Compute final risk level
  const riskLevel: RotationRiskLevel =
    riskScore >= 60 ? "CRITICAL" :
    riskScore >= 40 ? "HIGH"     :
    riskScore >= 20 ? "MEDIUM"   :
    "LOW";

  const mitigations: string[] = [
    "Validate new secret before activation",
    "Use grace period for gradual cutover",
    "Monitor for errors after activation",
    "Keep old version in GRACE status for rollback",
  ];

  if (strategy === "EMERGENCY") {
    mitigations.push("Post-emergency validation required");
  }

  return {
    riskLevel,
    riskScore: Math.min(100, riskScore),
    factors,
    mitigations,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── determineStrategy ─────────────────────────────────────────────────────────

/**
 * determineStrategy — suggest the appropriate rotation strategy based on context.
 */
export function determineStrategy(params: {
  isCompromised:   boolean;
  isExpired:       boolean;
  expiresWithinDays?: number;
  isScheduled:     boolean;
}): RotationStrategy {
  if (params.isCompromised) return "EMERGENCY";
  if (params.isExpired)     return "EMERGENCY";
  if (params.isScheduled)   return "SCHEDULED";
  return "MANUAL";
}
