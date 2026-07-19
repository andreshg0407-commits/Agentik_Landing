/**
 * lib/finance/payment-service.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Treasury Hub — Lógica contable de cobros.
 * Sprint 2.5 — COBROS (primera versión operativa).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Responsabilidades:
 *   1. Registrar un pago recibido (PaymentRecord).
 *   2. Aplicar (conciliar) el pago contra facturas (PaymentAllocation).
 *   3. Actualizar CustomerReceivable: paidAmount, balanceDue, status, paidAt.
 *   4. Recalcular CustomerProfile: totalReceivable, overdueReceivable.
 *   5. Reversar un pago con trazabilidad completa.
 *   6. Consultas para dashboard: cobrosHoy, totalCobrado, tasaDeCobro.
 *
 * ── Reglas contables ─────────────────────────────────────────────────────────
 *
 *   • Un pago puede cubrir N facturas (split).
 *   • Una factura puede recibir N pagos parciales.
 *   • La suma de allocations <= PaymentRecord.amount.
 *   • Si suma de allocations == amount → status = RECONCILED.
 *   • Si suma de allocations < amount → status = PARTIALLY_RECONCILED.
 *   • Cuando balanceDue <= 0 → CustomerReceivable.status = PAID.
 *   • Cuando 0 < paidAmount < originalAmount → status = PARTIAL.
 *   • Reverso: deshace todos los allocations + restaura CustomerReceivable.
 *
 * ── Invariantes ──────────────────────────────────────────────────────────────
 *
 *   balanceDue = originalAmount - paidAmount (siempre)
 *   allocatedAmount = SUM(PaymentAllocation.allocatedAmount) para ese pago
 *   unallocatedAmount = PaymentRecord.amount - allocatedAmount
 *
 * ── Atomicidad ───────────────────────────────────────────────────────────────
 *
 *   Todas las operaciones de escritura corren dentro de prisma.$transaction
 *   para garantizar consistencia en caso de fallo parcial.
 */

import { Prisma, PaymentMethod, PaymentStatus, PaymentSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Re-exports for callers ─────────────────────────────────────────────────────
export { PaymentMethod, PaymentStatus, PaymentSource };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterPaymentInput {
  organizationId: string;
  createdBy:      string;            // userId del operador

  // Identificación del cliente
  customerId?:    string | null;     // FK CustomerProfile
  customerNit?:   string | null;
  customerName:   string;

  // Monto
  amount:         number;            // valor total recibido (COP)
  paymentDate:    Date;              // fecha del cobro (puede ser pasada)

  // Detalle bancario
  bankName?:      string | null;
  bankAccount?:   string | null;
  paymentMethod?: PaymentMethod;
  reference?:     string | null;     // referencia bancaria
  externalRef?:   string | null;

  // Comprobante
  attachmentUrl?:  string | null;
  attachmentName?: string | null;

  notes?:         string | null;
  source?:        PaymentSource;
  documentType?:  "PAGO" | "ND" | "AJUSTE";

  // Facturas a conciliar en el mismo acto (opcional — se puede diferir)
  allocations?: AllocationInput[];
}

export interface AllocationInput {
  receivableId:    string;           // CustomerReceivable.id
  allocatedAmount: number;           // monto a aplicar a esta factura
}

export interface AllocatePaymentInput {
  paymentId:   string;
  allocations: AllocationInput[];
}

export interface ReversePaymentInput {
  paymentId:      string;
  organizationId: string;
  reversedBy:     string;
  reason:         string;
}

// Return types
export interface PaymentResult {
  paymentId:        string;
  status:           PaymentStatus;
  amount:           number;
  allocatedAmount:  number;
  unallocatedAmount: number;
  allocations:      AllocationResult[];
}

export interface AllocationResult {
  receivableId:    string;
  invoiceNumber:   string | null;
  customerName:    string;
  allocatedAmount: number;
  balanceBefore:   number;
  balanceAfter:    number;
  receivableStatus: string;
}

// Dashboard query types
export interface PaymentSummary {
  totalCollected:       number;   // SUM(amount) pagos confirmados/reconciliados
  collectedToday:       number;   // SUM(amount) con paymentDate = hoy
  collectedThisMonth:   number;   // SUM(amount) paymentDate en mes actual
  paymentCount:         number;   // número de cobros registrados
  todayCount:           number;
  pendingAllocation:    number;   // SUM(unallocatedAmount) pendientes de conciliar
  collectionRate:       number | null;   // totalCollected / totalInvoiced × 100
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : typeof v === "object" && v !== null && "toString" in v
    ? parseFloat((v as { toString(): string }).toString())
    : NaN;
  return isFinite(n) ? n : 0;
}

function toDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0)  return "CURRENT";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

