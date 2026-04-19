import { prisma } from "@/lib/prisma";

const DEFAULT_MODULES: Array<{ code: string; enabled: boolean; configJson?: any }> = [
  { code: "CONTROL_CENTER", enabled: true },
  { code: "RUNS", enabled: true },
  { code: "INTEGRATIONS", enabled: true },
  { code: "AGENTS", enabled: true },

  // opcionales por plan / activación manual
  { code: "CONVERSATIONS", enabled: false },
  { code: "LUCA_MARKETING", enabled: false },
  { code: "MILA_WHATSAPP", enabled: false },
];

export async function ensureMainProject(orgId: string) {
  const existing = await prisma.project.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true },
  });

  if (existing) return existing;

  // Transacción: crear project + seedear módulos
  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId: orgId,
        name: "Main",
        key: "main",
        status: "ACTIVE",
      },
      select: { id: true, key: true },
    });

    await tx.projectModule.createMany({
      data: DEFAULT_MODULES.map((m) => ({
        projectId: project.id,
        code: m.code,
        enabled: m.enabled,
        configJson: m.configJson ?? undefined,
      })),
      skipDuplicates: true,
    });

    return project;
  });

  return created;
}