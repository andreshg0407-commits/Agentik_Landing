/**
 * lib/auth/platform-authority.ts
 *
 * Canonical resolvers for the PLATFORM vs TENANT authority boundary.
 *
 * Sprint: PLATFORM-AUTHORITY-SEPARATION-01
 *
 * ── Design ──────────────────────────────────────────────────────────────────────
 *
 * Platform identity and tenant membership are INDEPENDENT dimensions:
 *
 *   platformRole      — stored on User.platformRole (global, independent of org).
 *                       NEVER derived from Membership.role, email, org slug, or flags.
 *
 *   membershipRole    — stored on Membership.role (scoped to one organization).
 *                       Represents tenant authority only.
 *
 * ── Platform roles ──────────────────────────────────────────────────────────────
 *
 *   SUPER_ADMIN   — full platform override; bypasses tenant entitlement censorship
 *   AGENTIK_ADMIN — internal console access; no client business data
 *   null          — no platform authority (tenant-only user)
 *
 * ── Key rules ───────────────────────────────────────────────────────────────────
 *
 *   - Platform authority is NEVER inferred from Membership.role.
 *   - A membership with role=SUPER_ADMIN does NOT grant platform authority.
 *   - Only User.platformRole grants platform authority.
 *   - Selecting a tenant scopes DATA, never degrades platformRole.
 *   - ORG_ADMIN in the "agentik" org does NOT equal platform user.
 */

import type { Role } from "@prisma/client";
import type { PlatformRoleValue } from "@/lib/tenant";
import type { ModuleKey } from "@/lib/tenant/modules";
import { getModulesForRole } from "./module-access";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface PlatformAuthority {
  /** True when the user holds a global platform role (User.platformRole != null). */
  isPlatformUser: boolean;
  /** The platform role, or null for tenant-only users. */
  platformRole: PlatformRoleValue | null;
  /** Platform SUPER_ADMIN can bypass tenant entitlement censorship in nav/UI. */
  bypassEntitlementCensorship: boolean;
  /** Platform user can access internal console surfaces. */
  canAccessInternalConsole: boolean;
}

export interface TenantAuthority {
  /** The org-level membership role (tenant authority). */
  orgRole: Role;
  /** Modules enabled for the tenant (entitlement layer). */
  orgEntitledModules: Set<ModuleKey>;
  /** Whether the user is a seller confined to Seller App. */
  isSellerConfined: boolean;
}

export interface EffectiveAccess {
  /** The source of authority that granted access. */
  grantedBy: "platform" | "tenant" | "both";
  /** Whether the module is accessible. */
  accessible: boolean;
  /** Whether the nav should show the full module (vs stub). */
  showFullNav: boolean;
}

// ── Platform Authority Resolution ────────────────────────────────────────────────

/**
 * Resolves platform authority from User.platformRole.
 *
 * This is the CANONICAL source of platform authority. It takes the global
 * platformRole from the User record — NOT from Membership.role.
 *
 * @param platformRole — User.platformRole value (null for tenant-only users).
 */
export function resolvePlatformAuthority(platformRole: PlatformRoleValue | null): PlatformAuthority {
  const isPlatformUser = platformRole !== null;

  return {
    isPlatformUser,
    platformRole,
    bypassEntitlementCensorship: platformRole === "SUPER_ADMIN",
    canAccessInternalConsole: platformRole === "SUPER_ADMIN" || platformRole === "AGENTIK_ADMIN",
  };
}

/**
 * Resolves tenant authority from org membership and entitlements.
 * orgRole may be null when a platform SUPER_ADMIN reviews without membership.
 * In that case, role-based module filtering defaults to VIEWER (minimum).
 */
export function resolveTenantAuthority(
  orgRole: Role | null,
  orgEntitledModules: Set<ModuleKey>,
  isSellerConfined: boolean,
): TenantAuthority {
  return { orgRole: orgRole ?? ("VIEWER" as Role), orgEntitledModules, isSellerConfined };
}

/**
 * Resolves effective access for a specific module given platform and tenant authority.
 *
 * Decision logic:
 *   1. Platform SUPER_ADMIN: always accessible, full nav (platform bypass).
 *   2. Platform AGENTIK_ADMIN: accessible only if in internal module set.
 *   3. Tenant users: accessible only if BOTH role-permitted AND org-entitled.
 */
export function resolveEffectiveAccess(
  platform: PlatformAuthority,
  tenant: TenantAuthority,
  moduleKey: ModuleKey,
): EffectiveAccess {
  const roleModules = getModulesForRole(tenant.orgRole);
  const rolePermits = roleModules.has(moduleKey);
  const orgEntitles = tenant.orgEntitledModules.has(moduleKey);

  // Platform SUPER_ADMIN: full override — bypasses all tenant entitlements
  if (platform.bypassEntitlementCensorship) {
    return {
      grantedBy: "platform",
      accessible: true,
      showFullNav: true,
    };
  }

  // Platform AGENTIK_ADMIN: internal modules only via platform authority
  if (platform.canAccessInternalConsole) {
    const agentikModules = getModulesForRole("AGENTIK_ADMIN");
    const platformPermits = agentikModules.has(moduleKey);
    if (platformPermits) {
      return {
        grantedBy: "platform",
        accessible: true,
        showFullNav: true,
      };
    }
  }

  // Tenant user (or platform user accessing non-platform module): intersection
  const accessible = rolePermits && orgEntitles;
  return {
    grantedBy: "tenant",
    accessible,
    showFullNav: accessible,
  };
}
