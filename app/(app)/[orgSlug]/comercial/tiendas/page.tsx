/**
 * /[orgSlug]/comercial/tiendas
 *
 * Tiendas — Server Component wrapper.
 *
 * TERCERO: Non-blocking. Only resolves orgSlug + orgId.
 * All data loads lazily on the client via API endpoints.
 * No buildCanonicalStoreDistribution. No getStoresWorkspaceWithSignals.
 * Shell renders immediately.
 *
 * Sprint: AGENTIK-STORES-STABILIZATION-PERFORMANCE-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { TiendasClient } from "./tiendas-client";

export default async function TiendasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  return (
    <TiendasClient
      orgSlug={orgSlug}
      orgId={orgId}
    />
  );
}
