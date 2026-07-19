/**
 * lib/agent-runtime/audit.ts
 *
 * Agentik Agent Runtime — Audit Trail Types
 *
 * Every agent action, tool call, and workflow step must leave an immutable audit record.
 * This is non-negotiable for an enterprise OS — decisions must be traceable.
 *
 * This file defines types only. The storage implementation uses Prisma and lives in lib/agentik/.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

import type { AgentRuntimeId, AgentDomain, ActionStatus } from "./agent-types";

// ── Audit record types ────────────────────────────────────────────────────────

export type AuditRecordType =
  | "action"    // AgentAction lifecycle event
  | "tool"      // Tool call (read or write)
  | "workflow"  // Workflow step execution
  | "context"   // Context snapshot (for traceability of what data the agent saw)
  | "signal"    // Signal detected/resolved
  | "memory";   // Memory read/write

// ── Audit record ──────────────────────────────────────────────────────────────

export interface AuditRecord {
  id:             string;
  type:           AuditRecordType;
  organizationId: string;
  moduleKey:      string;
  domain:         AgentDomain;
  agentId:        AgentRuntimeId;
  /** User who triggered or approved the audited event. Null for automated events. */
  userId?:        string;
  /** Correlation ID linking all events in a single agent invocation */
  correlationId?: string;
  /** Human-readable summary of what happened */
  summary:        string;
  /** Full payload (inputs, outputs, before/after states) */
  payload:        Record<string, unknown>;
  /** ISO timestamp */
  timestamp:      string;
  /** Duration in ms for tool/workflow records */
  durationMs?:    number;
  /** true when the record represents a successful outcome */
  success:        boolean;
  /** Error message when success=false */
  errorMsg?:      string;
}

// ── Action audit record ───────────────────────────────────────────────────────

export interface ActionAuditRecord extends AuditRecord {
  type: "action";
  payload: {
    actionId:    string;
    actionType:  string;
    prevStatus:  ActionStatus;
    newStatus:   ActionStatus;
    approvedBy?: string;   // userId
    dismissedBy?: string;  // userId
    executionResult?: unknown;
  };
}

// ── Tool audit record ─────────────────────────────────────────────────────────

export interface ToolAuditRecord extends AuditRecord {
  type: "tool";
  payload: {
    toolId:      string;
    toolName:    string;
    permission:  string;
    input:       Record<string, unknown>;
    output?:     unknown;
    errorMsg?:   string;
  };
}

// ── Audit trail (collection of records per action/workflow) ───────────────────

export interface AuditTrail {
  entityId:   string;   // actionId or workflowId
  entityType: "action" | "workflow";
  records:    AuditRecord[];
  startedAt:  string;
  completedAt?: string;
  finalStatus?: string;
}

// ── Immutability rule ─────────────────────────────────────────────────────────
//
// Audit records must NEVER be deleted or modified after creation.
// This is enforced at the application layer (no update operations on audit tables).
// Storage: Prisma append-only table (no Update, no Delete in service layer).

// ── Builder helper ────────────────────────────────────────────────────────────

let _auditSeq = 0;

/**
 * Create an immutable audit record for an agent action lifecycle event.
 *
 * Usage:
 *   const record = createAgentAuditRecord({
 *     organizationId: org.id,
 *     agentId:        "david_commercial",
 *     domain:         "commercial",
 *     moduleKey:      "comercial.maletas",
 *     userId:         user.id,
 *     actionId:       action.id,
 *     actionType:     action.type,
 *     prevStatus:     "pending_approval",
 *     newStatus:      "approved",
 *     summary:        "Production request approved by coordinator",
 *     success:        true,
 *   });
 *
 * V1: returned record is logged / stored in payloadJson of ActionTask.
 * V2: persisted to AgentAuditRecord Prisma model.
 */
export function createAgentAuditRecord(params: {
  organizationId: string;
  agentId:        AgentRuntimeId;
  domain:         AgentDomain;
  moduleKey:      string;
  userId?:        string;
  correlationId?: string;
  actionId:       string;
  actionType:     string;
  prevStatus:     ActionStatus;
  newStatus:      ActionStatus;
  summary:        string;
  success:        boolean;
  errorMsg?:      string;
  /** Optional SHA-256 of the action payload — for tamper detection in V2 */
  payloadHash?:   string;
}): ActionAuditRecord {
  const now = new Date().toISOString();
  return {
    id:             `aar_${Date.now()}_${++_auditSeq}`,
    type:           "action",
    organizationId: params.organizationId,
    moduleKey:      params.moduleKey,
    domain:         params.domain,
    agentId:        params.agentId,
    userId:         params.userId,
    correlationId:  params.correlationId,
    summary:        params.summary,
    payload: {
      actionId:    params.actionId,
      actionType:  params.actionType,
      prevStatus:  params.prevStatus,
      newStatus:   params.newStatus,
      ...(params.newStatus === "approved" && params.userId ? { approvedBy: params.userId } : {}),
      ...(params.newStatus === "dismissed" && params.userId ? { dismissedBy: params.userId } : {}),
      ...(params.payloadHash ? { payloadHash: params.payloadHash } : {}),
    },
    timestamp:  now,
    success:    params.success,
    errorMsg:   params.errorMsg,
  };
}
