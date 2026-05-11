/**
 * GET    /api/orgs/[orgSlug]/finance/payments/[paymentId]
 *   → Detalle completo del pago + allocations.
 *
 * POST   /api/orgs/[orgSlug]/finance/payments/[paymentId]/allocate
 *   (handled inline via ?action=allocate)
 *   → Conciliar un pago pendiente contra facturas.
 *   body: { allocations: [{ receivableId, allocatedAmount }] }
 *
 * DELETE /api/orgs/[orgSlug]/finance/payments/[paymentId]
 *   → Reversar (anular) un pago con motivo.
 *   body: { reason: string }
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { prisma }                      from "@/lib/prisma";
import {
  allocatePayment,
  reversePayment,
  PaymentStatus,
} from "@/lib/finance/payment-service";

type RouteContext = { params: Promise<{ orgSlug: string; paymentId: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { orgSlug, paymentId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const payment = await prisma.paymentRecord.findFirst({
      where:   { id: paymentId, organizationId: organization.id },
      include: {
        allocations: {
          include: {
            receivable: {
              select: {
                invoiceNumber: true, customerName: true, customerNit: true,
                originalAmount: true, paidAmount: true, balanceDue: true,
                invoiceDate: true, dueDate: true, daysOverdue: true,
                agingBucket: true, status: true,
              },
            },
          },
        },
      },
    });

    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(payment);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST (allocate action) ────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { orgSlug, paymentId } = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);
    const body = await req.json();

    // Verify payment belongs to org
    const payment = await prisma.paymentRecord.findFirst({
      where: { id: paymentId, organizationId: organization.id },
      select: { id: true, status: true },
    });
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payment.status === PaymentStatus.REVERSED) {
      return NextResponse.json({ error: "Payment is reversed" }, { status: 409 });
    }

    if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
      return NextResponse.json({ error: "allocations[] is required" }, { status: 400 });
    }

    const result = await allocatePayment({ paymentId, allocations: body.allocations });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg  = err instanceof Error ? err.message : "Error";
    const code = msg.includes("not found") ? 404
               : msg.includes("PAID") || msg.includes("already") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

// ── DELETE (reverse) ──────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { orgSlug, paymentId } = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);
    const body   = await req.json().catch(() => ({}));
    const reason = body.reason ?? "Reversado por el operador";

    const result = await reversePayment({
      paymentId,
      organizationId: organization.id,
      reversedBy:     user.id,
      reason,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg  = err instanceof Error ? err.message : "Error";
    const code = msg.includes("not found") ? 404
               : msg.includes("already reversed") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
