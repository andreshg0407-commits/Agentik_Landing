/**
 * lib/security/secret-rotation/rotation-types.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Secret Rotation — Domain Types
 *
 * Core types for the Agentik Secret Rotation layer.
 * All types are JSON-serializable. No Prisma. No server-only. No crypto.
 *
 * Principles:
 *   - Multi-tenant: every rotation carries orgSlug
 *   - Fail-closed: default RotationResult is FAILED
 *   - Auditable: every rotation state change is traceable
 *   - Reversible: no active secret is deleted during rotation
 *   - Version coexistence: old and new versions may coexist temporarily
 */

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * SecretRotationStatus — lifecycle state of a rotation operation.
 */
export type SecretRotationStatus =
  | "PENDING"      // rotation requested, not yet validated
  | "VALIDATING"   // new secret being validated against provider
  | "READY"        // validated, awaiting activation
  | "ACTIVE"       // new version is live; old version in grace period
  | "REVOKED"      // old version revoked, rotation complete
  | "FAILED"       // rotation failed at any step
  | "CANCELLED";   // rotation cancelled before activation

// ── Strategy ──────────────────────────────────────────────────────────────────

/**
 * RotationStrategy — how the rotation was initiated.
 */
export type RotationStrategy =
  | "MANUAL"       // initiated by a human operator
  | "SCHEDULED"    // initiated by an automated schedule
  | "EMERGENCY";   // initiated due to suspected compromise

// ── Risk Level ────────────────────────────────────────────────────────────────

export type RotationRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Rotation Plan ─────────────────────────────────────────────────────────────

/**
 * RotationPlan — a plan for rotating a secret.
 * Produced by the planner before execution begins.
 */
export interface RotationPlan {
  /** Unique plan identifier. */
  id:                  string;
  /** The secret being rotated. */
  secretId:            string;
  /** The tenant scope. */
  orgSlug:             string;
  /** Rotation strategy. */
  strategy:            RotationStrategy;
  /** Risk level of this rotation. */
  riskLevel:           RotationRiskLevel;
  /** Whether approval is required before activation. */
  requiresApproval:    boolean;
  /** Who requested the rotation. */
  requestedBy:         string;
  /** Human-readable reason for the rotation. */
  reason:              string;
  /** Steps the rotation will follow. */
  steps:               RotationStep[];
  /** Estimated window for the rotation (ISO 8601 duration, e.g. "PT5M"). */
  estimatedWindow:     string;
  /** Whether a grace period is needed for old version. */
  gracePeriodRequired: boolean;
  /** Duration of grace period in seconds (if required). */
  gracePeriodSeconds?: number;
  /** ISO 8601 timestamp when the plan was created. */
  createdAt:           string;
}

/**
 * RotationStep — a single step in a rotation plan.
 */
export interface RotationStep {
  /** Step index (0-based). */
  index:       number;
  /** Human-readable step name. */
  name:        string;
  /** What this step does. */
  description: string;
  /** Whether this step is reversible. */
  reversible:  boolean;
}

// ── Rotation Policy ───────────────────────────────────────────────────────────

/**
 * RotationPolicy — rules governing rotation for a class of secrets.
 */
export interface RotationPolicy {
  /** Unique policy identifier. */
  id:                       string;
  /** Human-readable name. */
  name:                     string;
  /** Description of the policy. */
  description:              string;
  /** How often this class of secret should be rotated (in days). */
  rotationIntervalDays:     number;
  /** How many days before expiry to warn. */
  warningThresholdDays:     number;
  /** How many days before expiry to auto-rotate (if scheduled). */
  autoRotateThresholdDays:  number;
  /** Whether emergency rotation bypasses approval. */
  emergencyBypassesApproval: boolean;
  /** Whether this policy is currently active. */
  isActive:                 boolean;
}

// ── Rotation Result ───────────────────────────────────────────────────────────

/**
 * RotationResult — the structured outcome of a rotation operation.
 */
export interface RotationResult {
  /** Whether the operation succeeded. */
  success:     boolean;
  /** The rotation ID (if a rotation record was created). */
  rotationId?: string;
  /** The final status after the operation. */
  status:      SecretRotationStatus;
  /** Machine-readable reason. */
  reason:      string;
  /** Human-readable message. */
  message:     string;
  /** ISO 8601 timestamp of the result. */
  resultAt:    string;
  /** Duration of the operation in milliseconds. */
  durationMs:  number;
}

// ── Rotation Request ──────────────────────────────────────────────────────────

/**
 * RotationRequest — input for requesting a secret rotation.
 */
export interface RotationRequest {
  /** The secret being rotated (from RotationRegistry). */
  secretId:    string;
  /** The tenant scope. */
  orgSlug:     string;
  /** Who is requesting the rotation. */
  requestedBy: string;
  /** Why the rotation is needed. */
  reason:      string;
  /** Rotation strategy. */
  strategy:    RotationStrategy;
  /** Optional metadata for the rotation. */
  metadata?:   Record<string, string | number | boolean>;
}

// ── Rotation Validation Input ─────────────────────────────────────────────────

/**
 * RotationValidationInput — input for validating a new secret version.
 */
export interface RotationValidationInput {
  /** The rotation ID being validated. */
  rotationId: string;
  /** The tenant scope. */
  orgSlug:    string;
  /** Who is validating. */
  validatedBy: string;
  /** Whether the validation passed. */
  passed:     boolean;
  /** Optional notes from validation. */
  notes?:     string;
}

// ── Factory Helpers ───────────────────────────────────────────────────────────

/** Build a successful RotationResult. */
export function successResult(
  reason:     string,
  message:    string,
  rotationId?: string,
  start?:     number,
): RotationResult {
  return {
    success:    true,
    rotationId,
    status:     "ACTIVE",
    reason,
    message,
    resultAt:   new Date().toISOString(),
    durationMs: start !== undefined ? Date.now() - start : 0,
  };
}

/** Build a failed RotationResult. */
export function failedResult(
  reason:  string,
  message: string,
  start?:  number,
): RotationResult {
  return {
    success:    false,
    status:     "FAILED",
    reason,
    message,
    resultAt:   new Date().toISOString(),
    durationMs: start !== undefined ? Date.now() - start : 0,
  };
}

/** Build a cancelled RotationResult. */
export function cancelledResult(
  reason:  string,
  message: string,
  start?:  number,
): RotationResult {
  return {
    success:    false,
    status:     "CANCELLED",
    reason,
    message,
    resultAt:   new Date().toISOString(),
    durationMs: start !== undefined ? Date.now() - start : 0,
  };
}
