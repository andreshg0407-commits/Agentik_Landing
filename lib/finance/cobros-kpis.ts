/**
 * lib/finance/cobros-kpis.ts
 *
 * Real cobros KPIs from CollectionRecord.
 *
 * CollectionRecord is the MONETARY layer for cobros (R1, R2, RS, RC, RG, RA, AN, A1, A2).
 * Source set is now derived from lib/financial/source-registry.ts — COLLECTION_SOURCES.
 * Amounts come from SAG v_pagosnew.Valor_Pagado — confirmed real values, not the
 * structural zero from MOVIMIENTOS headers.
 *
 * Usage:
 *   const kpis = await getCobrosKpis(orgId, { from: startDate, to: endDate });
 *   // kpis.bySource.R1.amount — total cobrado empresa F1
 *   // kpis.totalAmount        — total cobrado (all codes)
 *
 * When CollectionRecord is empty (collections sync not yet run), falls back to
 * SaleRecord count-only from cobros-breakdown.ts.
 */

import { prisma } from "@/lib/prisma";
import { COLLECTION_SOURCES } from "@/lib/financial/source-registry";

// ── Supported cobro codes — derived from canonical financial source registry ──
//
// Previously hardcoded as ["R1", "R2", "RS", "RC", "RG", "RA", "SI", "AN"].
// Now derived from COLLECTION_SOURCES (lib/financial/source-registry.ts).
//
// Key changes from FIN-02 migration:
//   REMOVED: SI — marked "EXCLUIR TOTALMENTE" in FUENTES.xlsx; not a cobro source.
//   ADDED:   A1 — Anticipo Cliente Empresa (official F1 advance).
//   ADDED:   A2 — Anticipo Cliente F2.
//
// CobroCode is now string (registry-driven) instead of a closed literal union.

export const COBRO_CODES: readonly string[] = COLLECTION_SOURCES;
export type CobroCode = string;

// ── Result types ──────────────────────────────────────────────────────────────

export interface CobroCodeMetrics {
  amount: number;
  count:  number;
}

