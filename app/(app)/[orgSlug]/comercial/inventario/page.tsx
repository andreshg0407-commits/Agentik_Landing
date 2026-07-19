/**
 * /[orgSlug]/comercial/inventario
 *
 * Inventory Control Center — Server Component wrapper.
 * Auth -> snapshot build -> serialized context -> InventarioClient.
 *
 * Sprint: INVENTORY-CONTROL-CENTER-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildInventoryControlSnapshot } from "@/lib/inventory/inventory-control-service";
import { InventarioClient } from "./inventario-client";

export default async function InventarioPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const snapshot = await buildInventoryControlSnapshot(organization.id, orgSlug);

  return (
    <InventarioClient
      orgSlug={orgSlug}
      snapshot={snapshot}
    />
  );
}
