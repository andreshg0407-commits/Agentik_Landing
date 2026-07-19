/**
 * lib/work/live/work-execution-factory.ts
 *
 * Agentik — Live Work Execution Factories
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * Pure factory functions for creating domain objects.
 * No Prisma. No React. No side effects.
 */

import type {
  WorkExecutionJob,
  WorkExecutionJobId,
  WorkExecutionAudit,
  WorkExecutionResult,
  WorkExecutionSummary,
  WorkExecutionStatus,
  WorkExecutionTrigger,
  WorkExecutorType,
  WorkExecutionPayload,
  WorkExecutionError,
  WorkExecutionActor,
  ApprovalApprovedEvent,
} from "./work-execution-types";

// ── ID generator ──────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── createExecutionJob ────────────────────────────────────────────────────────

export interface CreateExecutionJobInput {
  executorType: WorkExecutorType;
  trigger:      WorkExecutionTrigger;
  orgSlug:      string;
  approvalId:   string;
  payload:      WorkExecutionPayload;
  metadata?:    Record<string, unknown>;
}

export function createExecutionJob(input: CreateExecutionJobInput): WorkExecutionJob {
  return {
    id:           genId("wej"),
    executorType: input.executorType,
    status:       "PENDING",
    trigger:      input.trigger,
    orgSlug:      input.orgSlug,
    approvalId:   input.approvalId,
    payload:      input.payload,
    createdAt:    new Date().toISOString(),
    metadata:     input.metadata ?? {},
  };
}

// ── createExecutionJobFromApprovalEvent ───────────────────────────────────────

/**
 * Convenience factory: build a WorkExecutionJob directly from an ApprovalApprovedEvent.
 */
export function createExecutionJobFromApprovalEvent(
  event:        ApprovalApprovedEvent,
  executorType: WorkExecutorType,
  params?:      Record<string, unknown>,
): WorkExecutionJob {
  const job = createExecutionJob({
    executorType,
    trigger:   "APPROVAL_APPROVED",
    orgSlug:   event.orgSlug,
    approvalId: event.approvalId,
    payload: {
      params:   params ?? {},
      trigger: {
        approvalId:      event.approvalId,
        approvalTitle:   event.approvalTitle,
        approvalStatus:  event.approvalStatus,
        approvedBy:      event.approvedBy,
        approvedAt:      event.approvedAt,
        approvedByType:  event.approvedByType,
        orgSlug:         event.orgSlug,
        module:          event.module,
        entityType:      event.entityType,
        entityId:        event.entityId,
        navigationTarget: event.navigationTarget,
      },
      metadata: {
        impactSummary:    event.impactSummary,
        approvalCategory: event.approvalCategory,
        actionType:       event.actionType,
      },
    },
    metadata: {
      approvalCategory: event.approvalCategory,
      entityType:       event.entityType,
    },
  });
  // Propagate module + actionType for specialized executor routing
  job.module     = event.module;
  job.actionType = event.actionType;
  return job;
}

// ── createRetryExecutionJob ───────────────────────────────────────────────────

/**
 * Input accepted by createRetryExecutionJob.
 * Uses scalar fields only — no dependency on PersistedWorkExecution (server-only).
 */
export interface CreateRetryJobInput {
  /** ID of the original failed execution. */
  originalJobId:    string;
  executorType:     WorkExecutorType;
  trigger:          WorkExecutionTrigger;
  orgSlug:          string;
  approvalId:       string;
  /** Original payloadJson stored in DB — will be reused as-is. */
  originalPayload:  unknown;
  /** Current retry attempt count (original.retryAttempt). */
  originalAttempt:  number;
  maxRetryAttempts: number;
  actor:            WorkExecutionActor;
  reason?:          string;
  // Module executor routing (copied from original)
  module?:          string;
  actionType?:      string;
}

/**
 * Build a WorkExecutionJob for a manual retry of a failed execution.
 * The retry job gets a new ID but carries the original payload unchanged.
 */
export function createRetryExecutionJob(input: CreateRetryJobInput): WorkExecutionJob {
  const now = new Date().toISOString();
  return {
    id:                 genId("wej"),
    executorType:       input.executorType,
    status:             "PENDING",
    trigger:            input.trigger,
    orgSlug:            input.orgSlug,
    approvalId:         input.approvalId,
    payload:            (input.originalPayload ?? { params: {}, trigger: {}, metadata: {} }) as WorkExecutionPayload,
    createdAt:          now,
    metadata:           { isRetry: true, originalJobId: input.originalJobId },
    retryOfExecutionId: input.originalJobId,
    retryAttempt:       input.originalAttempt + 1,
    maxRetryAttempts:   input.maxRetryAttempts,
    retryReason:        input.reason,
    retriedBy:          input.actor,
    retriedAt:          now,
    // Copy module routing for specialized executor
    module:             input.module,
    actionType:         input.actionType,
  };
}

// ── createExecutionAudit ──────────────────────────────────────────────────────

export interface CreateExecutionAuditInput {
  jobId:     WorkExecutionJobId;
  event:     WorkExecutionAudit["event"];
  actorId:   string;
  actorType: WorkExecutionAudit["actorType"];
  message:   string;
  metadata?: Record<string, unknown>;
}

export function createExecutionAudit(input: CreateExecutionAuditInput): WorkExecutionAudit {
  return {
    id:         genId("wea"),
    jobId:      input.jobId,
    event:      input.event,
    actorId:    input.actorId,
    actorType:  input.actorType,
    message:    input.message,
    metadata:   input.metadata ?? {},
    occurredAt: new Date().toISOString(),
  };
}

// ── createExecutionResult ─────────────────────────────────────────────────────

export interface CreateExecutionResultInput {
  jobId:       WorkExecutionJobId;
  success:     boolean;
  status:      WorkExecutionStatus;
  message:     string;
  output?:     Record<string, unknown>;
  errors?:     WorkExecutionError[];
  warnings?:   string[];
  auditTrail?: WorkExecutionAudit[];
  startedAt:   string;
}

export function createExecutionResult(input: CreateExecutionResultInput): WorkExecutionResult {
  const completedAt = new Date().toISOString();
  const durationMs  = new Date(completedAt).getTime() - new Date(input.startedAt).getTime();

  return {
    id:          genId("wer"),
    jobId:       input.jobId,
    success:     input.success,
    status:      input.status,
    message:     input.message,
    output:      input.output     ?? {},
    errors:      input.errors     ?? [],
    warnings:    input.warnings   ?? [],
    auditTrail:  input.auditTrail ?? [],
    startedAt:   input.startedAt,
    completedAt,
    durationMs:  Math.max(0, durationMs),
  };
}

// ── createExecutionSummary ────────────────────────────────────────────────────

export function createExecutionSummary(jobs: WorkExecutionJob[]): WorkExecutionSummary {
  return {
    total:     jobs.length,
    pending:   jobs.filter(j => j.status === "PENDING").length,
    running:   jobs.filter(j => j.status === "RUNNING").length,
    completed: jobs.filter(j => j.status === "COMPLETED").length,
    failed:    jobs.filter(j => j.status === "FAILED").length,
    cancelled: jobs.filter(j => j.status === "CANCELLED").length,
  };
}

// ── createExecutionError ──────────────────────────────────────────────────────

export function createExecutionError(
  code:      string,
  message:   string,
  detail?:   string,
  retryable  = false,
): WorkExecutionError {
  return {
    code,
    message,
    detail,
    retryable,
    occurredAt: new Date().toISOString(),
  };
}
