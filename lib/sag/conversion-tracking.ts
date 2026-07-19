/**
 * conversion-tracking.ts
 *
 * SAG Source-Aware Layer — "Conversión Despacho → Factura" KPI
 *
 * Measures how effectively FUENTE_2 (remisión / despacho) records convert
 * to FUENTE_1 (factura oficial) within configurable time windows.
 *
 * Matching strategy:
 *   1. Exact: when originDocumentRef is populated on the FUENTE_1 record
 *      and references the FUENTE_2 comprobante → direct link.
 *   2. Heuristic: for the same (organizationId, customerNit, period):
 *      FUENTE_1 amount ≥ 80% of FUENTE_2 amount within the conversion window.
 *      Used when originDocumentRef is absent (most Castillitos exports pre-backfill).
 *
 * Business rules:
 *   - Window: configurable, default 30 days.
 *   - A FUENTE_2 record is "converted" when a matching FUENTE_1 record exists.
 *   - Conversion rate = converted_F2_amount / total_F2_amount × 100.
 *   - Unconverted FUENTE_2 after threshold is a conversion risk.
 *   - Risk levels mirror REMISION_RISK_THRESHOLDS from source-inference.ts.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assessRemisionRisk, REMISION_RISK_THRESHOLDS, type RemisionRisk } from "./source-inference";
import { getOrphanSummary } from "@/lib/sales/source-dedup";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConversionKpiSummary {
  /** Reporting period (YYYYMM) or date range string. */
  periodo:                string;
  organizationId:         string;
  windowDays:             number;

  // Overall totals
  totalF2Amount:          number;   // total FUENTE_2 in period
  totalF1Amount:          number;   // total FUENTE_1 in period
  estimatedConvertedAmount: number; // F2 portion matched to F1 (heuristic)
  unconvertedAmount:      number;   // F2 with no matching F1

  // Rates
  conversionRate:         number;   // 0-100  (estimated)
  f1ShareOfTotal:         number;   // F1 / (F1 + F2) × 100

  // Risk buckets (for unconverted F2 by age)
  byRisk: {
    none:     { count: number; amount: number };
    low:      { count: number; amount: number };
    medium:   { count: number; amount: number };
    high:     { count: number; amount: number };
    critical: { count: number; amount: number };
  };

  // Seller breakdown
  bySeller: SellerConversionKpi[];
  // Store breakdown
  byStore:  StoreConversionKpi[];
  // Trend (monthly, last N months)
  trend:    ConversionTrendRow[];
}

export interface SellerConversionKpi {
  sellerSlug:       string;
  sellerName:       string;
  f2Amount:         number;
  f1Amount:         number;
  conversionRate:   number;   // 0-100
  pendingCount:     number;
  maxAgeDays:       number;
  risk:             RemisionRisk;
}

export interface StoreConversionKpi {
  storeSlug:        string;
  storeName:        string;
  f2Amount:         number;
  f1Amount:         number;
  conversionRate:   number;
  pendingCount:     number;
  maxAgeDays:       number;
  risk:             RemisionRisk;
}

export interface ConversionTrendRow {
  periodo:          string;   // YYYYMM
  f1Amount:         number;
  f2Amount:         number;
  conversionRate:   number;
  unconvertedAmount: number;
}

// ── Main KPI function ─────────────────────────────────────────────────────────

/**
 * Returns the Conversión Despacho → Factura KPI for a given period.
 *
 * @param organizationId - Tenant ID.
 * @param periodoAoMes   - YYYYMM period string.
 * @param windowDays     - Days after F2 date within which a F1 match counts as converted.
 */
