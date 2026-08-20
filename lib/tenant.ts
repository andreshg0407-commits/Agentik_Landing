// lib/tenant.ts
import { prisma } from "@/lib/prisma";
import { ensureMainProject } from "@/lib/ensure-main-project";
import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";

// ── Platform role type ──────────────────────────────────────────────────────────
// Mirrors the PlatformRole enum in schema.prisma.
// Defined here as a string literal union for runtime use without requiring
// prisma generate to have run with the new enum (backward compatibility).
export type PlatformRoleValue = "SUPER_ADMIN" | "AGENTIK_ADMIN";

export type TenantContext = {
  userId: string;
  orgId: string;
  orgSlug: string;
  /**
   * Organization membership role — tenant authority only.
   * null when a platform SUPER_ADMIN accesses a tenant without membership.
   * NEVER contains platformRole values — only Membership.role.
   */
  role: Role | null;
  /** Global platform role — independent of membership. null = tenant-only user. */
  platformRole: PlatformRoleValue | null;
  projectId: string;
  projectKey: string;
};

// Jerarquía simple — AGENTIK_ADMIN es lateral (interno), no por encima de ORG_ADMIN en el dominio cliente
const ROLE_ORDER: Role[] = ["VIEWER", "BILLING", "OPERATOR", "MANAGER", "ORG_ADMIN", "AGENTIK_ADMIN", "SUPER_ADMIN"];
const roleGte = (a: Role, b: Role) => ROLE_ORDER.indexOf(a) >= ROLE_ORDER.indexOf(b);

/**
 * Reads the platformRole from the User table.
 *
 * BACKWARD COMPATIBLE: if the platformRole column does not yet exist
 * (migration not applied), returns null without throwing.
 *
 * SAFETY: Only suppresses Prisma P2022 (column not found).
 * All other errors (connection, permission, timeout, corruption)
 * are rethrown and remain observable.
 */
async function readPlatformRole(userId: string): Promise<PlatformRoleValue | null> {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { platformRole: true },
    });
    const role = user?.platformRole as string | null | undefined;
    if (role === "SUPER_ADMIN" || role === "AGENTIK_ADMIN") return role;
    return null;
  } catch (err: unknown) {
    // P2022: column does not exist — migration not yet applied.
    // This is the ONLY acceptable degradation path.
    if (isPrismaColumnNotFound(err)) return null;
    // All other errors (connection, permissions, timeout, etc.) must propagate.
    throw err;
  }
}

/**
 * Detects Prisma P2022 "column does not exist" errors.
 * Used exclusively by readPlatformRole for backward-compatible column reads.
 */
function isPrismaColumnNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  // Prisma Client known error with code P2022
  if ("code" in err && (err as { code: string }).code === "P2022") return true;
  // Prisma adapter / raw query: column "platformRole" does not exist
  const msg = "message" in err ? String((err as { message: string }).message) : "";
  if (msg.includes("column") && msg.includes("platformRole") && msg.includes("does not exist")) return true;
  return false;
}

/**
 * Resuelve el contexto multi-tenant por orgSlug:
 *
 * 1. Authenticate user.
 * 2. Resolve Organization by slug.
 * 3. Read User.platformRole (global authority, independent of membership).
 * 4. Look up Membership in this org.
 * 5. Grant access if:
 *    a. User has ACTIVE membership in this org, OR
 *    b. User.platformRole = SUPER_ADMIN (global review access without membership).
 * 6. Return platformRole and membershipRole SEPARATELY — never conflated.
 *
 * organizationId delimits ALL downstream queries regardless of platform authority.
 * Platform bypass controls module/entitlement visibility, never data scope.
 */
export async function requireTenant(orgSlug: string, minRole?: Role): Promise<TenantContext> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("ORG_NOT_FOUND");

  // ── Platform authority (global, independent of membership) ──────────────────
  const platformRole = await readPlatformRole(user.id);

  // ── Tenant membership ───────────────────────────────────────────────────────
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    select: { role: true, status: true },
  });

  const hasActiveMembership = membership?.status === "ACTIVE";
  const membershipRole: Role | null = hasActiveMembership ? membership!.role : null;

  // ── Access decision ─────────────────────────────────────────────────────────
  // Path A: active membership in this org → standard tenant access.
  // Path B: platformRole=SUPER_ADMIN → global review access (no membership required).
  //         The organizationId still scopes ALL queries.
  if (!hasActiveMembership && platformRole !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN_NOT_MEMBER");
  }

  // minRole check applies only to membership role (tenant authority).
  // Platform SUPER_ADMIN bypasses minRole — they can review any route.
  if (minRole && membershipRole !== null && !roleGte(membershipRole, minRole)) {
    if (platformRole !== "SUPER_ADMIN") {
      throw new Error("FORBIDDEN_ROLE");
    }
  }

  // ✅ (MVP) garantizamos un solo project principal
  const project = await ensureMainProject(org.id);

  return {
    userId: user.id,
    orgId: org.id,
    orgSlug: org.slug,
    role: membershipRole,
    platformRole,
    projectId: project.id,
    projectKey: project.key,
  };
}
