/**
 * /[orgSlug]/seller-app
 *
 * Seller App V1 — Mobile-first operational surface for field sellers.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-01
 *
 * Server component:
 *   - Authenticates user → org → membership
 *   - Resolves seller identity via certified frontline mapping
 *   - Loads seller-scoped data (attention, customers, inactive)
 *   - Passes to client as flat props
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";
import { getSellerAttention } from "@/lib/comercial/frontline/frontline-attention-service";
import { getSellerInactiveCustomers } from "@/lib/comercial/frontline/seller-inactive-customers";
import { getSellerAppFeatureFlags } from "@/lib/comercial/frontline/seller-app-features";
import { prisma } from "@/lib/prisma";
import { SellerAppShell } from "./seller-app-shell";

const db = prisma as any;

export default async function SellerAppPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { user, organization, membership } = await requireOrgAccess(orgSlug);

  // Resolve seller identity
  const sellerIdentity = await resolveCurrentSeller({
    organizationId: organization.id,
    userId: user.id,
  });

  const scope = deriveSellerScope(sellerIdentity);

  // Load seller-scoped attention
  const attention = await getSellerAttention(
    organization.id,
    sellerIdentity.sellerId,
    orgSlug,
  );

  // Load seller-scoped customers
  const customerFilter = scope.canAccessAllCustomers
    ? { organizationId: organization.id }
    : { organizationId: organization.id, sellerSlug: sellerIdentity.sellerSlug };

  const customers = await db.customerProfile.findMany({
    where: customerFilter,
    select: {
      id: true,
      name: true,
      legalName: true,
      nit: true,
      nitNormalized: true,
      city: true,
      sellerSlug: true,
      sellerName: true,
      totalReceivable: true,
      overdueReceivable: true,
      maxDpd: true,
      sagTerceroId: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  // Load inactive customers
  const inactiveResult = sellerIdentity.sellerId
    ? await getSellerInactiveCustomers(organization.id, sellerIdentity.sellerId, { inactiveDays: 90 })
    : { items: [], totalCount: 0, provenance: { source: "n/a", asOf: new Date().toISOString() } };

  // Get last purchase dates for all customers (batch)
  const nitKeys = customers
    .filter((c: any) => c.sagTerceroId != null)
    .map((c: any) => String(c.sagTerceroId));

  const lastOrders = nitKeys.length > 0
    ? await db.customerOrderRecord.groupBy({
        by: ["customerNit"],
        where: {
          organizationId: organization.id,
          customerNit: { in: nitKeys },
          status: "FACTURADO",
        },
        _max: { orderDate: true },
      })
    : [];

  const lastOrderMap: Record<string, string> = {};
  for (const row of lastOrders) {
    if (row._max.orderDate) {
      lastOrderMap[row.customerNit] = row._max.orderDate.toISOString();
    }
  }

  // Serialize customers for client
  const serializedCustomers = customers.map((c: any) => {
    const nitKey = c.sagTerceroId != null ? String(c.sagTerceroId) : null;
    const lastPurchase = nitKey ? lastOrderMap[nitKey] ?? null : null;

    return {
      id: c.id,
      name: c.legalName ?? c.name ?? "",
      nit: c.nitNormalized ?? c.nit ?? null,
      city: c.city ?? null,
      sellerSlug: c.sellerSlug ?? null,
      totalReceivable: Number(c.totalReceivable ?? 0),
      overdueReceivable: Number(c.overdueReceivable ?? 0),
      maxDpd: c.maxDpd ?? 0,
      lastPurchaseDate: lastPurchase,
    };
  });

  // Inactive customer IDs for filter
  const inactiveIds = new Set(inactiveResult.items.map(i => i.customerId));

  // Feature flags
  const features = getSellerAppFeatureFlags(organization.id);

  return (
    <SellerAppShell
      orgSlug={orgSlug}
      orgId={organization.id}
      sellerIdentity={{
        sellerId: sellerIdentity.sellerId,
        sellerName: sellerIdentity.sellerName,
        sellerSlug: sellerIdentity.sellerSlug,
        role: sellerIdentity.role,
        mappingSource: sellerIdentity.mappingSource,
        isSellerScoped: sellerIdentity.isSellerScoped,
        isManagerOrAbove: sellerIdentity.isManagerOrAbove,
      }}
      attention={attention}
      customers={serializedCustomers}
      inactiveCustomerIds={[...inactiveIds]}
      inactiveCustomers={inactiveResult.items.map(i => ({
        customerId: i.customerId,
        customerName: i.customerName,
        classification: i.classification,
        lastPurchaseDate: i.lastPurchaseDate,
        daysSinceLastPurchase: i.daysSinceLastPurchase,
        receivables: i.receivables,
      }))}
      features={features}
    />
  );
}
