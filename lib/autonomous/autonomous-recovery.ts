/**
 * lib/autonomous/autonomous-recovery.ts
 *
 * Agentik — Autonomous Operations — Recovery Helpers
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Pure helpers for detecting and classifying stuck, incomplete,
 * or retry-exhausted autonomous operations.
 *
 * NO cron. NO scheduler. NO side effects.
 * Recovery decisions only — actual recovery is caller's responsibility.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AutonomousExecution, AutonomousExecutionStatus } from "./autonomous-types";
import { MAX_AUTONOMOUS_RETRIES } from "./autonomous-safety";

// ── Recovery state ────────────────────────────────────────────────────────────

export type AutonomousRecoveryAction =
  | "RETRY"           // operation can be retried
  | "ESCALATE"        // needs human review (too many retries or stuck)
  | "ABANDON"         // permanently failed, no recovery path
  | "NONE";           // no recovery needed

export interface RecoveryAssessment {
  action:     AutonomousRecoveryAction;
  reason:     string;
  retryable:  boolean;
}

// ── Timeout threshold ─────────────────────────────────────────────────────────

/** An execution running longer than this (ms) is considered stuck. */
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── Detectors ─────────────────────────────────────────────────────────────────

/**
 * Returns true if an execution is considered stuck (started but not completed
 * within the stuck threshold).
 */
export function isExecutionStuck(execution: AutonomousExecution): boolean {
  if (execution.status !== "FAILED" && execution.completedAt) return false;
  const startedMs = new Date(execution.startedAt).getTime();
  const nowMs     = Date.now();
  return nowMs - startedMs > STUCK_THRESHOLD_MS;
}

/**
 * Returns true if the execution is in a terminal state that cannot recover.
 */
export function isTerminalStatus(status: AutonomousExecutionStatus): boolean {
  return status === "COMPLETED" || status === "BLOCKED" || status === "ESCALATED";
}

/**
 * Returns true if a failed execution can be retried.
 */
export function isRetryable(execution: AutonomousExecution, retryCount: number): boolean {
  if (isTerminalStatus(execution.status)) return false;
  if (retryCount >= MAX_AUTONOMOUS_RETRIES) return false;
  return execution.status === "FAILED";
}

// ── Recovery assessment ───────────────────────────────────────────────────────

/**
 * Assess what recovery action, if any, is needed for an execution.
 *
 * @param execution   The execution to assess.
 * @param retryCount  Number of retries already attempted for this operation.
 */
export function assessRecovery(
  execution:  AutonomousExecution,
  retryCount: number,
): RecoveryAssessment {
  // Already completed — no recovery needed
  if (isTerminalStatus(execution.status)) {
    return {
      action:    "NONE",
      reason:    `Execution is in terminal status: ${execution.status}.`,
      retryable: false,
    };
  }

  // Retries exhausted
  if (retryCount >= MAX_AUTONOMOUS_RETRIES) {
    return {
      action:    "ESCALATE",
      reason:    `Retry limit reached (${retryCount}/${MAX_AUTONOMOUS_RETRIES}). Escalating to human review.`,
      retryable: false,
    };
  }

  // Stuck execution
  if (isExecutionStuck(execution)) {
    return {
      action:    "ESCALATE",
      reason:    `Execution stuck — started at ${execution.startedAt} and has not completed.`,
      retryable: false,
    };
  }

  // Retryable failure
  if (execution.status === "FAILED") {
    return {
      action:    "RETRY",
      reason:    `Execution failed (retry ${retryCount + 1}/${MAX_AUTONOMOUS_RETRIES} available).`,
      retryable: true,
    };
  }

  // SKIPPED — no recovery needed
  return {
    action:    "NONE",
    reason:    `Execution status "${execution.status}" requires no recovery.`,
    retryable: false,
  };
}