/**
 * Recalcula CustomerProfile.totalReceivable y overdueReceivable en vivo
 * desde CustomerReceivable (filtro canónico RX_OPEN_STATUSES).
 */
async function refreshProfileReceivables(
  tx:             Prisma.TransactionClient,
  organizationId: string,
  customerNit:    string | null | undefined,
  customerId:     string | null | undefined,
): Promise<void> {
  if (!customerNit && !customerId) return;

  type AggRow = { total_rx: number | null; overdue_rx: number | null };

  const nitFilter = customerNit
    ? Prisma.sql`AND "customerNit" = ${customerNit}`
    : Prisma.sql``;

  const [row] = await tx.$queryRaw<AggRow[]>(Prisma.sql`
    SELECT
      SUM("balanceDue")::float8                                                    AS total_rx,
      SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8       AS overdue_rx
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${organizationId}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      ${nitFilter}
  `);

  const totalReceivable   = toNum(row?.total_rx);
  const overdueReceivable = toNum(row?.overdue_rx);

  await tx.customerProfile.updateMany({
    where: customerNit
      ? { organizationId, nit: customerNit }
      : { organizationId, id: customerId as string },
    data: {
      totalReceivable:   toDecimal(totalReceivable),
      overdueReceivable: toDecimal(overdueReceivable),
      updatedAt:         new Date(),
    },
  });
}

// ── Core: apply allocations inside a transaction ──────────────────────────────

