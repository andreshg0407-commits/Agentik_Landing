/**
 * lib/autonomous/autonomous-audit.ts
 *
 * Agentik — Autonomous Operations — Audit Log
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * AutonomousAuditLog — in-memory, serializable audit log.
 * Same philosophy as AgentAuditLog in lib/agents/runtime/agent-runtime-log.ts.
 *
 * Persistence is NOT implemented here — this is pure domain.
 * For persistence, use AGENTIK-AUTONOMOUS-AUDIT-PERSISTENCE-01.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AutonomousEvent, AutonomousEventType } from "./autonomous-events";
import { createAutonomousEvent } from "./autonomous-events";

// ── Audit entry ───────────────────────────────────────────────────────────────

export interface AutonomousAuditEntry {
  event:       AutonomousEvent;
  operationId: string;
  orgSlug:     string;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * AutonomousAuditLog — collects events for one autonomous operation lifecycle.
 *
 * Usage:
 *   const log = new AutonomousAuditLog(operationId, orgSlug);
 *   log.record("operation_created", "Operation initialized.");
 *   log.record("decision_made", "Decision: AUTO_ALLOWED", { policy: "AUTO_ALLOWED" });
 *   const entries = log.getEntries();
 *   const json    = log.toJSON();
 */
export class AutonomousAuditLog {
  private readonly _operationId: string;
  private readonly _orgSlug:     string;
  private readonly _entries:     AutonomousAuditEntry[] = [];

  constructor(operationId: string, orgSlug: string) {
    this._operationId = operationId;
    this._orgSlug     = orgSlug;
  }

  /**
   * Record an audit event.
   */
  record(
    type:      AutonomousEventType,
    message:   string,
    metadata?: Record<string, unknown>,
  ): void {
    const event = createAutonomousEvent(
      type,
      this._operationId,
      this._orgSlug,
      message,
      metadata,
    );
    this._entries.push({
      event,
      operationId: this._operationId,
      orgSlug:     this._orgSlug,
    });
  }

  /**
   * Returns all recorded entries in insertion order.
   */
  getEntries(): readonly AutonomousAuditEntry[] {
    return this._entries;
  }

  /**
   * Returns the audit log as a JSON-serializable array.
   * Each entry is fully serializable — no circular references.
   */
  toJSON(): AutonomousEvent[] {
    return this._entries.map(e => e.event);
  }

  /** Total number of recorded events. */
  get size(): number {
    return this._entries.length;
  }

  /** Operation ID this log tracks. */
  get operationId(): string {
    return this._operationId;
  }
}
