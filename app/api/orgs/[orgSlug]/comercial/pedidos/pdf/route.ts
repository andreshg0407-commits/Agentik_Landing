/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos/pdf
 *
 * Generates a PDF for a specific order.
 * Returns the PDF as a binary stream.
 *
 * Sprint: COMERCIAL-PEDIDOS-DOCUMENTO-HISTORIAL-03
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { exportOrderPdf } from "@/lib/comercial/pedidos/order-pdf-service";
import { getOrder } from "@/lib/comercial/pedidos/order-service";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { user, organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const orderId = body.orderId as string;

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  // Seller scope enforcement: seller A cannot generate PDF for seller B order
  const sellerIdentity = await resolveCurrentSeller({ organizationId: orgId, userId: user.id });
  const sellerScope = deriveSellerScope(sellerIdentity);
  if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
    const order = await getOrder(orgId, orderId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const orderSellerId = order.header?.sellerId;
    if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const result = await exportOrderPdf(orgId, orderId, {
    orgSlug,
    discount: body.discount ?? null,
  });

  if (!result) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control":       "no-store",
    },
  });
}
