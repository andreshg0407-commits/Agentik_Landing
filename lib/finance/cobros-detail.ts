/**
 * lib/finance/cobros-detail.ts
 *
 * Individual record queries for cobros drilldown panels in Torre de Control.
 * Feeds "Cobros recibidos hoy" and "Consignaciones pendientes" detail views.
 *
 * Source authority: lib/financial/source-registry.ts only.
 */

import { prisma }                   from "@/lib/prisma";
import { PENDING_DEPOSIT_SOURCES }  from "@/lib/financial/source-registry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollectionDetailRecord {
  id:             string;
  collectionDate: Date;
  comprobanteCode: string;
  documentNumber: string | null;
  customerName:   string | null;
  customerNit:    string | null;
  amount:         number;
}

export interface DepositDetailRecord {
  id:             string;
  saleDate:       Date;
  comprobanteCode: string;
  comprobante:    string | null;
  customerName:   string | null;
  amount:         number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decToNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch individual CollectionRecord rows for a single operational day.
 * Powers the "Cobros recibidos hoy" drilldown.
 */
export async function getTodayCollectionDetail(
  organizationId: string,
  opDayStart: Date,
  opDayEnd: Date,
  take = 25,
): Promise<CollectionDetailRecord[]> {
  const rows = await (prisma as any).collectionRecord.findMany({
    where:   { organizationId, collectionDate: { gte: opDayStart, lt: opDayEnd } },
    select:  { id: true, collectionDate: true, comprobanteCode: true, documentNumber: true, customerName: true, customerNit: true, amount: true },
    orderBy: { collectionDate: "desc" },
    take,
  });

  return (rows as any[]).map(r => ({
    id:             r.id,
    collectionDate: r.collectionDate,
    comprobanteCode: r.comprobanteCode ?? "—",
    documentNumber: r.documentNumber  ?? null,
    customerName:   r.customerName    ?? null,
    customerNit:    r.customerNit     ?? null,
    amount:         decToNum(r.amount),
  }));
}

/**
 * Fetch the most recent pending deposit SaleRecord rows (B1/B2/H1/H2/CP).
 * Powers the "Consignaciones pendientes" drilldown.
 */
export async function getPendingDepositDetail(
  organizationId: string,
  take = 25,
): Promise<DepositDetailRecord[]> {
  const rows = await (prisma as any).saleRecord.findMany({
    where:   { organizationId, comprobanteCode: { in: [...PENDING_DEPOSIT_SOURCES] } },
    select:  { id: true, saleDate: true, comprobanteCode: true, comprobante: true, customerName: true, amount: true },
    orderBy: { saleDate: "desc" },
    take,
  });

  return (rows as any[]).map(r => ({
    id:             r.id,
    saleDate:       r.saleDate,
    comprobanteCode: r.comprobanteCode ?? "—",
    comprobante:    r.comprobante ?? null,
    customerName:   r.customerName ?? null,
    amount:         Math.abs(decToNum(r.amount)),
  }));
}
