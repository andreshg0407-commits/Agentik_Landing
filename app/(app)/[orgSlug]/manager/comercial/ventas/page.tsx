/**
 * /[orgSlug]/manager/comercial/ventas — Ventas executive surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 * Narrow loader replaces monolithic loadControlComercial.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadNarrowVentas } from "@/lib/comercial/manager/manager-narrow-loaders";
import { assembleVentasPAFromNarrow } from "@/lib/comercial/manager/manager-commercial-adapter";
import { VentasSurfaceClient } from "./ventas-client";

export default async function ManagerVentasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const narrowData = await loadNarrowVentas(organization.id);
  const ventasPA = assembleVentasPAFromNarrow(narrowData);

  return <VentasSurfaceClient ventasPA={ventasPA} />;
}
