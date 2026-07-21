/**
 * /[orgSlug]/comercial/inventario
 *
 * Inventory Control Center — Server Component wrapper.
 * Auth -> snapshot build -> canonical enrichment -> InventarioClient.
 *
 * Sprint: COMERCIAL-INVENTARIO-CANONICAL-STATUS-INTEGRATION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildInventoryControlSnapshot } from "@/lib/inventory/inventory-control-service";
import { enrichWithCanonicalClassification } from "@/lib/inventory/inventory-canonical-status-loader";
import { InventarioClient } from "./inventario-client";

export default async function InventarioPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const snapshot = await buildInventoryControlSnapshot(organization.id, orgSlug);
  const canonicalSnapshot = await enrichWithCanonicalClassification(organization.id, snapshot);

  return (
    <InventarioClient
      orgSlug={orgSlug}
      snapshot={snapshot}
      canonicalSnapshot={canonicalSnapshot}
    />
  );
}
