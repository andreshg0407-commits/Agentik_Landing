/**
 * GET  /api/orgs/[orgSlug]/finance/payments
 *   → Lista pagos recientes + resumen de cobros.
 *   ?status=PENDING,RECONCILED  &limit=50  &customerNit=xxx  &from=yyyy-mm-dd  &to=yyyy-mm-dd
 *
 * POST /api/orgs/[orgSlug]/finance/payments
 *   → Registrar un cobro recibido (con o sin conciliación inmediata).
 *   body: RegisterPaymentInput
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  registerPayment,
  listPayments,
  getPaymentSummary,
  PaymentMethod,
  PaymentStatus,
  PaymentSource,
  type RegisterPaymentInput,
} from "@/lib/finance/payment-service";

const VALID_METHODS  = new Set(Object.values(PaymentMethod));
const VALID_STATUSES = new Set(Object.values(PaymentStatus));
const VALID_SOURCES  = new Set(Object.values(PaymentSource));

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req:    NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }  = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);
    const orgId = organization.id;
    const sp    = req.nextUrl.searchParams;

    const limitParam = sp.get("limit");
    const limit      = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

    const statusParam = sp.get("status");
    const statuses    = statusParam
      ? statusParam.split(",").filter(s => VALID_STATUSES.has(s as PaymentStatus)) as PaymentStatus[]
      : undefined;

    const customerNit = sp.get("customerNit") ?? undefined;
    const fromParam   = sp.get("from");
    const toParam     = sp.get("to");
    const from        = fromParam ? new Date(fromParam) : undefined;
    const to          = toParam   ? new Date(toParam)   : undefined;

    const [payments, summary] = await Promise.all([
      listPayments(orgId, { limit, status: statuses, customerNit, from, to }),
      getPaymentSummary(orgId),
    ]);

    return NextResponse.json({ payments, summary });
  } catch (err: unknown) {
    console.error("[payments/GET]", err);
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req:    NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }  = await params;
    const { organization, user } = await requireOrgAccess(orgSlug);
    const orgId = organization.id;
    const body  = await req.json();

    // ── Validation ────────────────────────────────────────────────────────────
    const { customerName, amount, paymentDate } = body;

    if (!customerName || typeof customerName !== "string" || !customerName.trim()) {
      return NextResponse.json({ error: "customerName es requerido" }, { status: 400 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount debe ser un número mayor que 0" }, { status: 400 });
    }
    if (!paymentDate) {
      return NextResponse.json({ error: "paymentDate es requerido" }, { status: 400 });
    }
    const parsedDate = new Date(paymentDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "paymentDate inválido" }, { status: 400 });
    }

    const paymentMethod = body.paymentMethod && VALID_METHODS.has(body.paymentMethod)
      ? (body.paymentMethod as PaymentMethod)
      : PaymentMethod.TRANSFERENCIA;

    const source = body.source && VALID_SOURCES.has(body.source)
      ? (body.source as PaymentSource)
      : PaymentSource.FORM;

    // Validate allocations if provided
    const allocations: { receivableId: string; allocatedAmount: number }[] = [];
    if (Array.isArray(body.allocations)) {
      for (const a of body.allocations) {
        if (!a.receivableId || typeof a.receivableId !== "string") {
          return NextResponse.json({ error: "allocation.receivableId inválido" }, { status: 400 });
        }
        if (!a.allocatedAmount || typeof a.allocatedAmount !== "number" || a.allocatedAmount <= 0) {
          return NextResponse.json({ error: "allocation.allocatedAmount debe ser > 0" }, { status: 400 });
        }
        allocations.push({ receivableId: a.receivableId, allocatedAmount: a.allocatedAmount });
      }
    }

    const input: RegisterPaymentInput = {
      organizationId:  orgId,
      createdBy:       user.id,
      customerId:      body.customerId   ?? null,
      customerNit:     body.customerNit  ?? null,
      customerName:    customerName.trim(),
      amount,
      paymentDate:     parsedDate,
      bankName:        body.bankName     ?? null,
      bankAccount:     body.bankAccount  ?? null,
      paymentMethod,
      reference:       body.reference    ?? null,
      externalRef:     body.externalRef  ?? null,
      attachmentUrl:   body.attachmentUrl  ?? null,
      attachmentName:  body.attachmentName ?? null,
      notes:           body.notes        ?? null,
      source,
      allocations,
    };

    const result = await registerPayment(input);

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    console.error("[payments/POST]", err);
    const msg  = err instanceof Error ? err.message : "Error interno";
    const code = msg.includes("not found") || msg.includes("access denied") ? 404
               : msg.includes("PAID") || msg.includes("cancelled") || msg.includes("already") ? 409
               : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
