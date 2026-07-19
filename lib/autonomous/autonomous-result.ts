/**
 * lib/autonomous/autonomous-result.ts
 *
 * Agentik — Autonomous Operations — Execution Result
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * The complete output of one autonomous operation lifecycle.
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AutonomousDecision, AutonomousExecutionStatus } from "./autonomous-types";

// ── Result ────────────────────────────────────────────────────────────────────

/**
 * AutonomousResult — the structured outcome of processing an AutonomousOperation.
 *
 * Status semantics:
 *   COMPLETED  — operation executed successfully via Agent Runtime
 *   BLOCKED    — policy is MANUAL_ONLY or kill switch is OFF
 *   ESCALATED  — approval request was created; waiting for human
 *   FAILED     — execution attempted but returned error
 *   SKIPPED    — operation not applicable (kill switch, duplicate, etc.)
 */
export interface AutonomousResult {
  /** Whether the lifecycle completed without fatal error. */
  success:        boolean;
  /** Final status of this operation. */
  status:         AutonomousExecutionStatus;
  /** The decision that was made. */
  decision:       AutonomousDecision;
  /** Execution ID if Agent Runtime was called. */
  executionId?:   string;
  /** Approval ID if status=ESCALATED. */
  approvalId?:    string;
  /** Workflow run ID if a workflow was started. */
  workflowRunId?: string;
  /** Human-readable outcome message. */
  message:        string;
  /** Non-fatal issues encountered. */
  warnings:       string[];
  /** Fatal errors (non-empty when success=false). */
  errors:         string[];
}

// ── Factory helpers ───────────────────────────────────────────────────────────

export function blockedResult(
  decision: AutonomousDecision,
  reason:   string,
): AutonomousResult {
  return {
    success:  false,
    status:   "BLOCKED",
    decision,
    message:  reason,
    warnings: [],
    errors:   [reason],
  };
}

export function skippedResult(
  decision: AutonomousDecision,
  reason:   string,
): AutonomousResult {
  return {
    success:  true,
    status:   "SKIPPED",
    decision,
    message:  reason,
    warnings: [],
    errors:   [],
  };
}

export function escalatedResult(
  decision:   AutonomousDecision,
  approvalId: string,
  message:    string,
): AutonomousResult {
  return {
    success:    true,
    status:     "ESCALATED",
    decision,
    approvalId,
    message,
    warnings:   [],
    errors:     [],
  };
}

export function completedResult(
  decision:    AutonomousDecision,
  executionId: string,
  message:     string,
  warnings:    string[] = [],
): AutonomousResult {
  return {
    success:     true,
    status:      "COMPLETED",
    decision,
    executionId,
    message,
    warnings,
    errors:      [],
  };
}

export function failedResult(
  decision: AutonomousDecision,
  error:    string,
): AutonomousResult {
  return {
    success:  false,
    status:   "FAILED",
    decision,
    message:  error,
    warnings: [],
    errors:   [error],
  };
}
