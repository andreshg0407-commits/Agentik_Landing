/**
 * lib/copilot/memory-planning/memory-planning-audit.ts
 *
 * Agentik — Copilot Memory-Aware Planning — Audit Trail
 * Sprint: AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 *
 * Audit events for all memory-aware planning operations.
 * All events are serializable JSON objects.
 * No Prisma. No persistence yet.
 */

import type { MemoryPlanningSignalType, PlanningSignalStrength, CopilotPlanPriority } from "./memory-planning-types";
import type { AgentId }   from "@/lib/agents/runtime/agent-types";
import type { CopilotDomain } from "./memory-planning-types";

// ── Event types ───────────────────────────────────────────────────────────────

export type MemoryPlanningAuditEventType =
  | "memory_signals_extracted"
  | "memory_agent_added"
  | "memory_warning_added"
  | "memory_suggested_action_added"
  | "memory_plan_priority_calculated"
  | "memory_planning_failed";

// ── Event shape ───────────────────────────────────────────────────────────────

export interface MemoryPlanningAuditEvent {
  id:         string;
  orgSlug:    string;
  requestId:  string;
  type:       MemoryPlanningAuditEventType;
  message:    string;
  metadata:   Record<string, unknown>;
  occurredAt: string;
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `mpaud-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPlanningAuditEvent(
  orgSlug:   string,
  requestId: string,
  type:      MemoryPlanningAuditEventType,
  message:   string,
  metadata:  Record<string, unknown> = {},
): MemoryPlanningAuditEvent {
  return {
    id:         nextId(),
    orgSlug,
    requestId,
    type,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

// ── Typed event constructors ──────────────────────────────────────────────────

export function auditSignalsExtracted(
  orgSlug:   string,
  requestId: string,
  count:     number,
  memoryCount: number,
): MemoryPlanningAuditEvent {
  return createPlanningAuditEvent(
    orgSlug, requestId,
    "memory_signals_extracted",
    `${count} planning signal(s) extracted from ${memoryCount} memory entry/entries.`,
    { signalCount: count, memoryCount },
  );
}

export function auditAgentAdded(
  orgSlug:   string,
  requestId: string,
  agentId:   AgentId,
  reason:    string,
  signalType: MemoryPlanningSignalType,
): MemoryPlanningAuditEvent {
  return createPlanningAuditEvent(
    orgSlug, requestId,
    "memory_agent_added",
    `Agent "${agentId}" added to plan via memory signal (${signalType}): ${reason}`,
    { agentId, reason, signalType },
  );
}

export function auditWarningAdded(
  orgSlug:   string,
  requestId: string,
  warning:   string,
  memoryId:  string,
): MemoryPlanningAuditEvent {
  return createPlanningAuditEvent(
    orgSlug, requestId,
    "memory_warning_added",
    `Warning added from memory ${memoryId}: ${warning.slice(0, 100)}`,
    { warning: warning.slice(0, 200), memoryId },
  );
}

export function auditSuggestedActionAdded(
  orgSlug:   string,
  requestId: string,
  action:    string,
  memoryId:  string,
): MemoryPlanningAuditEvent {
  return createPlanningAuditEvent(
    orgSlug, requestId,
    "memory_suggested_action_added",
    `Suggested action from memory ${memoryId}: ${action.slice(0, 100)}`,
    { action: action.slice(0, 200), memoryId },
  );
}

export function auditPriorityCalculated(
  orgSlug:   string,
  requestId: string,
  priority:  CopilotPlanPriority,
  signalCount: number,
): MemoryPlanningAuditEvent {
  return createPlanningAuditEvent(
    orgSlug, requestId,
    "memory_plan_priority_calculated",
    `Plan priority calculated: ${priority} (from ${signalCount} signal(s)).`,
    { priority, signalCount },
  );
}

export function auditPlanningFailed(
  orgSlug:   string,
  requestId: string,
  error:     string,
): MemoryPlanningAuditEvent {
  return createPlanningAuditEvent(
    orgSlug, requestId,
    "memory_planning_failed",
    `Memory-aware planning failed (non-blocking): ${error}`,
    { error },
  );
}

// ── Log ───────────────────────────────────────────────────────────────────────

export class MemoryPlanningAuditLog {
  private _events: MemoryPlanningAuditEvent[] = [];

  push(event: MemoryPlanningAuditEvent): void {
    this._events.push(event);
  }

  getAll(): MemoryPlanningAuditEvent[] {
    return [...this._events];
  }

  getByType(type: MemoryPlanningAuditEventType): MemoryPlanningAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  count(): number {
    return this._events.length;
  }
}

/** Process-level planning audit log — non-persisted. */
export const globalPlanningAuditLog = new MemoryPlanningAuditLog();
