/**
 * lib/comercial/tiendas/store-sales-service.ts
 *
 * AGENTIK-SALES-CANONICAL-SOURCE-01 — Certified store sales from SaleRecord
 * AGENTIK-STORES-CERTIFIED-SALES-MIGRATION-01 — family-based classification
 *
 * Queries SaleRecord (SAG FACTURAS) using the canonical fuente code→store mapping.
 * This is the ONLY certified source for store-level revenue and document counts.
 *
 * Data source: SaleRecord (synced from SAG MOVIMIENTOS, k_n_clase_fuente=1)
 *   - Has fuente code in rawJson.code (derived from ka_ni_fuente via fuenteToCode)
 *   - Has document-level amounts (revenue per invoice/nota)
 *   - Does NOT have product-level detail (productCode is NULL)
 *
 * Semantics (certified in store-sales-assembly.ts + its tests):
 *   - SQL aggregates month × fuente code; classification happens in the pure
 *     assembly layer by canonical DOCUMENT FAMILY — never by amount sign.
 *   - Revenue = FACTURA − NOTA_CREDITO. RECAUDO_POS is cash collection and is
 *     exposed separately (posReceiptRev), NEVER summed into revenue.
 *
 * For product-level intelligence per store, a separate sync from vw_agentik_ventas
 * with ka_ni_fuente exposed is required. That is NOT yet available.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getCodesForStore,
  CANONICAL_SALES_STORES,
} from "@/lib/comercial/sales-canonical-source";
import {
  assembleStoreSales,
  buildStoreSalesKpis,
  type StoreSalesRawRow,
  type StoreSalesResponse,
  type StoreSalesMonth,
  type StoreSalesKpis,
} from "./store-sales-assembly";

// Re-export types so existing consumers keep importing from this module.
export type { StoreSalesResponse, StoreSalesMonth, StoreSalesKpis };

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

  const codes = getCodesForStore(storeId);
  if (codes.length === 0) return null;

  const db = prisma as any;

  // Aggregate month × fuente code; family classification happens in the
  // pure assembly layer (store-sales-assembly.ts).
  const raw = await db.$queryRawUnsafe(`
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
    ORDER BY month ASC
  `, orgId, YEAR_START, YEAR_END, codes);

  const rows: StoreSalesRawRow[] = (raw as any[]).map(r => ({
    month:    r.month ? (r.month as Date).toISOString().slice(0, 7) : "????-??",
    code:     r.code ?? "",
    docCount: r.doc_count ?? 0,
    amount:   r.amount ?? 0,
  }));

  const result = assembleStoreSales(storeId, SALES_YEAR, rows);
  if (!result) return null;

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

  // Network totals reuse the same certified KPI builder over the union of
  // every store's monthly rows (dataMonths = distinct months with revenue docs).
  const allMonthly = valid.flatMap(st => st.monthly);
  const monthsWithRevenue = new Set(
    allMonthly.filter(m => m.invoices > 0 || m.credits > 0).map(m => m.month),
  );
  const totals = buildStoreSalesKpis(allMonthly);
  totals.dataMonths = monthsWithRevenue.size;
  totals.avgMonthlyRevenue = totals.dataMonths > 0
    ? Math.round(totals.totalRevenue / totals.dataMonths)
    : 0;

  const result: AllStoresSalesSummary = {
    year: SALES_YEAR,
    stores: valid,
    totals,
    certified: true,
  };

  setCache(cacheKey, result);
  return result;
}
