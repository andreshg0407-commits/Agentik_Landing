/**
 * /[orgSlug]/manager/comercial/inventario — Inventario executive surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 * Narrow loader replaces monolithic loadControlComercial.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadNarrowInventario } from "@/lib/comercial/manager/manager-narrow-loaders";
import { assembleInventarioPAFromNarrow } from "@/lib/comercial/manager/manager-commercial-adapter";
import { InventarioSurfaceClient } from "./inventario-client";

export default async function ManagerInventarioPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const narrowData = await loadNarrowInventario(organization.id);
  const inventarioPA = assembleInventarioPAFromNarrow(narrowData);

  return <InventarioSurfaceClient inventarioPA={inventarioPA} />;
}
