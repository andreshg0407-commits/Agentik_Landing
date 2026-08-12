/**
 * /[orgSlug]/manager/comercial/tiendas — Tiendas executive surface (Level 1).
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 * Network facts + touchable store list from canonical store network.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildStoreNetworkSnapshot } from "@/lib/comercial/tiendas/store-network-inventory";
import { assembleTiendasPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { TiendasSurfaceClient } from "./tiendas-client";

export default async function ManagerTiendasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const networkSnapshot = await buildStoreNetworkSnapshot(orgId).catch(() => null);
  const tiendasPA = assembleTiendasPA({ networkSnapshot, orgSlug });

  return <TiendasSurfaceClient tiendasPA={tiendasPA} />;
}
