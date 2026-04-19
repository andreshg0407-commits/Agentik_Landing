import { MembershipStatus, IntegrationProvider } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

/**
 * Validates:
 *  1. User is authenticated
 *  2. User has active membership in the given organization
 *  3. The integration exists, belongs to that organization, and matches the expected provider
 *
 * Returns { user, role, integration } or throws a typed error string.
 */
export async function requireIntegrationAccess(
  organizationId: string,
  integrationId: string,
  provider: IntegrationProvider
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId, status: MembershipStatus.ACTIVE },
    select: { role: true },
  });
  if (!membership) throw new Error("ACCESS_DENIED");

  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId, provider },
    select: { id: true, provider: true, status: true, name: true, configJson: true },
  });
  if (!integration) throw new Error("INTEGRATION_NOT_FOUND");

  return { user, role: membership.role, integration };
}
