/**
 * /[orgSlug]/comercial/pedidos
 *
 * Pedidos — Server Component wrapper.
 * Loads order stats and passes to client.
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: COMERCIAL-PEDIDOS-POLISH-03
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";
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

  const [stats, orders, healthCounts, branding, maxSagOrderDate] = await Promise.all([
    getOrderStats(orgId),
    listOrders(orgId),
    getCommercialHealth(orgId),
    getOrganizationBranding(orgId),
    getMaxCustomerOrderDate(orgId),
  ]);

  return (
    <PedidosClient
      orgSlug={orgSlug}
      orgId={orgId}
      initialStats={stats}
      initialOrders={orders}
      commercialHealth={healthCounts}
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

async function getCommercialHealth(orgId: string) {
  const [pedidosImportados, pedidosConLineas, lineasRegistradas, productosDisponibles, productosSinInventario] = await Promise.all([
    prisma.cRMQuote.count({ where: { organizationId: orgId } }),
    prisma.cRMQuote.count({
      where: { organizationId: orgId, quoteLines: { some: {} } },
    }),
    (prisma as any).cRMQuoteLine.count({ where: { organizationId: orgId } }).catch(() => 0) as Promise<number>,
    prisma.productEntity.count({
      where: { organizationId: orgId, variants: { some: { inventoryLevels: { some: { quantity: { gt: 0 } } } } } },
    }).catch(() => 0),
    prisma.productEntity.count({
      where: {
        organizationId: orgId,
        OR: [
          { variants: { none: {} } },
          { variants: { every: { inventoryLevels: { every: { quantity: { lte: 0 } } } } } },
        ],
      },
    }).catch(() => 0),
  ]);

  return { pedidosImportados, pedidosConLineas, lineasRegistradas, productosDisponibles, productosSinInventario };
}
