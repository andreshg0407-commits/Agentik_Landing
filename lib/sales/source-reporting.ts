/**
 * source-reporting.ts
 *
 * SAG Source-Aware Layer — Unified Reporting Contracts (Sprint 4A)
 *
 * Single entry-point for all source-aware KPI queries consumed by UI pages.
 * All functions read from SourceMatchRecord (persisted dedup results) rather
 * than re-computing on every request.
 *
 * Consumers:
 *   - executive/page.tsx      → getSourceSplitKpis (Torre de Control)
 *   - sales/page.tsx          → getSourceAwareDashboardKpis
 *   - customer-360/           → getCustomerSourceKpis (Section 5b)
 *   - sales/vendors/[slug]/   → getSellerSourceKpis
 *   - reconciliation/page.tsx → getOrphanSummary (re-exported)
 *
 * Architecture:
 *   Reports here call getOrphanSummary() from source-dedup.ts and combine
 *   with SaleRecord aggregations for F1 totals. This gives a single,
 *   consistent conversionRate across all modules for the same period.
 */

import { prisma } from "@/lib/prisma";
import { Prisma }  from "@prisma/client";
import { type TruthModule, MODULE_SQL_CONDITION } from "./source-rules";
import { getOrphanSummary, type OrphanSummary } from "./source-dedup";

// Re-export OrphanSummary for consumers that only need the orphan view
export type { OrphanSummary };
export { getOrphanSummary };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SourceSplitKpis {
  /** Total FUENTE_1 (recognized revenue). */
  f1Amount:        number;
  /** Total FUENTE_2 (operational demand / remisiones). */
  f2Amount:        number;
  /** Total F1 + F2. */
  totalAmount:     number;
  /** F1 as % of total. */
  f1SharePct:      number;
  /** F2 as % of total. */
  f2SharePct:      number;
  /**
   * Real conversion rate from SourceMatchRecord: matched F2 / total F2 × 100.
   * This is the authoritative number — consistent across all modules.
   */
  conversionRate:  number;
  /** F2 amount that has NOT been matched to any F1 (real orphans). */
  orphanAmount:    number;
  /** Count of real orphan F2 records. */
  orphanCount:     number;
  /** Percentage of legacy-assumed-FUENTE_1 rows (data quality indicator). */
  legacyAssumedPct: number;
  /** True when there is sales data for this period. */
  hasData:         boolean;
}

export interface SellerSourceKpis {
  sellerSlug:     string;
  sellerName:     string;
  f1Amount:       number;
  f2Amount:       number;
  orphanAmount:   number;
  orphanCount:    number;
  conversionRate: number;
  maxOrphanDays:  number;
  risk:           string;
}

export interface CustomerSourceKpis {
  customerNit:     string | null;
  f1Amount:        number;
  f2Amount:        number;
  orphanAmount:    number;
  orphanCount:     number;
  conversionRate:  number;
  remisionPendingCount: number;
  hasSourceData:   boolean;
}

// ── Source split KPIs (for Torre de Control / executive page) ─────────────────

/**
 * Returns source split KPIs for a period.
 * conversionRate is read from SourceMatchRecord — the authoritative number.
 *
 * @param organizationId
 * @param periodoAoMes  YYYYMM
 */
