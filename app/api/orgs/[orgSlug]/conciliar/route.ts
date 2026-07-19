/**
 * POST /api/orgs/[orgSlug]/conciliar
 *
 * Applies a payment to one or more CustomerReceivable invoices.
 *
 * Two entry modes:
 *   A. CollectionRecord-based: collectionRecordId present → bridge SAG receipt to invoice(s)
 *   B. Manual entry: no collectionRecordId → operator logs a payment not yet in SAG
 *
 * In both cases a PaymentRecord + PaymentAllocation(s) are created via
 * payment-service, which also updates CustomerReceivable.balanceDue + status.
 *
 * Multi-tenant: organizationId enforced on every query.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { registerPayment, PaymentMethod, PaymentSource } from "@/lib/finance/payment-service";
import { prisma } from "@/lib/prisma";

const VALID_METHODS = new Set(Object.values(PaymentMethod));

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug } = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);
    const orgId = organization.id;
    const body  = await req.json();

    // ── Required fields ───────────────────────────────────────────────────────
    const { customerNit, customerName, amount, paymentDate, allocations } = body;

    if (!customerName || typeof customerName !== "string") {
      return NextResponse.json({ error: "customerName requerido" }, { status: 400 });
    }
    const parsedAmount = typeof amount === "number" ? amount : parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json({ error: "amount debe ser > 0" }, { status: 400 });
    }
    const parsedDate = paymentDate ? new Date(paymentDate) : new Date();
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "paymentDate inválido" }, { status: 400 });
    }
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: "allocations[] requerido (mínimo 1 entrada)" }, { status: 400 });
    }

    // ── CollectionRecord validation (mode A) ──────────────────────────────────
    const collectionRecordId: string | null = body.collectionRecordId ?? null;

    if (collectionRecordId) {
      const cr = await prisma.collectionRecord.findFirst({
        where: { id: collectionRecordId, organizationId: orgId },
        select: { id: true, appliedStatus: true, amount: true },
      });
      if (!cr) {
        return NextResponse.json({ error: "CollectionRecord no encontrado" }, { status: 404 });
      }
      if (cr.appliedStatus === "APPLIED" || cr.appliedStatus === "MANUAL_OVERRIDE") {
        return NextResponse.json({ error: "Este recibo ya fue aplicado completamente" }, { status: 409 });
      }
    }

    // ── Validate allocation entries ────────────────────────────────────────────
    const parsedAllocations: { receivableId: string; allocatedAmount: number }[] = [];
    for (const a of allocations) {
      if (!a.receivableId || typeof a.receivableId !== "string") {
        return NextResponse.json({ error: "allocation.receivableId inválido" }, { status: 400 });
      }
      const amt = typeof a.allocatedAmount === "number" ? a.allocatedAmount : parseFloat(a.allocatedAmount);
      if (!amt || amt <= 0) {
        return NextResponse.json({ error: "allocation.allocatedAmount debe ser > 0" }, { status: 400 });
      }
      parsedAllocations.push({ receivableId: a.receivableId, allocatedAmount: amt });
    }

    const totalAllocating = parsedAllocations.reduce((s, a) => s + a.allocatedAmount, 0);
    if (totalAllocating > parsedAmount + 0.01) {
      return NextResponse.json(
        { error: `Suma de allocations (${totalAllocating}) supera el monto (${parsedAmount})` },
        { status: 400 },
      );
    }

    // ── Resolve paymentMethod ─────────────────────────────────────────────────
    const paymentMethod = body.paymentMethod && VALID_METHODS.has(body.paymentMethod)
      ? (body.paymentMethod as PaymentMethod)
      : PaymentMethod.TRANSFERENCIA;

    const VALID_DOC_TYPES = new Set(["PAGO", "ND", "AJUSTE"]);
    const documentType = body.documentType && VALID_DOC_TYPES.has(body.documentType)
      ? (body.documentType as "PAGO" | "ND" | "AJUSTE")
      : "PAGO" as const;

    const isManual: boolean = body.isManual === true;

    // ── Register payment + allocations ────────────────────────────────────────
    const result = await registerPayment({
      organizationId:  orgId,
      createdBy:       user.id,
      customerId:      body.customerId  ?? null,
      customerNit:     customerNit ?? null,
      customerName:    customerName.trim(),
      amount:          parsedAmount,
      paymentDate:     parsedDate,
      paymentMethod,
      documentType,
      reference:       body.reference  ?? null,
      notes:           body.notes      ?? null,
      source:          isManual ? PaymentSource.FORM : PaymentSource.FORM,
      allocations:     parsedAllocations,
    });

    // ── Update CollectionRecord applied state (mode A) ────────────────────────
    if (collectionRecordId) {
      const totalAllocated = result.allocatedAmount;
      const crAmount       = parsedAmount;   // amount we're applying from the CR
      const newStatus = Math.abs(totalAllocated - crAmount) <= 0.01
        ? "APPLIED"
        : "PARTIALLY_APPLIED";

      await prisma.collectionRecord.update({
        where: { id: collectionRecordId },
        data: {
          appliedStatus:   newStatus,
          paymentRecordId: result.paymentId,
          appliedAt:       new Date(),
          appliedBy:       user.id,
        },
      });
    } else if (isManual) {
      // nothing to mark — pure manual entry
    }

    return NextResponse.json({ ...result, collectionRecordId }, { status: 201 });

  } catch (err: unknown) {
    console.error("[conciliar/POST]", err);
    const msg  = err instanceof Error ? err.message : "Error interno";
    const code = msg.includes("not found") || msg.includes("access denied") ? 404
               : msg.includes("PAID") || msg.includes("already") ? 409
               : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
