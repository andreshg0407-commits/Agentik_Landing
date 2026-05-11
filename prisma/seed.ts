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

// ✅ Seed usando DIRECT_URL (sin pooler) para evitar sorpresas
const pool = new Pool({ connectionString: mustGetEnv("DIRECT_URL") });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const OWNER_EMAIL = "hello@agentik.com.co";
  const ORG_SLUG = "agentik";
  const ORG_NAME = "Agentik";
  const PROJECT_NAME = "Agentik Main";
  const PROJECT_KEY = "agentik-main";

  // 1) User (owner)
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { name: "Agentik Owner" },
    create: { email: OWNER_EMAIL, name: "Agentik Owner" },
  });

  // 2) Organization
  const orgSettings = {
    timezone: "America/Bogota",
    currency: "COP",
    brand: {
      name: "Agentik",
      primaryEmail: OWNER_EMAIL,
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

  // 3) Membership (owner -> ORG_ADMIN)
  await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: owner.id },
    },
    update: { role: "ORG_ADMIN", status: "ACTIVE", acceptedAt: new Date() },
    create: {
      organizationId: org.id,
      userId: owner.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
      acceptedAt: new Date(),
    },
  });

  // 4) Main Project
  // ✅ FIX: tu schema tiene @@unique([organizationId, key]) => organizationId_key
  const project = await prisma.project.upsert({
    where: {
      organizationId_key: { organizationId: org.id, key: PROJECT_KEY },
    },
    update: {
      name: PROJECT_NAME,
      status: "ACTIVE",
      description:
        "Proyecto principal (único) para el dashboard Enterprise de Agentik.",
      settingsJson: { isMain: true },
    },
    create: {
      organizationId: org.id,
      name: PROJECT_NAME,
      key: PROJECT_KEY,
      status: "ACTIVE",
      description:
        "Proyecto principal (único) para el dashboard Enterprise de Agentik.",
      settingsJson: { isMain: true },
    },
  });

  // 5) ProjectModules base
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

  // ── Auth test user ──────────────────────────────────────────────────────────

  const TEST_EMAIL = "andreshg0407@gmail.com";
  const TEST_PASSWORD = "changeme123"; // change after first login

  const testUser = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { name: "Andres" },
    create: { email: TEST_EMAIL, name: "Andres" },
  });

  const passwordHash = await hashPassword(TEST_PASSWORD);

  await prisma.passwordCredential.upsert({
    where: { userId: testUser.id },
    update: { passwordHash },
    create: { userId: testUser.id, passwordHash },
  });

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

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: castillitos.id,
        userId: testUser.id,
      },
    },
    update: { role: Role.ORG_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
    create: {
      organizationId: castillitos.id,
      userId: testUser.id,
      role: Role.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
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

  await prisma.workspaceMembership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: petsWorkspace.id,
        userId: testUser.id,
      },
    },
    update: { role: Role.ORG_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
    create: {
      workspaceId: petsWorkspace.id,
      userId: testUser.id,
      role: Role.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    },
  });

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

  // Internal admin — full org access + all client workspaces
  const arketopsAdmin = await prisma.user.upsert({
    where: { email: "admin@arketops.local" },
    update: { name: "ARKETOPS Admin" },
    create: { email: "admin@arketops.local", name: "ARKETOPS Admin" },
  });

  await prisma.passwordCredential.upsert({
    where: { userId: arketopsAdmin.id },
    update: { passwordHash: await hashPassword("changeme123") },
    create: { userId: arketopsAdmin.id, passwordHash: await hashPassword("changeme123") },
  });

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

  await prisma.passwordCredential.upsert({
    where: { userId: externalClient.id },
    update: { passwordHash: await hashPassword("changeme123") },
    create: { userId: externalClient.id, passwordHash: await hashPassword("changeme123") },
  });

  // Org-level membership with lowest role so requireOrgAccess passes,
  // but the client cannot see other workspaces they have no WorkspaceMembership in.
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
    // Runs
    await prisma.run.createMany({
      data: [
        { organizationId: castillitos.id, projectId: castillitosProject.id, type: "marketing.image_export", status: RunStatus.SUCCEEDED, startedAt: new Date(), endedAt: new Date() },
        { organizationId: castillitos.id, projectId: petsProject.id, type: "catalog.update", status: RunStatus.SUCCEEDED, startedAt: new Date(), endedAt: new Date() },
        { organizationId: arketops.id, projectId: arketopsProject.id, type: "report.generate", status: RunStatus.RUNNING, startedAt: new Date() },
        { organizationId: arketops.id, projectId: clienteDemo1Project.id, type: "invoice.process", status: RunStatus.SUCCEEDED, startedAt: new Date(), endedAt: new Date() },
      ],
    });

    // Alerts — only non-Castillitos demo alerts; Castillitos noise alerts removed (cleanup-seed-alerts.ts)
    await prisma.alert.createMany({
      data: [
        { organizationId: arketops.id, projectId: clienteDemo1Project.id, type: "invoice.overdue", title: "Factura vencida", message: "Cliente Demo 1 tiene facturas por vencer", severity: AlertSeverity.WARNING, status: AlertStatus.OPEN },
      ],
    });

    // Events — only non-Castillitos demo events; Castillitos prototype events removed (cleanup-seed-alerts.ts)
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

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: doJeans.id,
        userId: testUser.id,
      },
    },
    update: { role: Role.SUPER_ADMIN, status: MembershipStatus.ACTIVE, acceptedAt: new Date() },
    create: {
      organizationId: doJeans.id,
      userId: testUser.id,
      role: Role.SUPER_ADMIN,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    },
  });

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log("✅ Seed OK");
  console.log({
    owner: { id: owner.id, email: owner.email },
    org: { id: org.id, slug: org.slug },
    project: { id: project.id, key: project.key },
    modules: modules.map((m) => `${m.code}:${m.enabled ? "on" : "off"}`),
    testUser: { id: testUser.id, email: testUser.email },
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
    console.error("❌ Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });