/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos
 *
 * Actions: create, list, get, update_draft, update_line, submit,
 *          mark_pending_sag, mark_synced, mark_conflict, cancel,
 *          return_to_draft, check_duplicate, stats, send_to_sag
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  createOrderDraft,
  createOrderDraftDeduped,
  deleteDraftOrder,
  getOrder,
  listOrders,
  updateOrderDraft,
  updateOrderLine,
  submitOrder,
  markPendingSag,
  markSynced,
  markConflict,
  cancelOrder,
  returnToDraft,
  checkDuplicateOrder,
  getOrderStats,
} from "@/lib/comercial/pedidos/order-service";
import { sendOrderToSagQueue } from "@/lib/comercial/pedidos/order-sag-bridge";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import {
  searchCustomers,
  getCustomer,
} from "@/lib/comercial/clientes/canonical-customer-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "create": {
      if (body.wizardSessionKey) {
        const { order, alreadyExists, reservation } = await createOrderDraftDeduped(orgId, {
          header: body.header, lines: body.lines,
          createdBy: body.createdBy ?? "usuario",
          wizardSessionKey: body.wizardSessionKey,
        });
        return NextResponse.json({ order, alreadyExists, reservation });
      }
      const { order, reservation } = await createOrderDraft(orgId, {
        header: body.header, lines: body.lines, createdBy: body.createdBy ?? "usuario",
      });
      return NextResponse.json({ order, reservation });
    }

    case "delete_draft": {
      const result = await deleteDraftOrder(orgId, body.orderId);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
      }
      return NextResponse.json({ ok: true, reservation: result.reservation });
    }

    case "list": {
      const orders = await listOrders(orgId, {
        status: body.status, today: body.today,
      });
      return NextResponse.json({ orders });
    }

    case "get": {
      const order = await getOrder(orgId, body.orderId);
      return NextResponse.json({ order });
    }

    case "update_draft": {
      const { order, reservation } = await updateOrderDraft(orgId, body.orderId, {
        header: body.header, lines: body.lines,
      });
      return NextResponse.json({ order, reservation });
    }

    case "update_line": {
      const order = await updateOrderLine(orgId, body.orderId, body.lineId, {
        quantity: body.quantity,
        removed:  body.removed,
        comment:  body.comment,
      });
      return NextResponse.json({ order });
    }

    case "submit": {
      const { order, reservation } = await submitOrder(orgId, body.orderId);
      return NextResponse.json({ order, reservation });
    }

    case "mark_pending_sag": {
      const order = await markPendingSag(orgId, body.orderId);
      return NextResponse.json({ order });
    }

    case "mark_synced": {
      const order = await markSynced(orgId, body.orderId, body.sagOrderId);
      return NextResponse.json({ order });
    }

    case "mark_conflict": {
      const order = await markConflict(orgId, body.orderId, body.sagError);
      return NextResponse.json({ order });
    }

    case "cancel": {
      const { order, reservation } = await cancelOrder(orgId, body.orderId);
      return NextResponse.json({ order, reservation });
    }

    case "return_to_draft": {
      const order = await returnToDraft(orgId, body.orderId);
      return NextResponse.json({ order });
    }

    case "check_duplicate": {
      const result = await checkDuplicateOrder(orgId, body.header);
      return NextResponse.json(result);
    }

    case "stats": {
      const stats = await getOrderStats(orgId);
      return NextResponse.json({ stats });
    }

    case "send_to_sag": {
      const order = await getOrder(orgId, body.orderId);
      if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      const result = await sendOrderToSagQueue(orgId, body.userId ?? "usuario", order);
      if (!result.ok && !result.alreadyQueued) {
        return NextResponse.json({ error: result.error, ...result }, { status: 422 });
      }
      return NextResponse.json(result);
    }

    case "list_sellers": {
      const dir = await buildSellerDirectory(orgId);
      const sellers = dir.sellers.map(s => ({
        sellerId: s.sellerId,
        sellerName: s.sellerName,
        active: s.active,
      }));
      return NextResponse.json({ sellers });
    }

    case "search_customers": {
      const results = await searchCustomers(orgId, body.query ?? "");
      // Map canonical results to wizard-compatible shape
      const customers = results.map(r => ({
        customerCode: r.sagCode ?? "",
        customerName: r.name,
        customerId: r.nit ?? "",
        city: r.city ?? "",
        sagCode: r.sagCode ?? "",
        profileId: r.id,
        address: r.address ?? "",
        sellerName: r.seller?.name ?? "",
        sellerId: r.seller?.id ?? "",
        sagReadiness: r.sagReadiness,
      }));
      return NextResponse.json({ customers });
    }

    case "get_customer_detail": {
      const customer = await getCustomer(orgId, body.profileId);
      if (!customer) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ customer });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
