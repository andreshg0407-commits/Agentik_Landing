/**
 * lib/work/chaining/workflow-chain-idempotency.ts
 *
 * Agentik — Workflow Chain Idempotency Key Builders
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01
 *
 * Deterministic key construction for workflow-level deduplication.
 * Wraps the existing buildWorkflowRunIdempotencyKey from lib/idempotency
 * and adds workflow-specific key builders for steps and continuations.
 *
 * Pure. No Prisma. No React. No Next. No side effects.
 */

import { normalizeIdempotencyPart } from "../../idempotency/idempotency-key";

// ── Key builders ──────────────────────────────────────────────────────────────

/**
 * Deterministic key for a WorkflowRun.
 * Same orgSlug + chainId + triggerExecutionId → same key, always.
 *
 * Format: workflow_run:{orgSlug}:{chainId}:{triggerExecutionId}
 */
export function buildWorkflowRunIdempotencyKey(
  orgSlug:            string,
  chainId:            string,
  triggerExecutionId: string,
): string {
  return [
    "workflow_run",
    normalizeIdempotencyPart(orgSlug),
    normalizeIdempotencyPart(chainId),
    normalizeIdempotencyPart(triggerExecutionId),
  ].filter(Boolean).join(":");
}

/**
 * Deterministic key for a single workflow step dispatch.
 * Prevents the same step from being dispatched twice in a run.
 *
 * Format: workflow_step:{orgSlug}:{workflowRunId}:{stepId}:{previousExecutionId}
 */
export function buildWorkflowStepIdempotencyKey(
  orgSlug:             string,
  workflowRunId:       string,
  stepId:              string,
  previousExecutionId: string,
): string {
  return [
    "workflow_step",
    normalizeIdempotencyPart(orgSlug),
    normalizeIdempotencyPart(workflowRunId),
    normalizeIdempotencyPart(stepId),
    normalizeIdempotencyPart(previousExecutionId),
  ].filter(Boolean).join(":");
}

/**
 * Deterministic key for a chain continuation event.
 * Used to prevent the same execution from continuing the chain twice.
 *
 * Format: workflow_continuation:{orgSlug}:{workflowRunId}:{executionId}
 */
export function buildWorkflowContinuationIdempotencyKey(
  orgSlug:       string,
  workflowRunId: string,
  executionId:   string,
): string {
  return [
    "workflow_continuation",
    normalizeIdempotencyPart(orgSlug),
    normalizeIdempotencyPart(workflowRunId),
    normalizeIdempotencyPart(executionId),
  ].filter(Boolean).join(":");
}
