/**
 * lib/copilot/memory/memory-audit.ts
 *
 * Agentik — Copilot Memory Engine — Audit Trail
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * Audit events for all memory operations.
 * All events are serializable JSON objects.
 * No Prisma. No persistence yet.
 *
 * Persistence will be added in AGENTIK-COPILOT-MEMORY-AUDIT-PERSIST-01.
 */

import type { MemoryType, MemoryScope, MemoryImportance } from "./memory-types";

// ── Event types ───────────────────────────────────────────────────────────────

export type MemoryAuditEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "memory_retrieved"
  | "memory_classified"
  | "memory_rejected";

// ── Event shape ───────────────────────────────────────────────────────────────

export interface MemoryAuditEvent {
  id:         string;
  orgSlug:    string;
  type:       MemoryAuditEventType;
  message:    string;
  metadata:   Record<string, unknown>;
  occurredAt: string;
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextAuditId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `maud-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createMemoryAuditEvent(
  orgSlug:  string,
  type:     MemoryAuditEventType,
  message:  string,
  metadata: Record<string, unknown> = {},
): MemoryAuditEvent {
  return {
    id:         nextAuditId(),
    orgSlug,
    type,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

// ── Typed event constructors ──────────────────────────────────────────────────

export function auditMemoryCreated(
  orgSlug:    string,
  memoryId:   string,
  title:      string,
  memType:    MemoryType,
  importance: MemoryImportance,
  source:     string,
): MemoryAuditEvent {
  return createMemoryAuditEvent(
    orgSlug,
    "memory_created",
    `Memory created: "${title}" [${memType}/${importance}] by ${source}.`,
    { memoryId, title, memType, importance, source },
  );
}

export function auditMemoryUpdated(
  orgSlug:  string,
  memoryId: string,
  fields:   string[],
): MemoryAuditEvent {
  return createMemoryAuditEvent(
    orgSlug,
    "memory_updated",
    `Memory "${memoryId}" updated: ${fields.join(", ")}.`,
    { memoryId, updatedFields: fields },
  );
}

export function auditMemoryDeleted(
  orgSlug:  string,
  memoryId: string,
  title:    string,
): MemoryAuditEvent {
  return createMemoryAuditEvent(
    orgSlug,
    "memory_deleted",
    `Memory deleted: "${title}" (${memoryId}).`,
    { memoryId, title },
  );
}

export function auditMemoryRetrieved(
  orgSlug: string,
  count:   number,
  scope:   MemoryScope,
  query?:  string,
): MemoryAuditEvent {
  return createMemoryAuditEvent(
    orgSlug,
    "memory_retrieved",
    `${count} memory entry/entries retrieved (scope: ${scope}).`,
    { count, scope, query: query?.slice(0, 200) },
  );
}

export function auditMemoryClassified(
  orgSlug:     string,
  memType:     MemoryType,
  importance:  MemoryImportance,
  shouldStore: boolean,
  contentSnip: string,
): MemoryAuditEvent {
  return createMemoryAuditEvent(
    orgSlug,
    "memory_classified",
    `Content classified as ${memType}/${importance} — store=${shouldStore}.`,
    { memType, importance, shouldStore, contentSnip: contentSnip.slice(0, 100) },
  );
}

export function auditMemoryRejected(
  orgSlug:      string,
  rejectReason: string,
  contentSnip:  string,
): MemoryAuditEvent {
  return createMemoryAuditEvent(
    orgSlug,
    "memory_rejected",
    `Memory rejected: ${rejectReason}.`,
    { rejectReason, contentSnip: contentSnip.slice(0, 100) },
  );
}

// ── Governance policies ───────────────────────────────────────────────────────

/**
 * Policy check: can this org store new memories?
 *
 * Current implementation: always true.
 * Future: check memory quota from tenant billing.
 */
export function canStoreMemory(_orgSlug: string): boolean {
  // DEBT(policy): add quota check in AGENTIK-COPILOT-MEMORY-QUOTA-01
  return true;
}

/**
 * Policy check: can this org retrieve memories?
 *
 * Current implementation: always true.
 * Future: check access control and module permissions.
 */
export function canRetrieveMemory(_orgSlug: string): boolean {
  // DEBT(policy): add access control in AGENTIK-COPILOT-MEMORY-ACLS-01
  return true;
}

// ── Log accumulator (in-process, non-persisted) ───────────────────────────────

export class MemoryAuditLog {
  private _events: MemoryAuditEvent[] = [];

  push(event: MemoryAuditEvent): void {
    this._events.push(event);
  }

  getAll(): MemoryAuditEvent[] {
    return [...this._events];
  }

  getByType(type: MemoryAuditEventType): MemoryAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  getByOrg(orgSlug: string): MemoryAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  count(): number {
    return this._events.length;
  }
}

// ── Global audit log ─────────────────────────────────────────────────────────

/**
 * Process-level audit log. Accumulates all memory events for the lifetime
 * of the process. Non-persisted — for observability and debugging.
 *
 * DEBT: Replace with persistent event log in AGENTIK-COPILOT-MEMORY-AUDIT-PERSIST-01.
 */
export const globalMemoryAuditLog = new MemoryAuditLog();
