/**
 * lib/comercial/tiendas/store-intelligence-history-service.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-HISTORY-BENCHMARK-01 — Capa SQL.
 *
 * Fuente ÚNICA: SaleRecord (SAG FACTURAS, misma fuente certificada de
 * store-sales-service). Cero fuentes nuevas de verdad.
 *
 * PERFORMANCE — conteo de queries CONSTANTE (cero N+1):
 *   Q1  serie completa de la tienda: month × code, SIN límites de año
 *       (una query cubre todos los años disponibles).
 *   Q2  red completa del período actual: month × code para TODOS los códigos
 *       de tienda en UNA query (la atribución código→tienda ocurre en la
 *       ley pura — jamás una query por tienda).
 *   Q3  same-cut del año anterior para la tienda (rango de DÍA exacto).
 *   Q4  freshness: MIN/MAX(saleDate) tienda y red con FILTER, una query.
 *   → 4 queries totales, independiente de años × tiendas.
 *
 * Toda query filtra por organizationId (aislamiento multi-tenant).
 * Cero años hardcodeados: todo deriva de asOfDate (parámetro o hoy).
 * Viewport-agnostic: cero isMobile/breakpoints aquí.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  CANONICAL_SALES_STORES,
  getCodesForStore,
} from "@/lib/comercial/sales-canonical-source";
import { assembleStoreSales } from "./store-sales-assembly";
import {
  buildHistoricalSeries,
  buildNetworkBenchmark,
  buildCertifiedFreshness,
  sumNetByFamily,
  sameCutPreviousYear,
  type CertifiedHistoricalSeries,
  type CertifiedNetworkBenchmark,
  type CertifiedFreshness,
  type RawCodeAggRow,
  type BenchmarkStoreInput,
} from "./store-intelligence-history-assembly";

// ── Bundle contract ──────────────────────────────────────────────────────────

export interface IntelligenceHistoryPerformance {
  queryCount: number;
  dbCumulativeMs: number;
  dbWallClockMs: number;
  computeMs: number;
  totalMs: number;
}

export interface IntelligenceHistoryBundle {
  historicalSeries: CertifiedHistoricalSeries;
  networkBenchmark: CertifiedNetworkBenchmark;
  freshness: CertifiedFreshness;
  performance: IntelligenceHistoryPerformance;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface MonthCodeRow { month: string; code: string; docCount: number; amount: number }

function mapMonthCodeRows(raw: unknown): MonthCodeRow[] {
  return (raw as any[]).map(r => ({
    month: r.month ? (r.month as Date).toISOString().slice(0, 7) : "????-??",
    code: r.code ?? "",
    docCount: r.doc_count ?? 0,
    amount: r.amount ?? 0,
  }));
}

function allNetworkCodes(): string[] {
  return CANONICAL_SALES_STORES.flatMap(s => getCodesForStore(s.storeId));
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Main entry ───────────────────────────────────────────────────────────────

export async function loadIntelligenceHistoryBundle(
  orgId: string,
  storeId: string,
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Promise<IntelligenceHistoryBundle> {
  const t0 = Date.now();
  const db = prisma as any;

  const asOfYear = Number(asOfDate.slice(0, 4));
  const currentYearStart = `${asOfYear}-01-01`;
  const asOfExclusive = nextDay(asOfDate);
  const prevCutDate = sameCutPreviousYear(asOfDate);
  const prevYearStart = `${asOfYear - 1}-01-01`;
  const prevCutExclusive = nextDay(prevCutDate);

  const storeCodes = getCodesForStore(storeId);
  const networkCodes = allNetworkCodes();

  const timings: number[] = [];
  async function timed<T>(p: Promise<T>): Promise<T> {
    const s = Date.now();
    const r = await p;
    timings.push(Date.now() - s);
    return r;
  }

  const dbStart = Date.now();
  // Q1–Q4 en paralelo — conteo CONSTANTE, cero N+1
  const [q1raw, q2raw, q3raw, q4raw] = await Promise.all([
    // Q1 — serie completa de la tienda (todos los años disponibles)
    timed(db.$queryRawUnsafe(`
      SELECT DATE_TRUNC('month', s."saleDate") as month,
             s."rawJson"->>'code' as code,
             COUNT(*)::int as doc_count,
             SUM(s.amount::float)::float as amount
      FROM "SaleRecord" s
      WHERE s."organizationId" = $1
        AND s."rawJson"->>'code' = ANY($2)
      GROUP BY DATE_TRUNC('month', s."saleDate"), s."rawJson"->>'code'
      ORDER BY month ASC
    `, orgId, storeCodes)),

    // Q2 — red completa, período actual [1 ene asOfYear .. asOfDate], UNA query
    timed(db.$queryRawUnsafe(`
      SELECT DATE_TRUNC('month', s."saleDate") as month,
             s."rawJson"->>'code' as code,
             COUNT(*)::int as doc_count,
             SUM(s.amount::float)::float as amount
      FROM "SaleRecord" s
      WHERE s."organizationId" = $1
        AND s."saleDate" >= $2
        AND s."saleDate" < $3
        AND s."rawJson"->>'code' = ANY($4)
      GROUP BY DATE_TRUNC('month', s."saleDate"), s."rawJson"->>'code'
    `, orgId, currentYearStart, asOfExclusive, networkCodes)),

    // Q3 — same-cut año anterior para la tienda (corte de DÍA exacto)
    timed(db.$queryRawUnsafe(`
      SELECT s."rawJson"->>'code' as code,
             COUNT(*)::int as doc_count,
             SUM(s.amount::float)::float as amount
      FROM "SaleRecord" s
      WHERE s."organizationId" = $1
        AND s."saleDate" >= $2
        AND s."saleDate" < $3
        AND s."rawJson"->>'code' = ANY($4)
      GROUP BY s."rawJson"->>'code'
    `, orgId, prevYearStart, prevCutExclusive, storeCodes)),

    // Q4 — freshness certificada: MIN/MAX(saleDate) tienda y red, una query
    timed(db.$queryRawUnsafe(`
      SELECT MIN(s."saleDate") FILTER (WHERE s."rawJson"->>'code' = ANY($2)) as store_min,
             MAX(s."saleDate") FILTER (WHERE s."rawJson"->>'code' = ANY($2)) as store_max,
             MIN(s."saleDate") FILTER (WHERE s."rawJson"->>'code' = ANY($3)) as net_min,
             MAX(s."saleDate") FILTER (WHERE s."rawJson"->>'code' = ANY($3)) as net_max
      FROM "SaleRecord" s
      WHERE s."organizationId" = $1
    `, orgId, storeCodes, networkCodes)),
  ]);
  const dbWallClockMs = Date.now() - dbStart;

  const computeStart = Date.now();

  // ── Serie histórica ──
  const q1rows = mapMonthCodeRows(q1raw);
  const assembled = assembleStoreSales(storeId, asOfYear, q1rows);
  const monthlyAllYears = assembled?.monthly ?? [];

  const q3rows: RawCodeAggRow[] = (q3raw as any[]).map(r => ({
    code: r.code ?? "", docCount: r.doc_count ?? 0, amount: r.amount ?? 0,
  }));
  const prevSameCut = sumNetByFamily(q3rows, storeId);

  const historicalSeries = buildHistoricalSeries(
    monthlyAllYears,
    asOfDate,
    prevSameCut.hasData ? prevSameCut : { ...prevSameCut, hasData: false },
  );

  // ── Benchmark de red — atribución código→tienda en ley pura ──
  const q2rows = mapMonthCodeRows(q2raw);
  const perStoreAgg: RawCodeAggRow[] = q2rows.map(r => ({
    code: r.code, docCount: r.docCount, amount: r.amount,
  }));
  const storeInputs: BenchmarkStoreInput[] = CANONICAL_SALES_STORES.map(s => {
    const agg = sumNetByFamily(perStoreAgg, s.storeId);
    return {
      storeId: s.storeId,
      storeName: s.storeName,
      netSales: agg.netSales,
      invoiceCount: agg.invoiceCount,
    };
  });
  const networkBenchmark = buildNetworkBenchmark(storeId, storeInputs, currentYearStart, asOfDate);

  // ── Freshness (de los DATOS certificados, no del reloj) ──
  const q4 = (q4raw as any[])[0] ?? {};
  const toISO = (d: unknown): string | null =>
    d instanceof Date ? d.toISOString().slice(0, 10) : (typeof d === "string" && d ? d.slice(0, 10) : null);
  const freshness = buildCertifiedFreshness({
    storeFirstSaleDate: toISO(q4.store_min),
    networkLastSaleDate: toISO(q4.net_max),
    asOfDate,
  });

  const computeMs = Date.now() - computeStart;

  return {
    historicalSeries,
    networkBenchmark,
    freshness,
    performance: {
      queryCount: 4,
      dbCumulativeMs: timings.reduce((s, t) => s + t, 0),
      dbWallClockMs,
      computeMs,
      totalMs: Date.now() - t0,
    },
  };
}