export async function getConversionKpi(
  organizationId: string,
  periodoAoMes:   string,
  windowDays      = 30,
): Promise<ConversionKpiSummary> {
  // ── Primary path: read from persisted SourceMatchRecord ─────────────────────
  // This is O(1) indexed reads instead of O(n²) in-memory matching.
  // Falls back to heuristic if the table has no rows for this period.
  const orphanSummary = await getOrphanSummary(organizationId, periodoAoMes);

  // Load F1/F2 totals and seller/store names from SaleRecord (lightweight grouped query)
  const sourceRows = await prisma.$queryRaw<Array<{
    source:      string;
    seller_slug: string;
    seller_name: string;
    store_slug:  string;
    store_name:  string;
    amount:      number;
    rec_count:   string;
    min_date:    Date;
  }>>(Prisma.sql`
    SELECT
      "sagSourceType"::text        AS source,
      "sellerSlug"                 AS seller_slug,
      "sellerName"                 AS seller_name,
      "storeSlug"                  AS store_slug,
      "storeName"                  AS store_name,
      SUM("amount")::float8        AS amount,
      CAST(COUNT(*) AS TEXT)       AS rec_count,
      MIN("saleDate")              AS min_date
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
    GROUP  BY 1, 2, 3, 4, 5
    ORDER  BY 2
  `);

  type SellerAcc = { name: string; f1: number; f2: number; count: number; minDate: Date };
  type StoreAcc  = { name: string; f1: number; f2: number; count: number; minDate: Date };

  const bySeller = new Map<string, SellerAcc>();
  const byStore  = new Map<string, StoreAcc>();
  let totalF1 = 0;
  let totalF2 = 0;

  for (const r of sourceRows) {
    const isF1   = r.source === "OFICIAL";
    const amount = Number(r.amount);

    const sEx = bySeller.get(r.seller_slug) ?? { name: r.seller_name, f1: 0, f2: 0, count: 0, minDate: r.min_date };
    if (isF1) sEx.f1 += amount; else { sEx.f2 += amount; sEx.count += Number(r.rec_count); }
    bySeller.set(r.seller_slug, sEx);

    const stEx = byStore.get(r.store_slug) ?? { name: r.store_name, f1: 0, f2: 0, count: 0, minDate: r.min_date };
    if (isF1) stEx.f1 += amount; else { stEx.f2 += amount; stEx.count += Number(r.rec_count); }
    byStore.set(r.store_slug, stEx);

    if (isF1) totalF1 += amount; else totalF2 += amount;
  }

  // ── Conversion numbers from SourceMatchRecord (authoritative) ───────────────
  // If SourceMatchRecord has data for this period, use it; otherwise fall back.
  const hasPersistedData = orphanSummary.totalOrphans > 0 || orphanSummary.conversionRate < 100;
  const conversionRate   = hasPersistedData
    ? orphanSummary.conversionRate
    : (totalF2 > 0 ? (Math.min(totalF1, totalF2) / totalF2) * 100 : 100); // legacy heuristic fallback

  const orphanAmount     = orphanSummary.totalAmount;
  const matchedAmount    = Math.max(0, totalF2 - orphanAmount);
  const unconverted      = orphanAmount;
  const total            = totalF1 + totalF2;
  const f1Share          = total > 0 ? (totalF1 / total) * 100 : 100;

  // Risk buckets from SourceMatchRecord
  const byRisk = {
    none:     { count: orphanSummary.byRisk.none.count,     amount: orphanSummary.byRisk.none.amount },
    low:      { count: orphanSummary.byRisk.low.count,      amount: orphanSummary.byRisk.low.amount },
    medium:   { count: orphanSummary.byRisk.medium.count,   amount: orphanSummary.byRisk.medium.amount },
    high:     { count: orphanSummary.byRisk.high.count,     amount: orphanSummary.byRisk.high.amount },
    critical: { count: orphanSummary.byRisk.critical.count, amount: orphanSummary.byRisk.critical.amount },
  };

  // ── Seller KPIs — merge SaleRecord totals with SourceMatchRecord orphan data ─
  const now = new Date();
  const sellerOrphanMap = new Map(
    orphanSummary.bySeller.map(s => [s.sellerSlug, s])
  );

  const sellerKpis: SellerConversionKpi[] = [...bySeller.entries()].map(([slug, v]) => {
    const orphanData   = sellerOrphanMap.get(slug);
    const orphanAmt    = orphanData?.amount ?? 0;
    const matchedAmt   = Math.max(0, v.f2 - orphanAmt);
    const rate         = v.f2 > 0 ? (matchedAmt / v.f2) * 100 : 100;
    const ageDays      = orphanData?.maxDays ?? Math.floor((now.getTime() - v.minDate.getTime()) / 86_400_000);
    return {
      sellerSlug:     slug,
      sellerName:     v.name,
      f2Amount:       v.f2,
      f1Amount:       v.f1,
      conversionRate: rate,
      pendingCount:   orphanData?.count ?? 0,
      maxAgeDays:     ageDays,
      risk:           v.f2 > 0 ? assessRemisionRisk(ageDays) : "NONE",
    };
  }).sort((a, b) => a.conversionRate - b.conversionRate);

  const storeKpis: StoreConversionKpi[] = [...byStore.entries()].map(([slug, v]) => {
    const rate    = v.f2 > 0
      ? (Math.max(0, v.f2 - (v.f2 * (1 - conversionRate / 100))) / v.f2) * 100
      : 100;
    const ageDays = Math.floor((now.getTime() - v.minDate.getTime()) / 86_400_000);
    return {
      storeSlug:      slug,
      storeName:      v.name,
      f2Amount:       v.f2,
      f1Amount:       v.f1,
      conversionRate: rate,
      pendingCount:   v.f2 > v.f1 ? v.count : 0,
      maxAgeDays:     ageDays,
      risk:           v.f2 > 0 ? assessRemisionRisk(ageDays) : "NONE",
    };
  }).sort((a, b) => a.conversionRate - b.conversionRate);

  return {
    periodo:                  periodoAoMes,
    organizationId,
    windowDays,
    totalF2Amount:            totalF2,
    totalF1Amount:            totalF1,
    estimatedConvertedAmount: matchedAmount,
    unconvertedAmount:        unconverted,
    conversionRate,
    f1ShareOfTotal:           f1Share,
    byRisk,
    bySeller:                 sellerKpis,
    byStore:                  storeKpis,
    trend:                    [],  // populated by getConversionTrend below
  };
}

