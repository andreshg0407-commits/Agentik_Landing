/**
 * prisma/seed.ts
 *
 * AUTH-SEED-SAFETY-01
 *
 * Idempotent seed for Agentik Enterprise OS.
 *
 * CREDENTIALS ARE NEVER HARDCODED. All passwords come from environment variables
 * that are set only at seed time and never committed to the repository.
 *
 * Required env vars (always):
 *   DIRECT_URL — Prisma direct DB connection string
 *
 * Optional env vars (seed-time only):
 *   SEED_ADMIN_EMAIL    — principal admin email (skip admin user if missing)
 *   SEED_ADMIN_NAME     — principal admin display name (default: "Admin")
 *   SEED_ADMIN_PASSWORD — principal admin password (skip credential if missing)
 *   SEED_ARKETOPS_ADMIN_PASSWORD  — ARKETOPS admin password (skip credential if missing)
 *   SEED_ARKETOPS_VIEWER_PASSWORD — ARKETOPS viewer password (skip credential if missing)
 *
 * DO NOT run this seed in production without reviewing the env vars first.
 * DO NOT store real passwords in .env files committed to version control.
 */
import "dotenv/config";
import {
  AlertSeverity,
  AlertStatus,
  EventStatus,
  MembershipStatus,
  Role,
  RunStatus,
} from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth/password";

