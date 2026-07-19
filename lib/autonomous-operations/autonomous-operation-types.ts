/**
 * lib/autonomous-operations/autonomous-operation-types.ts
 *
 * Agentik — Autonomous Operations Core Types
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Pure domain types. No Prisma. No React. No Next.
 * Safe to import from any layer.
 */

// ── Branded ID types ──────────────────────────────────────────────────────────

export type AutonomousOperationId       = string;
export type AutonomousOperationRunId    = string;
export type AutonomousOperationPlanId   = string;
export type AutonomousOperationPolicyId = string;

// ── Status ────────────────────────────────────────────────────────────────────

export type AutonomousOperationStatus =
  | "DRAFT"
  | "PLANNED"
  | "BLOCKED"
  | "WAITING_APPROVAL"
  | "READY_TO_EXECUTE"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

// ── Mode ──────────────────────────────────────────────────────────────────────

/**
 * Controls what the Autonomous Operations layer is allowed to do.
 *
 * PREVIEW            — surface only; no creates, no dispatches
 * ASSISTED           — create task/approval drafts with human confirmation
 * APPROVAL_REQUIRED  — create approval request only; no direct task/workflow
 * SAFE_AUTOMATION    — allow CREATE_TASK_ONLY for LOW risk; everything else requires approval
 * AUTONOMOUS_DISABLED — escalate or no_action only; no real creates
 */
export type AutonomousOperationMode =
  | "PREVIEW"
  | "ASSISTED"
  | "APPROVAL_REQUIRED"
  | "SAFE_AUTOMATION"
  | "AUTONOMOUS_DISABLED";

// ── Risk level ────────────────────────────────────────────────────────────────

export type AutonomousOperationRiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

// ── Decision ──────────────────────────────────────────────────────────────────

/**
 * What the policy engine decides to do with a ProposedAction.
 */
export type AutonomousOperationDecision =
  | "ALLOW_AUTO_EXECUTE"
  | "REQUIRE_APPROVAL"
  | "CREATE_TASK_ONLY"
  | "CREATE_APPROVAL_ONLY"
  | "START_WORKFLOW"
  | "ESCALATE_TO_USER"
  | "BLOCK"
  | "NO_ACTION";

// ── Source / Target / Actor ───────────────────────────────────────────────────

export type AutonomousOperationSource =
  | "AGENT_RUNTIME"
  | "COPILOT"
  | "SYSTEM"
  | "USER";

export interface AutonomousOperationTarget {
  domain:       string;
  module:       string;
  entityType?:  string;
  entityId?:    string;
}

export interface AutonomousOperationActor {
  agentId:    string;
  agentName:  string;
  userId?:    string;
  userRole?:  string;
}

// ── Input ─────────────────────────────────────────────────────────────────────

export interface AutonomousOperationInput {
  orgSlug:          string;
  organizationId?:  string;
  agentId:          string;
  agentName:        string;
  agentDomain:      string;
  runtimeMode:      AutonomousOperationMode;
  proposedAction:   import("../agents/runtime/agent-runtime-result").ProposedAction;
  decisionResult?:  import("../decisions/decision-result").DecisionEngineResult;
  sourceRunId?:     string;
  idempotencyKey?:  string;
  currentUserId?:   string;
  currentUserRole?: string;
  metadata:         Record<string, unknown>;
}

// ── Draft types ───────────────────────────────────────────────────────────────

export interface TaskDraft {
  title:          string;
  description:    string;
  domain:         string;
  module:         string;
  priority:       "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignedAgentId?: string;
  entityType?:    string;
  entityId?:      string;
  dueAt?:         string;
  sourceSignalId?: string;
  metadata?:      Record<string, unknown>;
}

export interface ApprovalDraft {
  title:           string;
  description:     string;
  domain:          string;
  module:          string;
  actionType:      string;
  requestedBy:     string;
  entityType?:     string;
  entityId?:       string;
  businessContext?: Record<string, unknown>;
  expiresAt?:      string;
  metadata?:       Record<string, unknown>;
}

export interface WorkflowDraft {
  chainId:         string;
  triggerPayload:  Record<string, unknown>;
  requiresApproval: boolean;
  metadata?:       Record<string, unknown>;
}

export interface EscalationPayload {
  title:           string;
  description:     string;
  urgency:         "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  agentId:         string;
  targetModule:    string;
  navigationTarget?: string;
  metadata?:       Record<string, unknown>;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export type AutonomousOperationEventType =
  | "operation_planned"
  | "operation_blocked"
  | "operation_waiting_approval"
  | "operation_task_created"
  | "operation_approval_created"
  | "operation_escalated"
  | "operation_completed"
  | "operation_failed"
  | "operation_cancelled"
  | "policy_applied"
  | "guardrail_blocked"
  | "guardrail_passed"
  | "validation_error"
  | "idempotency_key_created"
  | "idempotency_hit"
  | "idempotency_miss";

export interface AutonomousOperationAuditEvent {
  id:          string;
  planId:      AutonomousOperationPlanId;
  agentId:     string;
  orgSlug:     string;
  event:       AutonomousOperationEventType;
  message:     string;
  metadata?:   Record<string, unknown>;
  occurredAt:  string;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface AutonomousOperationPlan {
  id:                       AutonomousOperationPlanId;
  inputId:                  string;
  agentId:                  string;
  orgSlug:                  string;
  status:                   AutonomousOperationStatus;
  decision:                 AutonomousOperationDecision;
  riskLevel:                AutonomousOperationRiskLevel;
  requiresApproval:         boolean;
  requiresHumanConfirmation: boolean;
  canAutoExecute:           boolean;
  actionType:               string;
  targetDomain:             string;
  targetModule:             string;
  title:                    string;
  description:              string;
  reasoning:                string;
  payload:                  Record<string, unknown>;
  navigationTarget?:        string;
  approvalDraft?:           ApprovalDraft;
  taskDraft?:               TaskDraft;
  workflowDraft?:           WorkflowDraft;
  escalationPayload?:       EscalationPayload;
  auditTrail:               AutonomousOperationAuditEvent[];
  errors:                   string[];
  warnings:                 string[];
  idempotencyKey?:          string;
  createdAt:                string;
  metadata:                 Record<string, unknown>;
}