export async function getSourceSplitKpis(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SourceSplitKpis> {
  const [sourceRows, orphanSummary, legacyRows] = await Promise.all([
    // F1 and F2 totals from SaleRecord
    prisma.$queryRaw<Array<{ source: string; amount: number }>>(Prisma.sql`
      SELECT
        "sagSourceType"::text  AS source,
        SUM("amount")::float8  AS amount
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
        AND "productLine" NOT ILIKE 'Total %'
        AND "productLine" NOT ILIKE 'Subtotal%'
      GROUP BY 1
    `),
    // Authoritative orphan data from SourceMatchRecord
    getOrphanSummary(organizationId, periodoAoMes),
    // Legacy-assumed rows (data quality)
    prisma.$queryRaw<Array<{ cnt: string }>>(Prisma.sql`
      SELECT CAST(COUNT(*) AS TEXT) AS cnt
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
        AND "sourceInferredFrom" = 'legacy'
    `),
  ]);

  const f1Amount  = sourceRows.find(r => r.source === "OFICIAL")?.amount  ?? 0;
  const f2Amount  = sourceRows.find(r => r.source === "REMISION")?.amount ?? 0;
  const total     = f1Amount + f2Amount;
  const legacy    = Number(legacyRows[0]?.cnt ?? 0);
  const totalCount = await prisma.saleRecord.count({
    where: { organizationId, periodoAoMes },
  });

  return {
    f1Amount,
    f2Amount,
    totalAmount:      total,
    f1SharePct:       total > 0 ? (f1Amount / total) * 100 : 100,
    f2SharePct:       total > 0 ? (f2Amount / total) * 100 : 0,
    conversionRate:   orphanSummary.conversionRate,
    orphanAmount:     orphanSummary.totalAmount,
    orphanCount:      orphanSummary.totalOrphans,
    legacyAssumedPct: totalCount > 0 ? (legacy / totalCount) * 100 : 0,
    hasData:          total > 0,
  };
}

// ── Seller source KPIs (for vendor detail + SourceSplitSection) ───────────────

/**
 * Returns per-seller source KPIs for a period.
 * Uses SourceMatchRecord for orphan data, SaleRecord for F1/F2 totals.
 */
export async function getSellerSourceKpis(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SellerSourceKpis[]> {
  const [sellerRows, orphanSummary] = await Promise.all([
    prisma.$queryRaw<Array<{
      seller_slug: string;
      seller_name: string;
      source:      string;
      amount:      number;
    }>>(Prisma.sql`
      SELECT
        "sellerSlug"          AS seller_slug,
        MAX("sellerName")     AS seller_name,
        "sagSourceType"::text AS source,
        SUM("amount")::float8 AS amount
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
        AND "productLine" NOT ILIKE 'Total %'
        AND "productLine" NOT ILIKE 'Subtotal%'
      GROUP BY 1, 3
      ORDER BY 1
    `),
    getOrphanSummary(organizationId, periodoAoMes),
  ]);

  // Build F1/F2 totals per seller
  type Acc = { name: string; f1: number; f2: number };
  const map = new Map<string, Acc>();
  for (const r of sellerRows) {
    const ex = map.get(r.seller_slug) ?? { name: r.seller_name, f1: 0, f2: 0 };
    if (r.source === "OFICIAL") ex.f1 += r.amount;
    else                         ex.f2 += r.amount;
    map.set(r.seller_slug, ex);
  }

  const orphanBySellerMap = new Map(
    orphanSummary.bySeller.map(s => [s.sellerSlug, s])
  );

  return [...map.entries()].map(([slug, v]) => {
    const o            = orphanBySellerMap.get(slug);
    const orphanAmount = o?.amount  ?? 0;
    const orphanCount  = o?.count   ?? 0;
    const maxDays      = o?.maxDays ?? 0;
    const matchedAmt   = Math.max(0, v.f2 - orphanAmount);
    const rate         = v.f2 > 0 ? (matchedAmt / v.f2) * 100 : 100;
    return {
      sellerSlug:     slug,
      sellerName:     v.name,
      f1Amount:       v.f1,
      f2Amount:       v.f2,
      orphanAmount,
      orphanCount,
      conversionRate: rate,
      maxOrphanDays:  maxDays,
      risk:           o?.risk ?? "NONE",
    };
  }).sort((a, b) => a.conversionRate - b.conversionRate);
}

// ── Customer source KPIs (for Customer 360 Section 5b) ────────────────────────

/**
 * Returns source split KPIs for a specific customer NIT.
 * conversionRate reads from SourceMatchRecord for accuracy.
 *
 * @param customerNit  The customer's NIT (can be null — returns empty if so)
 * @param periodoAoMes  Optional period filter. Defaults to last 12 months.
 */
export async function getCustomerSourceKpis(
  organizationId: string,
  customerNit:    string | null,
  periodoAoMes?:  string,
): Promise<CustomerSourceKpis> {
  const empty: CustomerSourceKpis = {
    customerNit,
    f1Amount:            0,
    f2Amount:            0,
    orphanAmount:        0,
    orphanCount:         0,
    conversionRate:      100,
    remisionPendingCount: 0,
    hasSourceData:       false,
  };

  if (!customerNit) return empty;

  // Get F1/F2 totals for this customer
  const periodFilter = periodoAoMes
    ? Prisma.sql`AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}`
    : Prisma.sql`AND "saleDate" >= ${new Date(Date.now() - 365 * 86_400_000)}`;

  const [sourceRows, orphanRows] = await Promise.all([
    prisma.$queryRaw<Array<{ source: string; amount: number; cnt: string }>>(Prisma.sql`
      SELECT
        "sagSourceType"::text  AS source,
        SUM("amount")::float8  AS amount,
        CAST(COUNT(*) AS TEXT) AS cnt
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "customerNit"     = ${customerNit}
        ${periodFilter}
        AND "productLine" NOT ILIKE 'Total %'
        AND "productLine" NOT ILIKE 'Subtotal%'
      GROUP BY 1
    `),
    // Orphans for this customer from SourceMatchRecord
    (prisma as any).sourceMatchRecord.findMany({
      where: {
        organizationId,
        customerNit,
        isOrphan: true,
        ...(periodoAoMes ? { periodoAoMes } : {}),
      },
      select: { f2Amount: true },
    }) as Promise<Array<{ f2Amount: number }>>,
  ]);

  const f1Amount = sourceRows.find(r => r.source === "OFICIAL")?.amount  ?? 0;
  const f2Amount = sourceRows.find(r => r.source === "REMISION")?.amount ?? 0;
  const f2Count  = Number(sourceRows.find(r => r.source === "REMISION")?.cnt ?? 0);
  const total    = f1Amount + f2Amount;

  const orphanAmount = orphanRows.reduce((s: number, r: { f2Amount: number }) => s + r.f2Amount, 0);
  const orphanCount  = orphanRows.length;
  const matchedAmt   = Math.max(0, f2Amount - orphanAmount);
  const convRate     = f2Amount > 0 ? (matchedAmt / f2Amount) * 100 : 100;

  return {
    customerNit,
    f1Amount,
    f2Amount,
    orphanAmount,
    orphanCount,
    conversionRate:       convRate,
    remisionPendingCount: orphanCount,
    hasSourceData:        total > 0,
  };
}

// ── Store source KPIs (for SourceSplitSection in /sales) ─────────────────────

export interface StoreSourceKpis {
  storeSlug:      string;
  storeName:      string;
  f1Amount:       number;
  f2Amount:       number;
  orphanAmount:   number;
  f2SharePct:     number;
  conversionRate: number;
}

export async function getStoreSourceKpis(
  organizationId: string,
  periodoAoMes:   string,
): Promise<StoreSourceKpis[]> {
  const storeRows = await prisma.$queryRaw<Array<{
    store_slug: string;
    store_name: string;
    source:     string;
    amount:     number;
  }>>(Prisma.sql`
    SELECT
      "storeSlug"           AS store_slug,
      MAX("storeName")      AS store_name,
      "sagSourceType"::text AS source,
      SUM("amount")::float8 AS amount
    FROM "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    GROUP BY 1, 3
    ORDER BY 1
  `);

  // Orphan amounts per store from SourceMatchRecord
  const orphanRows = await (prisma as any).sourceMatchRecord.groupBy({
    by:    ["storeSlug"],
    where: { organizationId, periodoAoMes, isOrphan: true },
    _sum:  { f2Amount: true },
    _count: true,
  }) as Array<{ storeSlug: string; _sum: { f2Amount: number }; _count: number }>;
  const orphanByStore = new Map(orphanRows.map(r => [r.storeSlug, r._sum.f2Amount ?? 0]));

  type Acc = { name: string; f1: number; f2: number };
  const map = new Map<string, Acc>();
  for (const r of storeRows) {
    const ex = map.get(r.store_slug) ?? { name: r.store_name, f1: 0, f2: 0 };
    if (r.source === "OFICIAL") ex.f1 += r.amount;
    else                         ex.f2 += r.amount;
    map.set(r.store_slug, ex);
  }

  return [...map.entries()].map(([slug, v]) => {
    const orphanAmt  = orphanByStore.get(slug) ?? 0;
    const total      = v.f1 + v.f2;
    const matched    = Math.max(0, v.f2 - orphanAmt);
    const convRate   = v.f2 > 0 ? (matched / v.f2) * 100 : 100;
    return {
      storeSlug:      slug,
      storeName:      v.name,
      f1Amount:       v.f1,
      f2Amount:       v.f2,
      orphanAmount:   orphanAmt,
      f2SharePct:     total > 0 ? (v.f2 / total) * 100 : 0,
      conversionRate: convRate,
    };
  }).sort((a, b) => b.f2Amount - a.f2Amount);
}
