/**
 * lib/auth/post-login-destination.ts
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * Canonical post-login destination resolver.
 *
 * After successful authentication, determines the correct product surface
 * based on: organization, membership, role, seller identity, module permissions.
 *
 * Rules (in precedence order):
 *   1. Valid internal callback → return callback (if user has access)
 *   2. Provisioned seller (OPERATOR/VIEWER with sellerSlug) → /{orgSlug}/seller-app
 *   3. Admin/Manager → /{orgSlug} (org root handles role-based redirect)
 *   4. Multi-org user with no deterministic org → /select-org (org selector)
 *   5. Single-org user → /{orgSlug} (org root handles role-based redirect)
 *
 * SERVER ONLY.
 */

import "server-only";
import { MembershipStatus, OrgStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";

export interface PostLoginDestination {
  destination: string;
  reason: string;
}

/**
 * Resolves the correct post-login destination for the current authenticated user.
 *
 * @param requestedCallback  Optional callbackUrl from the login page. Must already
 *                           be sanitized (internal path only). Pass null/undefined
 *                           or "/" to skip callback precedence.
 */
export async function resolvePostLoginDestination(
  requestedCallback?: string | null,
): Promise<PostLoginDestination> {
  const user = await getCurrentUser();
  if (!user) {
    return { destination: "/login", reason: "unauthenticated" };
  }

  // Load all active memberships
  const memberships = await prisma.membership.findMany({
    where: {
      userId: user.id,
      status: MembershipStatus.ACTIVE,
      organization: {
        status: OrgStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      role: true,
      permissionsJson: true,
      organization: { select: { slug: true } },
    },
  });

  if (memberships.length === 0) {
    return { destination: "/unauthorized", reason: "no_active_membership" };
  }

  // ── 1. Valid internal callback with access ────────────────────────────────
  if (requestedCallback && requestedCallback !== "/") {
    // Extract orgSlug from callback path: /orgSlug/...
    const callbackOrgSlug = extractOrgSlug(requestedCallback);
    if (callbackOrgSlug) {
      const hasAccess = memberships.some(m => m.organization.slug === callbackOrgSlug);
      if (hasAccess) {
        // Check seller confinement: seller cannot access enterprise paths via callback
        const membership = memberships.find(m => m.organization.slug === callbackOrgSlug);
        if (membership && isProvisionedSeller(membership)) {
          // Sellers can only access seller-app paths
          if (requestedCallback.includes("/seller-app")) {
            return { destination: requestedCallback, reason: "callback_seller_app" };
          }
          // Redirect seller to seller-app instead of enterprise callback
          return {
            destination: `/${callbackOrgSlug}/seller-app`,
            reason: "callback_seller_confined",
          };
        }
        return { destination: requestedCallback, reason: "callback_valid" };
      }
    }
    // Callback org not accessible — fall through to default routing
  }

  // ── 2–5. Default routing based on memberships ────────────────────────────

  if (memberships.length === 1) {
    const m = memberships[0];
    const orgSlug = m.organization.slug;

    // Provisioned seller → seller-app
    if (isProvisionedSeller(m)) {
      return {
        destination: `/${orgSlug}/seller-app`,
        reason: "seller_default",
      };
    }

    // All other roles → org root (handles role-based redirect server-side)
    return {
      destination: `/${orgSlug}`,
      reason: "single_org_default",
    };
  }

  // Multi-org: try to find a deterministic single org
  // If user has exactly one non-seller membership, prefer that
  // Otherwise route to org selector
  const nonSellerMemberships = memberships.filter(m => !isProvisionedSeller(m));
  const sellerMemberships = memberships.filter(m => isProvisionedSeller(m));

  // If all memberships are for the same org, route there
  const uniqueOrgs = new Set(memberships.map(m => m.organization.slug));
  if (uniqueOrgs.size === 1) {
    const orgSlug = memberships[0].organization.slug;
    if (sellerMemberships.length > 0 && nonSellerMemberships.length === 0) {
      return { destination: `/${orgSlug}/seller-app`, reason: "single_org_seller" };
    }
    return { destination: `/${orgSlug}`, reason: "single_org_default" };
  }

  // True multi-org — route to org selector. DO NOT guess.
  return {
    destination: "/select-org",
    reason: "multi_org_selector",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isProvisionedSeller(membership: {
  role: string;
  permissionsJson: unknown;
}): boolean {
  const SELLER_ROLES = new Set(["OPERATOR", "VIEWER"]);
  if (!SELLER_ROLES.has(membership.role)) return false;
  const perms = membership.permissionsJson as Record<string, unknown> | null;
  return !!perms?.sellerSlug;
}

function extractOrgSlug(path: string): string | null {
  // Path format: /orgSlug/... — extract first segment
  const match = path.match(/^\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}
