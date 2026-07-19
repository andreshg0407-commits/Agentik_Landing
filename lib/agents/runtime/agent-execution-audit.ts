/**
 * lib/agents/runtime/agent-execution-audit.ts
 *
 * Agentik — Agent Execution Audit Events
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Pure audit helpers for the execution layer.
 * No side effects. No Prisma. No React. No Next.
 */

import type {
  AgentExecutionAuditEvent,
  AgentExecutionAuditEventType,
  AgentExecutionId,
} from "./agent-execution-types";
import type { AgentId } from "./agent-runtime-types";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextAuditId(): string {
  _seq++;
  return `aex_audit_${Date.now()}_${(_seq).toString(36)}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAgentExecutionAuditEvent(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  event:       AgentExecutionAuditEventType,
  message:     string,
  metadata?:   Record<string, unknown>,
): AgentExecutionAuditEvent {
  return {
    id:          nextAuditId(),
    executionId,
    agentId,
    orgSlug,
    event,
    message,
    metadata,
    occurredAt:  new Date().toISOString(),
  };
}

// ── Semantic helpers ──────────────────────────────────────────────────────────

export function auditExecutionPlanned(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  planCount:   number,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_execution_planned",
    `Agent execution planned: ${planCount} action(s) queued`,
    { planCount },
  );
}

export function auditExecutionSkipped(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  reason:      string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_execution_skipped",
    `Agent execution skipped: ${reason}`,
    { reason },
  );
}

export function auditActionSelected(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  actionId:    string,
  actionType:  string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_action_selected",
    `Action selected for execution: ${actionType} [${actionId}]`,
    { actionId, actionType },
  );
}

export function auditActionBlocked(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  actionId:    string,
  actionType:  string,
  reason:      string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_action_blocked",
    `Action blocked: ${actionType} [${actionId}] — ${reason}`,
    { actionId, actionType, reason },
  );
}

export function auditOperationPlanned(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  actionId:    string,
  planId:      string,
  decision:    string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_operation_planned",
    `Operation planned: decision=${decision} [planId=${planId}]`,
    { actionId, planId, decision },
  );
}

export function auditOperationExecuted(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  actionId:    string,
  entityType:  string,
  entityId:    string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_operation_executed",
    `Operation executed: ${entityType} created [id=${entityId}]`,
    { actionId, entityType, entityId },
  );
}

export function auditOperationWaitingApproval(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  actionId:    string,
  approvalId:  string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_operation_waiting_approval",
    `Operation waiting approval [approvalId=${approvalId}]`,
    { actionId, approvalId },
  );
}

export function auditOperationAlreadyProcessed(
  executionId:      AgentExecutionId,
  agentId:          AgentId,
  orgSlug:          string,
  actionId:         string,
  existingEntityId: string,
  idempotencyKey:   string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_operation_already_processed",
    `Idempotency hit: existing entity reused [id=${existingEntityId}]`,
    { actionId, existingEntityId, idempotencyKey },
  );
}

export function auditExecutionCompleted(
  executionId:   AgentExecutionId,
  agentId:       AgentId,
  orgSlug:       string,
  executedCount: number,
  blockedCount:  number,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_execution_completed",
    `Agent execution completed: ${executedCount} executed, ${blockedCount} blocked`,
    { executedCount, blockedCount },
  );
}

export function auditExecutionFailed(
  executionId: AgentExecutionId,
  agentId:     AgentId,
  orgSlug:     string,
  error:       string,
): AgentExecutionAuditEvent {
  return createAgentExecutionAuditEvent(
    executionId, agentId, orgSlug,
    "agent_execution_failed",
    `Agent execution failed: ${error}`,
    { error },
  );
}
