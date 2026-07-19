/**
 * lib/idempotency/idempotency-result.ts
 *
 * Agentik — Idempotency Check Result
 * Sprint: AGENTIK-IDEMPOTENCY-01
 *
 * Pure domain. No Prisma. No React.
 */

import type { IdempotencyStatus } from "./idempotency-types";

// ── Result ────────────────────────────────────────────────────────────────────

/**
 * The result of an idempotency check before creating a Task, Approval, or WorkflowRun.
 *
 * Callers inspect `alreadyProcessed`:
 *   true  → use existingEntityId, skip creation
 *   false → proceed with creation
 */
export interface IdempotencyCheckResult {
  /** True if the key was accepted (either new or existing — not invalid/conflict). */
  success:             boolean;
  /** Disposition of the idempotency check. */
  status:              IdempotencyStatus;
  /** The key that was checked. */
  key:                 string;
  /** True when a prior record was found — caller must NOT create again. */
  alreadyProcessed:    boolean;
  /** ID of the existing entity when alreadyProcessed=true. */
  existingEntityId?:   string;
  /** Type of the existing entity: "task" | "approval" | "workflow_run". */
  existingEntityType?: string;
  /** Human-readable explanation. */
  message:             string;
  errors:              string[];
  warnings:            string[];
  metadata?:           Record<string, unknown>;
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function idempotencyHit(
  key:        string,
  entityId:   string,
  entityType: string,
): IdempotencyCheckResult {
  return {
    success:             true,
    status:              "EXISTING",
    key,
    alreadyProcessed:    true,
    existingEntityId:    entityId,
    existingEntityType:  entityType,
    message:             `Idempotency hit: existing ${entityType} found (id=${entityId})`,
    errors:              [],
    warnings:            [],
  };
}

export function idempotencyMiss(key: string): IdempotencyCheckResult {
  return {
    success:          true,
    status:           "NEW",
    key,
    alreadyProcessed: false,
    message:          "Idempotency miss: no prior record — safe to create",
    errors:           [],
    warnings:         [],
  };
}

export function idempotencyInvalid(key: string, reason: string): IdempotencyCheckResult {
  return {
    success:          false,
    status:           "INVALID",
    key,
    alreadyProcessed: false,
    message:          `Idempotency key invalid: ${reason}`,
    errors:           [reason],
    warnings:         [],
  };
}
