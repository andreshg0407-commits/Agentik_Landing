import { prisma } from "@/lib/prisma";

export async function getOrgDashboardActivity(organizationId: string) {
  const [runs, alerts, events] = await Promise.all([
    prisma.run.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true },
    }),
    prisma.alert.findMany({
      where: { organizationId, status: { not: "RESOLVED" } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: { id: true, type: true, title: true, severity: true, status: true, createdAt: true },
    }),
    prisma.event.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true },
    }),
  ]);

  return { runs, alerts, events };
}
