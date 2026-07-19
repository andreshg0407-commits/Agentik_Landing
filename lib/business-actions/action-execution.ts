/**
 * action-execution.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Execution record — an attempt to execute an action.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ExecutionMode, ExecutionStatus } from "./action-types";
import { nextActionId } from "./action-types";
import type { ActionTrace } from "./action-trace";

// -- Action Execution ---------------------------------------------------------

/** Record of an execution attempt. */
export interface ActionExecution {
  /** Unique execution ID. */
  executionId: string;
  /** Action being executed. */
  actionId: string;
  /** Action plan this execution belongs to. */
  actionPlanId: string | null;
  /** Organization. */
  organizationId: string;
  /** Execution mode. */
  mode: ExecutionMode;
  /** Current status. */
  status: ExecutionStatus;
  /** When execution started. */
  startedAt: string;
  /** When execution completed. */
  completedAt: string | null;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Attempt number (1-based). */
  attempt: number;
  /** Input data. */
  input: Record<string, unknown>;
  /** Output data. */
  output: Record<string, unknown>;
  /** Error if failed. */
  error: string | null;
  /** Provenance trace. */
  trace: ActionTrace;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action execution. */
export function buildActionExecution(opts: {
  actionId: string;
  organizationId: string;
  mode: ExecutionMode;
  trace: ActionTrace;
  actionPlanId?: string | null;
  attempt?: number;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ActionExecution {
  return {
    executionId: nextActionId("aexe"),
    actionId: opts.actionId,
    actionPlanId: opts.actionPlanId ?? null,
    organizationId: opts.organizationId,
    mode: opts.mode,
    status: "queued",
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: 0,
    attempt: opts.attempt ?? 1,
    input: opts.input ?? {},
    output: {},
    error: null,
    trace: opts.trace,
    metadata: opts.metadata ?? {},
  };
}

/** Mark an execution as completed. */
export function completeExecution(
  exec: ActionExecution,
  status: ExecutionStatus,
  output: Record<string, unknown>,
  error?: string | null,
): ActionExecution {
  return {
    ...exec,
    status,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - new Date(exec.startedAt).getTime(),
    output,
    error: error ?? null,
  };
}
