/**
 * lib/work/chaining/workflow-chain-hardening.ts
 *
 * Agentik — Workflow Chaining Hardening Helpers
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01
 *
 * Pure helpers for idempotency, safety limits, and processing locks.
 * No Prisma. No React. No server-only. Safe to import in validation scripts.
 */

import type { WorkflowChainRun, WorkflowChainAuditEvent } from "./workflow-chain-types";

// ── Safety limits ─────────────────────────────────────────────────────────────

export const SAFETY_LIMITS = {
  /** Maximum step results stored in a single run (loop guard). */
  MAX_STEP_RESULTS:    20,
  /** Maximum approval steps created within a single run. */
  MAX_APPROVALS:       10,
  /** Maximum auto-dispatched executions within a single run. */
  MAX_AUTO_DISPATCHES: 10,
  /** Run is considered stuck-running after this many ms without update. */
  STUCK_RUNNING_MS:    15 * 60 * 1000, // 15 minutes
  /** Run is considered stuck-blocked after this many ms without update. */
  STUCK_BLOCKED_MS:    5  * 60 * 1000, // 5 minutes
} as const;

// ── Idempotency keys ──────────────────────────────────────────────────────────

/**
 * Deterministic key for a chain run.
 * Same chainId + triggerExecutionId always produces the same key.
 */
export function buildIdempotencyKey(
  chainId:            string,
  triggerExecutionId: string,
): string {
  return `workflow:${chainId}:${triggerExecutionId}`;
}

/**
 * Deterministic key for a single chain step dispatch.
 * Prevents the same step from being dispatched twice within one run.
 */
export function buildWorkflowStepIdempotencyKey(
  workflowRunId:       string,
  stepId:              string,
  previousExecutionId: string,
): string {
  return `workflow-step:${workflowRunId}:${stepId}:${previousExecutionId}`;
}

// ── Hardening metadata ────────────────────────────────────────────────────────

/**
 * Shape of the hardening sub-object stored inside run.metadata.
 * All fields optional — defaults to 0/empty for fresh runs.
 */
export interface WorkflowRunHardeningMeta {
  /** Execution IDs currently being processed (processing lock). */
  processingExecutionIds: string[];
  /** Execution IDs already fully processed (duplicate guard). */
  processedExecutionIds:  string[];
  /** Total approval steps created this run (safety limit). */
  approvalCount:          number;
  /** Total auto-dispatch executions created this run (safety limit). */
  autoDispatchCount:      number;
}

export function getHardeningMeta(run: WorkflowChainRun): WorkflowRunHardeningMeta {
  const meta = run.metadata as Record<string, unknown>;
  return {
    processingExecutionIds: (meta.processingExecutionIds as string[]) ?? [],
    processedExecutionIds:  (meta.processedExecutionIds  as string[]) ?? [],
    approvalCount:          (meta.approvalCount          as number)   ?? 0,
    autoDispatchCount:      (meta.autoDispatchCount      as number)   ?? 0,
  };
}

export function setHardeningMeta(
  run:  WorkflowChainRun,
  hard: Partial<WorkflowRunHardeningMeta>,
): WorkflowChainRun {
  return {
    ...run,
    metadata: {
      ...run.metadata,
      ...hard,
    },
    updatedAt: new Date().toISOString(),
  };
}

// ── Processing lock helpers ───────────────────────────────────────────────────

/** Returns true if this executionId is already processed — skip without action. */
export function isAlreadyProcessed(run: WorkflowChainRun, executionId: string): boolean {
  const hard = getHardeningMeta(run);
  return hard.processedExecutionIds.includes(executionId);
}

/** Returns true if this executionId is currently being processed — concurrent lock. */
export function isCurrentlyProcessing(run: WorkflowChainRun, executionId: string): boolean {
  const hard = getHardeningMeta(run);
  return hard.processingExecutionIds.includes(executionId);
}

