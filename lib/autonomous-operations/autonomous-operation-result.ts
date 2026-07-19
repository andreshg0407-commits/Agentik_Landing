/**
 * lib/autonomous-operations/autonomous-operation-result.ts
 *
 * Agentik — Autonomous Operations Result
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * The complete output of one autonomous operation lifecycle.
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AutonomousOperationPlan,
  AutonomousOperationStatus,
  AutonomousOperationAuditEvent,
} from "./autonomous-operation-types";

// ── Execution record (server-produced, optional) ──────────────────────────────

export interface AutonomousOperationExecution {
  executorType:  string;
  startedAt:     string;
  completedAt?:  string;
  durationMs?:   number;
  success:       boolean;
  message?:      string;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface AutonomousOperationResult {
  /** True if the operation lifecycle completed without fatal errors. */
  success:              boolean;
  message:              string;
  /** The plan that was created and (optionally) executed. */
  plan:                 AutonomousOperationPlan;
  /** Execution record if the plan was dispatched. */
  execution?:           AutonomousOperationExecution;
  /** ID of the task created if decision = CREATE_TASK_ONLY. */
  createdTaskId?:       string;
  /** ID of the approval created if decision = CREATE_APPROVAL_ONLY. */
  createdApprovalId?:   string;
  /** ID of the workflow run started if decision = START_WORKFLOW (future). */
  createdWorkflowRunId?: string;
  status:               AutonomousOperationStatus;
  errors:               string[];
  warnings:             string[];
  auditTrail:           AutonomousOperationAuditEvent[];
  // ── Idempotency — AGENTIK-IDEMPOTENCY-01 ──────────────────────────────────
  /** True when a prior record was found and reused instead of creating a new one. */
  alreadyProcessed?:    boolean;
  /** ID of the entity that already existed (task or approval). */
  existingEntityId?:    string;
  /** Type of the existing entity: "task" | "approval". */
  existingEntityType?:  string;
  /** The idempotency key that was used for deduplication. */
  idempotencyKey?:      string;
}
