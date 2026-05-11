/**
 * lib/reconciliation/reconciliation-audit.ts
 *
 * Sprint S3 Phase 1 — Audit queries and reporting utilities.
 *
 * READ-ONLY queries for:
 *   - Reconciliation status summary
 *   - Per-customer allocation history
 *   - Balance correction report
 *   - Unmatched cobros report
 *   - Rollback helpers (returns data needed, does not execute rollback)
 */

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReconciliationSummary {
  orgId: string;
  generatedAt: Date;

  // CollectionAllocation stats
  totalAllocations:    number;
  totalAmountApplied:  number;
  receivablesUpdated:  number;
  receivablesPaid:     number;
  receivablesPartial:  number;

  // CollectionRecord stats
  cobrosApplied:       number;
  cobrosAvailable:     number;

  // CustomerReceivable stats (current live state)
  rxTotalBalance:      number;
  rxTotalOriginal:     number;
  rxTotalPaid:         number;
  rxOpenCount:         number;
  rxPartialCount:      number;
  rxPaidCount:         number;

  // Confidence breakdown
  byConfidence: Record<string, number>;
  byRule:       Record<string, number>;
}

export interface AllocationDetail {
  allocationId:       string;
  collectionRecordId: string;
  receivableId:       string;
  erpId:             string | null;
  customerName:       string;
  customerNit:        string | null;
  cobroDate:          Date;
  comprobanteCode:    string;
  cobroAmount:        number;
  amountApplied:      number;
  balanceBefore:      number;
  balanceAfter:       number;
  statusBefore:       string;
  statusAfter:        string;
  ruleUsed:           string;
  confidence:         string;
  appliedBy:          string;
  createdAt:          Date;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return parseFloat(String(v)) || 0;
}

