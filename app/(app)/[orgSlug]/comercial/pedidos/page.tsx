/**
 * /[orgSlug]/comercial/pedidos
 *
 * Pedidos — Server Component wrapper.
 * Loads order stats and passes to client.
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: COMERCIAL-PEDIDOS-POLISH-03
 * Sprint: AGENTIK-ORDERS-OPERATIONS-REFINEMENT-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getOrderStats, listOrders, getMaxCustomerOrderDate, computeServerKpiStats } from "@/lib/comercial/pedidos/order-service";
import { getOrganizationBranding } from "@/lib/tenant/branding";
import { PedidosClient } from "./pedidos-client";

export default async function PedidosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  const [stats, orders, branding, maxSagOrderDate, serverKpiStats] = await Promise.all([
    getOrderStats(orgId),
    listOrders(orgId),
    getOrganizationBranding(orgId),
    getMaxCustomerOrderDate(orgId),
    computeServerKpiStats(orgId),
  ]);

  // Patch loadedOrders with the actual list length
  serverKpiStats.loadedOrders = orders.length;

  return (
    <PedidosClient
      orgSlug={orgSlug}
      orgId={orgId}
      initialStats={stats}
      initialOrders={orders}
      initialServerKpiStats={serverKpiStats}
      maxSagOrderDate={maxSagOrderDate}
      branding={{
        commercialName: branding.commercialName,
        legalName:      branding.legalName,
        phone:          branding.phone,
        email:          branding.email,
        website:        branding.website,
        logoUrl:        branding.logoUrl,
        documentFooter: branding.documentFooter,
      }}
    />
  );
}
