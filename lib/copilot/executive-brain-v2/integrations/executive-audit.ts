// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 21 — Audit Integration

import type { ExecutiveBriefing, ExecutiveDigest, ExecutivePriority, ExecutiveConflict, ExecutiveBrainV2Result } from "../executive-brain-types";

// ── Audit Event Types ─────────────────────────────────────────────────────────

export type ExecutiveBrainAuditEventType =
  | "EXECUTIVE_CONTEXT_CREATED"
  | "EXECUTIVE_PRIORITY_COMPUTED"
  | "EXECUTIVE_BRIEFING_CREATED"
  | "EXECUTIVE_DIGEST_CREATED"
  | "EXECUTIVE_AGENDA_CREATED"
  | "EXECUTIVE_CONFLICT_DETECTED"
  | "EXECUTIVE_RISK_ESCALATED"
  | "EXECUTIVE_OPPORTUNITY_FOUND"
  | "EXECUTIVE_BRAIN_RUN"
  | "EXECUTIVE_GUARDRAIL_VIOLATION";

export const EXECUTIVE_BRAIN_AUDIT_EVENT_TYPES: ExecutiveBrainAuditEventType[] = [
  "EXECUTIVE_CONTEXT_CREATED", "EXECUTIVE_PRIORITY_COMPUTED",
  "EXECUTIVE_BRIEFING_CREATED", "EXECUTIVE_DIGEST_CREATED",
  "EXECUTIVE_AGENDA_CREATED", "EXECUTIVE_CONFLICT_DETECTED",
  "EXECUTIVE_RISK_ESCALATED", "EXECUTIVE_OPPORTUNITY_FOUND",
  "EXECUTIVE_BRAIN_RUN", "EXECUTIVE_GUARDRAIL_VIOLATION",
];

export interface ExecutiveBrainAuditEvent {
  readonly id: string;
  readonly orgSlug: string;
  readonly eventType: ExecutiveBrainAuditEventType;
  readonly actorId: string | null;
  readonly agentId: string | null;
  readonly targetId: string | null;
  readonly payload: Record<string, unknown>;
  readonly severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  readonly occurredAt: string;
}

// ── Audit builders ────────────────────────────────────────────────────────────

function makeAuditId(): string {
  return `ebaudit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function auditExecutiveContextCreated(
  orgSlug: string,
  priorityCount: number,
  riskCount: number
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_CONTEXT_CREATED",
    actorId: null,
    agentId: null,
    targetId: null,
    payload: { priorityCount, riskCount },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutivePriorityComputed(
  orgSlug: string,
  priority: ExecutivePriority
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_PRIORITY_COMPUTED",
    actorId: null,
    agentId: null,
    targetId: priority.id,
    payload: { title: priority.title, level: priority.level, priorityScore: priority.priorityScore, rank: priority.rank },
    severity: priority.level === "CRITICAL" ? "WARN" : "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutiveBriefingCreated(
  orgSlug: string,
  briefing: ExecutiveBriefing
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_BRIEFING_CREATED",
    actorId: null,
    agentId: null,
    targetId: briefing.id,
    payload: { type: briefing.type, priorityCount: briefing.priorities.length, executiveScore: briefing.executiveScore },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutiveDigestCreated(
  orgSlug: string,
  digest: ExecutiveDigest
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_DIGEST_CREATED",
    actorId: null,
    agentId: null,
    targetId: digest.id,
    payload: { period: digest.period, priorityCount: digest.topPriorities.length, executiveScore: digest.executiveScore },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutiveAgendaCreated(
  orgSlug: string,
  agendaId: string,
  itemCount: number
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_AGENDA_CREATED",
    actorId: null,
    agentId: null,
    targetId: agendaId,
    payload: { itemCount },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutiveConflictDetected(
  orgSlug: string,
  conflict: ExecutiveConflict
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_CONFLICT_DETECTED",
    actorId: null,
    agentId: null,
    targetId: conflict.id,
    payload: {
      type: conflict.type,
      severity: conflict.severity,
      elementATitle: conflict.elementATitle,
      elementBTitle: conflict.elementBTitle,
    },
    severity: conflict.severity === "CRITICAL" ? "ERROR" : "WARN",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutiveBrainRun(
  orgSlug: string,
  result: ExecutiveBrainV2Result
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_BRAIN_RUN",
    actorId: null,
    agentId: null,
    targetId: result.id,
    payload: {
      status: result.status,
      prioritiesComputed: result.prioritiesComputed,
      risksDetected: result.risksDetected,
      conflictsDetected: result.conflictsDetected,
      durationMs: result.durationMs,
    },
    severity: result.status === "FAILED" ? "ERROR" : "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditExecutiveGuardrailViolation(
  orgSlug: string,
  violations: string[]
): ExecutiveBrainAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "EXECUTIVE_GUARDRAIL_VIOLATION",
    actorId: null,
    agentId: null,
    targetId: null,
    payload: { violations },
    severity: violations.some((v) => v.includes("CROSS_TENANT")) ? "CRITICAL" : "ERROR",
    occurredAt: new Date().toISOString(),
  };
}

export function buildExecutiveAuditLog(events: ExecutiveBrainAuditEvent[]): {
  total: number;
  byType: Record<string, number>;
  criticalCount: number;
} {
  const byType: Record<string, number> = {};
  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1;
  }
  return {
    total: events.length,
    byType,
    criticalCount: events.filter((e) => e.severity === "CRITICAL" || e.severity === "ERROR").length,
  };
}
