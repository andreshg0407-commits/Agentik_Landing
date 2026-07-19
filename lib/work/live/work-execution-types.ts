/**
 * lib/work/live/work-execution-types.ts
 *
 * Agentik — Live Work Execution Domain Types
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * Type system for the real (post-approval) work execution layer.
 * Separate from lib/work/work-types.ts (simulation layer).
 *
 * Architecture boundary: No React · No Prisma · No Next.js · Pure domain types.
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

export type WorkExecutionJobId    = string;
export type WorkExecutionAuditId  = string;
export type WorkExecutionResultId = string;

// ── Actor ─────────────────────────────────────────────────────────────────────

/**
 * Identifies who initiated a retry (or other actor-driven action).
 * Intentionally simple — mirrors ApprovalActor without importing from approvals domain.
 */
export interface WorkExecutionActor {
  id:   string;
  type: "USER" | "AGENT" | "SYSTEM";
  name: string;
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Lifecycle states of a live work execution job.
 */
export type WorkExecutionStatus =
  | "PENDING"    // Created, not yet dispatched
  | "QUEUED"     // Accepted by dispatcher, waiting for executor
  | "RUNNING"    // Executor is actively processing
  | "COMPLETED"  // Execution finished successfully
  | "FAILED"     // Execution failed — may be retryable
  | "CANCELLED"; // Manually cancelled before or during execution

// ── Trigger source ────────────────────────────────────────────────────────────

/**
 * What triggered this execution.
 * APPROVAL_APPROVED is the primary trigger in this sprint.
 */
export type WorkExecutionTrigger =
  | "APPROVAL_APPROVED"  // Human approved a CopilotApproval
  | "MANUAL"             // Triggered directly by a user
  | "SCHEDULED"          // Scheduled job
  | "WEBHOOK"            // External webhook event
  | "SYSTEM";            // Internal system trigger

// ── Executor type ─────────────────────────────────────────────────────────────

/**
 * Canonical executor identifiers.
 * Maps to concrete executor implementations.
 */
export type WorkExecutorType =
  | "TASK_ASSIGNMENT"
  | "REPORT_GENERATION"
  | "DOCUMENT_GENERATION"
  | "CONCILIATION_APPROVAL"
  | "PORTFOLIO_TRANSFER"
  | "CAMPAIGN_LAUNCH"
  | "WORKFLOW_EXECUTION";

// ── Triggering approval context ───────────────────────────────────────────────

/**
 * Snapshot of the approval that triggered this execution.
 * Immutable after creation — the source of truth for audit.
 */
export interface WorkExecutionTriggerContext {
  approvalId:      string;
  approvalTitle:   string;
  approvalStatus:  string;
  approvedBy:      string;
  approvedAt:      string;
  approvedByType:  "USER" | "AGENT" | "SYSTEM";
  orgSlug:         string;
  module?:         string;
  entityType?:     string;
  entityId?:       string;
  navigationTarget?: string;
}

// ── Execution payload ─────────────────────────────────────────────────────────

/**
 * Input data passed to the executor.
 * Structured, not arbitrary — each executor defines its own schema.
 */
export interface WorkExecutionPayload {
  /** Executor-specific parameters. */
  params:      Record<string, unknown>;
  /** Trigger context — always present for APPROVAL_APPROVED executions. */
  trigger:     WorkExecutionTriggerContext;
  /** Execution metadata. */
  metadata:    Record<string, unknown>;
}

// ── Execution job ─────────────────────────────────────────────────────────────

/**
 * The execution job — the runtime instance of a unit of work.
 * Created by the Dispatcher when an approval is approved.
 */
export interface WorkExecutionJob {
  id:           WorkExecutionJobId;
  executorType: WorkExecutorType;
  status:       WorkExecutionStatus;
  trigger:      WorkExecutionTrigger;
  orgSlug:      string;
  approvalId:   string;
  payload:      WorkExecutionPayload;
  createdAt:    string;
  startedAt?:   string;
  completedAt?: string;
  failedAt?:    string;
  metadata:     Record<string, unknown>;
  // Module executor routing
  module?:      string;
  actionType?:  string;
  // ── Retry fields ─────────────────────────────────────────────────────────────
  retryOfExecutionId?: string;
  retryAttempt?:       number;
  maxRetryAttempts?:   number;
  retryReason?:        string;
  retriedBy?:          WorkExecutionActor;
  retriedAt?:          string;
}

// ── Execution audit event ─────────────────────────────────────────────────────

/**
 * A single audit event in an execution's history.
 */
export interface WorkExecutionAudit {
  id:          WorkExecutionAuditId;
  jobId:       WorkExecutionJobId;
  event:       "created" | "queued" | "started" | "completed" | "failed" | "cancelled";
  actorId:     string;
  actorType:   "USER" | "AGENT" | "SYSTEM" | "EXECUTOR";
  message:     string;
  metadata:    Record<string, unknown>;
  occurredAt:  string;
}

// ── Execution error ───────────────────────────────────────────────────────────

export interface WorkExecutionError {
  code:       string;
  message:    string;
  detail?:    string;
  retryable:  boolean;
  occurredAt: string;
}

// ── Execution result ─────────────────────────────────────────────────────────

/**
 * Result returned by an executor after completing (or failing) a job.
 */
export interface WorkExecutionResult {
  id:          WorkExecutionResultId;
  jobId:       WorkExecutionJobId;
  success:     boolean;
  status:      WorkExecutionStatus;
  message:     string;
  /** Structured output from the executor. */
  output:      Record<string, unknown>;
  errors:      WorkExecutionError[];
  warnings:    string[];
  /** Audit trail produced during execution. */
  auditTrail:  WorkExecutionAudit[];
  startedAt:   string;
  completedAt: string;
  durationMs:  number;
}

// ── Execution summary ─────────────────────────────────────────────────────────

/**
 * Aggregate summary over a set of executions.
 */
export interface WorkExecutionSummary {
  total:     number;
  pending:   number;
  running:   number;
  completed: number;
  failed:    number;
  cancelled: number;
}

// ── Approval-approved event ───────────────────────────────────────────────────

/**
 * Domain event emitted when a human approves an ApprovalRequest.
 * Consumed by the event bridge to trigger work execution.
 */
export interface ApprovalApprovedEvent {
  approvalId:      string;
  approvalTitle:   string;
  approvalStatus:  "APPROVED";
  approvalCategory: string;
  approvedBy:      string;
  approvedByType:  "USER" | "AGENT" | "SYSTEM";
  approvedAt:      string;
  orgSlug:         string;
  module?:         string;
  actionType?:     string;
  entityType?:     string;
  entityId?:       string;
  navigationTarget?: string;
  impactSummary?:  string;
}
