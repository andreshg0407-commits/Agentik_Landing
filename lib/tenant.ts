// lib/tenant.ts
import { prisma } from "@/lib/prisma";
import { ensureMainProject } from "@/lib/ensure-main-project";
import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";

export type TenantContext = {
  userId: string;
  orgId: string;
  orgSlug: string;
  role: Role;
  projectId: string;
  projectKey: string;
};

// Jerarquía simple — AGENTIK_ADMIN es lateral (interno), no por encima de ORG_ADMIN en el dominio cliente
const ROLE_ORDER: Role[] = ["VIEWER", "BILLING", "OPERATOR", "MANAGER", "ORG_ADMIN", "AGENTIK_ADMIN", "SUPER_ADMIN"];
const roleGte = (a: Role, b: Role) => ROLE_ORDER.indexOf(a) >= ROLE_ORDER.indexOf(b);

/**
 * Resuelve el contexto multi-tenant por orgSlug:
 * - user autenticado
 * - org existe
 * - membership ACTIVE
 * - (MVP) project principal garantizado (key="main")
 */
export async function requireTenant(orgSlug: string, minRole?: Role): Promise<TenantContext> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("ORG_NOT_FOUND");

  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE") throw new Error("FORBIDDEN_NOT_MEMBER");

  if (minRole && !roleGte(membership.role, minRole)) {
    throw new Error("FORBIDDEN_ROLE");
  }

  // ✅ (MVP) garantizamos un solo project principal
  const project = await ensureMainProject(org.id);

  return {
    userId: user.id,
    orgId: org.id,
    orgSlug: org.slug,
    role: membership.role,
    projectId: project.id,
    projectKey: project.key,
  };
}