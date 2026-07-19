/**
 * lib/copilot/copilot-audit.ts
 *
 * Agentik — Copilot Intelligence — Audit Trail
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Pure domain audit events for the Copilot Intelligence pipeline.
 * All events are serializable JSON objects.
 * No Prisma. No server-only. No persistence yet.
 *
 * Persistence will be added in AGENTIK-COPILOT-AUDIT-PERSIST-01.
 */

import type { CopilotIntent } from "./copilot-types";
import type { AgentId }       from "@/lib/agents/runtime/agent-types";

// ── Event types ───────────────────────────────────────────────────────────────

export type CopilotAuditEventType =
  | "copilot_request_received"
  | "copilot_intent_resolved"
  | "copilot_agents_selected"
  | "copilot_plan_created"
  | "copilot_execution_started"
  | "copilot_execution_completed";

// ── Event shape ───────────────────────────────────────────────────────────────

export interface CopilotAuditEvent {
  id:         string;
  requestId:  string;
  type:       CopilotAuditEventType;
  message:    string;
  metadata:   Record<string, unknown>;
  occurredAt: string;
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextAuditId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `cpa-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCopilotAuditEvent(
  requestId: string,
  type:      CopilotAuditEventType,
  message:   string,
  metadata:  Record<string, unknown> = {},
): CopilotAuditEvent {
  return {
    id:         nextAuditId(),
    requestId,
    type,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

// ── Typed event constructors ──────────────────────────────────────────────────

export function auditRequestReceived(
  requestId:   string,
  orgSlug:     string,
  userMessage: string,
): CopilotAuditEvent {
  return createCopilotAuditEvent(
    requestId,
    "copilot_request_received",
    `Copilot request received from org "${orgSlug}".`,
    { orgSlug, userMessage: userMessage.slice(0, 200) },
  );
}

export function auditIntentResolved(
  requestId: string,
  intent:    CopilotIntent,
  message:   string,
): CopilotAuditEvent {
  return createCopilotAuditEvent(
    requestId,
    "copilot_intent_resolved",
    `Intent resolved: ${intent}.`,
    { intent, userMessage: message.slice(0, 200) },
  );
}

export function auditAgentsSelected(
  requestId: string,
  intent:    CopilotIntent,
  agentIds:  AgentId[],
): CopilotAuditEvent {
  return createCopilotAuditEvent(
    requestId,
    "copilot_agents_selected",
    `${agentIds.length} agent(s) selected for intent ${intent}: ${agentIds.join(", ")}.`,
    { intent, agentIds },
  );
}

export function auditPlanCreated(
  requestId:     string,
  planId:        string,
  agentIds:      AgentId[],
  parallelizable: boolean,
): CopilotAuditEvent {
  return createCopilotAuditEvent(
    requestId,
    "copilot_plan_created",
    `Execution plan "${planId}" created — ${agentIds.length} agent(s), parallelizable=${parallelizable}.`,
    { planId, agentIds, parallelizable },
  );
}

export function auditExecutionStarted(
  requestId: string,
  planId:    string,
  agentIds:  AgentId[],
): CopilotAuditEvent {
  return createCopilotAuditEvent(
    requestId,
    "copilot_execution_started",
    `Execution started for plan "${planId}" with agents: ${agentIds.join(", ")}.`,
    { planId, agentIds },
  );
}

export function auditExecutionCompleted(
  requestId:  string,
  planId:     string,
  success:    boolean,
  durationMs: number,
  errors:     string[],
): CopilotAuditEvent {
  return createCopilotAuditEvent(
    requestId,
    "copilot_execution_completed",
    `Execution of plan "${planId}" ${success ? "completed successfully" : "completed with errors"} in ${durationMs}ms.`,
    { planId, success, durationMs, errorCount: errors.length, errors },
  );
}

// ── Log accumulator (in-process, non-persisted) ───────────────────────────────

export class CopilotAuditLog {
  private _events: CopilotAuditEvent[] = [];

  push(event: CopilotAuditEvent): void {
    this._events.push(event);
  }

  getAll(): CopilotAuditEvent[] {
    return [...this._events];
  }

  count(): number {
    return this._events.length;
  }
}

// ── Persistent Adapter (AGENTIK-SECURITY-AUDIT-PERSISTENCE-01) ───────────────

/**
 * PersistentCopilotAuditAdapter
 *
 * Bridge from CopilotAuditLog (in-memory) to the persistent audit layer.
 * Persistence is fire-and-forget — never blocks the copilot operation.
 *
 * Copilot events lack orgSlug (they use requestId).
 * This adapter requires orgSlug to be passed explicitly.
 */
export class PersistentCopilotAuditAdapter {
  constructor(private readonly memoryLog: CopilotAuditLog) {}

  pushWithOrg(event: CopilotAuditEvent, orgSlug: string): void {
    this.memoryLog.push(event);
    void this._persist(event, orgSlug);
  }

  /** Push without org — only writes to memory log. */
  push(event: CopilotAuditEvent): void {
    this.memoryLog.push(event);
  }

  private async _persist(event: CopilotAuditEvent, orgSlug: string): Promise<void> {
    try {
      const { getPersistentAuditService } = await import(
        "@/lib/security/audit-persistence/persistent-audit-service"
      );
      const svc = getPersistentAuditService();

      // Map copilot event types to persistent types
      const eventTypeMap: Record<string, string> = {
        copilot_intent_resolved:    "INTENT_RESOLVED",
        copilot_agents_selected:    "AGENT_SELECTED",
        copilot_plan_created:       "PLAN_GENERATED",
        copilot_execution_completed:"RESPONSE_GENERATED",
        copilot_request_received:   "COPILOT_REQUEST_RECEIVED",
        copilot_execution_started:  "COPILOT_EXECUTION_COMPLETED",
      };

      const persistType = eventTypeMap[event.type] ?? "RESPONSE_GENERATED";

      await svc.recordEvent({
        orgSlug,
        eventType: persistType as any,
        category:  "COPILOT",
        severity:  "LOW",
        metadata:  { requestId: event.requestId, message: event.message, ...event.metadata },
      });
    } catch {
      // Persistence failures must never propagate
    }
  }
}

/** Global copilot audit log (in-memory). */
export const globalCopilotAuditLog = new CopilotAuditLog();

/** Global persistent copilot audit adapter. */
export const persistentCopilotAuditAdapter = new PersistentCopilotAuditAdapter(
  globalCopilotAuditLog,
);
