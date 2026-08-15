/**
 * /[orgSlug]/manager/comercial/clientes — Clientes executive surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 * Narrow loader replaces monolithic loadControlComercial.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadNarrowClientes } from "@/lib/comercial/manager/manager-narrow-loaders";
import { assembleClientesPAFromNarrow } from "@/lib/comercial/manager/manager-commercial-adapter";
import { ClientesSurfaceClient } from "./clientes-client";

export default async function ManagerClientesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const narrowData = await loadNarrowClientes(organization.id);
  const clientesPA = assembleClientesPAFromNarrow(narrowData);

  return <ClientesSurfaceClient clientesPA={clientesPA} />;
}