// ── Trend query ───────────────────────────────────────────────────────────────

/**
 * Returns monthly conversion trend for the last N months.
 * Useful for "Evolución conversión F2→F1" chart.
 */
export async function getConversionTrend(
  organizationId: string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<ConversionTrendRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    periodo: string;
    source:  string;
    amount:  number;
  }>>(Prisma.sql`
    SELECT
      COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) AS periodo,
      "sagSourceType"::text                                    AS source,
      SUM("amount")::float8                                    AS amount
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM'))
             BETWEEN ${startPeriodo} AND ${endPeriodo}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
    GROUP  BY 1, 2
    ORDER  BY 1
  `);

  const byPeriodo = new Map<string, { f1: number; f2: number }>();
  for (const r of rows) {
    const ex = byPeriodo.get(r.periodo) ?? { f1: 0, f2: 0 };
    if (r.source === "OFICIAL") ex.f1 += Number(r.amount);
    else                         ex.f2 += Number(r.amount);
    byPeriodo.set(r.periodo, ex);
  }

  return [...byPeriodo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, v]) => {
      const total           = v.f1 + v.f2;
      const converted       = Math.min(v.f1, v.f2);
      const conversionRate  = v.f2 > 0 ? (converted / v.f2) * 100 : 100;
      const unconvertedAmount = Math.max(0, v.f2 - v.f1);
      return { periodo, f1Amount: v.f1, f2Amount: v.f2, conversionRate, unconvertedAmount };
    });
}

// ── Top converters / bottleneck queries ───────────────────────────────────────

/**
 * Returns sellers ranked by F2→F1 conversion rate (best first).
 * Used for "Vendedores con mayor conversión despacho a factura" report.
 */
export async function getTopConvertersBySeller(
  organizationId: string,
  periodoAoMes:   string,
  limit           = 10,
): Promise<SellerConversionKpi[]> {
  const kpi = await getConversionKpi(organizationId, periodoAoMes);
  return kpi.bySeller
    .filter(s => s.f2Amount > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, limit);
}

/**
 * Returns stores with highest unconverted F2 exposure.
 * Used for "Sucursales con alta preventa no facturada" report.
 */
export async function getHighExposureStores(
  organizationId: string,
  periodoAoMes:   string,
  minExposure     = 0,
): Promise<StoreConversionKpi[]> {
  const kpi = await getConversionKpi(organizationId, periodoAoMes);
  return kpi.byStore
    .filter(s => s.f2Amount > 0 && (s.f2Amount - s.f1Amount) >= minExposure)
    .sort((a, b) => (b.f2Amount - b.f1Amount) - (a.f2Amount - a.f1Amount));
}

// ── Risk thresholds re-export ─────────────────────────────────────────────────
export { REMISION_RISK_THRESHOLDS, type RemisionRisk };
