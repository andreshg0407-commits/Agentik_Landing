/**
 * lib/copilot/playbooks/playbook-audit.ts
 *
 * Agentik — Copilot Playbooks — Audit Trail
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Audit events for all playbook operations.
 * All events are JSON-serializable objects.
 * No Prisma. No persistence yet.
 *
 * Pure domain. No server-only. No React.
 */

import type { PlaybookCategory, PlaybookPriority } from "./playbook-types";

// ── Event types ───────────────────────────────────────────────────────────────

export type PlaybookAuditEventType =
  | "PLAYBOOK_CREATED"
  | "PLAYBOOK_UPDATED"
  | "PLAYBOOK_ARCHIVED"
  | "PLAYBOOK_RETRIEVED"
  | "PLAYBOOK_MATCHED"
  | "PLAYBOOK_APPLIED";

// ── Event shape ───────────────────────────────────────────────────────────────

export interface PlaybookAuditEvent {
  id:         string;
  orgSlug:    string;
  type:       PlaybookAuditEventType;
  message:    string;
  metadata:   Record<string, unknown>;
  occurredAt: string;
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextAuditId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `pbaud-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPlaybookAuditEvent(
  orgSlug:  string,
  type:     PlaybookAuditEventType,
  message:  string,
  metadata: Record<string, unknown> = {},
): PlaybookAuditEvent {
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

export function auditPlaybookCreated(
  orgSlug:    string,
  playbookId: string,
  title:      string,
  category:   PlaybookCategory,
  priority:   PlaybookPriority,
): PlaybookAuditEvent {
  return createPlaybookAuditEvent(
    orgSlug,
    "PLAYBOOK_CREATED",
    `Playbook created: "${title}" [${category}/${priority}].`,
    { playbookId, title, category, priority },
  );
}

export function auditPlaybookUpdated(
  orgSlug:    string,
  playbookId: string,
  fields:     string[],
): PlaybookAuditEvent {
  return createPlaybookAuditEvent(
    orgSlug,
    "PLAYBOOK_UPDATED",
    `Playbook "${playbookId}" updated: ${fields.join(", ")}.`,
    { playbookId, updatedFields: fields },
  );
}

export function auditPlaybookArchived(
  orgSlug:    string,
  playbookId: string,
  title:      string,
): PlaybookAuditEvent {
  return createPlaybookAuditEvent(
    orgSlug,
    "PLAYBOOK_ARCHIVED",
    `Playbook archived: "${title}" (${playbookId}).`,
    { playbookId, title },
  );
}

export function auditPlaybookRetrieved(
  orgSlug: string,
  count:   number,
  query?:  string,
): PlaybookAuditEvent {
  return createPlaybookAuditEvent(
    orgSlug,
    "PLAYBOOK_RETRIEVED",
    `${count} playbook(s) retrieved.`,
    { count, query: query?.slice(0, 200) },
  );
}

export function auditPlaybookMatched(
  orgSlug:    string,
  playbookId: string,
  title:      string,
  matchReason: string,
): PlaybookAuditEvent {
  return createPlaybookAuditEvent(
    orgSlug,
    "PLAYBOOK_MATCHED",
    `Playbook matched: "${title}" — reason: ${matchReason}.`,
    { playbookId, title, matchReason },
  );
}

export function auditPlaybookApplied(
  orgSlug:    string,
  playbookId: string,
  title:      string,
  context:    string,
): PlaybookAuditEvent {
  return createPlaybookAuditEvent(
    orgSlug,
    "PLAYBOOK_APPLIED",
    `Playbook applied: "${title}" in context: ${context}.`,
    { playbookId, title, context },
  );
}

// ── Audit log accumulator ─────────────────────────────────────────────────────

export class PlaybookAuditLog {
  private _events: PlaybookAuditEvent[] = [];

  push(event: PlaybookAuditEvent): void {
    this._events.push(event);
  }

  getAll(): PlaybookAuditEvent[] {
    return [...this._events];
  }

  getByType(type: PlaybookAuditEventType): PlaybookAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  getByOrg(orgSlug: string): PlaybookAuditEvent[] {
    return this._events.filter(e => e.orgSlug === orgSlug);
  }

  count(): number {
    return this._events.length;
  }

  clear(): void {
    this._events = [];
  }
}

// ── Global audit log ──────────────────────────────────────────────────────────

/**
 * Process-level playbook audit log.
 * Accumulates all playbook events for the lifetime of the process.
 * Non-persisted — for observability and debugging.
 *
 * DEBT: Replace with persistent event log in AGENTIK-COPILOT-PLAYBOOKS-AUDIT-PERSIST-01.
 */
export const globalPlaybookAuditLog = new PlaybookAuditLog();
