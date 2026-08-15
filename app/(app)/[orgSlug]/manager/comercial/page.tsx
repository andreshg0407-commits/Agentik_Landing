/**
 * /[orgSlug]/manager/comercial — Commercial Hub.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 *
 * Lightweight hub built from module definitions only.
 * No commercial data queries. No loadControlComercial.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { assembleCommercialHubPALightweight } from "@/lib/comercial/manager/manager-commercial-adapter";
import { CommercialHubClient } from "./commercial-hub-client";

export default async function ManagerComercialPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  const hubPA = assembleCommercialHubPALightweight(orgSlug);

  return <CommercialHubClient orgSlug={orgSlug} hubPA={hubPA} />;
}
