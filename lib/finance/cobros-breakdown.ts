/**
 * lib/finance/cobros-breakdown.ts
 *
 * Cobros breakdown by SAG source code (k_sc_codigo_fuente / comprobanteCode).
 *
 * Validated mapping (Castillitos management, Apr 2026):
 *   R1  → Cobros empresa F1 (pagos para facturación oficial)
 *   R2  → Cobros empresa F2/remisiones
 *   RS, RC, RG, RA → Recaudos POS almacenes (retail operativo)
 *   SI, AN          → Cartera retail financiero (Addi / Sistecredit)
 *   CP, B1, B2, H1, H2 → Consignaciones PENDIENTES — dinero recibido sin identificar;
 *                         NO es cobro final, debe gestionarse por separado.
 *
 * All cobros live in SaleRecord (imported via SAG sync).
 * comprobanteCode = raw SAG source code stored on each SaleRecord row.
 */

import { prisma }        from "@/lib/prisma";
import type { FiscalWindow } from "@/lib/finance/fiscal-window";
import {
  CODIGOS_COBROS_EMPRESA,
  CODIGOS_COBROS_ALMACEN_ACTIVOS,
  CODIGOS_RETAIL_FINANCIERO,
} from "@/lib/sag/master-data/source-semantic-rules";
import {
  PENDING_DEPOSIT_SOURCES,
  isCollectionSource,
} from "@/lib/financial/source-registry";

// Filter CODIGOS_RETAIL_FINANCIERO through the financial registry.
// SI (ka_ni=111) is in NA_ELIMINATED_CODES — EXCLUIR TOTALMENTE per FUENTES.xlsx.
// This leaves only AN (Anticipos Sistecredit), which is the correct retail financiero source.
const RETAIL_FINANCIERO_ACTIVE: readonly string[] =
  CODIGOS_RETAIL_FINANCIERO.filter(isCollectionSource);

// ── Result type ───────────────────────────────────────────────────────────────

export interface CobrosBreakdown {
  /** R1 + R2: cobros empresa conciliados */
  empresa: {
    r1: { amount: number; count: number };
    r2: { amount: number; count: number };
    total: number;
    count: number;
  };
  /** RS, RC, RG, RA: recaudos POS almacenes */
  almacenes: {
    amount: number;
    count: number;
  };
  /** SI, AN: Addi / Sistecredit */
  retailFinanciero: {
    amount: number;
    count: number;
  };
  /** CP, B1, B2, H1, H2: consignaciones pendientes de identificar */
  consignacionesPendientes: {
    amount: number;
    count: number;
  };
  /** Grand total of true cobros (empresa + almacenes + retailFinanciero). CP excluded. */
  totalCobros: number;
  totalCobrosCount: number;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

type AggRow = { comprobanteCode: string | null; _sum: { amount: { toNumber(): number } | null }; _count: number };

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Returns a breakdown of cobros by SAG source type for an org.
 *
 * @param organizationId  Org to query.
 * @param window          Optional fiscal window; when provided, filters by saleDate.
 */
export async function getCobrosBreakdown(
  organizationId: string,
  window?: FiscalWindow,
): Promise<CobrosBreakdown> {
  const allCodes = [
    ...CODIGOS_COBROS_EMPRESA,
    ...CODIGOS_COBROS_ALMACEN_ACTIVOS,
    ...RETAIL_FINANCIERO_ACTIVE,
    ...PENDING_DEPOSIT_SOURCES,
  ] as string[];

  const dateFilter = window && window.mode !== "full_history"
    ? { gte: window.from, lte: window.to }
    : undefined;

  const rows = await (prisma as any).saleRecord.groupBy({
    by: ["comprobanteCode"],
    where: {
      organizationId,
      comprobanteCode: { in: allCodes },
      ...(dateFilter ? { saleDate: dateFilter } : {}),
    },
    _sum:   { amount: true },
    _count: true,
  }) as AggRow[];

  // Build a lookup map.
  // SAG stores ALL cobro/recibo amounts with signo = -1 (they reduce CxC balance),
  // so raw SaleRecord.amount values are negative.  We take Math.abs so every cobro
  // bucket displays the economic amount received (always positive).
  // Codes that have no amount in the SOAP response (R1, R2, RS, RC, RG, RA, SI, CP)
  // arrive as 0 — that is a sync/mapper data gap, not a sign issue.
  const byCode = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const code = r.comprobanteCode ?? "__unknown__";
    const amount = r._sum?.amount != null ? Math.abs(r._sum.amount.toNumber()) : 0;
    byCode.set(code, { amount: toNum(amount), count: toNum(r._count) });
  }

  function sum(codes: readonly string[]) {
    return codes.reduce(
      (acc, c) => {
        const row = byCode.get(c);
        return { amount: acc.amount + (row?.amount ?? 0), count: acc.count + (row?.count ?? 0) };
      },
      { amount: 0, count: 0 },
    );
  }

  const r1 = byCode.get("R1") ?? { amount: 0, count: 0 };
  const r2 = byCode.get("R2") ?? { amount: 0, count: 0 };
  const almacenes          = sum(CODIGOS_COBROS_ALMACEN_ACTIVOS);
  const retailFinanciero   = sum(RETAIL_FINANCIERO_ACTIVE);
  const consignaciones     = sum([...PENDING_DEPOSIT_SOURCES]);

  const empresaTotal = r1.amount + r2.amount;
  const empresaCount = r1.count  + r2.count;

  return {
    empresa: {
      r1,
      r2,
      total: empresaTotal,
      count: empresaCount,
    },
    almacenes,
    retailFinanciero,
    consignacionesPendientes: consignaciones,
    totalCobros:      empresaTotal + almacenes.amount + retailFinanciero.amount,
    totalCobrosCount: empresaCount + almacenes.count  + retailFinanciero.count,
  };
}
