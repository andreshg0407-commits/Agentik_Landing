import { prisma } from "@/lib/prisma";

const projectSelect = {
  id: true,
  name: true,
  key: true,
  workspace: {
    select: { id: true, name: true, slug: true },
  },
} as const;

export async function listRuns(organizationId: string, projectId?: string) {
  return prisma.run.findMany({
    where: {
      organizationId,
      // When projectId is supplied, restrict to that project or unscoped runs.
      // Without projectId, return all runs for the org (used in summary views).
      ...(projectId
        ? { OR: [{ projectId: null }, { projectId }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      status: true,
      attempt: true,
      maxAttempts: true,
      queuedAt: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      project: { select: projectSelect },
    },
  });
}

export async function getRun(runId: string, organizationId: string) {
  return prisma.run.findFirst({
    where: { id: runId, organizationId },
    select: {
      id: true,
      type: true,
      status: true,
      attempt: true,
      maxAttempts: true,
      traceId: true,
      idempotencyKey: true,
      inputJson: true,
      outputJson: true,
      errorJson: true,
      queuedAt: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      updatedAt: true,
      project: { select: projectSelect },
    },
  });
}
