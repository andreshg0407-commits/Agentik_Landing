import { MembershipStatus, OrgStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

export async function requireOrgAccess(orgSlug: string) {
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
    select: { id: true, role: true, status: true },
  });

  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new Error("ACCESS_DENIED");
  }

  return { user, organization, membership };
}
