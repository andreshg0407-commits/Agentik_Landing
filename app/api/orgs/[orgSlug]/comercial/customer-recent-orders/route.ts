/**
 * GET /api/orgs/[orgSlug]/comercial/customer-recent-orders?customerId=xxx
 *
 * AGENTIK-SELLER-APP-CLIENTS-360-V1-01 — pedidos recientes del cliente para
 * el Cliente 360 del Seller App.
 *
 * Fuente: CustomerOrderRecord (read model canónico local; histórico <= cutover
 * y CURRENT >= cutover conviven en el MISMO modelo — cero SOAP aquí).
 * Join determinista: CustomerProfile.sagTerceroId → customerNit. Sin nombres.
 *
 * Authorization: requireOrgAccess + seller scope enforcement — patrón idéntico
 * a customer-context (viewer scope REUTILIZADO, no rediseñado).
 * READ-ONLY.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const db = prisma as any;

const RECENT_ORDERS_LIMIT = 5;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { user, organization } = await requireOrgAccess(orgSlug);

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  // Seller scope enforcement: verify caller can access this customer
  const sellerIdentity = await resolveCurrentSeller({
    organizationId: organization.id,
    userId: user.id,
  });
  const scope = deriveSellerScope(sellerIdentity);

  const customerWhere: Record<string, unknown> = {
    id: customerId,
    organizationId: organization.id,
  };
  if (!scope.canAccessAllCustomers && scope.sellerSlug) {
    customerWhere.sellerSlug = scope.sellerSlug;
  }

  const customer = await db.customerProfile.findFirst({
    where: customerWhere,
    select: { id: true, sagTerceroId: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (customer.sagTerceroId == null) {
    return NextResponse.json({ orders: [] });
  }

  const rows = await db.customerOrderRecord.findMany({
    where: {
      organizationId: organization.id,
      customerNit: String(customer.sagTerceroId),
    },
    orderBy: { orderDate: "desc" },
    take: RECENT_ORDERS_LIMIT,
    select: {
      orderNumber: true,
      orderDate: true,
      status: true,
      amount: true,
      totalUnits: true,
      lineCount: true,
    },
  });

  return NextResponse.json({
    orders: rows.map((r: any) => ({
      orderNumber: r.orderNumber,
      orderDate: r.orderDate.toISOString(),
      status: r.status,
      amount: Number(r.amount ?? 0),
      totalUnits: r.totalUnits != null ? Number(r.totalUnits) : null,
      lineCount: r.lineCount ?? null,
    })),
  });
}
