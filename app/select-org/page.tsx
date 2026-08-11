/**
 * app/select-org/page.tsx
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * Authenticated organization selector.
 * Displayed when a user belongs to more than one organization
 * and no org is deterministically selected.
 *
 * Shows only organizations the user has ACTIVE membership in.
 * Routes to /{orgSlug} (enterprise launcher) or /{orgSlug}/seller-app.
 *
 * AUTH REQUIRED — middleware redirects unauthenticated users to /login.
 */

import { redirect } from "next/navigation";
import { getAccessibleOrganizations } from "@/lib/auth/user-orgs";
import { OrgSelectorClient } from "./org-selector-client";

export default async function SelectOrgPage() {
  const orgs = await getAccessibleOrganizations();

  if (orgs.length === 0) {
    redirect("/unauthorized");
  }

  // Single org — skip selector, go directly
  if (orgs.length === 1) {
    redirect(`/${orgs[0].slug}`);
  }

  // Multiple orgs — render selector
  const orgList = orgs.map(o => ({
    slug: o.slug,
    name: o.name,
    role: o.role,
  }));

  return <OrgSelectorClient orgs={orgList} />;
}
