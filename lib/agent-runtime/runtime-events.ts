/**
 * lib/agent-runtime/runtime-events.ts
 *
 * Agentik Agent Runtime — Runtime Events
 *
 * Typed event system for the agent runtime.
 * Events are emitted throughout the lifecycle and consumed by the audit layer.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

import type { AgentRuntimeId, AgentDomain, ActionStatus } from "./agent-types";
import { appendRuntimeEvent }   from "./event-store";
import { normalizeRuntimeEvent } from "./event-normalizer";

// ── Event types ───────────────────────────────────────────────────────────────

export type RuntimeEventType =
  // Agent lifecycle
  | "agent.invoked"
  | "agent.context_resolved"
  | "agent.signals_detected"
  | "agent.action_generated"
  // Tool execution
  | "tool.called"
  | "tool.completed"
  | "tool.failed"
  // Action lifecycle
  | "action.suggested"
  | "action.pending_approval"
  | "action.shown_to_user"
  | "action.approved"
  | "action.rejected"
  | "action.dismissed"
  | "action.executing"
  | "action.executed"
  | "action.failed"
  | "action.expired"
  // Tool execution kernel events
  | "tool.execution_requested"
  | "tool.execution_validating"
  | "tool.execution_started"
  | "tool.execution_succeeded"
  | "tool.execution_failed"
  | "tool.execution_rejected"
  | "tool.execution_skipped"
  // Execution session lifecycle events
  | "execution.session_created"
  | "execution.lease_acquired"
  | "execution.lease_released"
  | "execution.lease_expired"
  | "execution.heartbeat"
  | "execution.validating"
  | "execution.running"
  | "execution.succeeded"
  | "execution.failed"
  | "execution.timed_out"
  | "execution.canceled"
  | "execution.retry_scheduled"
  | "execution.retry_prepared"
  | "execution.skipped"
  | "execution.rejected"
  // Attempt-level lifecycle events
  | "execution.attempt_started"
  | "execution.attempt_succeeded"
  | "execution.attempt_failed"
  | "execution.attempt_timed_out"
  // Durability — store bootstrap, recovery, consistency
  | "execution.store_bootstrap"
  | "execution.recovered"
  | "execution.zombie_detected"
  | "execution.consistency_warning"
  // Memory
  | "memory.read"
  | "memory.written"
  // Workflow
  | "workflow.started"
  | "workflow.step_completed"
  | "workflow.completed"
  | "workflow.failed"
  // System
  | "context.snapshot_built"
  | "source.health_checked";

// ── Base event ────────────────────────────────────────────────────────────────

export interface RuntimeEvent {
  id:             string;
  type:           RuntimeEventType;
  organizationId: string;
  agentId:        AgentRuntimeId;
  domain:         AgentDomain;
  moduleKey:      string;
  timestamp:      string;  // ISO
  correlationId?: string;  // groups related events in a single invocation
  durationMs?:    number;
  metadata:       Record<string, unknown>;
}

// ── Specific event shapes ─────────────────────────────────────────────────────

export interface AgentInvokedEvent extends RuntimeEvent {
  type: "agent.invoked";
  metadata: {
    pathname:   string;
    userId:     string;
    hasContext: boolean;
  };
}

export interface ToolCalledEvent extends RuntimeEvent {
  type: "tool.called" | "tool.completed" | "tool.failed";
  metadata: {
    toolId:       string;
    inputSummary: string;
    errorMsg?:    string;
  };
}

export interface ActionStatusEvent extends RuntimeEvent {
  type:
    | "action.suggested"
    | "action.pending_approval"
    | "action.approved"
    | "action.rejected"
    | "action.dismissed"
    | "action.executing"
    | "action.executed"
    | "action.failed"
    | "action.expired";
  metadata: {
    actionId:    string;
    actionType:  string;
    prevStatus?: ActionStatus;
    newStatus:   ActionStatus;
    userId?:     string;   // for user-driven transitions (approve / dismiss / reject)
    errorMsg?:   string;
  };
}

// ── Event builder ─────────────────────────────────────────────────────────────

let _seq = 0;

export function buildRuntimeEvent<T extends RuntimeEvent>(
  partial: Omit<T, "id" | "timestamp">,
): T {
  return {
    ...partial,
    id:        `re_${Date.now()}_${++_seq}`,
    timestamp: new Date().toISOString(),
  } as T;
}

// ── Runtime event emitter ─────────────────────────────────────────────────────
//
// V1: development logging + returns serializable event.
// V2: pipe to a persistent event store (Prisma AgentRuntimeEvent model or external bus).

export function emitAgentRuntimeEvent<T extends RuntimeEvent>(
  partial: Omit<T, "id" | "timestamp">,
): T {
  const event = buildRuntimeEvent<T>(partial);

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log(
      `[AgentRuntime] ${event.type} | agent=${event.agentId} | module=${event.moduleKey} | org=${event.organizationId}`,
      JSON.stringify(event.metadata, null, 2),
    );
  }

  // Best-effort persist — never blocks or throws
  try {
    const stored = normalizeRuntimeEvent(event);
    void appendRuntimeEvent(stored);
  } catch {
    // Event store failure must never affect runtime or UI
  }

  return event;
}
