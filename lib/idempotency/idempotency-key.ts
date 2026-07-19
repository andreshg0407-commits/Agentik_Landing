/**
 * lib/idempotency/idempotency-key.ts
 *
 * Agentik — Idempotency Key Builder
 * Sprint: AGENTIK-IDEMPOTENCY-01
 *
 * Deterministic key construction from structured inputs.
 * Pure. No side effects. No Prisma. No React.
 *
 * Key format:
 *   {scope}:{orgSlug}:{agentId}:{sourceRunId}:{proposedActionId}:{actionType}:{targetDomain}:{targetModule}[:{entityType}:{entityId}]
 *
 * Example:
 *   autonomous_operation:castillitos:diego:run_abc123:pa_diego_001:create_approval_draft:finance:conciliacion
 */

import type { IdempotencyInput } from "./idempotency-types";
import type { AutonomousOperationInput } from "../autonomous-operations/autonomous-operation-types";

// ── Normalize helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a single key part: lowercase, trim, replace spaces with hyphens.
 * Returns undefined if the value is empty/undefined.
 */
export function normalizeIdempotencyPart(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null || value.trim() === "") return undefined;
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Join non-undefined parts with ":" separator.
 */
export function safeJoinIdempotencyParts(parts: (string | undefined)[]): string {
  return parts.filter((p): p is string => p !== undefined && p !== "").join(":");
}

// ── Generic key builder ───────────────────────────────────────────────────────

/**
 * Build a deterministic idempotency key from structured input.
 * Undefined fields are omitted — only present fields contribute.
 * Same input always produces same key.
 */
export function buildIdempotencyKey(input: IdempotencyInput): string {
  const parts: (string | undefined)[] = [
    normalizeIdempotencyPart(input.scope.toLowerCase()),
    normalizeIdempotencyPart(input.orgSlug),
    normalizeIdempotencyPart(input.agentId),
    normalizeIdempotencyPart(input.sourceRunId),
    normalizeIdempotencyPart(input.proposedActionId),
    normalizeIdempotencyPart(input.actionType),
    normalizeIdempotencyPart(input.targetDomain),
    normalizeIdempotencyPart(input.targetModule),
    normalizeIdempotencyPart(input.entityType),
    normalizeIdempotencyPart(input.entityId),
    normalizeIdempotencyPart(input.workflowRunId),
    normalizeIdempotencyPart(input.stepId),
  ];

  return safeJoinIdempotencyParts(parts);
}

// ── Domain-specific builders ───────────────────────────────────────────────────

/**
 * Build the idempotency key for an AutonomousOperationInput.
 * Uses: scope + orgSlug + agentId + sourceRunId + proposedActionId + actionType + domain + module.
 */
export function buildAutonomousOperationIdempotencyKey(
  input: AutonomousOperationInput,
): string {
  const action = input?.proposedAction;
  if (!action) {
    // Fallback for invalid inputs — still deterministic
    return safeJoinIdempotencyParts([
      "autonomous_operation",
      normalizeIdempotencyPart(input?.orgSlug),
      normalizeIdempotencyPart(input?.agentId),
      normalizeIdempotencyPart(input?.sourceRunId),
    ]);
  }
  const relatedEntity = action.payload?.relatedEntity as Record<string, unknown> | undefined;

  return buildIdempotencyKey({
    scope:             "AUTONOMOUS_OPERATION",
    orgSlug:           input.orgSlug,
    agentId:           input.agentId,
    sourceRunId:       input.sourceRunId,
    proposedActionId:  action.id,
    actionType:        action.type,
    targetDomain:      action.targetDomain,
    targetModule:      action.targetModule,
    entityType:        relatedEntity?.type as string | undefined,
    entityId:          relatedEntity?.id   as string | undefined,
  });
}

/**
 * Build a task-scoped key from an autonomous operation key.
 * Scoped to TASK for repository lookup.
 */
export function buildTaskIdempotencyKey(
  orgSlug:     string,
  agentId:     string,
  sourceRunId: string | undefined,
  actionId:    string,
  actionType:  string,
  domain:      string,
  module:      string,
  entityType?: string,
  entityId?:   string,
): string {
  return buildIdempotencyKey({
    scope:            "TASK",
    orgSlug,
    agentId,
    sourceRunId,
    proposedActionId: actionId,
    actionType,
    targetDomain:     domain,
    targetModule:     module,
    entityType,
    entityId,
  });
}

/**
 * Build an approval-scoped key from an autonomous operation key.
 */
export function buildApprovalIdempotencyKey(
  orgSlug:     string,
  agentId:     string,
  sourceRunId: string | undefined,
  actionId:    string,
  actionType:  string,
  domain:      string,
  module:      string,
  entityType?: string,
  entityId?:   string,
): string {
  return buildIdempotencyKey({
    scope:            "APPROVAL",
    orgSlug,
    agentId,
    sourceRunId,
    proposedActionId: actionId,
    actionType,
    targetDomain:     domain,
    targetModule:     module,
    entityType,
    entityId,
  });
}

/**
 * Build a workflow-run-scoped key.
 */
export function buildWorkflowRunIdempotencyKey(
  orgSlug:       string,
  workflowRunId: string,
  stepId?:       string,
): string {
  return buildIdempotencyKey({
    scope:         "WORKFLOW_RUN",
    orgSlug,
    workflowRunId,
    stepId,
  });
}

/**
 * Build a work-execution-scoped key.
 */
export function buildWorkExecutionIdempotencyKey(
  orgSlug:             string,
  previousExecutionId: string,
  stepId:              string,
): string {
  return buildIdempotencyKey({
    scope:               "WORK_EXECUTION",
    orgSlug,
    previousExecutionId,
    stepId,
  });
}
