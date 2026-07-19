/**
 * lib/work/chaining/workflow-chain-types.ts
 *
 * Agentik — Workflow Chaining Domain Types
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Pure TypeScript. No React. No Prisma. No server-only.
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

export type WorkflowChainId = string;
export type WorkflowStepId  = string;
export type WorkflowRunId   = string;

// ── Enumerations ──────────────────────────────────────────────────────────────

export type WorkflowStepStatus =
  | "PENDING"           // Not yet reached
  | "READY"             // Inputs met, ready to execute
  | "RUNNING"           // Execution in progress
  | "COMPLETED"         // Finished successfully
  | "FAILED"            // Finished with error
  | "SKIPPED"           // Skipped per condition / onFailure = SKIP
  | "BLOCKED"           // Dependency not met
  | "WAITING_APPROVAL"; // Paused waiting for human approval

export type WorkflowChainStatus =
  | "PENDING"    // Created, not yet executing
  | "RUNNING"    // At least one step is executing or completed
  | "COMPLETED"  // All steps done successfully
  | "FAILED"     // A step failed and chain stopped
  | "CANCELLED"  // Manually cancelled
  | "BLOCKED";   // Cannot proceed (missing dependency, policy block)

export type WorkflowTriggerType =
  | "APPROVAL_APPROVED"    // Human approves → first step fires
  | "EXECUTION_COMPLETED"  // A previous execution finishes → chain continues
  | "MANUAL"               // Direct trigger from service or admin
  | "SCHEDULED";           // Time-based trigger (future)

export type WorkflowChainCategory =
  | "FINANCE"
  | "COMMERCIAL"
  | "MARKETING"
  | "COLLECTIONS"
  | "OPERATIONS";

export type WorkflowStepOnFailure = "STOP" | "SKIP";

// ── Step condition ─────────────────────────────────────────────────────────────

/**
 * Optional guard condition on a step.
 * Evaluated against the previous step result's output.
 */
export interface WorkflowStepCondition {
  /** JSON path into previous step output: "success", "output.amount", etc. */
  field:    string;
  operator: "equals" | "not_equals" | "exists" | "greater_than" | "less_than";
  value:    unknown;
}

// ── Step definition ───────────────────────────────────────────────────────────

/**
 * Immutable definition of one step in a workflow chain.
 * Registered in the chain registry. Never mutated at runtime.
 */
export interface WorkflowStepDefinition {
  id:          WorkflowStepId;
  label:       string;
  description: string;
  /** Domain module: "finanzas", "comercial", "marketing", "cobranza", "management" */
  module:      string;
  /** Module executor action type: "RECONCILIATION", "ORDER_RELEASE", etc. */
  actionType:  string;
  /**
   * If true, this step CANNOT execute automatically.
   * The chain creates an ApprovalRequest and waits for human approval.
   * Only once approved does execution proceed.
   */
  requiresApproval: boolean;
  /** Step IDs that must be COMPLETED before this step can run. */
  dependsOn?:       WorkflowStepId[];
  /** Guard condition evaluated against previous step output. */
  condition?:       WorkflowStepCondition;
  /** Template merged into the execution payload for this step. */
  payloadTemplate?: Record<string, unknown>;
  /** Explicitly defined next step on success. If omitted, uses array order. */
  onSuccess?:       WorkflowStepId;
  /** What to do if this step fails. Default: "STOP". */
  onFailure?:       WorkflowStepOnFailure;
  /** Max auto-retries before marking step FAILED. */
  maxRetries:       number;
  metadata:         Record<string, unknown>;
}

// ── Chain definition ──────────────────────────────────────────────────────────

/**
 * Immutable workflow chain definition.
 * Registered in the chain registry. Describes the full process.
 */
export interface WorkflowChainDefinition {
  id:          WorkflowChainId;
  name:        string;
  description: string;
  category:    WorkflowChainCategory;
  trigger:     WorkflowTriggerType;
  /** Ordered list of steps. Executed in array order unless onSuccess overrides. */
  steps:       WorkflowStepDefinition[];
  createdAt:   string;
  version:     string;
  isActive:    boolean;
  metadata:    Record<string, unknown>;
}

// ── Step result ───────────────────────────────────────────────────────────────

/**
 * Runtime state of one step within a live chain run.
 */
export interface WorkflowStepResult {
  stepId:       WorkflowStepId;
  status:       WorkflowStepStatus;
  /** ID of the WorkExecution that executed this step. */
  executionId?: string;
  /** ID of the ApprovalRequest created for this step (when requiresApproval). */
  approvalId?:  string;
  message:      string;
  startedAt?:   string;
  completedAt?: string;
  retryCount:   number;
  metadata:     Record<string, unknown>;
}

// ── Chain run ─────────────────────────────────────────────────────────────────

/**
 * Live instance of an executing workflow chain.
 * Created when the first step fires, destroyed when chain reaches terminal status.
 */
export interface WorkflowChainRun {
  id:                  WorkflowRunId;
  /** Deterministic deduplication key: "workflow:${chainId}:${triggerExecutionId}" */
  idempotencyKey?:     string;
  chainId:             WorkflowChainId;
  chainName:           string;
  orgSlug:             string;
  status:              WorkflowChainStatus;
  /** The WorkExecution that triggered the chain (first step or manual). */
  triggerExecutionId:  string;
  /** The ApprovalRequest that triggered the chain (if any). */
  triggerApprovalId?:  string;
  /** Step currently being executed or awaiting approval. */
  currentStepId:       WorkflowStepId | null;
  /** IDs of all steps completed so far. */
  completedStepIds:    WorkflowStepId[];
  /** Live results for each step touched so far. */
  stepResults:         WorkflowStepResult[];
  auditTrail:          WorkflowChainAuditEvent[];
  createdAt:           string;
  updatedAt:           string;
  completedAt?:        string;
  failedAt?:           string;
  metadata:            Record<string, unknown>;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export type WorkflowChainEventType =
  | "chain_started"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_skipped"
  | "approval_requested"
  | "chain_completed"
  | "chain_failed"
  | "chain_cancelled"
  | "chain_blocked"
  // Hardening events (AGENTIK-WORKFLOW-HARDENING-01)
  | "idempotency_hit"
  | "duplicate_step_prevented"
  | "duplicate_approval_prevented"
  | "duplicate_execution_prevented"
  | "chain_continuation_failed"
  | "chain_safety_limit_reached"
  | "processing_started"
  | "processing_completed"
  | "processing_released"
  | "dead_letter_recorded"
  | "recovery_candidate_found";

export interface WorkflowChainAuditEvent {
  id:            string;
  runId:         WorkflowRunId;
  stepId?:       WorkflowStepId;
  event:         WorkflowChainEventType;
  executionId?:  string;
  approvalId?:   string;
  message:       string;
  metadata:      Record<string, unknown>;
  occurredAt:    string;
}

// ── Stuck run report ──────────────────────────────────────────────────────────

/** Returned by recoverStuckRuns — read-only report, never mutates. */
export interface StuckRunReport {
  runId:             WorkflowRunId;
  chainId:           WorkflowChainId;
  chainName:         string;
  status:            WorkflowChainStatus;
  currentStepId:     WorkflowStepId | null;
  lastAuditEvent:    WorkflowChainAuditEvent | null;
  staleSinceMs:      number;
  recommendedAction: "retry_current_step" | "cancel" | "manual_review";
}
