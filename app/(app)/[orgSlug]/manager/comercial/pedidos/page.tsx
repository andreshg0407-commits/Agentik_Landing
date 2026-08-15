/**
 * /[orgSlug]/manager/comercial/pedidos — Pedidos executive surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 * Narrow loader replaces monolithic loadControlComercial.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadNarrowPedidos } from "@/lib/comercial/manager/manager-narrow-loaders";
import { assemblePedidosPAFromNarrow } from "@/lib/comercial/manager/manager-commercial-adapter";
import { PedidosSurfaceClient } from "./pedidos-client";

export default async function ManagerPedidosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const narrowData = await loadNarrowPedidos(organization.id);
  const pedidosPA = assemblePedidosPAFromNarrow(narrowData);

  return <PedidosSurfaceClient pedidosPA={pedidosPA} />;
}
