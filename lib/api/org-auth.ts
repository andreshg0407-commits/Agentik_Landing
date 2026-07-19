import { MembershipStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

// Validates that the current session user has an active membership
// in the given organization. Returns { user, role } or null.
export async function requireOrgMembership(organizationId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId, status: MembershipStatus.ACTIVE },
    select: { role: true },
  });

  if (!membership) return null;
  return { user, role: membership.role };
}
