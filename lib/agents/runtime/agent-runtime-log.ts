/**
 * lib/agents/runtime/agent-runtime-log.ts
 *
 * Agentik — Universal Agent Runtime — Runtime Audit Log
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * In-memory audit log for a single agent runtime run.
 * Records goal, plan, steps, results, errors, and timestamps.
 * JSON-serializable — ready for future DB persistence.
 *
 * Pure domain. No Prisma. No React. No server-only.
 * (Distinct from the existing agent-runtime-audit.ts which validates contexts.)
 */

import type { AgentId, AgentAuditEntry } from "./agent-types";

// ── Audit log ─────────────────────────────────────────────────────────────────

let _seq = 0;
function nextAuditId(): string {
  _seq++;
  return `aud_${Date.now()}_${(_seq).toString(36)}`;
}

export interface AuditRecordInput {
  agentId:   AgentId;
  event:     string;
  stepId?:   string;
  message:   string;
  metadata:  Record<string, unknown>;
}

/**
 * In-memory audit log for one runtime run.
 * Collect all events → serialize as AgentAuditEntry[].
 */
export class AgentAuditLog {
  private readonly _entries: AgentAuditEntry[] = [];

  record(input: AuditRecordInput): void {
    this._entries.push({
      id:         nextAuditId(),
      agentId:    input.agentId,
      event:      input.event,
      stepId:     input.stepId,
      message:    input.message,
      metadata:   input.metadata,
      occurredAt: new Date().toISOString(),
    });
  }

  getEntries(): AgentAuditEntry[] {
    return [...this._entries];
  }

  toJSON(): string {
    return JSON.stringify(this._entries, null, 2);
  }
}