function mustGetEnv(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const pool = new Pool({ connectionString: mustGetEnv("DIRECT_URL") });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Seed-time credentials (never hardcoded) ───────────────────────────────
  const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
  const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Admin";
  const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
  const ARKETOPS_ADMIN_PW = process.env.SEED_ARKETOPS_ADMIN_PASSWORD;
  const ARKETOPS_VIEWER_PW = process.env.SEED_ARKETOPS_VIEWER_PASSWORD;

  // ── Principal admin user ──────────────────────────────────────────────────
  // Single consolidated admin. Created only when SEED_ADMIN_EMAIL is provided.
  // Password set only when SEED_ADMIN_PASSWORD is provided.
  // An existing password is NEVER overwritten when the variable is absent.

  let adminUser: { id: string; email: string } | null = null;

  if (!ADMIN_EMAIL) {
    console.warn("WARN: SEED_ADMIN_EMAIL not set — skipping admin user creation/update");
  } else {
    adminUser = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { name: ADMIN_NAME },
      create: { email: ADMIN_EMAIL, name: ADMIN_NAME },
    });

    if (!ADMIN_PASSWORD) {
      console.warn("WARN: SEED_ADMIN_PASSWORD not set — existing credential preserved (or none created)");
    } else {
      const hash = await hashPassword(ADMIN_PASSWORD);
      await prisma.passwordCredential.upsert({
        where: { userId: adminUser.id },
        update: { passwordHash: hash },
        create: { userId: adminUser.id, passwordHash: hash },
      });
    }
  }

  // ── Agentik org ───────────────────────────────────────────────────────────

  const ORG_SLUG = "agentik";
  const ORG_NAME = "Agentik";
  const PROJECT_NAME = "Agentik Main";
  const PROJECT_KEY = "agentik-main";

  const orgSettings = {
    timezone: "America/Bogota",
    currency: "COP",
    brand: {
      name: "Agentik",
      ...(ADMIN_EMAIL ? { primaryEmail: ADMIN_EMAIL } : {}),
    },
  };

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {
      name: ORG_NAME,
      status: "ACTIVE",
      type: "ENTERPRISE",
      settingsJson: orgSettings,
    },
    create: {
      name: ORG_NAME,
      slug: ORG_SLUG,
      status: "ACTIVE",
      type: "ENTERPRISE",
      settingsJson: orgSettings,
    },
  });

  if (adminUser) {
    await prisma.membership.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: adminUser.id },
      },
      update: { role: Role.SUPER_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
      create: {
        organizationId: org.id,
        userId: adminUser.id,
        role: Role.SUPER_ADMIN,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
  }

  // Agentik main project
  const project = await prisma.project.upsert({
    where: {
      organizationId_key: { organizationId: org.id, key: PROJECT_KEY },
    },
    update: {
      name: PROJECT_NAME,
      status: "ACTIVE",
      description:
        "Proyecto principal (unico) para el dashboard Enterprise de Agentik.",
      settingsJson: { isMain: true },
    },
    create: {
      organizationId: org.id,
      name: PROJECT_NAME,
      key: PROJECT_KEY,
      status: "ACTIVE",
      description:
        "Proyecto principal (unico) para el dashboard Enterprise de Agentik.",
      settingsJson: { isMain: true },
    },
  });

  // ProjectModules base
  const modules = [
    { code: "CONTROL_CENTER", enabled: true },
    { code: "LUCA_MARKETING", enabled: true },
    { code: "MILA_WHATSAPP", enabled: false },
    { code: "SOFI_SALES", enabled: false },
    { code: "ENZO_OPS", enabled: false },
    { code: "INTEGRATIONS", enabled: true },
    { code: "RUNS_LOGS", enabled: true },
  ] as const;

  for (const m of modules) {
    await prisma.projectModule.upsert({
      where: { projectId_code: { projectId: project.id, code: m.code } },
      update: { enabled: m.enabled },
      create: {
        projectId: project.id,
        code: m.code,
        enabled: m.enabled,
        configJson: {},
      },
    });
  }

  // ── Castillitos org ─────────────────────────────────────────────────────────

  const castillitos = await prisma.organization.upsert({
    where: { slug: "castillitos" },
    update: { name: "Castillitos", status: "ACTIVE" },
    create: {
      name: "Castillitos",
      slug: "castillitos",
      type: "ENTERPRISE",
      status: "ACTIVE",
    },
  });

  if (adminUser) {
    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: castillitos.id,
          userId: adminUser.id,
        },
      },
      update: { role: Role.SUPER_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
      create: {
        organizationId: castillitos.id,
        userId: adminUser.id,
        role: Role.SUPER_ADMIN,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
  }

  // Castillitos opt-in modules
  const castillitosOptInModules = ["production", "inventory", "marketing_studio", "copilot"];
  for (const moduleKey of castillitosOptInModules) {
    await (prisma as any).tenantModule.upsert({
      where: {
        organizationId_moduleKey: {
          organizationId: castillitos.id,
          moduleKey,
        },
      },
      update: { enabled: true },
      create: {
        organizationId: castillitos.id,
        moduleKey,
        enabled: true,
      },
    });
  }

  // Castillitos branding
  await (prisma as any).organizationBranding.upsert({
    where: { organizationId: castillitos.id },
    update: {},
    create: {
      organizationId: castillitos.id,
      commercialName: "Castillitos",
      legalName: "Castillitos",
      country: "Colombia",
      primaryColor: "#004AAD",
      secondaryColor: "#1e1e2e",
      accentColor: "#004AAD",
      documentFooter: "Documento generado por Agentik para Castillitos.",
    },
  });

  // ── Pets workspace ───────────────────────────────────────────────────────────

  const petsWorkspace = await prisma.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: castillitos.id,
        slug: "pets",
      },
    },
    update: { name: "Pets" },
    create: {
      organizationId: castillitos.id,
      name: "Pets",
      slug: "pets",
      type: "BRAND",
    },
  });

  if (adminUser) {
    await prisma.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: petsWorkspace.id,
          userId: adminUser.id,
        },
      },
      update: { role: Role.ORG_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
      create: {
        workspaceId: petsWorkspace.id,
        userId: adminUser.id,
        role: Role.ORG_ADMIN,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
  }

  // ── ARKETOPS org ─────────────────────────────────────────────────────────────

  const arketops = await prisma.organization.upsert({
    where: { slug: "arketops" },
    update: { name: "ARKETOPS", status: "ACTIVE" },
    create: {
      name: "ARKETOPS",
      slug: "arketops",
      type: "SAAS_CUSTOMER",
      status: "ACTIVE",
    },
  });

  // ARKETOPS admin — full org access + all client workspaces
  const arketopsAdmin = await prisma.user.upsert({
    where: { email: "admin@arketops.local" },
    update: { name: "ARKETOPS Admin" },
    create: { email: "admin@arketops.local", name: "ARKETOPS Admin" },
  });

  if (ARKETOPS_ADMIN_PW) {
    const hash = await hashPassword(ARKETOPS_ADMIN_PW);
    await prisma.passwordCredential.upsert({
      where: { userId: arketopsAdmin.id },
      update: { passwordHash: hash },
      create: { userId: arketopsAdmin.id, passwordHash: hash },
    });
  } else {
    console.warn("WARN: SEED_ARKETOPS_ADMIN_PASSWORD not set — credential unchanged");
  }

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: arketops.id, userId: arketopsAdmin.id } },
    update: { role: Role.ORG_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
    create: {
      organizationId: arketops.id,
      userId: arketopsAdmin.id,
      role: Role.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    },
  });

  // Client workspaces
  const clienteDemo1 = await prisma.workspace.upsert({
    where: { organizationId_slug: { organizationId: arketops.id, slug: "cliente-demo-1" } },
    update: { name: "Cliente Demo 1" },
    create: {
      organizationId: arketops.id,
      name: "Cliente Demo 1",
      slug: "cliente-demo-1",
      type: "CLIENT",
    },
  });

  const restauranteDemo = await prisma.workspace.upsert({
    where: { organizationId_slug: { organizationId: arketops.id, slug: "restaurante-demo" } },
    update: { name: "Restaurante Demo" },
    create: {
      organizationId: arketops.id,
      name: "Restaurante Demo",
      slug: "restaurante-demo",
      type: "CLIENT",
    },
  });

  // Admin has access to both client workspaces
  for (const ws of [clienteDemo1, restauranteDemo]) {
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: arketopsAdmin.id } },
      update: { role: Role.MANAGER, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
      create: {
        workspaceId: ws.id,
        userId: arketopsAdmin.id,
        role: Role.MANAGER,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
  }

  // External client user — limited org access, workspace scoped to cliente-demo-1 only
  const externalClient = await prisma.user.upsert({
    where: { email: "cliente1@arketops.local" },
    update: { name: "Cliente Demo 1" },
    create: { email: "cliente1@arketops.local", name: "Cliente Demo 1" },
  });

  if (ARKETOPS_VIEWER_PW) {
    const hash = await hashPassword(ARKETOPS_VIEWER_PW);
    await prisma.passwordCredential.upsert({
      where: { userId: externalClient.id },
      update: { passwordHash: hash },
      create: { userId: externalClient.id, passwordHash: hash },
    });
  } else {
    console.warn("WARN: SEED_ARKETOPS_VIEWER_PASSWORD not set — credential unchanged");
  }

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: arketops.id, userId: externalClient.id } },
    update: { role: Role.VIEWER, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
    create: {
      organizationId: arketops.id,
      userId: externalClient.id,
      role: Role.VIEWER,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    },
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: clienteDemo1.id, userId: externalClient.id } },
    update: { role: Role.VIEWER, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
    create: {
      workspaceId: clienteDemo1.id,
      userId: externalClient.id,
      role: Role.VIEWER,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    },
  });

  // ── Demo projects (needed for workspace-linked activity) ─────────────────────

  const castillitosProject = await prisma.project.upsert({
    where: { organizationId_key: { organizationId: castillitos.id, key: "castillitos-main" } },
    update: {},
    create: { organizationId: castillitos.id, name: "Castillitos Main", key: "castillitos-main", status: "ACTIVE" },
  });

  const petsProject = await prisma.project.upsert({
    where: { organizationId_key: { organizationId: castillitos.id, key: "pets-main" } },
    update: { workspaceId: petsWorkspace.id },
    create: { organizationId: castillitos.id, workspaceId: petsWorkspace.id, name: "Pets Main", key: "pets-main", status: "ACTIVE" },
  });

  const arketopsProject = await prisma.project.upsert({
    where: { organizationId_key: { organizationId: arketops.id, key: "arketops-main" } },
    update: {},
    create: { organizationId: arketops.id, name: "ARKETOPS Main", key: "arketops-main", status: "ACTIVE" },
  });

  const clienteDemo1Project = await prisma.project.upsert({
    where: { organizationId_key: { organizationId: arketops.id, key: "cliente-demo-1-main" } },
    update: { workspaceId: clienteDemo1.id },
    create: { organizationId: arketops.id, workspaceId: clienteDemo1.id, name: "Cliente Demo 1 Main", key: "cliente-demo-1-main", status: "ACTIVE" },
  });

  // ── Demo activity (skip if already exists) ────────────────────────────────────

  const existingActivity = await prisma.run.count({
    where: { organizationId: { in: [castillitos.id, arketops.id] } },
  });

  if (existingActivity === 0) {
    await prisma.run.createMany({
      data: [
        { organizationId: castillitos.id, projectId: castillitosProject.id, type: "marketing.image_export", status: RunStatus.SUCCEEDED, startedAt: new Date(), endedAt: new Date() },
        { organizationId: castillitos.id, projectId: petsProject.id, type: "catalog.update", status: RunStatus.SUCCEEDED, startedAt: new Date(), endedAt: new Date() },
        { organizationId: arketops.id, projectId: arketopsProject.id, type: "report.generate", status: RunStatus.RUNNING, startedAt: new Date() },
        { organizationId: arketops.id, projectId: clienteDemo1Project.id, type: "invoice.process", status: RunStatus.SUCCEEDED, startedAt: new Date(), endedAt: new Date() },
      ],
    });

    await prisma.alert.createMany({
      data: [
        { organizationId: arketops.id, projectId: clienteDemo1Project.id, type: "invoice.overdue", title: "Factura vencida", message: "Cliente Demo 1 tiene facturas por vencer", severity: AlertSeverity.WARNING, status: AlertStatus.OPEN },
      ],
    });

    await prisma.event.createMany({
      data: [
        { organizationId: arketops.id, projectId: arketopsProject.id, type: "report.requested", sourceType: "user", payloadJson: { reportType: "monthly" }, status: EventStatus.PENDING },
        { organizationId: arketops.id, projectId: clienteDemo1Project.id, type: "invoice.received", sourceType: "integration", payloadJson: { invoiceId: "INV-2024-001", amount: 1500 }, status: EventStatus.PROCESSED, processedAt: new Date() },
      ],
    });
  }

  // ── Do Jeans org ─────────────────────────────────────────────────────────────

  const doJeans = await prisma.organization.upsert({
    where: { slug: "do-jeans" },
    update: { name: "Do Jeans", status: "ACTIVE" },
    create: {
      name: "Do Jeans",
      slug: "do-jeans",
      type: "ENTERPRISE",
      status: "ACTIVE",
    },
  });

  if (adminUser) {
    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: doJeans.id,
          userId: adminUser.id,
        },
      },
      update: { role: Role.SUPER_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
      create: {
        organizationId: doJeans.id,
        userId: adminUser.id,
        role: Role.SUPER_ADMIN,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
  }

  // ── Summary (never prints secrets) ────────────────────────────────────────────

  console.log("Seed OK");
  console.log({
    adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : "SKIPPED (SEED_ADMIN_EMAIL not set)",
    org: { id: org.id, slug: org.slug },
    project: { id: project.id, key: project.key },
    modules: modules.map((m) => `${m.code}:${m.enabled ? "on" : "off"}`),
    castillitos: { id: castillitos.id, slug: castillitos.slug },
    petsWorkspace: { id: petsWorkspace.id, slug: petsWorkspace.slug },
    arketops: { id: arketops.id, slug: arketops.slug },
    arketopsAdmin: { id: arketopsAdmin.id, email: arketopsAdmin.email },
    arketopsWorkspaces: [
      { slug: clienteDemo1.slug },
      { slug: restauranteDemo.slug },
    ],
    externalClient: { id: externalClient.id, email: externalClient.email },
    doJeans: { id: doJeans.id, slug: doJeans.slug },
    demoActivity: existingActivity === 0 ? "created" : "skipped (already exists)",
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
