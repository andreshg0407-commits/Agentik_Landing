/**
 * lib/tasks/persistence/task-prisma-repository.ts
 *
 * Agentik — Prisma Task Repository Implementation
 * Sprint: AGENTIK-TASK-PERSISTENCE-01
 *
 * SERVER-ONLY — imports Prisma directly.
 * Never import this from UI, client components, action-executor, or Copilot drawer.
 * Access via taskService only (which is also server-only).
 */
import "server-only";

import { prisma }                    from "@/lib/prisma";
import type { TaskRepository }       from "./task-repository";
import type {
  TaskRecord,
  TaskDraft,
  TaskUpdateInput,
  TaskFilter,
}                                    from "../task-types";
import {
  mapTaskDraftToCreateInput,
  mapPrismaTaskToRecord,
  mapTaskRecordToUpdateInput,
}                                    from "./task-mapper";

// ── Org slug → ID resolver ────────────────────────────────────────────────────

async function resolveOrgId(orgSlug: string): Promise<string> {
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!org) throw new Error(`Organization not found for slug: ${orgSlug}`);
  return org.id;
}

// ── Implementation ────────────────────────────────────────────────────────────

// ── Idempotent task creation — AGENTIK-IDEMPOTENCY-01 ─────────────────────────

/**
 * Find a task by its idempotency key + org.
 * Returns null if not found.
 */
export async function findTaskByIdempotencyKey(
  orgSlug:        string,
  idempotencyKey: string,
): Promise<TaskRecord | null> {
  const orgId = await resolveOrgId(orgSlug);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).task.findFirst({
    where: { organizationId: orgId, idempotencyKey },
  });
  return row ? mapPrismaTaskToRecord(row as Parameters<typeof mapPrismaTaskToRecord>[0]) : null;
}

/**
 * Create a task with idempotency protection.
 * - If a task with the same idempotencyKey exists, return it (alreadyProcessed=true).
 * - If not, create it.
 * - If a unique constraint race occurs, read back the existing record.
 * Never throws to callers.
 */
export async function createTaskIdempotent(
  draft:          TaskDraft,
  orgSlug:        string,
  idempotencyKey: string,
): Promise<{ task: TaskRecord; alreadyProcessed: boolean }> {
  // 1. Look up existing
  const existing = await findTaskByIdempotencyKey(orgSlug, idempotencyKey);
  if (existing) {
    return { task: existing, alreadyProcessed: true };
  }

  // 2. Create with idempotencyKey
  const orgId  = await resolveOrgId(orgSlug);
  const data   = { ...mapTaskDraftToCreateInput(draft, orgId), idempotencyKey };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).task.create({ data });
    return { task: mapPrismaTaskToRecord(row as Parameters<typeof mapPrismaTaskToRecord>[0]), alreadyProcessed: false };
  } catch (err) {
    // 3. On unique constraint race, read back the winner
    const isUniqueViolation = err instanceof Error &&
      (err.message.includes("Unique constraint") || err.message.includes("unique constraint") || err.message.includes("P2002"));
    if (isUniqueViolation) {
      const raceWinner = await findTaskByIdempotencyKey(orgSlug, idempotencyKey);
      if (raceWinner) return { task: raceWinner, alreadyProcessed: true };
    }
    throw err;
  }
}

export const taskPrismaRepository: TaskRepository = {

  async createTask(draft: TaskDraft, orgSlug: string): Promise<TaskRecord> {
    const orgId = await resolveOrgId(orgSlug);
    const data  = mapTaskDraftToCreateInput(draft, orgId);
    const row   = await prisma.task.create({ data });
    return mapPrismaTaskToRecord(row);
  },

  async updateTask(
    taskId:  string,
    input:   TaskUpdateInput,
    orgSlug: string,
  ): Promise<TaskRecord> {
    const orgId = await resolveOrgId(orgSlug);
    const row   = await prisma.task.update({
      where: { id: taskId, organizationId: orgId },
      data:  mapTaskRecordToUpdateInput(input),
    });
    return mapPrismaTaskToRecord(row);
  },

  async getTaskById(taskId: string, orgSlug: string): Promise<TaskRecord | null> {
    const orgId = await resolveOrgId(orgSlug);
    const row   = await prisma.task.findFirst({
      where: { id: taskId, organizationId: orgId },
    });
    return row ? mapPrismaTaskToRecord(row) : null;
  },

  async listTasks(orgSlug: string, filter?: TaskFilter): Promise<TaskRecord[]> {
    const orgId = await resolveOrgId(orgSlug);

    const rows = await prisma.task.findMany({
      where: {
        organizationId: orgId,
        ...(filter?.status      ? { status:   { in: filter.status   } } : {}),
        ...(filter?.priority    ? { priority:  { in: filter.priority } } : {}),
        ...(filter?.source      ? { source:    { in: filter.source   } } : {}),
        ...(filter?.category    ? { category:  { in: filter.category } } : {}),
        ...(filter?.ownerId     ? { ownerId:   filter.ownerId }         : {}),
        ...(filter?.assignedToId? { assignedId: filter.assignedToId }   : {}),
        ...(filter?.module      ? { module:    filter.module }          : {}),
        ...(filter?.dueBefore   ? { dueAt:     { lte: new Date(filter.dueBefore) } } : {}),
        ...(filter?.dueAfter    ? { dueAt:     { gte: new Date(filter.dueAfter)  } } : {}),
        ...(filter?.createdBefore ? { createdAt: { lte: new Date(filter.createdBefore) } } : {}),
        ...(filter?.createdAfter  ? { createdAt: { gte: new Date(filter.createdAfter)  } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaTaskToRecord);
  },

  async completeTask(taskId: string, orgSlug: string): Promise<TaskRecord> {
    const orgId = await resolveOrgId(orgSlug);
    const row   = await prisma.task.update({
      where: { id: taskId, organizationId: orgId },
      data:  { status: "completed", completedAt: new Date() },
    });
    return mapPrismaTaskToRecord(row);
  },

  async cancelTask(taskId: string, orgSlug: string): Promise<TaskRecord> {
    const orgId = await resolveOrgId(orgSlug);
    const row   = await prisma.task.update({
      where: { id: taskId, organizationId: orgId },
      data:  { status: "cancelled", cancelledAt: new Date() },
    });
    return mapPrismaTaskToRecord(row);
  },

};