export async function getReconciliationSummary(orgId: string): Promise<ReconciliationSummary> {
  const [
    allocStats,
    cobroApplied,
    cobroAvailable,
    rxAgg,
    rxByStatus,
    byConfidence,
    byRule,
  ] = await Promise.all([
    // Allocation stats
    (prisma as any).collectionAllocation.aggregate({
      where: { organizationId: orgId },
      _count: { id: true },
      _sum:   { amountApplied: true },
    }),

    // Cobros marked as APPLIED
    (prisma as any).collectionRecord.count({
      where: { organizationId: orgId, appliedStatus: "APPLIED" },
    }),

    // Cobros still AVAILABLE
    (prisma as any).collectionRecord.count({
      where: { organizationId: orgId, appliedStatus: "AVAILABLE" },
    }),

    // Receivable totals
    (prisma as any).customerReceivable.aggregate({
      where: { organizationId: orgId },
      _sum: { originalAmount: true, paidAmount: true, balanceDue: true },
    }),

    // Receivable count by status
    (prisma as any).customerReceivable.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),

    // Allocations by confidence
    (prisma as any).collectionAllocation.groupBy({
      by: ["confidence"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),

    // Allocations by rule
    (prisma as any).collectionAllocation.groupBy({
      by: ["ruleUsed"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
  ]);

  // Count distinct receivables updated
  const uniqueRxResult = await (prisma as any).$queryRaw`
    SELECT COUNT(DISTINCT "receivableId") AS cnt
    FROM "CollectionAllocation"
    WHERE "organizationId" = ${orgId}
  ` as { cnt: bigint }[];
  const receivablesUpdated = Number(uniqueRxResult[0]?.cnt ?? 0);

  const paidAfterResult = await (prisma as any).$queryRaw`
    SELECT
      SUM(CASE WHEN "statusAfter" = 'PAID'    THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN "statusAfter" = 'PARTIAL' THEN 1 ELSE 0 END) AS partial
    FROM (
      SELECT DISTINCT ON ("receivableId") "receivableId", "statusAfter"
      FROM "CollectionAllocation"
      WHERE "organizationId" = ${orgId}
      ORDER BY "receivableId", "createdAt" DESC
    ) t
  ` as { paid: bigint; partial: bigint }[];

  const rxStatusMap = Object.fromEntries(
    (rxByStatus as any[]).map(g => [g.status, g._count.id])
  );

  return {
    orgId,
    generatedAt: new Date(),
    totalAllocations:   Number(allocStats._count.id ?? 0),
    totalAmountApplied: toNum(allocStats._sum.amountApplied),
    receivablesUpdated,
    receivablesPaid:    Number(paidAfterResult[0]?.paid ?? 0),
    receivablesPartial: Number(paidAfterResult[0]?.partial ?? 0),
    cobrosApplied:      cobroApplied as number,
    cobrosAvailable:    cobroAvailable as number,
    rxTotalOriginal:    toNum(rxAgg._sum.originalAmount),
    rxTotalPaid:        toNum(rxAgg._sum.paidAmount),
    rxTotalBalance:     toNum(rxAgg._sum.balanceDue),
    rxOpenCount:        rxStatusMap["OPEN"]     ?? 0,
    rxPartialCount:     rxStatusMap["PARTIAL"]  ?? 0,
    rxPaidCount:        rxStatusMap["PAID"]      ?? 0,
    byConfidence:       Object.fromEntries((byConfidence as any[]).map(g => [g.confidence, g._count.id])),
    byRule:             Object.fromEntries((byRule as any[]).map(g => [g.ruleUsed, g._count.id])),
  };
}

// ── Per-receivable allocation history ─────────────────────────────────────────

export async function getAllocationsByReceivable(receivableId: string): Promise<AllocationDetail[]> {
  const rows = await (prisma as any).collectionAllocation.findMany({
    where:   { receivableId },
    orderBy: { createdAt: "asc" },
    include: {
      collectionRecord: {
        select: {
          amount: true,
          comprobanteCode: true,
          collectionDate: true,
        },
      },
      receivable: {
        select: { erpId: true, customerName: true, customerNit: true },
      },
    },
  });

  return rows.map((r: any) => ({
    allocationId:       r.id,
    collectionRecordId: r.collectionRecordId,
    receivableId:       r.receivableId,
    erpId:              r.receivable?.erpId ?? null,
    customerName:       r.receivable?.customerName ?? "",
    customerNit:        r.receivable?.customerNit ?? null,
    cobroDate:          r.collectionRecord?.collectionDate,
    comprobanteCode:    r.collectionRecord?.comprobanteCode ?? "",
    cobroAmount:        toNum(r.collectionRecord?.amount),
    amountApplied:      toNum(r.amountApplied),
    balanceBefore:      toNum(r.balanceBefore),
    balanceAfter:       toNum(r.balanceAfter),
    statusBefore:       r.statusBefore,
    statusAfter:        r.statusAfter,
    ruleUsed:           r.ruleUsed,
    confidence:         r.confidence,
    appliedBy:          r.appliedBy,
    createdAt:          r.createdAt,
  }));
}

// ── Unmatched cobros report ───────────────────────────────────────────────────

export interface UnmatchedCobro {
  cobroId:         string;
  comprobanteCode: string;
  amount:          number;
  collectionDate:  Date;
  docPagado:       number | null;
  erpIdAttempted:  string | null;
  customerName:    string | null;
  reason:          "NO_RX" | "NO_DOC_PAGADO" | "ZERO_BALANCE" | "WRITTEN_OFF";
}

export async function getUnmatchedCobros(orgId: string, limit = 200): Promise<UnmatchedCobro[]> {
  // Cobros that are AVAILABLE and have Documento_pagado, but no matching allocation
  type Row = {
    id: string;
    comprobanteCode: string;
    amount: any;
    collectionDate: Date;
    rawJson: unknown;
    customerName: string | null;
  };

  const cobros: Row[] = await (prisma as any).collectionRecord.findMany({
    where: {
      organizationId: orgId,
      appliedStatus:  { in: ["AVAILABLE"] },
    },
    select: {
      id: true,
      comprobanteCode: true,
      amount: true,
      collectionDate: true,
      rawJson: true,
      customerName: true,
    },
    take: limit,
    orderBy: { collectionDate: "desc" },
  });

  const { extractDocumentoPagado: edp, docPagadoToErpId: d2e } = await import("./reconciliation-rules");

  const results: UnmatchedCobro[] = [];
  for (const c of cobros) {
    const dp = edp(c.rawJson);
    const erpId = dp != null ? d2e(dp) : null;
    results.push({
      cobroId:         c.id,
      comprobanteCode: c.comprobanteCode,
      amount:          toNum(c.amount),
      collectionDate:  c.collectionDate,
      docPagado:       dp,
      erpIdAttempted:  erpId,
      customerName:    c.customerName,
      reason:          dp == null ? "NO_DOC_PAGADO" : "NO_RX",
    });
  }

  return results;
}

// ── Rollback data helper ──────────────────────────────────────────────────────

/**
 * Returns the data needed to rollback all allocations for a receivable.
 * Does NOT execute the rollback — call the rollback function in the apply script.
 */
export async function getRollbackDataForReceivable(receivableId: string) {
  return (prisma as any).collectionAllocation.findMany({
    where:   { receivableId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      collectionRecordId: true,
      receivableId: true,
      paidBefore: true,
      balanceBefore: true,
      statusBefore: true,
    },
  });
}
