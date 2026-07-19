/**
 * /[orgSlug]/configuracion/branding — Corporate Identity Configuration
 *
 * Sprint: TENANT-BRANDING-FOUNDATION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getOrganizationBranding } from "@/lib/tenant/branding";
import { BrandingConfigClient } from "./branding-client";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const branding = await getOrganizationBranding(organization.id);

  return <BrandingConfigClient orgSlug={orgSlug} initial={branding} />;
}
