/**
 * Agentik Action Layer — service.
 *
 * Phase 1: internal tracked work items.
 * No external side-effects (WhatsApp, SAG, GOCEN) — these are stored tasks.
 */

import { prisma }                     from "@/lib/prisma";
import { Prisma }                     from "@prisma/client";
import {
  ActionTaskStatus,
  ActionTaskType,
  ActionTaskPriority,
  type ActionTask,
}                                     from "@prisma/client";

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateActionInput {
  title:        string;
  description?: string;
  actionType:   ActionTaskType;
  targetType?:  string;
  targetId?:    string;
  targetLabel?: string;
  sourceModule?: string;
  priority?:    ActionTaskPriority;
  assignedTo?:  string;
  dueAt?:       Date;
  payloadJson?: Record<string, unknown>;
}

export interface ListActionsFilter {
  status?:   ActionTaskStatus;
  priority?: ActionTaskPriority;
  limit?:    number;
  offset?:   number;
}

// ── CRUD operations ───────────────────────────────────────────────────────────

export async function createActionTask(
  organizationId: string,
  createdBy:      string,
  input:          CreateActionInput,
): Promise<ActionTask> {
  return prisma.actionTask.create({
    data: {
      organizationId,
      createdBy,
      title:        input.title,
      description:  input.description,
      actionType:   input.actionType,
      targetType:   input.targetType,
      targetId:     input.targetId,
      targetLabel:  input.targetLabel,
      sourceModule: input.sourceModule,
      priority:     input.priority ?? ActionTaskPriority.MEDIUM,
      assignedTo:   input.assignedTo,
      dueAt:        input.dueAt,
      payloadJson:  input.payloadJson ? (input.payloadJson as Prisma.InputJsonValue) : Prisma.DbNull,
      status:       ActionTaskStatus.PENDING,
    },
  });
}

export async function listActionTasks(
  organizationId: string,
  filter: ListActionsFilter = {},
): Promise<ActionTask[]> {
  return prisma.actionTask.findMany({
    where: {
      organizationId,
      ...(filter.status   ? { status:   filter.status   } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
    take:   filter.limit  ?? 50,
    skip:   filter.offset ?? 0,
  });
}

export async function getActionTask(
  organizationId: string,
  actionId:       string,
): Promise<ActionTask | null> {
  return prisma.actionTask.findFirst({
    where: { id: actionId, organizationId },
  });
}

export async function assignActionTask(
  organizationId: string,
  actionId:       string,
  assignedTo:     string,
): Promise<ActionTask> {
  const existing = await _requireAction(organizationId, actionId);
  if (existing.status === ActionTaskStatus.COMPLETED || existing.status === ActionTaskStatus.CANCELED) {
    throw new Error("Cannot assign a completed or canceled action");
  }
  return prisma.actionTask.update({
    where: { id: actionId },
    data:  { assignedTo },
  });
}

export async function completeActionTask(
  organizationId: string,
  actionId:       string,
  result?:        Record<string, unknown>,
): Promise<ActionTask> {
  await _requireAction(organizationId, actionId);
  return prisma.actionTask.update({
    where: { id: actionId },
    data:  {
      status:       ActionTaskStatus.COMPLETED,
      completedAt:  new Date(),
      resultJson:   result ? (result as Prisma.InputJsonValue) : Prisma.DbNull,
      errorMessage: null,
    },
  });
}

export async function cancelActionTask(
  organizationId: string,
  actionId:       string,
): Promise<ActionTask> {
  const existing = await _requireAction(organizationId, actionId);
  if (existing.status === ActionTaskStatus.COMPLETED) {
    throw new Error("Cannot cancel a completed action");
  }
  return prisma.actionTask.update({
    where: { id: actionId },
    data:  {
      status:      ActionTaskStatus.CANCELED,
      completedAt: new Date(),
    },
  });
}

export async function rescheduleActionTask(
  organizationId: string,
  actionId:       string,
  dueAt:          Date | null,
): Promise<ActionTask> {
  const existing = await _requireAction(organizationId, actionId);
  if (existing.status === ActionTaskStatus.COMPLETED || existing.status === ActionTaskStatus.CANCELED) {
    throw new Error("Cannot reschedule a completed or canceled action");
  }
  return prisma.actionTask.update({
    where: { id: actionId },
    data:  { dueAt },
  });
}

export async function updateActionStatus(
  organizationId: string,
  actionId:       string,
  status:         ActionTaskStatus,
  opts?: { errorMessage?: string; result?: Record<string, unknown> },
): Promise<ActionTask> {
  await _requireAction(organizationId, actionId);
  return prisma.actionTask.update({
    where: { id: actionId },
    data:  {
      status,
      ...(status === ActionTaskStatus.COMPLETED || status === ActionTaskStatus.FAILED || status === ActionTaskStatus.CANCELED
        ? { completedAt: new Date() }
        : {}),
      ...(opts?.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      ...(opts?.result       ? { resultJson:   opts.result as Prisma.InputJsonValue } : {}),
    },
  });
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export interface ActionTaskStats {
  pending:   number;
  scheduled: number;
  running:   number;
  completed: number;
  failed:    number;
  canceled:  number;
  total:     number;
}

export async function getActionTaskStats(organizationId: string): Promise<ActionTaskStats> {
  const grouped = await prisma.actionTask.groupBy({
    by:    ["status"],
    where: { organizationId },
    _count: true,
  });

  const byStatus: Partial<Record<ActionTaskStatus, number>> = {};
  for (const row of grouped) {
    byStatus[row.status] = row._count;
  }

  return {
    pending:   byStatus.PENDING   ?? 0,
    scheduled: byStatus.SCHEDULED ?? 0,
    running:   byStatus.RUNNING   ?? 0,
    completed: byStatus.COMPLETED ?? 0,
    failed:    byStatus.FAILED    ?? 0,
    canceled:  byStatus.CANCELED  ?? 0,
    total:     grouped.reduce((s, r) => s + r._count, 0),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function _requireAction(organizationId: string, actionId: string): Promise<ActionTask> {
  const task = await prisma.actionTask.findFirst({
    where: { id: actionId, organizationId },
  });
  if (!task) throw new Error("ACTION_NOT_FOUND");
  return task;
}

// ── Re-export enums for convenience ──────────────────────────────────────────
export { ActionTaskStatus, ActionTaskType, ActionTaskPriority };
export type { ActionTask };
