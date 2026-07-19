/**
 * lib/agents/runtime/agent-execution-types.ts
 *
 * Agentik — Agent Execution Layer Types
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Defines the execution contract that sits between Agent Runtime and
 * Autonomous Operations.  Pure domain — no Prisma, no React, no Next.
 *
 * Mode ladder (least → most permissive):
 *   DISABLED < PREVIEW < PLAN_ONLY < APPROVAL_REQUIRED < SAFE_AUTOMATION < ASSISTED_EXECUTION
 */

import type { AgentId, AgentRunId }        from "./agent-runtime-types";
import type { AgentRuntimeContext }         from "./agent-context";
import type { AgentRuntimeResult }          from "./agent-runtime-result";
import type { AutonomousOperationPlan }     from "../../autonomous-operations/autonomous-operation-types";
import type { AutonomousOperationResult }   from "../../autonomous-operations/autonomous-operation-result";

// ── IDs ───────────────────────────────────────────────────────────────────────

export type AgentExecutionId     = string;
export type AgentExecutionPlanId = string;

// ── Execution mode ────────────────────────────────────────────────────────────

/**
 * Controls what the execution layer is allowed to do.
 *
 * DISABLED           — no operation allowed; analysis only
 * PREVIEW            — surface recommendations only; no plans, no side effects
 * PLAN_ONLY          — create plans (AutonomousOperationPlan) but never dispatch
 * APPROVAL_REQUIRED  — only CREATE_APPROVAL_DRAFT / escalations; no direct task creation
 * SAFE_AUTOMATION    — CREATE_TASK_DRAFT for LOW-risk actions only
 * ASSISTED_EXECUTION — CREATE_TASK_DRAFT + CREATE_APPROVAL_DRAFT; user reviews before action
 */
export type AgentExecutionMode =
  | "DISABLED"
  | "PREVIEW"
  | "PLAN_ONLY"
  | "APPROVAL_REQUIRED"
  | "SAFE_AUTOMATION"
  | "ASSISTED_EXECUTION";

// ── Step status ───────────────────────────────────────────────────────────────

export type AgentExecutionStatus =
  | "PLANNED"
  | "SKIPPED"
  | "BLOCKED"
  | "WAITING_APPROVAL"
  | "EXECUTED"
  | "FAILED"
  | "COMPLETED";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface AgentExecutionInput {
  /** Tenant slug. Required. */
  orgSlug:          string;
  /** Agent identifier: "diego" | "luca" | "mila". */
  agentId:          AgentId;
  /** Full runtime context — signals, profile, mode, memory, etc. */
  runtimeContext:   AgentRuntimeContext;
  /** Execution mode. Controls what the service is allowed to do. */
  executionMode:    AgentExecutionMode;
  /**
   * If set, only these ProposedAction IDs will be processed.
   * All others are skipped.
   */
  selectedActionIds?: string[];
  /**
   * Hard limit on the number of actions to process in one execution run.
   * Defaults to 5.
   */
  maxActions?:      number;
  /**
   * When true, no DB writes occur regardless of executionMode.
   * Equivalent to PLAN_ONLY but tracked separately for auditing.
   */
  dryRun:           boolean;
  metadata?:        Record<string, unknown>;
}

// ── Execution step ────────────────────────────────────────────────────────────

/** The outcome for a single ProposedAction within one execution run. */
export interface AgentExecutionStep {
  stepId:            string;
  actionId:          string;
  actionType:        string;
  actionLabel:       string;
  targetDomain:      string;
  targetModule:      string;
  status:            AgentExecutionStatus;
  /** The AutonomousOperationPlan that was created for this action. */
  plan?:             AutonomousOperationPlan;
  /** The AutonomousOperationResult if the plan was dispatched. */
  operationResult?:  AutonomousOperationResult;
  /** The idempotency key used (if any). */
  idempotencyKey?:   string;
  /** True when a prior record was found and reused. */
  alreadyProcessed?: boolean;
  existingEntityId?: string;
  existingEntityType?: string;
  /** ID of the Task created, if any. */
  createdTaskId?:    string;
  /** ID of the Approval created, if any. */
  createdApprovalId?: string;
  blockedReason?:    string;
  errors:            string[];
  warnings:          string[];
}

// ── Execution plan ────────────────────────────────────────────────────────────

/**
 * The output of planAgentExecution — NOT yet dispatched.
 * Maps each selected ProposedAction to an AutonomousOperationPlan.
 */
export interface AgentExecutionPlan {
  planId:           AgentExecutionPlanId;
  agentRunId:       AgentRunId;
  agentId:          AgentId;
  orgSlug:          string;
  executionMode:    AgentExecutionMode;
  dryRun:           boolean;
  runtimeResult:    AgentRuntimeResult;
  steps:            AgentExecutionStep[];
  plannedCount:     number;
  skippedCount:     number;
  blockedCount:     number;
  createdAt:        string;
  metadata?:        Record<string, unknown>;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export type AgentExecutionAuditEventType =
  | "agent_execution_planned"
  | "agent_execution_skipped"
  | "agent_action_selected"
  | "agent_action_blocked"
  | "agent_operation_planned"
  | "agent_operation_executed"
  | "agent_operation_waiting_approval"
  | "agent_operation_already_processed"
  | "agent_execution_completed"
  | "agent_execution_failed";

export interface AgentExecutionAuditEvent {
  id:          string;
  executionId: AgentExecutionId;
  agentId:     AgentId;
  orgSlug:     string;
  event:       AgentExecutionAuditEventType;
  message:     string;
  metadata?:   Record<string, unknown>;
  occurredAt:  string;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface AgentExecutionResult {
  success:              boolean;
  message:              string;
  agentRunId:           AgentRunId;
  agentId:              AgentId;
  executionMode:        AgentExecutionMode;
  dryRun:               boolean;
  /** The raw agent runtime output. */
  runtimeResult:        AgentRuntimeResult;
  /** Per-action execution steps. */
  steps:                AgentExecutionStep[];
  /** Operation results in the same order as steps. */
  operationResults:     AutonomousOperationResult[];
  executedCount:        number;
  plannedCount:         number;
  blockedCount:         number;
  waitingApprovalCount: number;
  alreadyProcessedCount: number;
  skippedCount:         number;
  /** IDs of all Tasks created during this execution. */
  createdTaskIds:       string[];
  /** IDs of all Approvals created during this execution. */
  createdApprovalIds:   string[];
  auditTrail:           AgentExecutionAuditEvent[];
  errors:               string[];
  warnings:             string[];
  completedAt?:         string;
  metadata?:            Record<string, unknown>;
}