async function applyAllocations(
  tx:             Prisma.TransactionClient,
  organizationId: string,
  paymentId:      string,
  paymentDate:    Date,
  allocations:    AllocationInput[],
): Promise<AllocationResult[]> {
  const results: AllocationResult[] = [];

  for (const alloc of allocations) {
    if (alloc.allocatedAmount <= 0) continue;

    // Load the receivable — verify it belongs to this org
    const rx = await tx.customerReceivable.findFirst({
      where: { id: alloc.receivableId, organizationId },
      select: {
        id: true, organizationId: true, invoiceNumber: true,
        customerName: true, customerNit: true,
        originalAmount: true, paidAmount: true, balanceDue: true,
        daysOverdue: true, status: true,
      },
    });

    if (!rx) throw new Error(`Receivable ${alloc.receivableId} not found or access denied`);
    if (rx.status === "PAID") throw new Error(`Invoice ${rx.invoiceNumber ?? rx.id} is already PAID`);
    if (rx.status === "WRITTEN_OFF") throw new Error(`Invoice ${rx.invoiceNumber ?? rx.id} is written off`);
    if (rx.status === "CANCELLED") throw new Error(`Invoice ${rx.invoiceNumber ?? rx.id} is cancelled`);

    const balanceBefore = toNum(rx.balanceDue);
    const applied       = Math.min(alloc.allocatedAmount, balanceBefore); // never overpay
    const newPaidAmount = toNum(rx.paidAmount) + applied;
    const newBalance    = Math.max(0, balanceBefore - applied);
    const nowPaid       = newBalance <= 0;

    const newStatus = nowPaid ? "PAID" : (newPaidAmount > 0 ? "PARTIAL" : rx.status);

    // Update the receivable
    await tx.customerReceivable.update({
      where: { id: rx.id },
      data: {
        paidAmount:  toDecimal(newPaidAmount),
        balanceDue:  toDecimal(newBalance),
        status:      newStatus,
        ...(nowPaid ? { paidAt: paymentDate } : {}),
        ...(nowPaid ? { agingBucket: "CURRENT", daysOverdue: 0 } : {}),
      },
    });

    // Create allocation record (snapshot)
    await tx.paymentAllocation.create({
      data: {
        organizationId,
        paymentId,
        receivableId:    rx.id,
        allocatedAmount: toDecimal(applied),
        balanceBefore:   toDecimal(balanceBefore),
        balanceAfter:    toDecimal(newBalance),
        receivableStatus: newStatus,
      },
    });

    results.push({
      receivableId:    rx.id,
      invoiceNumber:   rx.invoiceNumber,
      customerName:    rx.customerName,
      allocatedAmount: applied,
      balanceBefore,
      balanceAfter:    newBalance,
      receivableStatus: newStatus,
    });
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Registra un cobro recibido.
 *
 * Si se proveen `allocations`, las aplica en la misma transacción.
 * Si no, el pago queda en PENDING esperando conciliación posterior.
 *
 * @throws si alguna factura está pagada/cancelada/incobrable.
 * @throws si el monto de allocation supera el amount del pago.
 */
export async function registerPayment(
  input: RegisterPaymentInput,
): Promise<PaymentResult> {
  const {
    organizationId, createdBy, customerId, customerNit, customerName,
    amount, paymentDate, bankName, bankAccount,
    paymentMethod = PaymentMethod.TRANSFERENCIA,
    documentType = "PAGO",
    reference, externalRef, attachmentUrl, attachmentName,
    notes, source = PaymentSource.FORM,
    allocations = [],
  } = input;

  if (amount <= 0) throw new Error("El monto del pago debe ser mayor que cero");

  const totalAllocating = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
  if (totalAllocating > amount + 0.01) { // 1 peso tolerance for float
    throw new Error(`Suma de allocations (${totalAllocating}) supera el monto del pago (${amount})`);
  }

  return prisma.$transaction(async tx => {
    // 1. Create PaymentRecord
    const payment = await tx.paymentRecord.create({
      data: {
        organizationId,
        customerId:        customerId ?? null,
        customerNit:       customerNit ?? null,
        customerName,
        amount:            toDecimal(amount),
        allocatedAmount:   toDecimal(0),
        unallocatedAmount: toDecimal(amount),
        paymentDate,
        bankName:          bankName ?? null,
        bankAccount:       bankAccount ?? null,
        paymentMethod,
        documentType:      documentType as any,
        reference:         reference ?? null,
        externalRef:       externalRef ?? null,
        attachmentUrl:     attachmentUrl ?? null,
        attachmentName:    attachmentName ?? null,
        notes:             notes ?? null,
        status:            PaymentStatus.PENDING,
        source,
        createdBy,
      },
    });

    let allocationResults: AllocationResult[] = [];
    let allocatedTotal = 0;

    // 2. Apply allocations (if provided)
    if (allocations.length > 0) {
      allocationResults = await applyAllocations(tx, organizationId, payment.id, paymentDate, allocations);
      allocatedTotal = allocationResults.reduce((s, r) => s + r.allocatedAmount, 0);

      const newStatus = Math.abs(allocatedTotal - amount) <= 0.01
        ? PaymentStatus.RECONCILED
        : PaymentStatus.PARTIALLY_RECONCILED;

      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          allocatedAmount:   toDecimal(allocatedTotal),
          unallocatedAmount: toDecimal(Math.max(0, amount - allocatedTotal)),
          status:            newStatus,
          ...(newStatus === PaymentStatus.RECONCILED ? { reconciledAt: new Date() } : {}),
        },
      });

      // 3. Refresh CustomerProfile aggregates
      await refreshProfileReceivables(tx, organizationId, customerNit, customerId);
    }

    return {
      paymentId:         payment.id,
      status:            allocations.length === 0 ? PaymentStatus.PENDING
                         : Math.abs(allocatedTotal - amount) <= 0.01
                           ? PaymentStatus.RECONCILED
                           : PaymentStatus.PARTIALLY_RECONCILED,
      amount,
      allocatedAmount:   allocatedTotal,
      unallocatedAmount: Math.max(0, amount - allocatedTotal),
      allocations:       allocationResults,
    };
  });
}

/**
 * Concilia (aplica) un pago PENDING o PARTIALLY_RECONCILED contra facturas.
 * Puede llamarse múltiples veces hasta que el pago quede totalmente conciliado.
 */
