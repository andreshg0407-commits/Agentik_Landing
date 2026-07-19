/**
 * action-result.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Execution result — what happened when an action ran.
 *
 * eventsToEmit is a suggestion list, not emitted directly.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ExecutionStatus } from "./action-types";
import type { ActionReceipt } from "./action-receipt";

// -- Suggested Event ----------------------------------------------------------

/** An event suggested for emission after action execution. */
export interface SuggestedEvent {
  /** Event type to emit. */
  eventType: string;
  /** Summary. */
  summary: string;
  /** Payload data. */
  payload: Record<string, unknown>;
}

// -- Suggested Next Action ----------------------------------------------------

/** A follow-up action suggested after execution. */
export interface SuggestedNextAction {
  /** Action type. */
  actionType: string;
  /** Title. */
  title: string;
  /** Reason. */
  reason: string;
  /** Parameters. */
  parameters: Record<string, unknown>;
}

// -- Action Execution Result --------------------------------------------------

/** Complete result of executing an action. */
export interface ActionExecutionResult {
  /** Whether execution succeeded. */
  success: boolean;
  /** Execution status. */
  status: ExecutionStatus;
  /** Human-readable message. */
  message: string;
  /** Output data. */
  output: Record<string, unknown>;
  /** Error details if failed. */
  error: string | null;
  /** Execution receipt. */
  receipt: ActionReceipt | null;
  /** Events suggested for emission (NOT emitted directly). */
  eventsToEmit: SuggestedEvent[];
  /** Follow-up actions suggested. */
  nextActions: SuggestedNextAction[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a successful result. */
export function buildSuccessResult(opts: {
  message: string;
  output?: Record<string, unknown>;
  receipt?: ActionReceipt | null;
  eventsToEmit?: SuggestedEvent[];
  nextActions?: SuggestedNextAction[];
  metadata?: Record<string, unknown>;
}): ActionExecutionResult {
  return {
    success: true,
    status: "succeeded",
    message: opts.message,
    output: opts.output ?? {},
    error: null,
    receipt: opts.receipt ?? null,
    eventsToEmit: opts.eventsToEmit ?? [],
    nextActions: opts.nextActions ?? [],
    metadata: opts.metadata ?? {},
  };
}

/** Build a dry-run result. */
export function buildDryRunResult(opts: {
  message: string;
  output?: Record<string, unknown>;
  receipt?: ActionReceipt | null;
  eventsToEmit?: SuggestedEvent[];
  metadata?: Record<string, unknown>;
}): ActionExecutionResult {
  return {
    success: true,
    status: "dry_run_completed",
    message: opts.message,
    output: opts.output ?? {},
    error: null,
    receipt: opts.receipt ?? null,
    eventsToEmit: opts.eventsToEmit ?? [],
    nextActions: [],
    metadata: opts.metadata ?? {},
  };
}

/** Build a failed result. */
export function buildFailedResult(opts: {
  message: string;
  error: string;
  metadata?: Record<string, unknown>;
}): ActionExecutionResult {
  return {
    success: false,
    status: "failed",
    message: opts.message,
    output: {},
    error: opts.error,
    receipt: null,
    eventsToEmit: [{
      eventType: "business_action_failed",
      summary: opts.message,
      payload: { error: opts.error },
    }],
    nextActions: [],
    metadata: opts.metadata ?? {},
  };
}

/** Build an approval-required result. */
export function buildApprovalRequiredResult(opts: {
  message: string;
  metadata?: Record<string, unknown>;
}): ActionExecutionResult {
  return {
    success: false,
    status: "approval_required",
    message: opts.message,
    output: {},
    error: null,
    receipt: null,
    eventsToEmit: [{
      eventType: "business_action_approval_required",
      summary: opts.message,
      payload: {},
    }],
    nextActions: [],
    metadata: opts.metadata ?? {},
  };
}
