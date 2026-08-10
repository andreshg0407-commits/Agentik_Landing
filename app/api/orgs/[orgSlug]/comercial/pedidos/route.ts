/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos
 *
 * Actions: create, list, get, update_draft, update_line, submit,
 *          mark_pending_sag, mark_synced, mark_conflict, cancel,
 *          return_to_draft, check_duplicate, stats, send_to_sag
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: AGENTIK-SELLER-APP-UI-02-P0-SELLER-SCOPE
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
  computeServerKpiStats,
} from "@/lib/comercial/pedidos/order-service";
import { sendOrderToSagQueue } from "@/lib/comercial/pedidos/order-sag-bridge";
import { buildOrderSharePayload } from "@/lib/comercial/pedidos/order-share";
import { getOrganizationBranding } from "@/lib/tenant/branding";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import {
  searchCustomers,
  getCustomer,
} from "@/lib/comercial/clientes/canonical-customer-service";
import { getCustomerCommercialContext } from "@/lib/comercial/frontline/customer-commercial-context";
import { emitCustomerOverdueAttention } from "@/lib/comercial/frontline/frontline-attention-service";
import {
  resolveCurrentSeller,
  deriveSellerScope,
  customerScopeFilter,
} from "@/lib/comercial/frontline/seller-user-mapping";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { user, organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Resolve seller identity + scope for customer authorization
  const sellerIdentity = await resolveCurrentSeller({
    organizationId: orgId,
    userId: user.id,
  });
  const sellerScope = deriveSellerScope(sellerIdentity);
  const custScopeFilter = customerScopeFilter(sellerScope);

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "create": {
      // Verify seller can create order for this customer
      if (body.header?.customerId && !sellerScope.canAccessAllCustomers) {
        // Resolve customer by NIT or profileId to verify ownership
        const custAuth = await getCustomer(orgId, body.header.customerId, {
          sellerScopeFilter: custScopeFilter,
        });
        // Also check by customerCode (sagCode) if customerId lookup fails
        // because customerId in the header is NIT, not profileId
        if (!custAuth && body.header.customerCode) {
          const { prisma } = await import("@/lib/prisma");
          const profileByCode = await (prisma as any).customerProfile.findFirst({
            where: {
              organizationId: orgId,
              erpId: body.header.customerCode,
              ...custScopeFilter,
            },
            select: { id: true },
          });
          if (!profileByCode) {
            return NextResponse.json(
              { error: "No autorizado para crear pedido para este cliente" },
              { status: 403 },
            );
          }
        }
      }
      // Server-side seller authority: for seller-scoped users, override
      // client-supplied sellerId/sellerName with server-resolved identity.
      // This prevents seller A from creating orders attributed to seller B.
      const createHeader = { ...body.header };
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        createHeader.sellerId = sellerIdentity.sellerId;
        createHeader.sellerName = sellerIdentity.sellerName ?? createHeader.sellerName ?? "";
      }

      if (body.wizardSessionKey) {
        const { order, alreadyExists, reservation } = await createOrderDraftDeduped(orgId, {
          header: createHeader, lines: body.lines,
          createdBy: body.createdBy ?? "usuario",
          wizardSessionKey: body.wizardSessionKey,
        });
        return NextResponse.json({ order, alreadyExists, reservation });
      }
      const { order, reservation } = await createOrderDraft(orgId, {
        header: createHeader, lines: body.lines, createdBy: body.createdBy ?? "usuario",
      });
      return NextResponse.json({ order, reservation });
    }

    case "delete_draft": {
      // Seller scope enforcement: verify ownership before deletion
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const existing = await getOrder(orgId, body.orderId);
        if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        const orderSellerId = existing.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado para eliminar este pedido" }, { status: 403 });
        }
      }
      const result = await deleteDraftOrder(orgId, body.orderId);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
      }
      return NextResponse.json({ ok: true, reservation: result.reservation });
    }

    case "list": {
      // Server-side seller scope enforcement
      const listSellerScope = (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId)
        ? {
            sellerId: sellerIdentity.sellerId,
            sellerTerceroId: sellerIdentity.sagSellerCode
              ? parseInt(sellerIdentity.sagSellerCode, 10) || undefined
              : undefined,
          }
        : undefined;
      const orders = await listOrders(orgId, {
        status: body.status, today: body.today, sellerScope: listSellerScope,
      });
      return NextResponse.json({ orders });
    }

    case "get": {
      const order = await getOrder(orgId, body.orderId);
      if (!order) return NextResponse.json({ order: null });
      // Seller scope enforcement: seller A cannot view seller B order
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const orderSellerId = order.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado" }, { status: 403 });
        }
      }
      return NextResponse.json({ order });
    }

    case "update_draft": {
      // Seller scope enforcement: verify ownership before mutation
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const existing = await getOrder(orgId, body.orderId);
        if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        const orderSellerId = existing.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado para editar este pedido" }, { status: 403 });
        }
      }
      const { order, reservation } = await updateOrderDraft(orgId, body.orderId, {
        header: body.header, lines: body.lines,
      });
      return NextResponse.json({ order, reservation });
    }

    case "update_line": {
      // Seller scope enforcement: verify ownership before line mutation
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const existing = await getOrder(orgId, body.orderId);
        if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        const orderSellerId = existing.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado para editar este pedido" }, { status: 403 });
        }
      }
      const order = await updateOrderLine(orgId, body.orderId, body.lineId, {
        quantity: body.quantity,
        removed:  body.removed,
        comment:  body.comment,
      });
      return NextResponse.json({ order });
    }

    case "submit": {
      // Seller scope enforcement: verify ownership before submission
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const existing = await getOrder(orgId, body.orderId);
        if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        const orderSellerId = existing.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado para enviar este pedido" }, { status: 403 });
        }
      }
      const { order, reservation } = await submitOrder(orgId, body.orderId);
      return NextResponse.json({ order, reservation });
    }

    case "mark_pending_sag": {
      // SAG sync mutations are desktop-only — seller role blocked
      if (sellerScope.level === "seller") {
        return NextResponse.json({ error: "Sincronización SAG no autorizada para vendedores" }, { status: 403 });
      }
      const order = await markPendingSag(orgId, body.orderId);
      return NextResponse.json({ order });
    }

    case "mark_synced": {
      if (sellerScope.level === "seller") {
        return NextResponse.json({ error: "Sincronización SAG no autorizada para vendedores" }, { status: 403 });
      }
      const order = await markSynced(orgId, body.orderId, body.sagOrderId);
      return NextResponse.json({ order });
    }

    case "mark_conflict": {
      if (sellerScope.level === "seller") {
        return NextResponse.json({ error: "Sincronización SAG no autorizada para vendedores" }, { status: 403 });
      }
      const order = await markConflict(orgId, body.orderId, body.sagError);
      return NextResponse.json({ order });
    }

    case "cancel": {
      // Seller scope enforcement: verify ownership before cancellation
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const existing = await getOrder(orgId, body.orderId);
        if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        const orderSellerId = existing.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado para cancelar este pedido" }, { status: 403 });
        }
      }
      const { order, reservation } = await cancelOrder(orgId, body.orderId);
      return NextResponse.json({ order, reservation });
    }

    case "return_to_draft": {
      // Seller scope enforcement: verify ownership before status change
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const existing = await getOrder(orgId, body.orderId);
        if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
        const orderSellerId = existing.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado para modificar este pedido" }, { status: 403 });
        }
      }
      const order = await returnToDraft(orgId, body.orderId);
      return NextResponse.json({ order });
    }

    case "check_duplicate": {
      const result = await checkDuplicateOrder(orgId, body.header);
      return NextResponse.json(result);
    }

    case "stats": {
      // Stats are org-wide aggregates — seller-scoped users must not see org totals
      if (sellerScope.level === "seller") {
        return NextResponse.json({ error: "Estadísticas no disponibles para vendedores" }, { status: 403 });
      }
      const stats = await getOrderStats(orgId);
      return NextResponse.json({ stats });
    }

    case "kpi_stats": {
      // KPI stats are org-wide — restricted to admin/manager
      if (sellerScope.level === "seller") {
        return NextResponse.json({ error: "KPIs no disponibles para vendedores" }, { status: 403 });
      }
      const kpiStats = await computeServerKpiStats(orgId);
      return NextResponse.json({ kpiStats });
    }

    case "send_to_sag": {
      // HARD GATE: SAG synchronization is desktop-only — seller role blocked
      if (sellerScope.level === "seller") {
        return NextResponse.json({ error: "Sincronización SAG no autorizada para vendedores" }, { status: 403 });
      }
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
      const results = await searchCustomers(orgId, body.query ?? "", {
        sellerScopeFilter: custScopeFilter,
      });
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
        // Normalize sagReadiness from canonical status string to UI object shape
        sagReadiness: r.sagReadiness === "READY" ? null : {
          status: r.sagReadiness,
          blockers: r.sagReadiness === "DRAFT_ONLY"
            ? [{ field: "sagCode", reason: "Cliente sin código SAG — solo borrador" }]
            : r.sagReadiness === "BLOCKED"
              ? [{ field: "sagCode", reason: "Cliente bloqueado para pedidos SAG" }]
              : [],
        },
      }));
      return NextResponse.json({ customers });
    }

    case "get_customer_detail": {
      const customer = await getCustomer(orgId, body.profileId, {
        sellerScopeFilter: custScopeFilter,
      });
      if (!customer) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 403 });
      }
      return NextResponse.json({ customer });
    }

    case "get_customer_context": {
      // Verify customer belongs to seller before loading context
      const custCheck = await getCustomer(orgId, body.profileId, {
        sellerScopeFilter: custScopeFilter,
      });
      if (!custCheck) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 403 });
      }
      const ctx = await getCustomerCommercialContext(orgId, body.profileId);
      if (!ctx) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }
      const overdueAlert = await emitCustomerOverdueAttention(
        orgId, body.profileId, sellerIdentity.sellerId, orgSlug,
      );
      // Normalize to Seller App UI contract shape
      const uiContext = {
        identity: { name: ctx.customerName, nit: ctx.nitNormalized ?? "" },
        receivables: ctx.receivables ? {
          total: ctx.receivables.totalReceivable,
          overdue: ctx.receivables.overdueAmount,
          maxDaysOverdue: ctx.receivables.maxDaysOverdue,
          overdueDocumentCount: ctx.receivables.overdueDocumentCount,
          // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0
          truthStatus: ctx.receivables.truthStatus,
        } : null,
        topProductsByUnits: ctx.topProductsByUnits.map(p => ({
          referenceCode: p.referenceCode,
          description: p.description,
          totalUnits: p.totalUnits,
          purchaseCount: p.purchaseCount,
        })),
        totalOrdersL12: ctx.totalOrdersL12,
        lastPurchaseDate: ctx.lastPurchaseDate,
      };
      const uiOverdueAlert = overdueAlert ? {
        severity: overdueAlert.severity,
        message: overdueAlert.title,
      } : null;
      return NextResponse.json({ context: uiContext, overdueAlert: uiOverdueAlert });
    }

    case "share": {
      const order = await getOrder(orgId, body.orderId);
      if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      // Seller scope enforcement
      if (!sellerScope.canAccessAllOrders && sellerIdentity.sellerId) {
        const orderSellerId = order.header?.sellerId;
        if (orderSellerId && orderSellerId !== sellerIdentity.sellerId) {
          return NextResponse.json({ error: "No autorizado" }, { status: 403 });
        }
      }
      const branding = await getOrganizationBranding(orgId);
      const sharePayload = buildOrderSharePayload(order, {
        commercialName: branding.commercialName || "Agentik",
        legalName: branding.legalName || "Agentik",
        phone: branding.phone || "",
        email: branding.email || "",
        website: branding.website || "",
        logoUrl: branding.logoUrl || "",
        documentFooter: branding.documentFooter || "",
      });
      return NextResponse.json({ share: sharePayload });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
