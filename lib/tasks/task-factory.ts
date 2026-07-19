/**
 * lib/tasks/task-factory.ts
 *
 * Agentik — Task Factory Functions
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Pure factory functions for creating TaskDraft, TaskRecord, TaskAuditEvent,
 * TaskBusinessContext, and TaskRelationship instances.
 *
 * No Prisma. No persistence. No React. No Copilot imports.
 * ID generation: simple deterministic stub (no uuid dependency).
 */

import type {
  TaskDraft,
  TaskRecord,
  TaskAuditEvent,
  TaskBusinessContext,
  TaskRelationship,
  TaskCreationInput,
  TaskOwner,
  TaskAuditEventType,
  TaskRelationshipType,
} from "./task-types";
import { SYSTEM_TASK_OWNER } from "./task-assignment";

// ── ID generation ──────────────────────────────────────────────────────────────

function generateDraftId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `task_draft_${Date.now()}_${rand}`;
}

function generateRecordId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `task_${Date.now()}_${rand}`;
}

// ── Default business context ──────────────────────────────────────────────────

/**
 * Create a minimal TaskBusinessContext for a given org and module.
 */
export function createDefaultTaskBusinessContext(
  orgSlug: string,
  module?: string,
): TaskBusinessContext {
  return {
    orgSlug,
    module,
  };
}

// ── Relationship factory ──────────────────────────────────────────────────────

/**
 * Create a TaskRelationship.
 */
export function createTaskRelationship(
  type:         TaskRelationshipType,
  entityType:   string,
  entityId:     string,
  entityLabel?: string,
): TaskRelationship {
  return { type, entityType, entityId, entityLabel };
}

// ── Audit event factory ───────────────────────────────────────────────────────

/**
 * Create a TaskAuditEvent.
 */
export function createTaskAuditEvent(
  type:      TaskAuditEventType,
  actor:     TaskOwner,
  previous?: Record<string, unknown>,
  next?:     Record<string, unknown>,
  note?:     string,
): TaskAuditEvent {
  return {
    type,
    occurredAt: new Date().toISOString(),
    actorId:    actor.id,
    actorType:  actor.type,
    previous,
    next,
    note,
  };
}

// ── TaskDraft factory ─────────────────────────────────────────────────────────

/**
 * Create a TaskDraft from a TaskCreationInput.
 * Applies all defaults. Does not persist.
 */
export function createTaskDraft(input: TaskCreationInput): TaskDraft {
  return {
    id:              generateDraftId(),
    title:           input.title,
    description:     input.description,
    priority:        input.priority    ?? "medium",
    status:          "open",
    source:          input.source,
    category:        input.category   ?? "general",
    owner:           input.owner,
    assignment:      input.assignment,
    relationships:   input.relationships ?? [],
    businessContext: input.businessContext,
    visibility:      input.visibility  ?? "organization",
    dueDateMode:     input.dueDateMode ?? "none",
    dueAt:           input.dueAt,
    createdAt:       input.businessContext.customData?.createdAt as string | undefined
                     ?? new Date().toISOString(),
    createdBy:       input.createdBy,
    metadata:        input.metadata ?? {},
  };
}

// ── TaskRecord factory ────────────────────────────────────────────────────────

/**
 * Create a TaskRecord from a TaskDraft.
 * Adds persistence wrapper and initial audit event.
 * Does not persist — caller is responsible for storage.
 */
export function createTaskRecordFromDraft(
  draft:    TaskDraft,
  createdBy?: TaskOwner,
): TaskRecord {
  const actor     = createdBy ?? SYSTEM_TASK_OWNER;
  const now       = new Date().toISOString();
  const auditEvent = createTaskAuditEvent(
    "created",
    actor,
    undefined,
    { status: draft.status, priority: draft.priority },
    "Task created from draft.",
  );

  return {
    id:         generateRecordId(),
    draftId:    draft.id,
    draft,
    createdAt:  now,
    updatedAt:  now,
    auditTrail: [auditEvent],
  };
}