export async function allocatePayment(
  input: AllocatePaymentInput,
): Promise<PaymentResult> {
  const { paymentId, allocations } = input;

  return prisma.$transaction(async tx => {
    const payment = await tx.paymentRecord.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });

    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if (payment.status === PaymentStatus.REVERSED) throw new Error("Payment is reversed");
    if (payment.status === PaymentStatus.RECONCILED) throw new Error("Payment is already fully reconciled");

    const prevAllocated   = toNum(payment.allocatedAmount);
    const newTotalAllocating = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
    const paymentAmount   = toNum(payment.amount);

    if (prevAllocated + newTotalAllocating > paymentAmount + 0.01) {
      throw new Error(
        `Allocation total (${prevAllocated + newTotalAllocating}) exceeds payment amount (${paymentAmount})`
      );
    }

    const results = await applyAllocations(
      tx, payment.organizationId, paymentId, payment.paymentDate, allocations
    );

    const addedAllocated  = results.reduce((s, r) => s + r.allocatedAmount, 0);
    const totalAllocated  = prevAllocated + addedAllocated;
    const newStatus = Math.abs(totalAllocated - paymentAmount) <= 0.01
      ? PaymentStatus.RECONCILED
      : PaymentStatus.PARTIALLY_RECONCILED;

    await tx.paymentRecord.update({
      where: { id: paymentId },
      data: {
        allocatedAmount:   toDecimal(totalAllocated),
        unallocatedAmount: toDecimal(Math.max(0, paymentAmount - totalAllocated)),
        status:            newStatus,
        ...(newStatus === PaymentStatus.RECONCILED ? { reconciledAt: new Date() } : {}),
      },
    });

    await refreshProfileReceivables(
      tx, payment.organizationId, payment.customerNit, payment.customerId
    );

    return {
      paymentId,
      status:            newStatus,
      amount:            paymentAmount,
      allocatedAmount:   totalAllocated,
      unallocatedAmount: Math.max(0, paymentAmount - totalAllocated),
      allocations:       results,
    };
  });
}

/**
 * Reversa un pago: deshace todos sus allocations y restaura los saldos
 * de las facturas afectadas.
 *
 * @throws si el pago ya está reversado.
 */
export async function reversePayment(
  input: ReversePaymentInput,
): Promise<{ paymentId: string; reversedAllocations: number }> {
  const { paymentId, organizationId, reversedBy, reason } = input;

  return prisma.$transaction(async tx => {
    const payment = await tx.paymentRecord.findFirst({
      where: { id: paymentId, organizationId },
      include: { allocations: true },
    });

    if (!payment) throw new Error("Payment not found");
    if (payment.status === PaymentStatus.REVERSED) throw new Error("Payment already reversed");

    // Restore each receivable
    for (const alloc of payment.allocations) {
      const rx = await tx.customerReceivable.findUnique({
        where: { id: alloc.receivableId },
        select: { paidAmount: true, balanceDue: true, originalAmount: true, status: true },
      });
      if (!rx) continue;

      const restored     = toNum(alloc.allocatedAmount);
      const newPaid      = Math.max(0, toNum(rx.paidAmount) - restored);
      const newBalance   = toNum(rx.originalAmount) - newPaid;
      const now          = new Date();
      const dueMs        = (rx as any).dueDate instanceof Date ? (rx as any).dueDate.getTime() : 0;
      const daysOverdue  = Math.max(0, Math.floor((now.getTime() - dueMs) / 86_400_000));
      const newStatus    = newPaid > 0 ? "PARTIAL" : "OPEN";

      await tx.customerReceivable.update({
        where: { id: alloc.receivableId },
        data: {
          paidAmount:  toDecimal(newPaid),
          balanceDue:  toDecimal(newBalance),
          status:      newStatus,
          paidAt:      null,
          daysOverdue,
          agingBucket: agingBucket(daysOverdue),
        },
      });
    }

    // Mark payment as reversed
    await tx.paymentRecord.update({
      where: { id: paymentId },
      data: {
        status:           PaymentStatus.REVERSED,
        reversedAt:       new Date(),
        reversalReason:   reason,
        allocatedAmount:  toDecimal(0),
        unallocatedAmount: payment.amount,
      },
    });

    // Refresh profile
    await refreshProfileReceivables(tx, organizationId, payment.customerNit, payment.customerId);

    return { paymentId, reversedAllocations: payment.allocations.length };
  });
}

// ── Dashboard queries ─────────────────────────────────────────────────────────

