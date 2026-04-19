import { MembershipStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/auth";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";

// Internal: use when workspaceId is already known and org-level access
// has been verified upstream. Does not re-check org membership.
async function requireWorkspaceAccessById(workspaceId: string) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, organizationId: true, name: true, slug: true, type: true, deletedAt: true },
  });

  if (!workspace || workspace.deletedAt) {
    throw new Error("WORKSPACE_NOT_FOUND");
  }

  const workspaceMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    select: { id: true, role: true, status: true },
  });

  if (!workspaceMembership || workspaceMembership.status !== MembershipStatus.ACTIVE) {
    throw new Error("ACCESS_DENIED");
  }

  return { user, workspace, workspaceMembership };
}

export async function requireWorkspaceAccess(orgSlug: string, workspaceSlug: string) {
  const { user, organization, membership } = await requireOrgAccess(orgSlug);

  const workspace = await prisma.workspace.findUnique({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: workspaceSlug,
      },
    },
    select: { id: true, organizationId: true, name: true, slug: true, type: true, deletedAt: true },
  });

  if (!workspace || workspace.deletedAt) {
    throw new Error("WORKSPACE_NOT_FOUND");
  }

  const workspaceMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    select: { id: true, role: true, status: true },
  });

  if (!workspaceMembership || workspaceMembership.status !== MembershipStatus.ACTIVE) {
    throw new Error("ACCESS_DENIED");
  }

  return { user, organization, membership, workspace, workspaceMembership };
}

export { requireWorkspaceAccessById };
