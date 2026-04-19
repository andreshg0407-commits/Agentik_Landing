/**
 * remision-monitor.ts
 *
 * SAG Source-Aware Layer — Sprint
 *
 * Monitors REMISION (Fuente 2) records that have not been converted to an
 * OFFICIAL_INVOICE (Fuente 1) within configurable day thresholds.
 *
 * Pending conversions surface as:
 *   - Seller-level bottlenecks (which seller has most aged remisiones)
 *   - Branch-level bottlenecks (which store has most aged remisiones)
 *   - Customer-level exposure (which customer has most unconverted value)
 *   - Summary KPIs for Torre de Control and Finance Close Score
 *
 * Architecture:
 *   - All computation is done in-memory from SaleRecord queries.
 *   - No new DB schema required — reads sagSourceType and saleDate.
 *   - Conservative matching: a remision is "converted" when the same customer
 *     (by NIT) and same seller have an OFICIAL record within 60 days after
 *     the remision date. This is a heuristic — exact SAG-level matching
 *     requires originDocumentRef to be populated.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  assessRemisionRisk,
  REMISION_RISK_THRESHOLDS,
  type RemisionRisk,
} from "./source-inference";
import {
  getSourceSemantics,
  fromSagSourceType,
} from "./source-semantics";
import { getPersistedOrphans } from "@/lib/sales/source-dedup";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RemisionRecord {
  id:              string;
  saleDate:        Date;
  sellerSlug:      string;
  sellerName:      string;
  storeSlug:       string;
  storeName:       string;
  customerNit:     string | null;
  customerName:    string | null;
  productLine:     string;
  amount:          number;
  comprobante:     string | null;
  comprobanteCode: string | null;
  daysPending:     number;
  risk:            RemisionRisk;
}

export interface RemisionSellerSummary {
  sellerSlug:   string;
  sellerName:   string;
  totalAmount:  number;
  count:        number;
  maxDays:      number;
  risk:         RemisionRisk;
}

export interface RemisionStoreSummary {
  storeSlug:   string;
  storeName:   string;
  totalAmount: number;
  count:       number;
  maxDays:     number;
  risk:        RemisionRisk;
}

export interface RemisionMonitorSummary {
  /** Total REMISION value in pending state. */
  totalPendingAmount: number;
  /** Total count of pending remision records. */
  totalPendingCount:  number;
  /** Break down by risk bucket. */
  byRisk: {
    low:      { count: number; amount: number };
    medium:   { count: number; amount: number };
    high:     { count: number; amount: number };
    critical: { count: number; amount: number };
  };
  /** Top 10 sellers by pending remision amount. */
  bySeller:  RemisionSellerSummary[];
  /** Top 10 stores by pending remision amount. */
  byStore:   RemisionStoreSummary[];
  /** Individual remision records (most recent first, max 200). */
  items:     RemisionRecord[];
  hasData:   boolean;
  /** ISO timestamp of the last updated remision. */
  lastSaleDate: Date | null;
}

// ── Raw DB row type ───────────────────────────────────────────────────────────

type RemisionRaw = {
  id:              string;
  sale_date:       Date;
  seller_slug:     string;
  seller_name:     string;
  store_slug:      string;
  store_name:      string;
  customer_nit:    string | null;
  customer_name:   string | null;
  product_line:    string;
  amount:          number;
  comprobante:     string | null;
  comprobante_code: string | null;
};

// ── Main query ────────────────────────────────────────────────────────────────

