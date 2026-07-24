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
import { getOrderStats, listOrders, getMaxCustomerOrderDate } from "@/lib/comercial/pedidos/order-service";
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

  const [stats, orders, branding, maxSagOrderDate] = await Promise.all([
    getOrderStats(orgId),
    listOrders(orgId),
    getOrganizationBranding(orgId),
    getMaxCustomerOrderDate(orgId),
  ]);

  return (
    <PedidosClient
      orgSlug={orgSlug}
      orgId={orgId}
      initialStats={stats}
      initialOrders={orders}
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
