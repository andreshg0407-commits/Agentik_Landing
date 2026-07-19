/**
 * lib/tasks/persistence/task-mapper.ts
 *
 * Agentik — Task ↔ Prisma Mapper
 * Sprint: AGENTIK-TASK-PERSISTENCE-01
 *
 * Translates between domain TaskDraft/TaskRecord and Prisma input/output shapes.
 * No business logic. No validation. Pure structural translation.
 */

import type { Prisma, Task as PrismaTask } from "@prisma/client";
import type {
  TaskDraft,
  TaskRecord,
  TaskUpdateInput,
  TaskOwner,
  TaskAssignment,
  TaskRelationship,
  TaskAuditEvent,
  TaskOwnerType,
  TaskPriority,
  TaskStatus,
  TaskSource,
  TaskCategory,
  TaskVisibility,
  TaskDueDateMode,
} from "../task-types";
import { createTaskAuditEvent } from "../task-factory";
import { SYSTEM_TASK_OWNER }   from "../task-assignment";

// ── Draft → Prisma create input ───────────────────────────────────────────────

export function mapTaskDraftToCreateInput(
  draft:          TaskDraft,
  organizationId: string,
): Prisma.TaskCreateInput {
  const firstRelationship = draft.relationships[0];

  return {
    organization:   { connect: { id: organizationId } },
    draftId:        draft.id,
    title:          draft.title,
    description:    draft.description,
    priority:       draft.priority,
    status:         draft.status,
    source:         draft.source,
    category:       draft.category,
    visibility:     draft.visibility,
    ownerType:      draft.owner.type,
    ownerId:        draft.owner.id,
    ownerLabel:     draft.owner.name,
    assignedType:   draft.assignment?.assignedTo.type   ?? null,
    assignedId:     draft.assignment?.assignedTo.id     ?? null,
    assignedLabel:  draft.assignment?.assignedTo.name   ?? null,
    module:         draft.businessContext.module         ?? null,
    entityType:     firstRelationship?.entityType        ?? null,
    entityId:       firstRelationship?.entityId          ?? null,
    dueAt:          draft.dueAt ? new Date(draft.dueAt) : null,
    createdBy:      draft.createdBy.id,
    metadataJson:   ({
      ...draft.metadata,
      draftCreatedAt:  draft.createdAt,
      relationships:   draft.relationships,
      dueDateMode:     draft.dueDateMode,
      businessContext: draft.businessContext,
    } as unknown) as Prisma.InputJsonValue,
  };
}

// ── Prisma record → TaskRecord ────────────────────────────────────────────────

export function mapPrismaTaskToRecord(row: PrismaTask): TaskRecord {
  const owner: TaskOwner = {
    id:   row.ownerId,
    type: row.ownerType as TaskOwnerType,
    name: row.ownerLabel,
  };

  const createdByOwner: TaskOwner = {
    id:   row.createdBy,
    type: "system",
    name: row.createdBy,
  };

  let assignment: TaskAssignment | undefined;
  if (row.assignedId && row.assignedType && row.assignedLabel) {
    assignment = {
      assignedTo: {
        id:   row.assignedId,
        type: row.assignedType as TaskOwnerType,
        name: row.assignedLabel,
      },
      assignedBy: owner,
      assignedAt: row.createdAt.toISOString(),
    };
  }

  // Reconstruct relationships from metadataJson
  const meta = (row.metadataJson as Record<string, unknown> | null) ?? {};
  const relationships: TaskRelationship[] = Array.isArray(meta["relationships"])
    ? (meta["relationships"] as TaskRelationship[])
    : row.entityType && row.entityId
      ? [{ type: "related_to_module", entityType: row.entityType, entityId: row.entityId }]
      : [];

  const dueDateMode = (meta["dueDateMode"] as TaskDueDateMode | undefined) ?? "none";

  const businessContextRaw = meta["businessContext"] as Record<string, unknown> | undefined;
  const businessContext = {
    orgSlug:               businessContextRaw?.["orgSlug"]              as string                    ?? "",
    module:                row.module                                                                 ?? undefined,
    period:                businessContextRaw?.["period"]               as string        | undefined,
    customerRef:           businessContextRaw?.["customerRef"]          as string        | undefined,
    documentRef:           businessContextRaw?.["documentRef"]          as string        | undefined,
    alertRef:              businessContextRaw?.["alertRef"]             as string        | undefined,
    customData:            businessContextRaw?.["customData"]           as Record<string, unknown> | undefined,
    entityType:            businessContextRaw?.["entityType"]           as string        | undefined,
    entityId:              businessContextRaw?.["entityId"]             as string        | undefined,
    sourceAgentId:         businessContextRaw?.["sourceAgentId"]        as string        | undefined,
    sourceAgentName:       businessContextRaw?.["sourceAgentName"]      as string        | undefined,
    sourceDrawerCategory:  businessContextRaw?.["sourceDrawerCategory"] as string        | undefined,
    navigationTarget:      businessContextRaw?.["navigationTarget"]     as string        | undefined,
    impactSummary:         businessContextRaw?.["impactSummary"]        as string        | undefined,
    recommendation:        businessContextRaw?.["recommendation"]       as string        | undefined,
    metadata:              businessContextRaw?.["metadata"]             as Record<string, unknown> | undefined,
  };

  const draft: TaskDraft = {
    id:              row.draftId ?? `draft_from_${row.id}`,
    title:           row.title,
    description:     row.description ?? undefined,
    priority:        row.priority  as TaskPriority,
    status:          row.status    as TaskStatus,
    source:          row.source    as TaskSource,
    category:        row.category  as TaskCategory,
    owner,
    assignment,
    relationships,
    businessContext,
    visibility:      row.visibility as TaskVisibility,
    dueDateMode,
    dueAt:           row.dueAt?.toISOString(),
    createdAt:       row.createdAt.toISOString(),
    createdBy:       createdByOwner,
    metadata:        meta,
  };

  const auditTrail: TaskAuditEvent[] = [
    createTaskAuditEvent(
      "created",
      createdByOwner,
      undefined,
      { status: draft.status, priority: draft.priority },
    ),
  ];

  if (row.completedAt) {
    auditTrail.push(createTaskAuditEvent(
      "completed",
      SYSTEM_TASK_OWNER,
      { status: "in_progress" },
      { status: "completed" },
    ));
  }
  if (row.cancelledAt) {
    auditTrail.push(createTaskAuditEvent(
      "cancelled",
      SYSTEM_TASK_OWNER,
      { status: "open" },
      { status: "cancelled" },
    ));
  }

  return {
    id:          row.id,
    draftId:     row.draftId ?? undefined,
    draft,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString(),
    auditTrail,
  };
}

// ── TaskUpdateInput → Prisma update data ──────────────────────────────────────

export function mapTaskRecordToUpdateInput(
  input: TaskUpdateInput,
): Prisma.TaskUpdateInput {
  const update: Prisma.TaskUpdateInput = {};

  if (input.title       !== undefined) update.title       = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.priority    !== undefined) update.priority    = input.priority;
  if (input.status      !== undefined) update.status      = input.status;
  if (input.visibility  !== undefined) update.visibility  = input.visibility;
  if (input.dueAt       !== undefined) update.dueAt       = input.dueAt ? new Date(input.dueAt) : null;

  if (input.assignment !== undefined) {
    update.assignedType  = input.assignment.assignedTo.type;
    update.assignedId    = input.assignment.assignedTo.id;
    update.assignedLabel = input.assignment.assignedTo.name;
  }

  if (input.metadata !== undefined) {
    update.metadataJson = input.metadata as Prisma.InputJsonValue;
  }

  return update;
}
