/**
 * lib/finance/ap-kpis.ts
 *
 * AP (Cuentas por Pagar) and pending-deposit KPIs derived from SaleRecord.
 *
 * There is no dedicated payableRecord model — SAG AP documents (C1, G1, C2)
 * are stored in SaleRecord like all other SAG documents.
 * comprobanteCode identifies the document type; customerName/customerNit
 * identify the supplier (counterparty) in this AP context.
 * saleDate is the obligation date proxy — SaleRecord has no dueDate field.
 *
 * Source authority: lib/financial/source-registry.ts only.
 * No hardcoded source code arrays here.
 */

import { prisma }            from "@/lib/prisma";
import type { FiscalWindow } from "@/lib/finance/fiscal-window";
import {
  AP_CREATION_SOURCES,
  AP_REDUCTION_SOURCES,
  PENDING_DEPOSIT_SOURCES,
} from "@/lib/financial/source-registry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApKpis {
  /** AP obligations created (C1, G1, C2): gross amount + document count */
  totalCreated:    { amount: number; count: number };
  /** AP obligations reduced/paid (DC, DG): gross reduction amount + count */
  totalReduced:    { amount: number; count: number };
  /** Net AP balance: totalCreated.amount − totalReduced.amount */
  netBalance:      number;
  /** Top counterparties (suppliers) by AP creation amount, up to 5 */
  topSuppliers:    { name: string; amount: number; count: number }[];
  /** Pending deposits (B1, B2, H1, H2, CP): consignaciones sin identificar */
  pendingDeposits: { amount: number; count: number };
}

// ── AP document record (for drilldown panels) ─────────────────────────────────

export interface ApDocumentRecord {
  id:              string;
  saleDate:        Date;
  comprobanteCode: string;
  comprobante:     string | null;   // full reference, e.g. "C1-001234"
  customerName:    string | null;   // supplier name in AP context
  customerNit:     string | null;
  amount:          number;          // often 0 — SAG SOAP mapper gap for AP codes
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type AggRow = {
  comprobanteCode: string | null;
  _sum:            { amount: { toNumber(): number } | null };
  _count:          number;
};

type SupplierRow = {
  customerName: string | null;
  _sum:         { amount: { toNumber(): number } | null };
  _count:       number;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

function sumRows(rows: AggRow[]): { amount: number; count: number } {
  return rows.reduce(
    (acc, r) => ({
      amount: acc.amount + Math.abs(toNum(r._sum?.amount ?? null)),
      count:  acc.count  + toNum(r._count),
    }),
    { amount: 0, count: 0 },
  );
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Returns AP and pending-deposit KPIs for an org.
 *
 * @param organizationId  Org to query.
 * @param window          Optional fiscal window; when provided, filters by saleDate.
 */
export async function getApKpis(
  organizationId: string,
  window?: FiscalWindow,
): Promise<ApKpis> {
  const dateFilter =
    window && window.mode !== "full_history"
      ? { gte: window.from, lte: window.to }
      : undefined;

  const baseWhere = {
    organizationId,
    ...(dateFilter ? { saleDate: dateFilter } : {}),
  };

  const allApCodes = [
    ...AP_CREATION_SOURCES,
    ...AP_REDUCTION_SOURCES,
    ...PENDING_DEPOSIT_SOURCES,
  ];

  const [codeRows, supplierRows] = await Promise.all([
    // All AP + deposit codes grouped by comprobanteCode
    (prisma as any).saleRecord.groupBy({
      by:    ["comprobanteCode"],
      where: { ...baseWhere, comprobanteCode: { in: allApCodes } },
      _sum:  { amount: true },
      _count: true,
    }) as Promise<AggRow[]>,

    // Top suppliers by AP creation volume (up to 5)
    (prisma as any).saleRecord.groupBy({
      by:      ["customerName"],
      where:   { ...baseWhere, comprobanteCode: { in: [...AP_CREATION_SOURCES] }, customerName: { not: null } },
      _sum:    { amount: true },
      _count:  true,
      orderBy: { _sum: { amount: "desc" } },
      take:    5,
    }) as Promise<SupplierRow[]>,
  ]);

  const AP_CREATION_SET  = new Set(AP_CREATION_SOURCES);
  const AP_REDUCTION_SET = new Set(AP_REDUCTION_SOURCES);
  const DEPOSIT_SET      = new Set(PENDING_DEPOSIT_SOURCES);

  const totalCreated    = sumRows(codeRows.filter(r => r.comprobanteCode && AP_CREATION_SET.has(r.comprobanteCode)));
  const totalReduced    = sumRows(codeRows.filter(r => r.comprobanteCode && AP_REDUCTION_SET.has(r.comprobanteCode)));
  const pendingDeposits = sumRows(codeRows.filter(r => r.comprobanteCode && DEPOSIT_SET.has(r.comprobanteCode)));

  const topSuppliers = supplierRows.map(r => ({
    name:   String(r.customerName ?? "Proveedor desconocido"),
    amount: Math.abs(toNum(r._sum?.amount ?? null)),
    count:  toNum(r._count),
  }));

  return {
    totalCreated,
    totalReduced,
    netBalance: totalCreated.amount - totalReduced.amount,
    topSuppliers,
    pendingDeposits,
  };
}

// ── AP document drilldown ─────────────────────────────────────────────────────

function rowToApDoc(r: any): ApDocumentRecord {
  return {
    id:              r.id,
    saleDate:        r.saleDate,
    comprobanteCode: r.comprobanteCode ?? "—",
    comprobante:     r.comprobante ?? null,
    customerName:    r.customerName ?? null,
    customerNit:     r.customerNit ?? null,
    amount:          Math.abs(toNum(r.amount)),
  };
}

/**
 * Fetch individual AP SaleRecord rows (C1, G1, C2) for the drilldown panel.
 * Note: amount is 0 for most AP documents — SAG SOAP does not populate amounts
 * for comprobante codes C1/G1/C2 in the current mapper.
 */
export async function getApDocumentDetail(
  organizationId: string,
  window?: FiscalWindow,
  take = 25,
): Promise<ApDocumentRecord[]> {
  const dateFilter =
    window && window.mode !== "full_history"
      ? { gte: window.from, lte: window.to }
      : undefined;

  const rows = await (prisma as any).saleRecord.findMany({
    where:   {
      organizationId,
      comprobanteCode: { in: [...AP_CREATION_SOURCES] },
      ...(dateFilter ? { saleDate: dateFilter } : {}),
    },
    select:  { id: true, saleDate: true, comprobanteCode: true, comprobante: true, customerName: true, customerNit: true, amount: true },
    orderBy: { saleDate: "desc" },
    take,
  });

  return (rows as any[]).map(rowToApDoc);
}

/**
 * Return the single oldest AP obligation by saleDate.
 * Used to drive the "Tesorería inmediata" urgency signal.
 */
export async function getOldestApRecord(
  organizationId: string,
): Promise<ApDocumentRecord | null> {
  const row = await (prisma as any).saleRecord.findFirst({
    where:   { organizationId, comprobanteCode: { in: [...AP_CREATION_SOURCES] } },
    select:  { id: true, saleDate: true, comprobanteCode: true, comprobante: true, customerName: true, customerNit: true, amount: true },
    orderBy: { saleDate: "asc" },
  });

  return row ? rowToApDoc(row) : null;
}
