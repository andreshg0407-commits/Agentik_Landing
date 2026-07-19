/**
 * lib/copilot/execution-lifecycle.ts
 *
 * Agentik Copilot — Execution Lifecycle Tracking V3
 *
 * Phase 6 of Sprint AGENTIK-EXECUTION-LAYER-V3-CONTROLLED-OPS-01
 *
 * Tracks the full event log of a supervised execution session.
 * Every transition — preparation, approval, execution, completion,
 * failure, and rollback — generates an immutable lifecycle event.
 *
 * Append-only. Never update or delete events.
 *
 * V3: in-memory lifecycle; no Prisma persistence yet.
 * V4: backed by Prisma.CopilotExecutionLifecycleEvent.
 */

import type { SupervisedExecution, SupervisedExecutionStatus } from "./supervised-execution";
import type { RollbackOperation }                               from "./execution-rollback";
import type { ExecutionConfirmation }                           from "./execution-confirmation";

// ── Types ──────────────────────────────────────────────────────────────────────

export type LifecycleEventType =
  | "prepared"             // Execution draft prepared
  | "confirmation_sent"    // Confirmation sent to operator
  | "approved"             // Operator approved execution
  | "denied"               // Operator denied execution
  | "execution_started"    // Execution began
  | "execution_completed"  // Execution completed successfully
  | "execution_failed"     // Execution failed
  | "rollback_triggered"   // Rollback was triggered
  | "rollback_completed"   // Rollback completed
  | "rollback_failed"      // Rollback failed
  | "expired";             // Confirmation or execution window expired

export interface ExecutionLifecycleEvent {
  id:          string;
  executionId: string;
  type:        LifecycleEventType;
  state:       string;       // SupervisedExecutionStatus at time of event
  timestamp:   string;       // ISO string
  summary:     string;       // Human-readable description
  actor:       string;       // "agent:{agentId}" | "operator" | "system"
}

export interface ExecutionLifecycle {
  executionId: string;
  events:      ExecutionLifecycleEvent[];
  currentState: string;     // Latest SupervisedExecutionStatus
  latestSummary: string;    // Latest event summary
}

// ── Builder ──────────────────────────────────────────────────────────────────────

/**
 * Builds the initial lifecycle for a newly prepared supervised execution.
 */
export function buildExecutionLifecycle(
  execution: SupervisedExecution,
): ExecutionLifecycle {
  const events: ExecutionLifecycleEvent[] = [
    {
      id:          crypto.randomUUID(),
      executionId: execution.id,
      type:        "prepared",
      state:       "prepared",
      timestamp:   execution.preparedAt,
      summary:     `Ejecución preparada — ${execution.actions.length} acción${execution.actions.length !== 1 ? "es" : ""} · modo ${execution.executionMode}`,
      actor:       `agent:${execution.agentId}`,
    },
  ];

  // If confirmation was already requested (bundle requires approval), add event
  if (execution.status === "awaiting_confirmation") {
    events.push({
      id:          crypto.randomUUID(),
      executionId: execution.id,
      type:        "confirmation_sent",
      state:       "awaiting_confirmation",
      timestamp:   new Date(new Date(execution.preparedAt).getTime() + 100).toISOString(),
      summary:     "Confirmación enviada al operador — esperando aprobación",
      actor:       `agent:${execution.agentId}`,
    });
  }

  return {
    executionId:   execution.id,
    events,
    currentState:  execution.status,
    latestSummary: events[events.length - 1]?.summary ?? "",
  };
}

/**
 * Appends a new event to the lifecycle based on a state transition.
 * Immutable: returns a new lifecycle object.
 */
export function appendExecutionLifecycleEvent(
  lifecycle:     ExecutionLifecycle,
  type:          LifecycleEventType,
  state:         SupervisedExecutionStatus,
  summary:       string,
  actor:         string = "system",
): ExecutionLifecycle {
  const event: ExecutionLifecycleEvent = {
    id:          crypto.randomUUID(),
    executionId: lifecycle.executionId,
    type,
    state,
    timestamp:   new Date().toISOString(),
    summary,
    actor,
  };

  return {
    ...lifecycle,
    events:        [...lifecycle.events, event],
    currentState:  state,
    latestSummary: summary,
  };
}

/**
 * Builds a lifecycle from a confirmation decision.
 */
export function appendConfirmationEvent(
  lifecycle:     ExecutionLifecycle,
  confirmation:  ExecutionConfirmation,
): ExecutionLifecycle {
  if (confirmation.confirmationState === "approved") {
    return appendExecutionLifecycleEvent(
      lifecycle,
      "approved",
      "approved",
      "Operador aprobó la ejecución supervisada",
      "operator",
    );
  }
  if (confirmation.confirmationState === "denied") {
    return appendExecutionLifecycleEvent(
      lifecycle,
      "denied",
      "failed",
      `Operador denegó la ejecución — ${confirmation.denialReason ?? "sin motivo especificado"}`,
      "operator",
    );
  }
  if (confirmation.confirmationState === "expired") {
    return appendExecutionLifecycleEvent(
      lifecycle,
      "expired",
      "failed",
      "Ventana de confirmación expirada — operación cancelada",
      "system",
    );
  }
  return lifecycle;
}

/**
 * Builds a lifecycle from a rollback operation.
 */
export function appendRollbackEvent(
  lifecycle:  ExecutionLifecycle,
  rollback:   RollbackOperation,
): ExecutionLifecycle {
  if (rollback.rollbackState === "in_progress") {
    return appendExecutionLifecycleEvent(
      lifecycle,
      "rollback_triggered",
      "rolled_back",
      `Reversión iniciada — ${rollback.rollbackReason}`,
      "operator",
    );
  }
  if (rollback.rollbackState === "completed") {
    return appendExecutionLifecycleEvent(
      lifecycle,
      "rollback_completed",
      "rolled_back",
      "Reversión completada correctamente",
      "system",
    );
  }
  return lifecycle;
}

/**
 * Returns a human-readable lifecycle summary for rail and audit display.
 */
export function summarizeExecutionLifecycle(
  lifecycle: ExecutionLifecycle | null,
): string {
  if (!lifecycle || lifecycle.events.length === 0) return "Sin historial de ejecución";

  const count  = lifecycle.events.length;
  const latest = lifecycle.latestSummary;
  return `${count} evento${count !== 1 ? "s" : ""} · ${latest}`;
}

/**
 * Returns the last N lifecycle events in reverse-chronological order.
 * Safe for RSC props — all strings.
 */
export function getRecentLifecycleEvents(
  lifecycle: ExecutionLifecycle | null,
  limit:     number = 3,
): Array<{ type: string; summary: string; actor: string; relativeTime: string }> {
  if (!lifecycle) return [];

  const now = Date.now();
  return lifecycle.events
    .slice()
    .reverse()
    .slice(0, limit)
    .map(e => ({
      type:         e.type,
      summary:      e.summary,
      actor:        e.actor,
      relativeTime: formatRelative(now - new Date(e.timestamp).getTime()),
    }));
}

function formatRelative(diffMs: number): string {
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60)  return "hace un momento";
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `hace ${mins}m`;
  return `hace ${Math.floor(mins / 60)}h`;
}
