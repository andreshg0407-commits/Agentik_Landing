/**
 * /[orgSlug]/agentik/users — Tenant User Administration
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-02
 *
 * Internal Agentik surface for managing organization memberships.
 *
 * ACCESS: SUPER_ADMIN / AGENTIK_ADMIN only (isInternalRole gate).
 * ORG_ADMIN CANNOT access this page.
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole } from "@/lib/auth/module-access";
import { listOrgMembers } from "@/lib/auth/member-admin";
import { UsersAdminClient } from "./users-admin-client";

export default async function UsersAdminPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);

  if (!isInternalRole(membership.role)) {
    redirect(`/${orgSlug}`);
  }

  const result = await listOrgMembers(organization.id, membership.role);
  const members = result.ok ? result.data : [];

  return (
    <UsersAdminClient
      orgSlug={orgSlug}
      orgName={organization.name}
      callerRole={membership.role}
      initialMembers={members.map(m => ({
        ...m,
        invitedAt: m.invitedAt?.toISOString() ?? null,
        acceptedAt: m.acceptedAt?.toISOString() ?? null,
        disabledAt: m.disabledAt?.toISOString() ?? null,
      }))}
    />
  );
}