export async function getRemisionMonitor(
  organizationId: string,
  /** Max age to consider "pending" — remisiones older than this are still returned
   *  but flagged as CRITICAL. Default: 90 days (older than this is very stale). */
  maxAgeDays    = 90,
  /** YYYYMM period to scope the query. When omitted, loads from last 90 days. */
  periodoAoMes?: string,
): Promise<RemisionMonitorSummary> {
  const now = new Date();

  // ── Primary path: read orphans from SourceMatchRecord (persistent, accurate) ─
  // When periodoAoMes is provided, use getPersistedOrphans which reads from the
  // persisted dedup table. This only returns REAL orphans — F2 records with no
  // matching F1 — not all REMISION records.
  if (periodoAoMes) {
    const orphans = await getPersistedOrphans(organizationId, periodoAoMes, 0);

    if (orphans.length > 0) {
      // Load full SaleRecord details for the orphan IDs (for name fields)
      const orphanIds = orphans.map(o => o.f2RecordId);
      const details = await prisma.$queryRaw<RemisionRaw[]>(Prisma.sql`
        SELECT
          id,
          "saleDate"         AS sale_date,
          "sellerSlug"       AS seller_slug,
          "sellerName"       AS seller_name,
          "storeSlug"        AS store_slug,
          "storeName"        AS store_name,
          "customerNit"      AS customer_nit,
          "customerName"     AS customer_name,
          "productLine"      AS product_line,
          "amount"::float8   AS amount,
          "comprobante"      AS comprobante,
          "comprobanteCode"  AS comprobante_code
        FROM "SaleRecord"
        WHERE "id" = ANY(${orphanIds}::text[])
        ORDER BY "saleDate" DESC
        LIMIT 200
      `);

      const detailMap = new Map(details.map(d => [d.id, d]));

      const items: RemisionRecord[] = orphans.map(o => {
        const d = detailMap.get(o.f2RecordId);
        return {
          id:              o.f2RecordId,
          saleDate:        o.f2Date instanceof Date ? o.f2Date : new Date(o.f2Date),
          sellerSlug:      o.sellerSlug,
          sellerName:      d?.seller_name ?? o.sellerSlug,
          storeSlug:       o.storeSlug,
          storeName:       d?.store_name  ?? o.storeSlug,
          customerNit:     o.customerNit,
          customerName:    d?.customer_name ?? null,
          productLine:     d?.product_line  ?? "",
          amount:          o.f2Amount,
          comprobante:     d?.comprobante      ?? null,
          comprobanteCode: d?.comprobante_code ?? null,
          daysPending:     o.orphanDays,
          risk:            assessRemisionRisk(o.orphanDays) as RemisionRisk,
        };
      }).filter(i => i.daysPending <= maxAgeDays);

      return buildMonitorSummary(items, now);
    }
  }

  // ── Fallback path: raw REMISION scan (used pre-backfill or when no period given) ─
  // NOTE: This path treats ALL REMISION records as pending — not just real orphans.
  // It is kept as a fallback for backwards compatibility until SourceMatchRecord
  // is populated for all periods. The primary path above is always preferred.
  const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<RemisionRaw[]>(Prisma.sql`
    SELECT
      id,
      "saleDate"         AS sale_date,
      "sellerSlug"       AS seller_slug,
      "sellerName"       AS seller_name,
      "storeSlug"        AS store_slug,
      "storeName"        AS store_name,
      "customerNit"      AS customer_nit,
      "customerName"     AS customer_name,
      "productLine"      AS product_line,
      "amount"::float8   AS amount,
      "comprobante"      AS comprobante,
      "comprobanteCode"  AS comprobante_code
    FROM "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND "saleDate"       >= ${cutoff}
      AND (
        "sagSourceType"        = 'REMISION'
        OR "sagDocumentFamily" = 'DISPATCH_REMISION'
      )
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    ORDER BY "saleDate" DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    return {
      totalPendingAmount: 0,
      totalPendingCount:  0,
      byRisk: {
        low:      { count: 0, amount: 0 },
        medium:   { count: 0, amount: 0 },
        high:     { count: 0, amount: 0 },
        critical: { count: 0, amount: 0 },
      },
      bySeller:    [],
      byStore:     [],
      items:       [],
      hasData:     false,
      lastSaleDate: null,
    };
  }

  const items: RemisionRecord[] = rows.map((r) => {
    const daysPending = Math.floor(
      (now.getTime() - new Date(r.sale_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      id:              r.id,
      saleDate:        new Date(r.sale_date),
      sellerSlug:      r.seller_slug,
      sellerName:      r.seller_name,
      storeSlug:       r.store_slug,
      storeName:       r.store_name,
      customerNit:     r.customer_nit,
      customerName:    r.customer_name,
      productLine:     r.product_line,
      amount:          r.amount,
      comprobante:     r.comprobante,
      comprobanteCode: r.comprobante_code,
      daysPending,
      risk:            assessRemisionRisk(daysPending),
    };
  });

  return buildMonitorSummary(items, now);
}

// ── Shared aggregation helper ─────────────────────────────────────────────────

function buildMonitorSummary(items: RemisionRecord[], now: Date): RemisionMonitorSummary {
  if (items.length === 0) {
    return {
      totalPendingAmount: 0,
      totalPendingCount:  0,
      byRisk: {
        low:      { count: 0, amount: 0 },
        medium:   { count: 0, amount: 0 },
        high:     { count: 0, amount: 0 },
        critical: { count: 0, amount: 0 },
      },
      bySeller:    [],
      byStore:     [],
      items:       [],
      hasData:     false,
      lastSaleDate: null,
    };
  }

  const totalPendingAmount = items.reduce((s, i) => s + i.amount, 0);

  const byRisk = {
    low:      { count: 0, amount: 0 },
    medium:   { count: 0, amount: 0 },
    high:     { count: 0, amount: 0 },
    critical: { count: 0, amount: 0 },
  };
  for (const item of items) {
    if (item.risk === "NONE" || item.risk === "LOW")  { byRisk.low.count++;      byRisk.low.amount      += item.amount; }
    else if (item.risk === "MEDIUM")                   { byRisk.medium.count++;   byRisk.medium.amount   += item.amount; }
    else if (item.risk === "HIGH")                     { byRisk.high.count++;     byRisk.high.amount     += item.amount; }
    else if (item.risk === "CRITICAL")                 { byRisk.critical.count++; byRisk.critical.amount += item.amount; }
  }

  const sellerMap = new Map<string, RemisionSellerSummary>();
  for (const item of items) {
    const existing = sellerMap.get(item.sellerSlug);
    if (existing) {
      existing.totalAmount += item.amount;
      existing.count++;
      if (item.daysPending > existing.maxDays) {
        existing.maxDays = item.daysPending;
        existing.risk    = assessRemisionRisk(item.daysPending);
      }
    } else {
      sellerMap.set(item.sellerSlug, {
        sellerSlug:  item.sellerSlug,
        sellerName:  item.sellerName,
        totalAmount: item.amount,
        count:       1,
        maxDays:     item.daysPending,
        risk:        item.risk,
      });
    }
  }

  const storeMap = new Map<string, RemisionStoreSummary>();
  for (const item of items) {
    const existing = storeMap.get(item.storeSlug);
    if (existing) {
      existing.totalAmount += item.amount;
      existing.count++;
      if (item.daysPending > existing.maxDays) {
        existing.maxDays = item.daysPending;
        existing.risk    = assessRemisionRisk(item.daysPending);
      }
    } else {
      storeMap.set(item.storeSlug, {
        storeSlug:   item.storeSlug,
        storeName:   item.storeName,
        totalAmount: item.amount,
        count:       1,
        maxDays:     item.daysPending,
        risk:        item.risk,
      });
    }
  }

  const lastSaleDate = items.reduce(
    (latest, i) => (i.saleDate > latest ? i.saleDate : latest),
    items[0].saleDate,
  );

  return {
    totalPendingAmount,
    totalPendingCount: items.length,
    byRisk,
    bySeller:    [...sellerMap.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10),
    byStore:     [...storeMap.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10),
    items,
    hasData:     true,
    lastSaleDate,
  };
}

// ── Source mix query (Fuente 1 vs Fuente 2) ───────────────────────────────────

export interface SourceMixRow {
  periodoAoMes:   string;
  // FUENTE_1 — recognized revenue (shouldCountForRevenue = true)
  oficialAmount:  number;
  oficialLabel:   string;   // "Fuente 1 — Factura oficial"
  oficialCount:   number;
  // FUENTE_2 — dispatch / remision (shouldCountForRevenue = false)
  remisionAmount: number;
  remisionLabel:  string;   // "Fuente 2 — Remisión / Despacho"
  remisionCount:  number;
  // Derived
  totalAmount:    number;
  conversionRate: number;   // oficialAmount / totalAmount × 100
}

export async function getSourceMixByPeriod(
  organizationId: string,
  startPeriodo:   string,   // "YYYYMM"
  endPeriodo:     string,   // "YYYYMM"
): Promise<SourceMixRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    periodo: string;
    source:  string;
    amount:  number;
    count:   string;
  }>>(Prisma.sql`
    SELECT
      COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) AS periodo,
      "sagSourceType"::text                                     AS source,
      SUM("amount")::float8                                     AS amount,
      CAST(COUNT(*) AS TEXT)                                    AS count
    FROM "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM'))
          BETWEEN ${startPeriodo} AND ${endPeriodo}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    GROUP BY 1, 2
    ORDER BY 1
  `);

  const f1Sem = getSourceSemantics(fromSagSourceType("OFICIAL"));
  const f2Sem = getSourceSemantics(fromSagSourceType("REMISION"));

  // Pivot into one row per period
  const byPeriod = new Map<string, SourceMixRow>();
  for (const r of rows) {
    const existing = byPeriod.get(r.periodo) ?? {
      periodoAoMes:   r.periodo,
      oficialAmount:  0,
      oficialLabel:   f1Sem.sourceLabel,
      oficialCount:   0,
      remisionAmount: 0,
      remisionLabel:  f2Sem.sourceLabel,
      remisionCount:  0,
      totalAmount:    0,
      conversionRate: 100,
    };
    if (r.source === "OFICIAL") {
      existing.oficialAmount += r.amount;
      existing.oficialCount  += Number(r.count);
    } else {
      existing.remisionAmount += r.amount;
      existing.remisionCount  += Number(r.count);
    }
    existing.totalAmount    = existing.oficialAmount + existing.remisionAmount;
    existing.conversionRate = existing.totalAmount > 0
      ? (existing.oficialAmount / existing.totalAmount) * 100
      : 100;
    byPeriod.set(r.periodo, existing);
  }

  return [...byPeriod.values()].sort((a, b) => a.periodoAoMes.localeCompare(b.periodoAoMes));
}

// ── Conversion rate by seller ─────────────────────────────────────────────────

export interface SellerConversionRow {
  sellerSlug:      string;
  sellerName:      string;
  remisionAmount:  number;
  oficialAmount:   number;
  conversionRate:  number;   // oficialAmount / (oficialAmount + remisionAmount) * 100
}

export async function getSellerConversionRates(
  organizationId: string,
  startDate:      Date,
  endDate:        Date,
): Promise<SellerConversionRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    seller_slug: string;
    seller_name: string;
    source:      string;
    amount:      number;
  }>>(Prisma.sql`
    SELECT
      "sellerSlug" AS seller_slug,
      "sellerName" AS seller_name,
      "sagSourceType"::text AS source,
      SUM("amount")::float8 AS amount
    FROM "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND "saleDate" BETWEEN ${startDate} AND ${endDate}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    GROUP BY 1, 2, 3
    ORDER BY 1
  `);

  const bySlug = new Map<string, SellerConversionRow>();
  for (const r of rows) {
    const existing = bySlug.get(r.seller_slug) ?? {
      sellerSlug:     r.seller_slug,
      sellerName:     r.seller_name,
      remisionAmount: 0,
      oficialAmount:  0,
      conversionRate: 0,
    };
    if (r.source === "OFICIAL") existing.oficialAmount  += r.amount;
    else                         existing.remisionAmount += r.amount;
    bySlug.set(r.seller_slug, existing);
  }

  const result: SellerConversionRow[] = [];
  for (const row of bySlug.values()) {
    const total = row.oficialAmount + row.remisionAmount;
    result.push({
      ...row,
      conversionRate: total > 0 ? (row.oficialAmount / total) * 100 : 100,
    });
  }
  return result.sort((a, b) => a.conversionRate - b.conversionRate); // worst first
}
