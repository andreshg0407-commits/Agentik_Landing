/**
 * /[orgSlug]/manager/comercial/pedidos — Pedidos executive surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 * ORDER_SYNC_FAILED/PENDING are data health, NOT business attention.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { assemblePedidosPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { PedidosSurfaceClient } from "./pedidos-client";

export default async function ManagerPedidosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const [snapshot, importIntelligence] = await Promise.all([
    loadControlComercial(orgId, orgSlug),
    buildImportSupplyIntelligence(orgId).catch(() => null),
  ]);

  const pa = assembleCommercialExecutivePA({ snapshot, importIntelligence, orgSlug });
  const pedidosPA = assemblePedidosPA(pa);

  return <PedidosSurfaceClient pedidosPA={pedidosPA} />;
}
