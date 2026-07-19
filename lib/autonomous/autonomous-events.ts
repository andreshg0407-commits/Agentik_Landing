/**
 * lib/autonomous/autonomous-events.ts
 *
 * Agentik — Autonomous Operations — Event Types
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * All events emitted by the autonomous execution layer.
 * Fully serializable. No Prisma. No React. No server-only.
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type AutonomousEventType =
  | "operation_created"
  | "decision_made"
  | "operation_started"
  | "operation_completed"
  | "operation_blocked"
  | "operation_escalated"
  | "operation_failed";

// ── Event ─────────────────────────────────────────────────────────────────────

export interface AutonomousEvent {
  /** Unique event ID. */
  id:           string;
  /** The event type. */
  type:         AutonomousEventType;
  /** Operation this event belongs to. */
  operationId:  string;
  /** Tenant this event belongs to. */
  orgSlug:      string;
  /** Human-readable description. */
  message:      string;
  /** Structured payload — serializable. */
  metadata?:    Record<string, unknown>;
  /** ISO timestamp. */
  occurredAt:   string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _counter = 0;

export function createAutonomousEvent(
  type:        AutonomousEventType,
  operationId: string,
  orgSlug:     string,
  message:     string,
  metadata?:   Record<string, unknown>,
): AutonomousEvent {
  _counter++;
  return {
    id:          `aev_${Date.now()}_${_counter.toString(36)}`,
    type,
    operationId,
    orgSlug,
    message,
    metadata,
    occurredAt:  new Date().toISOString(),
  };
}
