import { prisma } from "@/lib/prisma";

const projectSelect = { id: true, name: true, key: true } as const;

export async function listEvents(organizationId: string) {
  return prisma.event.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      status: true,
      sourceType: true,
      sourceId: true,
      createdAt: true,
      project: { select: projectSelect },
    },
  });
}

export async function getEvent(eventId: string, organizationId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, organizationId },
    select: {
      id: true,
      type: true,
      status: true,
      sourceType: true,
      sourceId: true,
      traceId: true,
      runId: true,
      payloadJson: true,
      errorJson: true,
      processedAt: true,
      createdAt: true,
      project: { select: projectSelect },
    },
  });
}