export interface CobrosKpis {
  /** Total amount across all cobro codes. */
  totalAmount: number;
  /** Total receipt count across all cobro codes. */
  count:       number;
  /** Per-code breakdown. Keys always present for COLLECTION_SOURCES even when amount/count = 0. */
  bySource:    Record<string, CobroCodeMetrics>;
  /** True when CollectionRecord has data (real amounts). False = no sync yet. */
  hasRealAmounts: boolean;
  /** Period covered (ISO strings). */
  from?: string;
  to?:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  // Prisma Decimal
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

function emptyBySource(): Record<string, CobroCodeMetrics> {
  return Object.fromEntries(
    COBRO_CODES.map(c => [c, { amount: 0, count: 0 }])
  );
}

/** Safe accessor — returns zero metrics for any code not in the active set. */
function getMetrics(bySource: Record<string, CobroCodeMetrics>, code: string): CobroCodeMetrics {
  return bySource[code] ?? { amount: 0, count: 0 };
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Returns cobros KPIs from CollectionRecord for the given org and date range.
 *
 * @param organizationId  Org to query (multi-tenant safe).
 * @param opts.from       Start date (inclusive). Omit for all-time.
 * @param opts.to         End date (inclusive). Omit for all-time.
 * @param opts.codes      Subset of cobro codes. Defaults to all 8.
 */
export async function getCobrosKpis(
  organizationId: string,
  opts: {
    from?:  Date;
    to?:    Date;
    codes?: CobroCode[];
  } = {},
): Promise<CobrosKpis> {
  const { from, to, codes = [...COBRO_CODES] } = opts;

  // Build date filter for collectionDate
  const dateFilter: Record<string, unknown> =
    from || to
      ? {
          collectionDate: {
            ...(from ? { gte: from } : {}),
            ...(to   ? { lte: to   } : {}),
          },
        }
      : {};

  // ── Query CollectionRecord grouped by comprobanteCode ──────────────────────
  type AggRow = {
    comprobanteCode: string;
    _sum:  { amount: { toNumber(): number } | null };
    _count: number;
  };

  const rows: AggRow[] = await (prisma as any).collectionRecord.groupBy({
    by:    ["comprobanteCode"],
    where: {
      organizationId,
      comprobanteCode: { in: codes as string[] },
      ...dateFilter,
    },
    _sum:   { amount: true },
    _count: true,
  });

  const hasRealAmounts = rows.length > 0;

  // Build bySource map
  const bySource = emptyBySource();
  let totalAmount = 0;
  let totalCount  = 0;

  for (const row of rows) {
    const code = row.comprobanteCode as CobroCode;
    if (!COBRO_CODES.includes(code)) continue;

    // Amounts from SAG v_pagosnew are already absolute (Math.abs applied in mapper).
    // We apply Math.abs again here as a safety net for any legacy rows.
    const amount = Math.abs(toNum(row._sum?.amount));
    const count  = toNum(row._count);

    bySource[code] = { amount, count };
    totalAmount   += amount;
    totalCount    += count;
  }

  return {
    totalAmount,
    count:          totalCount,
    bySource,
    hasRealAmounts,
    from: from?.toISOString(),
    to:   to?.toISOString(),
  };
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Returns cobros grouped by business segment for dashboard display.
 *
 * Segments:
 *   empresa        — R1 + R2 (Recibos Caja Empresa — formal + remisiones)
 *   almacenes      — RS + RC + RG + RA (POS recaudos)
 *   retailFinanciero — SI + AN (Sistecredit / ADDI)
 */
export interface CobrosSegments {
  empresa:          { r1: CobroCodeMetrics; r2: CobroCodeMetrics; total: number; count: number };
  almacenes:        CobroCodeMetrics;
  retailFinanciero: CobroCodeMetrics;
  grandTotal:       number;
  grandCount:       number;
  hasRealAmounts:   boolean;
}

export async function getCobrosSegments(
  organizationId: string,
  opts: { from?: Date; to?: Date } = {},
): Promise<CobrosSegments> {
  const kpis = await getCobrosKpis(organizationId, opts);
  const b    = kpis.bySource;

  const r1 = getMetrics(b, "R1");
  const r2 = getMetrics(b, "R2");
  const empresa = {
    r1,
    r2,
    total: r1.amount + r2.amount,
    count: r1.count  + r2.count,
  };

  const almacenes = {
    amount: getMetrics(b, "RS").amount + getMetrics(b, "RC").amount + getMetrics(b, "RG").amount + getMetrics(b, "RA").amount,
    count:  getMetrics(b, "RS").count  + getMetrics(b, "RC").count  + getMetrics(b, "RG").count  + getMetrics(b, "RA").count,
  };

  // SI removed from retailFinanciero — marked EXCLUIR TOTALMENTE in FUENTES.xlsx.
  // Retail financiero = AN (Anticipos Sistecredit) only.
  const retailFinanciero = {
    amount: getMetrics(b, "AN").amount,
    count:  getMetrics(b, "AN").count,
  };

  return {
    empresa,
    almacenes,
    retailFinanciero,
    grandTotal: kpis.totalAmount,
    grandCount: kpis.count,
    hasRealAmounts: kpis.hasRealAmounts,
  };
}

// ── Edge-case guards (exported for callers) ────────────────────────────────────

/**
 * True when the amount for a given code is a real value (not a structural zero).
 * Use to decide whether to show the amount or "monto pendiente detalle SAG".
 */
export function hasRealAmount(metric: CobroCodeMetrics): boolean {
  return metric.count > 0 && metric.amount > 0;
}

/**
 * Display helper: returns formatted COP amount or the pending-detail placeholder.
 * Import fmtCOP from wherever your formatting utils live.
 */
export function cobroAmountDisplay(
  metric: CobroCodeMetrics,
  fmtCOP: (n: number) => string,
): string {
  if (!hasRealAmount(metric)) return "monto pendiente detalle SAG";
  return fmtCOP(metric.amount);
}
