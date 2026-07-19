/**
 * lib/finance/auto-reconcile.ts
 *
 * Backend auto-reconciliation engine.
 *
 * Reads CollectionRecord.appliedFacts (populated from SAG v_pagosnew
 * Documento_pagado field) and creates PaymentRecord + PaymentAllocation
 * for each open CustomerReceivable that has associated SAG documents.
 *
 * Key guarantees:
 *   - Idempotent: checks CollectionRecord.paymentRecordId + PaymentAllocation
 *     before creating anything. Re-runs are safe.
 *   - Non-destructive: never deletes or overwrites existing manual payments.
 *   - Per-invoice transactions: one failure does not abort the whole batch.
 *   - dryRun=true (default): computes result without writing anything.
 *
 * Data model:
 *   CollectionRecord.appliedFacts = [{invoiceNumber: string, amount: number}]
 *   CollectionRecord.paymentRecordId → set after auto-reconcile creates a payment
 *
 * Trigger:
 *   autoReconcileFromSAG({ organizationId, customerId?, invoiceId?, dryRun? })
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { prisma }               from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

/** One associated document found in SAG for a given invoice. */
export interface SagAssociatedDocument {
  invoiceNumber:  string;
  sourceCode:     string;               // comprobanteCode: R1, R2, AN, etc.
  documentNumber: string | null;        // CollectionRecord.documentNumber
  documentDate:   Date | null;
  amount:         number;
  documentType:   "PAGO" | "ND" | "AJUSTE";
  reference:      string | null;
  collectionRecordId: string;
  alreadyReconciled:  boolean;          // paymentRecordId already set
  existingPaymentId:  string | null;
  raw:            unknown;
}

/** Final reconciliation status derived from applied total vs original amount. */
export type RecoStatus =
  | "SIN_SOPORTE"    // no SAG documents found
  | "PARCIAL"        // appliedTotal > 0 but < originalAmount
  | "CONCILIADA"     // appliedTotal ≈ originalAmount (±1 COP tolerance)
  | "EXCESO";        // appliedTotal > originalAmount

export interface InvoiceSample {
  invoiceId:       string;
  invoiceNumber:   string | null;
  customerName:    string;
  originalAmount:  number;
  appliedTotal:    number;
  remainingBalance: number;
  status:          RecoStatus;
  documents:       SagAssociatedDocument[];
  skipped:         boolean;
  error:           string | null;
}

export interface AutoReconcileResult {
  invoicesScanned:       number;
  documentsFound:        number;
  fullyReconciled:       number;
  partiallyReconciled:   number;
  noSupport:             number;
  overApplied:           number;
  skippedAlreadyApplied: number;
  errors:                Array<{ invoiceId: string; invoiceNumber: string | null; error: string }>;
  samples:               InvoiceSample[];   // up to 20 representative entries
  dryRun:                boolean;
}

export interface AutoReconcileParams {
  organizationId: string;
  customerId?:    string;
  invoiceId?:     string;
  dryRun?:        boolean;     // default true — safe probe mode
  limit?:         number;      // max invoices to process (default 500)
  batchSize?:     number;      // per-transaction batch for DB writes (default 20)
}

// ── Document type classification ──────────────────────────────────────────────

function classifyDocument(code: string, docNumber: string | null): "PAGO" | "ND" | "AJUSTE" {
  const u = code.toUpperCase();
  // Anulación codes
  if (u === "AN") return "AJUSTE";
  // Nota-descuento codes (if tenant uses them)
  if (u.startsWith("ND") || u === "NC") return "ND";

  // Secondary: check document number string for keywords
  if (docNumber) {
    const d = docNumber.toUpperCase();
    if (d.includes("ND") || d.includes("DESCUENTO") || d.includes("NOTA DE") || d.includes("NOTA DEBITO")) return "ND";
    if (d.includes("AJUSTE") || d.includes("CORREC") || d.includes("ANULA")) return "AJUSTE";
  }
  return "PAGO";
}

function recoStatus(originalAmount: number, appliedTotal: number): RecoStatus {
  if (appliedTotal === 0)                        return "SIN_SOPORTE";
  if (appliedTotal > originalAmount + 0.01)      return "EXCESO";
  if (Math.abs(appliedTotal - originalAmount) <= 1) return "CONCILIADA";
  return "PARCIAL";
}

// ── Core engine ───────────────────────────────────────────────────────────────

