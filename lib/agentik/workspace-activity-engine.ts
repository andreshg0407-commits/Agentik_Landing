import { prisma } from "@/lib/prisma";
import { summarizeActivity } from "./activity-summary";
import { deriveBusinessStatus } from "./business-status";

// Run, Alert, Event do not have a direct workspaceId field.
// Workspace linkage goes through Project.workspaceId, so we filter
// via the nested relation: { project: { workspaceId } }.
// Records with no projectId are excluded — correct, as they carry no workspace context.
export async function getWorkspaceBusinessStatus(workspaceId: string) {
  const [runs, alerts, events] = await Promise.all([
    prisma.run.findMany({
      where: { project: { workspaceId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { status: true },
    }),
    prisma.alert.findMany({
      where: { project: { workspaceId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { severity: true, status: true },
    }),
    prisma.event.findMany({
      where: { project: { workspaceId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { status: true },
    }),
  ]);

  const summary = summarizeActivity({ runs, alerts, events });
  const businessStatus = deriveBusinessStatus(summary);

  return { summary, businessStatus };
}
