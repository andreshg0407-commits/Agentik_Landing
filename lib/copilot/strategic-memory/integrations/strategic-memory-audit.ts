// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Audit

import type { StrategicMemoryEntry, StrategicMemoryRelation } from "../strategic-memory-types";
import type { StrategicEngineRunResult } from "../strategic-memory-engine";

// ── Audit Event Types ─────────────────────────────────────────────────────────

export type StrategicAuditEventType =
  | "STRATEGIC_MEMORY_CREATED"
  | "STRATEGIC_MEMORY_UPDATED"
  | "STRATEGIC_MEMORY_ARCHIVED"
  | "STRATEGIC_MEMORY_INVALIDATED"
  | "STRATEGIC_RELATION_CREATED"
  | "STRATEGIC_RELATION_DELETED"
  | "STRATEGIC_SNAPSHOT_CREATED"
  | "STRATEGIC_ENGINE_RUN"
  | "STRATEGIC_GUARDRAIL_VIOLATION"
  | "STRATEGIC_CROSS_TENANT_ATTEMPT";

export interface StrategicAuditEvent {
  readonly id: string;
  readonly orgSlug: string;
  readonly eventType: StrategicAuditEventType;
  readonly actorId: string | null;
  readonly agentId: string | null;
  readonly targetId: string | null;
  readonly payload: Record<string, unknown>;
  readonly severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  readonly occurredAt: string;
}

// ── Audit Builders ────────────────────────────────────────────────────────────

function makeAuditId(): string {
  return `saud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function auditStrategicMemoryCreated(
  entry: StrategicMemoryEntry,
  actorId?: string
): StrategicAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug: entry.orgSlug,
    eventType: "STRATEGIC_MEMORY_CREATED",
    actorId: actorId ?? null,
    agentId: entry.agentId ?? null,
    targetId: entry.id,
    payload: {
      type: entry.type,
      priority: entry.priority,
      domain: entry.domain,
      title: entry.title,
      strategicScore: entry.strategicScore,
    },
    severity: entry.priority === "CRITICAL" ? "WARN" : "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditStrategicMemoryUpdated(
  entry: StrategicMemoryEntry,
  changes: Record<string, unknown>,
  actorId?: string
): StrategicAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug: entry.orgSlug,
    eventType: "STRATEGIC_MEMORY_UPDATED",
    actorId: actorId ?? null,
    agentId: entry.agentId ?? null,
    targetId: entry.id,
    payload: { changes, title: entry.title },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditStrategicMemoryArchived(
  entry: StrategicMemoryEntry,
  reason: string,
  actorId?: string
): StrategicAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug: entry.orgSlug,
    eventType: "STRATEGIC_MEMORY_ARCHIVED",
    actorId: actorId ?? null,
    agentId: entry.agentId ?? null,
    targetId: entry.id,
    payload: { reason, title: entry.title, type: entry.type },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditStrategicRelationCreated(
  relation: StrategicMemoryRelation,
  actorId?: string
): StrategicAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug: relation.orgSlug,
    eventType: "STRATEGIC_RELATION_CREATED",
    actorId: actorId ?? null,
    agentId: null,
    targetId: relation.id,
    payload: {
      type: relation.type,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      strength: relation.strength,
    },
    severity: "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function auditStrategicGuardrailViolation(
  orgSlug: string,
  violations: string[],
  actorId?: string
): StrategicAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "STRATEGIC_GUARDRAIL_VIOLATION",
    actorId: actorId ?? null,
    agentId: null,
    targetId: null,
    payload: { violations },
    severity: violations.some((v) => v.includes("CROSS_TENANT")) ? "CRITICAL" : "WARN",
    occurredAt: new Date().toISOString(),
  };
}

export function auditStrategicEngineRun(
  result: StrategicEngineRunResult,
  orgSlug: string
): StrategicAuditEvent {
  return {
    id: makeAuditId(),
    orgSlug,
    eventType: "STRATEGIC_ENGINE_RUN",
    actorId: null,
    agentId: null,
    targetId: result.id,
    payload: {
      status: result.status,
      savedEntryId: result.savedEntryId,
      strategicScore: result.strategicScore,
      warnings: result.violations,
    },
    severity: result.status === "FAILED" ? "ERROR" : "INFO",
    occurredAt: new Date().toISOString(),
  };
}

export function buildStrategicAuditLog(
  events: StrategicAuditEvent[]
): { total: number; byType: Record<string, number>; criticalCount: number } {
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
