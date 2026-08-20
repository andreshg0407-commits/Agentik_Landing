/**
 * lib/auth/platform-authority.ts
 *
 * Canonical resolvers for the PLATFORM vs TENANT authority boundary.
 *
 * Sprint: PLATFORM-REVIEW-PERSONAS-01
 *
 * ── Design ──────────────────────────────────────────────────────────────────────
 *
 * Platform identity and tenant membership are INDEPENDENT dimensions:
 *
 *   platformAuthority — derived from membership role being SUPER_ADMIN or AGENTIK_ADMIN.
 *                       Never inferred from email domain, org membership in "agentik", or flags.
 *
 *   tenantAuthority   — derived from org membership role + entitlements + feature flags.
 *                       Scoped to the selected tenant context.
 *
 * A single account can possess both (explicit dual capacity), calculated separately.
 *
 * ── Platform roles ──────────────────────────────────────────────────────────────
 *
 *   SUPER_ADMIN   — full platform override; bypasses tenant entitlement censorship
 *   AGENTIK_ADMIN — internal console access; no client business data
 *
 * ── Tenant roles ────────────────────────────────────────────────────────────────
 *
 *   ORG_ADMIN, MANAGER, OPERATOR, VIEWER, BILLING — client-facing, scoped to tenant
 *
 * ── Key rules ───────────────────────────────────────────────────────────────────
 *
 *   • Platform authority is NEVER inferred from email, org slug, cookies, or URL params.
 *   • Selecting a tenant scopes DATA, never degrades globalRole.
 *   • ORG_ADMIN in the "agentik" org ≠ platform user.
 *   • Seller in the "agentik" org ≠ platform user.
 *   • External email with explicit SUPER_ADMIN membership = platform user.
 */

import type { Role } from "@prisma/client";
import type { ModuleKey } from "@/lib/tenant/modules";
import { getModulesForRole, isInternalRole } from "./module-access";

// ── Types ────────────────────────────────────────────────────────────────────────

export type PlatformRole = "SUPER_ADMIN" | "AGENTIK_ADMIN";

export interface PlatformAuthority {
  /** True when the user holds a platform-level role (SUPER_ADMIN or AGENTIK_ADMIN). */
  isPlatformUser: boolean;
  /** The platform role, or null for tenant-only users. */
  platformRole: PlatformRole | null;
  /** Platform user can bypass tenant entitlement censorship in nav/UI. */
  bypassEntitlementCensorship: boolean;
  /** Platform user can access internal console surfaces. */
  canAccessInternalConsole: boolean;
}

export interface TenantAuthority {
  /** The org-level membership role. */
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
  /** Whether the nav should show the full module (vs stub/Próximamente). */
  showFullNav: boolean;
}

// ── Platform Authority Resolution ────────────────────────────────────────────────

const PLATFORM_ROLES = new Set<Role>(["SUPER_ADMIN", "AGENTIK_ADMIN"]);

/**
 * Resolves platform authority from the user's membership role in the current org.
 *
 * Platform authority is determined SOLELY by the membership role being one of
 * SUPER_ADMIN or AGENTIK_ADMIN. It is NEVER derived from:
 *   - email domain
 *   - org slug being "agentik"
 *   - feature flags or cookies
 *   - URL parameters
 */
export function resolvePlatformAuthority(membershipRole: Role): PlatformAuthority {
  const isPlatformUser = PLATFORM_ROLES.has(membershipRole);
  const platformRole = isPlatformUser ? (membershipRole as PlatformRole) : null;

  return {
    isPlatformUser,
    platformRole,
    bypassEntitlementCensorship: membershipRole === "SUPER_ADMIN",
    canAccessInternalConsole: isInternalRole(membershipRole),
  };
}

/**
 * Resolves tenant authority from org membership and entitlements.
 */
export function resolveTenantAuthority(
  orgRole: Role,
  orgEntitledModules: Set<ModuleKey>,
  isSellerConfined: boolean,
): TenantAuthority {
  return { orgRole, orgEntitledModules, isSellerConfined };
}

/**
 * Resolves effective access for a specific module given platform and tenant authority.
 *
 * Decision logic:
 *   1. SUPER_ADMIN: always accessible, full nav (platform bypass).
 *   2. AGENTIK_ADMIN: accessible only if role-permitted (internal modules).
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

  // SUPER_ADMIN: full override — role permits all, entitlement bypassed
  if (platform.bypassEntitlementCensorship) {
    return {
      grantedBy: "platform",
      accessible: true,
      showFullNav: true,
    };
  }

  // Non-SUPER platform user (AGENTIK_ADMIN): only role-permitted modules
  if (platform.isPlatformUser) {
    return {
      grantedBy: rolePermits ? "platform" : "tenant",
      accessible: rolePermits,
      showFullNav: rolePermits,
    };
  }

  // Tenant user: intersection of role + entitlement
  const accessible = rolePermits && orgEntitles;
  return {
    grantedBy: "tenant",
    accessible,
    showFullNav: accessible,
  };
}
