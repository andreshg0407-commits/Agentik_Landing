/**
 * lib/security/secret-rotation/rotation-planner.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Planner — Planning Only, No Execution
 *
 * Generates rotation plans and schedules.
 * NEVER executes rotations.
 * NEVER modifies secrets.
 * NEVER calls external providers.
 *
 * No Prisma. No server-only. Pure domain logic.
 */

import type { RotationPlan, RotationStrategy, RotationRiskLevel } from "./rotation-types";
import type { SecretVersion } from "./secret-version";
import { secretVersionStore, isVersionExpired, versionAgeInDays } from "./secret-version";
import { requiresRotation, evaluateRotationRisk } from "./rotation-policy-engine";
import { getRotationEntry, ROTATION_REGISTRY } from "./rotation-registry";

// ── ID Generator ──────────────────────────────────────────────────────────────

function newPlanId(): string {
  return `rplan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Standard Rotation Steps ───────────────────────────────────────────────────

const STANDARD_STEPS = [
  { index: 0, name: "request",    description: "Record rotation request and assign rotation ID.",    reversible: true  },
  { index: 1, name: "validate",   description: "Validate new secret version against provider.",       reversible: true  },
  { index: 2, name: "ready",      description: "Mark rotation as ready for activation.",              reversible: true  },
  { index: 3, name: "activate",   description: "Activate new version; old version enters GRACE.",     reversible: true  },
  { index: 4, name: "grace",      description: "Allow old version to serve in-flight requests.",      reversible: false },
  { index: 5, name: "revoke",     description: "Revoke old version after grace period expires.",       reversible: false },
  { index: 6, name: "audit",      description: "Record completed rotation in audit log.",              reversible: false },
];

const EMERGENCY_STEPS = [
  { index: 0, name: "emergency_request",  description: "Record emergency rotation. Bypass normal approval.",  reversible: false },
  { index: 1, name: "immediate_activate", description: "Activate new version immediately without grace.",      reversible: false },
  { index: 2, name: "revoke",             description: "Revoke compromised version immediately.",              reversible: false },
  { index: 3, name: "audit",             description: "Record emergency rotation in audit log.",               reversible: false },
];

// ── generateRotationPlan ──────────────────────────────────────────────────────

/**
 * generateRotationPlan — build a plan for rotating a specific secret.
 * Does not execute any changes.
 */
export function generateRotationPlan(params: {
  secretId:    string;
  orgSlug:     string;
  requestedBy: string;
  reason:      string;
  strategy:    RotationStrategy;
}): RotationPlan | { error: string } {
  const { secretId, orgSlug, requestedBy, reason, strategy } = params;

  const entry = getRotationEntry(secretId);
  if (!entry) {
    return { error: `Secret '${secretId}' is not in the rotation registry.` };
  }
  if (!entry.rotationSupported) {
    return { error: `Secret '${secretId}' does not support rotation.` };
  }

  const currentVersion = secretVersionStore.getActive(orgSlug, secretId);
  const riskAssessment = evaluateRotationRisk({
    strategy,
    providerRisk:      entry.riskLevel,
    hasActiveVersion:  currentVersion !== undefined,
    gracePeriodSec:    entry.supportsZeroDowntime ? 0 : 300,
  });

  const steps = strategy === "EMERGENCY" ? EMERGENCY_STEPS : STANDARD_STEPS;

  const gracePeriodRequired = !entry.supportsZeroDowntime && strategy !== "EMERGENCY";
  const gracePeriodSeconds  = gracePeriodRequired ? 300 : undefined;

  // Estimate window based on strategy
  const estimatedWindow = strategy === "EMERGENCY" ? "PT2M" : "PT10M";

  return {
    id:                  newPlanId(),
    secretId,
    orgSlug,
    strategy,
    riskLevel:           riskAssessment.riskLevel,
    requiresApproval:    entry.requiresApproval && strategy !== "EMERGENCY",
    requestedBy,
    reason,
    steps,
    estimatedWindow,
    gracePeriodRequired,
    gracePeriodSeconds,
    createdAt:           new Date().toISOString(),
  };
}

// ── buildRotationSchedule ─────────────────────────────────────────────────────

export interface ScheduledRotation {
  secretId:             string;
  secretName:           string;
  orgSlug:              string;
  recommendedBy:        string; // ISO 8601 date
  urgencyScore:         number;
  riskLevel:            RotationRiskLevel;
  reason:               string;
  currentVersionAge?:   number;
  currentVersionExpiry?: string;
}

/**
 * buildRotationSchedule — generate a prioritized list of upcoming rotations
 * for a tenant based on version age and expiry dates.
 *
 * Does not modify any state.
 */
export function buildRotationSchedule(orgSlug: string): ScheduledRotation[] {
  const schedule: ScheduledRotation[] = [];

  for (const entry of ROTATION_REGISTRY) {
    if (!entry.rotationSupported) continue;

    const currentVersion = secretVersionStore.getActive(orgSlug, entry.id);
    const evaluation     = requiresRotation({ currentVersion, isCompromised: false });

    if (!evaluation.requiresRotation && !evaluation.isRecommended) continue;

    // Compute recommended rotation date
    let recommendedBy: Date;
    if (currentVersion?.expiresAt) {
      // One week before expiry
      const expiry = new Date(currentVersion.expiresAt);
      expiry.setDate(expiry.getDate() - 7);
      recommendedBy = expiry;
    } else if (currentVersion) {
      // Based on recommended rotation interval
      const created = new Date(currentVersion.createdAt);
      created.setDate(created.getDate() + entry.recommendedRotationDays);
      recommendedBy = created;
    } else {
      recommendedBy = new Date(); // now — no version exists
    }

    schedule.push({
      secretId:              entry.id,
      secretName:            entry.name,
      orgSlug,
      recommendedBy:         recommendedBy.toISOString().split("T")[0],
      urgencyScore:          evaluation.urgencyScore,
      riskLevel:             entry.riskLevel,
      reason:                evaluation.reason,
      currentVersionAge:     currentVersion ? versionAgeInDays(currentVersion) : undefined,
      currentVersionExpiry:  currentVersion?.expiresAt,
    });
  }

  // Sort by urgency (highest first)
  return schedule.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

// ── detectExpiringSecrets ─────────────────────────────────────────────────────

export interface ExpiringSecret {
  secretId:      string;
  secretName:    string;
  orgSlug:       string;
  expiresAt:     string;
  daysUntilExpiry: number;
  isExpired:     boolean;
  riskLevel:     RotationRiskLevel;
}

/**
 * detectExpiringSecrets — find all active secret versions expiring
 * within the given number of days for a tenant.
 */
export function detectExpiringSecrets(orgSlug: string, withinDays = 30): ExpiringSecret[] {
  const result: ExpiringSecret[] = [];
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + withinDays);

  for (const entry of ROTATION_REGISTRY) {
    const version = secretVersionStore.getActive(orgSlug, entry.id);
    if (!version?.expiresAt) continue;

    const expiresAt      = new Date(version.expiresAt);
    const daysUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const isExpired       = isVersionExpired(version);

    if (!isExpired && expiresAt > threshold) continue;

    result.push({
      secretId:       entry.id,
      secretName:     entry.name,
      orgSlug,
      expiresAt:      version.expiresAt,
      daysUntilExpiry,
      isExpired,
      riskLevel:      entry.riskLevel,
    });
  }

  return result.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

// ── estimateRotationDuration ──────────────────────────────────────────────────

/**
 * Estimate how long a rotation will take in seconds.
 */
export function estimateRotationDurationSeconds(params: {
  strategy:         RotationStrategy;
  requiresApproval: boolean;
  gracePeriodSec?:  number;
}): number {
  const { strategy, requiresApproval, gracePeriodSec } = params;

  if (strategy === "EMERGENCY") return 120; // 2 minutes

  let estimate = 60; // base: 1 minute for validation
  if (requiresApproval) estimate += 1800; // approval can take 30 minutes
  if (gracePeriodSec)   estimate += gracePeriodSec;

  return estimate;
}
