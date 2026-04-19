import { prisma } from "@/lib/prisma";
import { summarizeActivity } from "./activity-summary";
import { deriveBusinessStatus } from "./business-status";

export async function getOrganizationBusinessStatus(organizationId: string) {
  const [runs, alerts, events] = await Promise.all([
    prisma.run.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { status: true },
    }),
    prisma.alert.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { severity: true, status: true },
    }),
    prisma.event.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { status: true },
    }),
  ]);

  const summary = summarizeActivity({ runs, alerts, events });
  const businessStatus = deriveBusinessStatus(summary);

  return { summary, businessStatus };
}