/**
 * Resumen de cobros para el dashboard ejecutivo.
 * Filtra CONFIRMED + RECONCILED + PARTIALLY_RECONCILED (excluye DRAFT y REVERSED).
 */
export async function getPaymentSummary(
  organizationId: string,
  opts?: { from?: Date; to?: Date },
): Promise<PaymentSummary> {
  const now          = new Date();
  const todayStart   = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const activeStatuses = [
    PaymentStatus.PENDING,
    PaymentStatus.RECONCILED,
    PaymentStatus.PARTIALLY_RECONCILED,
  ];

  const [allAgg, todayAgg, monthAgg, pendingAllocAgg, totalInvoicedAgg] = await Promise.all([
    // Total cobrado (todos los períodos)
    prisma.paymentRecord.aggregate({
      where: { organizationId, status: { in: activeStatuses } },
      _sum:   { amount: true },
      _count: true,
    }),
    // Cobrado hoy
    prisma.paymentRecord.aggregate({
      where: { organizationId, status: { in: activeStatuses }, paymentDate: { gte: todayStart } },
      _sum:   { amount: true },
      _count: true,
    }),
    // Cobrado este mes
    prisma.paymentRecord.aggregate({
      where: { organizationId, status: { in: activeStatuses }, paymentDate: { gte: monthStart } },
      _sum:   { amount: true },
      _count: true,
    }),
    // Monto pendiente de conciliar
    prisma.paymentRecord.aggregate({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_RECONCILED] },
      },
      _sum: { unallocatedAmount: true },
    }),
    // Total facturado (originalAmount de todos los CustomerReceivable)
    prisma.customerReceivable.aggregate({
      where: { organizationId },
      _sum:  { originalAmount: true },
    }),
  ]);

  const totalCollected     = toNum(allAgg._sum.amount);
  const collectedToday     = toNum(todayAgg._sum.amount);
  const collectedThisMonth = toNum(monthAgg._sum.amount);
  const paymentCount       = allAgg._count;
  const todayCount         = todayAgg._count;
  const pendingAllocation  = toNum(pendingAllocAgg._sum.unallocatedAmount);
  const totalInvoiced      = toNum(totalInvoicedAgg._sum.originalAmount);
  const collectionRate     = totalInvoiced > 0
    ? Math.round((totalCollected / totalInvoiced) * 10000) / 100
    : null;

  return {
    totalCollected,
    collectedToday,
    collectedThisMonth,
    paymentCount,
    todayCount,
    pendingAllocation,
    collectionRate,
  };
}

/**
 * Lista los pagos recientes de la org, con sus allocations.
 */
export async function listPayments(
  organizationId: string,
  opts?: {
    limit?:      number;
    status?:     PaymentStatus[];
    customerNit?: string;
    from?:       Date;
    to?:         Date;
  },
) {
  const limit = opts?.limit ?? 50;
  return prisma.paymentRecord.findMany({
    where: {
      organizationId,
      ...(opts?.status     ? { status: { in: opts.status } }                  : {}),
      ...(opts?.customerNit ? { customerNit: opts.customerNit }                : {}),
      ...(opts?.from || opts?.to ? {
        paymentDate: {
          ...(opts.from ? { gte: opts.from } : {}),
          ...(opts.to   ? { lte: opts.to   } : {}),
        },
      } : {}),
    },
    orderBy: { paymentDate: "desc" },
    take:    limit,
    include: {
      allocations: {
        include: { receivable: { select: { invoiceNumber: true, originalAmount: true, balanceDue: true } } },
      },
    },
  });
}

/**
 * Facturas abiertas de un cliente, ordenadas por vencimiento.
 * Usadas por el formulario de cobro para mostrar qué facturas conciliar.
 */
export async function getOpenReceivablesForCustomer(
  organizationId: string,
  customerNit:    string,
) {
  return prisma.customerReceivable.findMany({
    where: {
      organizationId,
      customerNit,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ daysOverdue: "desc" }, { dueDate: "asc" }],
    select: {
      id: true, invoiceNumber: true, erpId: true,
      originalAmount: true, paidAmount: true, balanceDue: true,
      invoiceDate: true, dueDate: true, daysOverdue: true,
      agingBucket: true, status: true,
    },
  });
}
