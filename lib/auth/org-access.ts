import { MembershipStatus, OrgStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import type { ModuleKey } from "@/lib/tenant/modules";
import { getEnabledModules } from "@/lib/tenant/modules";
import { getModulesForRole } from "@/lib/auth/module-access";

// ── Seller confinement at API level ─────────────────────────────────────────
// Provisioned sellers (OPERATOR/VIEWER with sellerSlug in permissionsJson) are
// confined to Seller App APIs. By default, requireOrgAccess DENIES them.
// Seller App API routes opt in with { allowProvisionedSeller: true }.
// Non-provisioned OPERATOR/VIEWER (no sellerSlug) are unaffected.

const SELLER_CONFINED_ROLES = new Set(["OPERATOR", "VIEWER"]);

export interface OrgAccessOptions {
  /** Set true for Seller App API routes. Default false = enterprise only. */
  allowProvisionedSeller?: boolean;
}

export async function requireOrgAccess(orgSlug: string, opts?: OrgAccessOptions) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  if (!organization || organization.deletedAt) {
    throw new Error("ORG_NOT_FOUND");
  }

  if (organization.status !== OrgStatus.ACTIVE) {
    throw new Error("ORG_INACTIVE");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    select: { id: true, role: true, status: true, permissionsJson: true },
  });

  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new Error("ACCESS_DENIED");
  }

  // Seller confinement gate: provisioned sellers cannot call enterprise APIs
  if (!opts?.allowProvisionedSeller && SELLER_CONFINED_ROLES.has(membership.role)) {
    const perms = membership.permissionsJson as Record<string, unknown> | null;
    if (perms?.sellerSlug) {
      throw new Error("ACCESS_DENIED_SELLER_CONFINED");
    }
  }

  return { user, organization, membership };
}

// ── Module entitlement guard ──────────────────────────────────────────────────
//
// Layout visibility is NOT security. APIs must enforce tenant entitlements
// server-side. This guard checks:
//   1. Org membership (via requireOrgAccess)
//   2. Module enabled for org (tenant entitlement)
//   3. Module allowed for role (role-based access)
//
// SUPER_ADMIN BYPASS: SUPER_ADMIN can access any module WITHOUT creating
// TenantModule rows, commercial terms, or billing periods. This is a
// read-only inspection capability — no tenant state is mutated.
//
// INTERNAL MODULE BYPASS: Internal modules (agentik, runs, events, etc.)
// are not gated by tenant entitlements — only by role permissions.

export interface ModuleAccessOptions extends OrgAccessOptions {
  /** The module key to check entitlement for. */
  moduleKey: ModuleKey;
}

/**
 * Centralized API-level module entitlement guard.
 *
 * Checks org membership + module entitlement + role permission.
 * Throws "MODULE_ACCESS_DENIED" (403) if the module is not available.
 *
 * SUPER_ADMIN bypasses tenant entitlement checks (no mutations).
 * Internal modules bypass tenant entitlement checks (role-only gate).
 */
export async function requireTenantModuleAccess(
  orgSlug: string,
  opts: ModuleAccessOptions,
) {
  const ctx = await requireOrgAccess(orgSlug, opts);

  const { moduleKey } = opts;
  const role = ctx.membership.role;

  // Step 1: Role permission check — does this role have access to this module?
  const roleModules = getModulesForRole(role);
  if (!roleModules.has(moduleKey)) {
    throw new Error("MODULE_ACCESS_DENIED");
  }

  // Step 2: SUPER_ADMIN bypass — can inspect any module without tenant mutation.
  if (role === "SUPER_ADMIN") {
    return ctx;
  }

  // Step 3: Tenant entitlement check — is this module enabled for the org?
  const orgModules = await getEnabledModules(ctx.organization.id);
  if (!orgModules.has(moduleKey)) {
    throw new Error("MODULE_ACCESS_DENIED");
  }

  return ctx;
}

// ── Domain-specific guards ────────────────────────────────────────────────────
//
// Centralized guards for module API families. Use these instead of
// pasting requireTenantModuleAccess with a hardcoded moduleKey into
// every route handler.
//
// Seller App APIs remain under their own authorization law
// (requireOrgAccess with allowProvisionedSeller: true).

/**
 * Centralized guard for ALL commercial API routes.
 *
 * Enforces: org membership + "sales" module entitlement + role permission.
 * SUPER_ADMIN bypasses entitlement (read-only inspection, no mutations).
 *
 * Usage: replace `requireOrgAccess(orgSlug)` with `requireCommercialAccess(orgSlug)`
 * in any route under /api/orgs/[orgSlug]/comercial/.
 */
export async function requireCommercialAccess(orgSlug: string, opts?: OrgAccessOptions) {
  return requireTenantModuleAccess(orgSlug, { ...opts, moduleKey: "sales" });
}

/**
 * Centralized guard for production API routes.
 */
export async function requireProductionAccess(orgSlug: string, opts?: OrgAccessOptions) {
  return requireTenantModuleAccess(orgSlug, { ...opts, moduleKey: "production" });
}