export async function autoReconcileFromSAG(
  params: AutoReconcileParams,
): Promise<AutoReconcileResult> {
  const {
    organizationId,
    customerId,
    invoiceId,
    dryRun    = true,
    limit     = 500,
    batchSize = 20,
  } = params;

  const db = prisma as any;

  const result: AutoReconcileResult = {
    invoicesScanned:       0,
    documentsFound:        0,
    fullyReconciled:       0,
    partiallyReconciled:   0,
    noSupport:             0,
    overApplied:           0,
    skippedAlreadyApplied: 0,
    errors:                [],
    samples:               [],
    dryRun,
  };

  // ── 1. Load open CustomerReceivable records ────────────────────────────────

  const rxWhere: Record<string, unknown> = {
    organizationId,
    status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
  };
  if (customerId) rxWhere.customerId  = customerId;
  if (invoiceId)  rxWhere.id          = invoiceId;

  const receivables = await db.customerReceivable.findMany({
    where:   rxWhere,
    orderBy: { dueDate: "asc" },
    take:    limit,
    select: {
      id: true, invoiceNumber: true, customerId: true, customerName: true,
      originalAmount: true, paidAmount: true, balanceDue: true, status: true,
      customerNit: true, organizationId: true,
      allocations: { select: { id: true } },   // detect existing allocations
    },
  }) as Array<{
    id: string; invoiceNumber: string | null; customerId: string | null;
    customerName: string; originalAmount: unknown; paidAmount: unknown;
    balanceDue: unknown; status: string; customerNit: string | null;
    organizationId: string;
    allocations: Array<{ id: string }>;
  }>;

  result.invoicesScanned = receivables.length;

  if (receivables.length === 0) return result;

  // ── 2. Build CustomerProfile lookup for paymentMethod/NIT metadata ─────────

  // Map customerId → { nit, sagTerceroId }
  const profileIds = [...new Set(receivables.map(r => r.customerId).filter(Boolean))] as string[];
  type ProfileMeta = { id: string; nit: string | null; sagTerceroId: number | null };
  const profiles: ProfileMeta[] = profileIds.length > 0
    ? await db.customerProfile.findMany({
        where:  { id: { in: profileIds }, organizationId },
        select: { id: true, nit: true, sagTerceroId: true },
      })
    : [];
  const profileMap = new Map<string, ProfileMeta>(profiles.map((p: ProfileMeta) => [p.id, p]));

  // ── 3. Process each invoice independently ─────────────────────────────────

  for (const rx of receivables) {
    const origAmt = typeof (rx.originalAmount as any)?.toNumber === "function"
      ? (rx.originalAmount as any).toNumber()
      : Number(rx.originalAmount ?? 0);

    const sample: InvoiceSample = {
      invoiceId:        rx.id,
      invoiceNumber:    rx.invoiceNumber,
      customerName:     rx.customerName,
      originalAmount:   origAmt,
      appliedTotal:     0,
      remainingBalance: origAmt,
      status:           "SIN_SOPORTE",
      documents:        [],
      skipped:          false,
      error:            null,
    };

    try {
      // ── 3a. Find CollectionRecord rows with appliedFacts referencing this invoice

      if (!rx.invoiceNumber) {
        // No invoice number → cannot match against appliedFacts
        result.noSupport++;
        sample.status = "SIN_SOPORTE";
        result.samples.push(sample);
        continue;
      }

      const crRows = await prisma.$queryRaw<Array<{
        id: string; comprobanteCode: string; documentNumber: string | null;
        collectionDate: Date; amount: unknown; appliedFacts: unknown;
        appliedStatus: string; paymentRecordId: string | null;
        customerNit: string | null; customerName: string | null;
      }>>(Prisma.sql`
        SELECT
          id, "comprobanteCode", "documentNumber",
          "collectionDate", amount, "appliedFacts",
          "appliedStatus", "paymentRecordId",
          "customerNit", "customerName"
        FROM "CollectionRecord"
        WHERE "organizationId" = ${organizationId}
          AND "appliedFacts" IS NOT NULL
          AND "appliedFacts" @> ${JSON.stringify([{ invoiceNumber: rx.invoiceNumber }])}::jsonb
        ORDER BY "collectionDate" ASC
      `);

      if (crRows.length === 0) {
        result.noSupport++;
        sample.status = "SIN_SOPORTE";
        result.samples.push(sample);
        continue;
      }

      result.documentsFound += crRows.length;

      // ── 3b. Build SagAssociatedDocument list ──────────────────────────────

      const sagDocs: SagAssociatedDocument[] = crRows.map(cr => {
        const amt = typeof (cr.amount as any)?.toNumber === "function"
          ? (cr.amount as any).toNumber()
          : Number(cr.amount ?? 0);

        // Extract the amount that applies specifically to this invoice
        // (appliedFacts may reference multiple invoices)
        const factsArr = Array.isArray(cr.appliedFacts) ? cr.appliedFacts as Array<{ invoiceNumber: string; amount: number }> : [];
        const matchingFact = factsArr.find(f => f.invoiceNumber === rx.invoiceNumber);
        const appliedAmt = matchingFact?.amount ?? amt;

        return {
          invoiceNumber:       rx.invoiceNumber!,
          sourceCode:          cr.comprobanteCode,
          documentNumber:      cr.documentNumber ?? null,
          documentDate:        cr.collectionDate,
          amount:              Math.abs(appliedAmt),
          documentType:        classifyDocument(cr.comprobanteCode, cr.documentNumber),
          reference:           cr.documentNumber ?? null,
          collectionRecordId:  cr.id,
          alreadyReconciled:   !!cr.paymentRecordId,
          existingPaymentId:   cr.paymentRecordId,
          raw:                 cr.appliedFacts,
        };
      });

      sample.documents   = sagDocs;
      const appliedTotal = sagDocs.reduce((s, d) => s + d.amount, 0);
      sample.appliedTotal     = appliedTotal;
      sample.remainingBalance = origAmt - appliedTotal;
      sample.status           = recoStatus(origAmt, appliedTotal);

      // ── 3c. Count reconciliation result ──────────────────────────────────

      if (sample.status === "CONCILIADA")    result.fullyReconciled++;
      else if (sample.status === "PARCIAL")  result.partiallyReconciled++;
      else if (sample.status === "EXCESO")   result.overApplied++;
      else                                   result.noSupport++;

      // ── 3d. Check if already fully covered by existing allocations ────────

      const hasExistingAllocations = rx.allocations.length > 0;
      const allAlreadyReconciled   = sagDocs.every(d => d.alreadyReconciled);

      if (allAlreadyReconciled) {
        result.skippedAlreadyApplied++;
        sample.skipped = true;
        result.samples.push(sample);
        continue;
      }

      // ── 3e. Write phase (only if dryRun=false) ────────────────────────────

      if (!dryRun) {
        // Resolve customer identity for PaymentRecord
        const profile = rx.customerId ? profileMap.get(rx.customerId) : null;

        // Process each unreconciled SAG document independently
        for (const sagDoc of sagDocs) {
          if (sagDoc.alreadyReconciled) continue;  // skip already-applied

          try {
            await prisma.$transaction(async tx => {
              // Guard: re-check inside transaction (race-condition protection)
              const crFresh = await tx.collectionRecord.findUnique({
                where:  { id: sagDoc.collectionRecordId },
                select: { id: true, paymentRecordId: true, appliedStatus: true },
              });
              if (!crFresh || crFresh.paymentRecordId) {
                // Already processed by a concurrent run — skip silently
                return;
              }

              // Also guard: check if a PaymentAllocation already exists for this
              // collectionRecord × receivable pair (extra idempotency)
              const existingAlloc = await tx.paymentAllocation.findFirst({
                where: { receivableId: rx.id },
                include: {
                  payment: {
                    select: { reference: true },
                  },
                },
              });
              // Only skip if we find an allocation from the exact same CR
              // (reference match). Don't skip manual payments.
              if (existingAlloc?.payment?.reference === sagDoc.collectionRecordId) {
                return;
              }

              // Clamp allocated amount to remaining balance on this receivable
              const rxCurrent = await tx.customerReceivable.findUnique({
                where:  { id: rx.id },
                select: { balanceDue: true },
              });
              const currentBalance = rxCurrent
                ? (typeof (rxCurrent.balanceDue as any)?.toNumber === "function"
                    ? (rxCurrent.balanceDue as any).toNumber()
                    : Number(rxCurrent.balanceDue ?? 0))
                : origAmt;

              const toAllocate = Math.min(sagDoc.amount, Math.max(0, currentBalance));
              if (toAllocate <= 0) return;  // balance already covered

              // Create PaymentRecord
              const payment = await tx.paymentRecord.create({
                data: {
                  organizationId,
                  customerId:        rx.customerId ?? null,
                  customerNit:       profile?.sagTerceroId != null
                                       ? String(profile.sagTerceroId)
                                       : rx.customerNit ?? null,
                  customerName:      rx.customerName,
                  amount:            toAllocate,
                  allocatedAmount:   0,
                  unallocatedAmount: toAllocate,
                  paymentDate:       sagDoc.documentDate ?? new Date(),
                  paymentMethod:     "OTRO" as any,
                  documentType:      sagDoc.documentType as any,
                  reference:         sagDoc.collectionRecordId,    // CR id as idempotency ref
                  notes:             `Auto-conciliado desde SAG CR ${sagDoc.collectionRecordId} (${sagDoc.sourceCode})`,
                  status:            "PENDING" as any,
                  source:            "FORM" as any,
                  createdBy:         "system:auto-reconcile",
                },
              });

              // Snapshot current balance on receivable
              const rxSnap = await tx.customerReceivable.findUnique({
                where:  { id: rx.id },
                select: { balanceDue: true },
              });
              const balBefore = rxSnap
                ? (typeof (rxSnap.balanceDue as any)?.toNumber === "function"
                    ? (rxSnap.balanceDue as any).toNumber()
                    : Number(rxSnap.balanceDue ?? 0))
                : origAmt;
              const balAfter  = Math.max(0, balBefore - toAllocate);

              // Create PaymentAllocation
              await tx.paymentAllocation.create({
                data: {
                  organizationId,
                  paymentId:        payment.id,
                  receivableId:     rx.id,
                  allocatedAmount:  toAllocate,
                  balanceBefore:    balBefore,
                  balanceAfter:     balAfter,
                  receivableStatus: balAfter <= 0.01 ? "PAID" : "PARTIAL",
                },
              });

              // Update CustomerReceivable balance
              const newStatus = balAfter <= 0.01 ? "PAID"
                               : balAfter < origAmt ? "PARTIAL"
                               : "OPEN";
              await tx.customerReceivable.update({
                where: { id: rx.id },
                data: {
                  paidAmount: { increment: toAllocate },
                  balanceDue: balAfter,
                  status:     newStatus,
                  ...(newStatus === "PAID" ? { paidAt: new Date() } : {}),
                },
              });

              // Update PaymentRecord totals
              await tx.paymentRecord.update({
                where: { id: payment.id },
                data: {
                  allocatedAmount:   toAllocate,
                  unallocatedAmount: 0,
                  status:            "RECONCILED" as any,
                  reconciledAt:      new Date(),
                },
              });

              // Mark CollectionRecord as applied
              await tx.collectionRecord.update({
                where: { id: sagDoc.collectionRecordId },
                data: {
                  paymentRecordId: payment.id,
                  appliedStatus:   "APPLIED",
                  appliedAt:       new Date(),
                  appliedBy:       "system:auto-reconcile",
                },
              });
            });
          } catch (docErr) {
            // Log per-document errors but continue processing other documents
            const msg = docErr instanceof Error ? docErr.message : String(docErr);
            console.error(`[auto-reconcile] Error on CR ${sagDoc.collectionRecordId} / inv ${rx.invoiceNumber}: ${msg}`);
            // Don't rethrow — process remaining docs
          }
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ invoiceId: rx.id, invoiceNumber: rx.invoiceNumber, error: msg });
      sample.error = msg;
      console.error(`[auto-reconcile] Invoice ${rx.invoiceNumber ?? rx.id}: ${msg}`);
    }

    result.samples.push(sample);
  }

  // Cap samples for readability
  result.samples = result.samples.slice(0, 20);

  return result;
}

