/**
 * lib/comercial/tiendas/store-sales-assembly.ts
 *
 * AGENTIK-STORES-CERTIFIED-SALES-MIGRATION-01 — Pure assembly of certified
 * store sales from SaleRecord raw aggregates.
 *
 * Business law being certified:
 *   - Revenue por tienda = FACTURA (+) y NOTA_CREDITO (−) exclusivamente.
 *   - RECAUDO_POS es cobro de caja, NO revenue: se expone por separado y
 *     NUNCA se suma a las ventas netas (evita doble conteo factura+recaudo).
 *   - La clasificación viene de la familia documental canónica
 *     (sales-canonical-source), nunca del signo del monto.
 *
 * Client-safe: NO "server-only" import. Pure functions only — the SQL layer
 * (store-sales-service) feeds raw rows here; tests certify this module.
 */

import {
  resolveCanonicalSalesSource,
  getCanonicalStore,
} from "../sales-canonical-source";

// ── Raw input row (one per month × fuente code) ──────────────────────────────

export interface StoreSalesRawRow {
  month:    string;   // YYYY-MM
  code:     string;   // fuente text code (FD, NS, RS, ...)
  docCount: number;   // document count for that month × code
  amount:   number;   // signed sum of SaleRecord.amount
}

// ── Assembled month ──────────────────────────────────────────────────────────

export interface StoreSalesMonth {
  month:           string;   // YYYY-MM
  label:           string;   // "Ene", "Feb", etc.
  invoices:        number;   // FACTURA document count
  credits:         number;   // NOTA_CREDITO document count
  revenue:         number;   // net revenue = grossRev + creditRev (facturas − notas)
  grossRev:        number;   // FACTURA amount only
  creditRev:       number;   // NOTA_CREDITO amount (negative)
  posReceiptCount: number;   // RECAUDO_POS document count (informational)
  posReceiptRev:   number;   // RECAUDO_POS amount — NOT included in revenue
}

// ── Assembled KPIs ───────────────────────────────────────────────────────────

export interface StoreSalesKpis {
  totalRevenue:       number;
  totalGrossRev:      number;
  totalCreditRev:     number;
  invoiceCount:       number;
  creditNoteCount:    number;
  posReceiptCount:    number;   // informational — never part of revenue
  totalPosReceiptRev: number;   // informational — never part of revenue
  dataMonths:         number;
  avgMonthlyRevenue:  number;
}

export interface StoreSalesResponse {
  storeId:    string;
  storeName:  string;
  year:       number;
  kpis:       StoreSalesKpis;
  monthly:    StoreSalesMonth[];
  certified:  true;   // always true — this module only assembles certified data
}

// ── Month labels ─────────────────────────────────────────────────────────────

export const SALES_MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Assemble a certified StoreSalesResponse from raw month×code aggregates.
 *
 * Classification is by canonical document family — never by amount sign:
 *   FACTURA       → invoices / grossRev
 *   NOTA_CREDITO  → credits / creditRev
 *   RECAUDO_POS   → posReceiptCount / posReceiptRev (excluded from revenue)
 *
 * Rows whose code does not resolve, or resolves to a different store,
 * are ignored (defensive: the SQL layer already filters by store codes).
 */
export function assembleStoreSales(
  storeId: string,
  year: number,
  rows: StoreSalesRawRow[],
): StoreSalesResponse | null {
  const store = getCanonicalStore(storeId);
  if (!store) return null;

  const byMonth = new Map<string, StoreSalesMonth>();

  for (const row of rows) {
    const resolution = resolveCanonicalSalesSource(row.code);
    if (!resolution || !resolution.store) continue;           // unknown / unattributed code
    if (resolution.store.storeId !== storeId) continue;       // belongs to another store

    const mm = row.month.slice(5, 7);
    let month = byMonth.get(row.month);
    if (!month) {
      month = {
        month: row.month,
        label: SALES_MONTH_LABELS[mm] ?? mm,
        invoices: 0, credits: 0,
        revenue: 0, grossRev: 0, creditRev: 0,
        posReceiptCount: 0, posReceiptRev: 0,
      };
      byMonth.set(row.month, month);
    }

    switch (resolution.documentFamily) {
      case "FACTURA":
        month.invoices += row.docCount;
        month.grossRev += row.amount;
        break;
      case "NOTA_CREDITO":
        month.credits += row.docCount;
        // Credit notes reduce revenue. Stored amounts are expected negative;
        // normalize defensively so a positive-stored nota still subtracts.
        month.creditRev += row.amount > 0 ? -row.amount : row.amount;
        break;
      case "RECAUDO_POS":
        month.posReceiptCount += row.docCount;
        month.posReceiptRev += row.amount;
        break;
      default:
        // VENTA_CONTADO / DEVOLUCION never carry store attribution today.
        // If they ever do, they must be certified explicitly before counting.
        break;
    }
  }

  const monthly = [...byMonth.values()]
    .map(m => ({ ...m, revenue: m.grossRev + m.creditRev }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const kpis = buildStoreSalesKpis(monthly);

  return {
    storeId:   store.storeId,
    storeName: store.storeName,
    year,
    kpis,
    monthly,
    certified: true,
  };
}

export function buildStoreSalesKpis(monthly: StoreSalesMonth[]): StoreSalesKpis {
  const totalRevenue       = monthly.reduce((s, m) => s + m.revenue, 0);
  const totalGrossRev      = monthly.reduce((s, m) => s + m.grossRev, 0);
  const totalCreditRev     = monthly.reduce((s, m) => s + m.creditRev, 0);
  const invoiceCount       = monthly.reduce((s, m) => s + m.invoices, 0);
  const creditNoteCount    = monthly.reduce((s, m) => s + m.credits, 0);
  const posReceiptCount    = monthly.reduce((s, m) => s + m.posReceiptCount, 0);
  const totalPosReceiptRev = monthly.reduce((s, m) => s + m.posReceiptRev, 0);
  // dataMonths counts months with actual revenue documents (facturas/notas),
  // not months that only have POS receipts.
  const dataMonths = monthly.filter(m => m.invoices > 0 || m.credits > 0).length;

  return {
    totalRevenue,
    totalGrossRev,
    totalCreditRev,
    invoiceCount,
    creditNoteCount,
    posReceiptCount,
    totalPosReceiptRev,
    dataMonths,
    avgMonthlyRevenue: dataMonths > 0 ? Math.round(totalRevenue / dataMonths) : 0,
  };
}