/** Add executionId to processingExecutionIds (acquire lock). */
export function acquireLock(run: WorkflowChainRun, executionId: string): WorkflowChainRun {
  const hard = getHardeningMeta(run);
  if (hard.processingExecutionIds.includes(executionId)) return run;
  return setHardeningMeta(run, {
    processingExecutionIds: [...hard.processingExecutionIds, executionId],
  });
}

/** Move executionId from processing → processed (release + commit). */
export function releaseLock(run: WorkflowChainRun, executionId: string): WorkflowChainRun {
  const hard = getHardeningMeta(run);
  return setHardeningMeta(run, {
    processingExecutionIds: hard.processingExecutionIds.filter(id => id !== executionId),
    processedExecutionIds:  [...hard.processedExecutionIds, executionId],
  });
}

/** Remove executionId from processingExecutionIds on failure (unlock without committing). */
export function abortLock(run: WorkflowChainRun, executionId: string): WorkflowChainRun {
  const hard = getHardeningMeta(run);
  return setHardeningMeta(run, {
    processingExecutionIds: hard.processingExecutionIds.filter(id => id !== executionId),
  });
}

// ── Safety limit checks ───────────────────────────────────────────────────────

export function hasExceededApprovalLimit(run: WorkflowChainRun): boolean {
  return getHardeningMeta(run).approvalCount >= SAFETY_LIMITS.MAX_APPROVALS;
}

export function hasExceededDispatchLimit(run: WorkflowChainRun): boolean {
  return getHardeningMeta(run).autoDispatchCount >= SAFETY_LIMITS.MAX_AUTO_DISPATCHES;
}

export function incrementApprovalCount(run: WorkflowChainRun): WorkflowChainRun {
  const hard = getHardeningMeta(run);
  return setHardeningMeta(run, { approvalCount: hard.approvalCount + 1 });
}

export function incrementDispatchCount(run: WorkflowChainRun): WorkflowChainRun {
  const hard = getHardeningMeta(run);
  return setHardeningMeta(run, { autoDispatchCount: hard.autoDispatchCount + 1 });
}

// ── Stuck run detection ───────────────────────────────────────────────────────

export function isRunStuck(run: WorkflowChainRun): {
  stuck:  boolean;
  reason: string;
  recommendedAction: "retry_current_step" | "cancel" | "manual_review";
} {
  if (run.status !== "RUNNING" && run.status !== "BLOCKED") {
    return { stuck: false, reason: "", recommendedAction: "manual_review" };
  }

  const updatedMs  = new Date(run.updatedAt).getTime();
  const nowMs      = Date.now();
  const staleSinceMs = nowMs - updatedMs;

  if (run.status === "RUNNING" && staleSinceMs > SAFETY_LIMITS.STUCK_RUNNING_MS) {
    return {
      stuck:             true,
      reason:            `RUNNING sin actualizar por ${Math.round(staleSinceMs / 60000)}min`,
      recommendedAction: "retry_current_step",
    };
  }

  if (run.status === "BLOCKED" && staleSinceMs > SAFETY_LIMITS.STUCK_BLOCKED_MS) {
    return {
      stuck:             true,
      reason:            `BLOCKED sin actualizar por ${Math.round(staleSinceMs / 60000)}min`,
      recommendedAction: "manual_review",
    };
  }

  return { stuck: false, reason: "", recommendedAction: "manual_review" };
}

// ── Dead-letter audit builder ─────────────────────────────────────────────────

export function buildFailureAuditEvent(
  runId:       string,
  executionId: string,
  err:         unknown,
): WorkflowChainAuditEvent {
  const raw     = err instanceof Error ? err.message : String(err);
  // Never store a stack trace — truncate to a safe summary
  const safe    = raw.slice(0, 200);
  return {
    id:          `wca_fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    runId,
    event:       "chain_continuation_failed",
    executionId,
    message:     `Error al continuar cadena: ${safe}`,
    metadata:    { executionId, safeErrorMessage: safe, timestamp: new Date().toISOString() },
    occurredAt:  new Date().toISOString(),
  };
}
