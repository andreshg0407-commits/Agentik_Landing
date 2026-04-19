import { MembershipStatus, OrgStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

export async function getAccessibleOrganizations() {
  const user = await getCurrentUser();
  if (!user) return [];

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
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return memberships.map(({ role, organization }) => ({ ...organization, role }));
}
