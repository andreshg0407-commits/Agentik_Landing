import { MembershipStatus, OrgStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

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
