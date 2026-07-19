/**
 * lib/agents/runtime/agent-runtime-types.ts
 *
 * Agentik — Agent Runtime Core Types
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Pure domain types. No Prisma. No React. No Next.
 * Safe to import from any layer.
 */

// ── Branded ID types ──────────────────────────────────────────────────────────

export type AgentId          = string;
export type AgentRunId       = string;
export type AgentRuntimeId   = string;
export type AgentCapabilityId = string;
export type AgentMemoryId    = string;

// ── Runtime status ────────────────────────────────────────────────────────────

export type AgentRuntimeStatus =
  | "IDLE"
  | "ANALYZING"
  | "RECOMMENDING"
  | "WAITING_APPROVAL"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED";

// ── Runtime mode ──────────────────────────────────────────────────────────────

/**
 * Controls how much autonomy the agent has in this session.
 *
 * PREVIEW              — analyze and surface only, no drafts
 * ASSISTED             — can create task/approval/workflow drafts for user review
 * APPROVAL_REQUIRED    — all proposed actions require explicit human approval
 * AUTONOMOUS_DISABLED  — strictly recommend only, never propose executable actions
 */
export type AgentRuntimeMode =
  | "PREVIEW"
  | "ASSISTED"
  | "APPROVAL_REQUIRED"
  | "AUTONOMOUS_DISABLED";

// ── Domains ───────────────────────────────────────────────────────────────────

export type AgentRuntimeDomain =
  | "FINANCE"
  | "COLLECTIONS"
  | "COMMERCIAL"
  | "MARKETING"
  | "OPERATIONS"
  | "MANAGEMENT"
  | "SYSTEM";

// ── Event types ───────────────────────────────────────────────────────────────

export type AgentRuntimeEventType =
  | "runtime_started"
  | "profile_validated"
  | "context_validated"
  | "permissions_checked"
  | "decision_engine_started"
  | "decision_engine_completed"
  | "recommendation_mapped"
  | "action_filtered"
  | "action_proposed"
  | "runtime_completed"
  | "runtime_failed"
  | "validation_error"
  | "permission_denied";

// ── Action types ──────────────────────────────────────────────────────────────

export type AgentRuntimeActionType =
  | "ANALYZE_SIGNALS"
  | "RUN_DECISION_ENGINE"
  | "RECOMMEND_ACTION"
  | "CREATE_TASK_DRAFT"
  | "CREATE_APPROVAL_DRAFT"
  | "START_WORKFLOW_DRAFT"
  | "ESCALATE_TO_USER"
  | "NO_ACTION";

// ── Risk levels ───────────────────────────────────────────────────────────────

export type AgentRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Audit event ───────────────────────────────────────────────────────────────

export interface AgentRuntimeAuditEvent {
  id:         string;
  runId:      AgentRunId;
  agentId:    AgentId;
  event:      AgentRuntimeEventType;
  message:    string;
  metadata?:  Record<string, unknown>;
  occurredAt: string;
}
