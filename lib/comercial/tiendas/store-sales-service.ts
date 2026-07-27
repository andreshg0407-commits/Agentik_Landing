/**
 * lib/comercial/tiendas/store-sales-service.ts
 *
 * AGENTIK-SALES-CANONICAL-SOURCE-01 — Certified store sales from SaleRecord
 *
 * Queries SaleRecord (SAG FACTURAS) using the canonical fuente code→store mapping.
 * This is the ONLY certified source for store-level revenue and document counts.
 *
 * Data source: SaleRecord (synced from SAG MOVIMIENTOS, k_n_clase_fuente=1)
 *   - Has fuente code in rawJson.code (derived from ka_ni_fuente via fuenteToCode)
 *   - Has document-level amounts (revenue per invoice/nota)
 *   - Does NOT have product-level detail (productCode is NULL)
 *
 * For product-level intelligence per store, a separate sync from vw_agentik_ventas
 * with ka_ni_fuente exposed is required. That is NOT yet available.
 *
 * Architecture:
 *   SaleRecord.rawJson.code → resolveCanonicalSalesSource() → storeId
 *   All queries filter by the canonical fuente codes for the requested store.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getCodesForStore,
  CANONICAL_SALES_STORES,
  type CanonicalSalesStore,
} from "@/lib/comercial/sales-canonical-source";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoreSalesMonth {
  month:     string;   // YYYY-MM
  label:     string;   // "Ene", "Feb", etc.
  invoices:  number;   // factura count
  credits:   number;   // nota credito count
  revenue:   number;   // net revenue (facturas - notas)
  grossRev:  number;   // factura revenue only
  creditRev: number;   // nota credito revenue (negative)
}

export interface StoreSalesKpis {
  totalRevenue:     number;
  totalGrossRev:    number;
  totalCreditRev:   number;
  invoiceCount:     number;
  creditNoteCount:  number;
  dataMonths:       number;
  avgMonthlyRevenue: number;
}

export interface StoreSalesResponse {
  storeId:    string;
  storeName:  string;
  year:       number;
  kpis:       StoreSalesKpis;
  monthly:    StoreSalesMonth[];
  certified:  true;   // always true — this service only returns certified data
}

export interface AllStoresSalesSummary {
  year:       number;
  stores:     StoreSalesResponse[];
  totals:     StoreSalesKpis;
  certified:  true;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SALES_YEAR = 2026;
const YEAR_START = `${SALES_YEAR}-01-01`;
const YEAR_END   = `${SALES_YEAR + 1}-01-01`;

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; ts: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Load sales for a single store ────────────────────────────────────────────

export async function loadStoreSales(
  orgId: string,
  storeId: string,
): Promise<StoreSalesResponse | null> {
  const cacheKey = `storeSales:${orgId}:${storeId}:${SALES_YEAR}`;
  const cached = getCached<StoreSalesResponse>(cacheKey);
  if (cached) return cached;

  const store = CANONICAL_SALES_STORES.find(s => s.storeId === storeId);
  if (!store) return null;

  const codes = getCodesForStore(storeId);
  if (codes.length === 0) return null;

  const db = prisma as any;

  // Monthly aggregation from SaleRecord, filtering by fuente codes
  // SaleRecord.rawJson->>'code' contains the fuente text code
  const monthlyRaw = await db.$queryRawUnsafe(`
    SELECT DATE_TRUNC('month', s."saleDate") as month,
           COUNT(CASE WHEN s.amount > 0 THEN 1 END)::int as invoices,
           COUNT(CASE WHEN s.amount < 0 THEN 1 END)::int as credits,
           SUM(s.amount::float)::float as net_revenue,
           SUM(CASE WHEN s.amount > 0 THEN s.amount::float ELSE 0 END)::float as gross_rev,
           SUM(CASE WHEN s.amount < 0 THEN s.amount::float ELSE 0 END)::float as credit_rev
    FROM "SaleRecord" s
    WHERE s."organizationId" = $1
      AND s."saleDate" >= $2
      AND s."saleDate" < $3
      AND s."rawJson"->>'code' = ANY($4)
    GROUP BY DATE_TRUNC('month', s."saleDate")
    ORDER BY month ASC
  `, orgId, YEAR_START, YEAR_END, codes);

  const monthly: StoreSalesMonth[] = (monthlyRaw as any[]).map(m => {
    const monthStr = m.month ? (m.month as Date).toISOString().slice(0, 7) : "????-??";
    const mm = monthStr.slice(5, 7);
    return {
      month:     monthStr,
      label:     MONTH_LABELS[mm] ?? mm,
      invoices:  m.invoices ?? 0,
      credits:   m.credits ?? 0,
      revenue:   m.net_revenue ?? 0,
      grossRev:  m.gross_rev ?? 0,
      creditRev: m.credit_rev ?? 0,
    };
  });

  const totalRevenue     = monthly.reduce((s, m) => s + m.revenue, 0);
  const totalGrossRev    = monthly.reduce((s, m) => s + m.grossRev, 0);
  const totalCreditRev   = monthly.reduce((s, m) => s + m.creditRev, 0);
  const invoiceCount     = monthly.reduce((s, m) => s + m.invoices, 0);
  const creditNoteCount  = monthly.reduce((s, m) => s + m.credits, 0);
  const dataMonths       = monthly.length;

  const result: StoreSalesResponse = {
    storeId:   store.storeId,
    storeName: store.storeName,
    year:      SALES_YEAR,
    kpis: {
      totalRevenue,
      totalGrossRev,
      totalCreditRev,
      invoiceCount,
      creditNoteCount,
      dataMonths,
      avgMonthlyRevenue: dataMonths > 0 ? Math.round(totalRevenue / dataMonths) : 0,
    },
    monthly,
    certified: true,
  };

  setCache(cacheKey, result);
  return result;
}

// ── Load sales for ALL stores ────────────────────────────────────────────────

export async function loadAllStoresSales(
  orgId: string,
): Promise<AllStoresSalesSummary> {
  const cacheKey = `allStoreSales:${orgId}:${SALES_YEAR}`;
  const cached = getCached<AllStoresSalesSummary>(cacheKey);
  if (cached) return cached;

  const stores = await Promise.all(
    CANONICAL_SALES_STORES.map(s => loadStoreSales(orgId, s.storeId)),
  );

  const valid = stores.filter((s): s is StoreSalesResponse => s !== null);

  const totals: StoreSalesKpis = {
    totalRevenue:     valid.reduce((s, st) => s + st.kpis.totalRevenue, 0),
    totalGrossRev:    valid.reduce((s, st) => s + st.kpis.totalGrossRev, 0),
    totalCreditRev:   valid.reduce((s, st) => s + st.kpis.totalCreditRev, 0),
    invoiceCount:     valid.reduce((s, st) => s + st.kpis.invoiceCount, 0),
    creditNoteCount:  valid.reduce((s, st) => s + st.kpis.creditNoteCount, 0),
    dataMonths:       Math.max(...valid.map(st => st.kpis.dataMonths), 0),
    avgMonthlyRevenue: 0,
  };
  const totalMonths = totals.dataMonths;
  totals.avgMonthlyRevenue = totalMonths > 0 ? Math.round(totals.totalRevenue / totalMonths) : 0;

  const result: AllStoresSalesSummary = {
    year: SALES_YEAR,
    stores: valid,
    totals,
    certified: true,
  };

  setCache(cacheKey, result);
  return result;
}