// ── formatAutoReconcileResult — human-readable summary ───────────────────────

export function formatAutoReconcileResult(r: AutoReconcileResult): string {
  const lines: string[] = [
    `\n╔══ Auto-Reconcile Result ${r.dryRun ? "[DRY RUN]" : "[LIVE]"} ══`,
    `║  Invoices scanned:       ${r.invoicesScanned}`,
    `║  SAG documents found:    ${r.documentsFound}`,
    `║  ✅ Fully reconciled:    ${r.fullyReconciled}`,
    `║  🟡 Partially reconciled: ${r.partiallyReconciled}`,
    `║  ⬜ No support:          ${r.noSupport}`,
    `║  🔴 Over-applied:        ${r.overApplied}`,
    `║  ⏭  Already applied:     ${r.skippedAlreadyApplied}`,
    `║  ❌ Errors:              ${r.errors.length}`,
    `╚${"═".repeat(40)}`,
  ];

  if (r.errors.length > 0) {
    lines.push("\nErrors:");
    for (const e of r.errors) {
      lines.push(`  inv ${e.invoiceNumber ?? e.invoiceId}: ${e.error}`);
    }
  }

  if (r.samples.length > 0) {
    lines.push("\nSamples (first 20):");
    const fmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
    for (const s of r.samples) {
      const icon = s.status === "CONCILIADA" ? "✅"
                   : s.status === "PARCIAL"   ? "🟡"
                   : s.status === "EXCESO"     ? "🔴" : "⬜";
      const skip = s.skipped ? " [skip]" : "";
      lines.push(
        `  ${icon}  ${(s.invoiceNumber ?? "—").padEnd(16)}  ` +
        `orig=${fmt.format(s.originalAmount).padStart(18)}  ` +
        `applied=${fmt.format(s.appliedTotal).padStart(18)}  ` +
        `rem=${fmt.format(s.remainingBalance).padStart(18)}  ` +
        `docs=${s.documents.length}${skip}${s.error ? "  ERR:" + s.error : ""}`
      );
    }
  }

  return lines.join("\n");
}
