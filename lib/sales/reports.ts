/**
 * Sales Intelligence reports for Castillitos.
 *
 * Three core reports that replace the manual Excel outputs:
 *
 * 1. getComparativoAnoMes   — monthly revenue vs same month prior year + YTD
 * 2. getParticipacionVendedor — seller share of revenue for a period
 * 3. getPedidosResumidos    — aggregated orders summary with avg ticket
 *
 * All queries are pure SQL via $queryRaw for aggregation performance.
 * All amounts are returned as numbers (Decimal cast in SQL).
 */

import { prisma } from "@/lib/prisma";
import { Prisma, SagDocumentFamily } from "@prisma/client";
import { type TruthModule, MODULE_SQL_CONDITION } from "./source-rules";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComparativoRow {
  periodo:       string;       // "YYYYMM"
  year:          number;
  month:         number;
  totalAmount:   number;
  txCount:       number | null;
  prevYearAmount: number | null;
  prevYearTxCount: number | null;
  pctChange:     number | null; // ((current - prev) / prev) * 100
}

export interface ParticipacionVendedorRow {
  sellerSlug:  string;
  sellerName:  string;
  totalAmount: number;
  txCount:     number | null;
  share:       number;         // 0–100
}

export interface PedidosResumidosRow {
  periodo:     string;
  sellerName:  string;
  storeName:   string;
  productLine: string;
  channel:     string;
  totalAmount: number;
  txCount:     number | null;
  avgTicket:   number | null;  // null when txCount is null
}

// ── 0. Latest available period ───────────────────────────────────────────────
// Returns the most-recently imported periodoAoMes ("YYYYMM") for the org.
// Falls back to the current calendar month so the dashboard never crashes on
// an empty database.

export async function getLatestPeriod(organizationId: string): Promise<string> {
  const rows = await prisma.$queryRaw<[{ max_periodo: string | null }]>`
    SELECT MAX("periodoAoMes") AS max_periodo
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  "periodoAoMes"   IS NOT NULL
  `;
  const max = rows[0]?.max_periodo;
  if (max) return max;
  // No data yet — fall back to today's month
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── 1. Comparativo Año/Mes ────────────────────────────────────────────────────
// Monthly totals for [startPeriodo..endPeriodo] plus the same months of the
// prior year, so the caller can render a side-by-side comparison table.
//
// startPeriodo / endPeriodo: "YYYYMM" inclusive

export async function getComparativoAnoMes(
  organizationId:    string,
  startPeriodo:      string,   // e.g. "202401"
  endPeriodo:        string,   // e.g. "202412"
  documentFamilies?: SagDocumentFamily[],
  /** Defaults to "revenue_executive" — OFICIAL only (recognized revenue). */
  module:            TruthModule = "revenue_executive",
): Promise<ComparativoRow[]> {
  // Derive prior year bounds
  const prevStart = String(Number(startPeriodo.slice(0, 4)) - 1) + startPeriodo.slice(4);
  const prevEnd   = String(Number(endPeriodo.slice(0, 4))   - 1) + endPeriodo.slice(4);

  const familyFilter = documentFamilies?.length
    ? Prisma.sql`AND "sagDocumentFamily" = ANY(ARRAY[${Prisma.join(documentFamilies)}]::"SagDocumentFamily"[])`
    : Prisma.sql``;
  const sourceFilter = Prisma.raw(MODULE_SQL_CONDITION[module]);

  type RawRow = {
    month:        string;   // "MM"
    year:         string;   // "YYYY"
    total_amount: number;
    tx_count:     string | null;
  };

  const rows: RawRow[] = await prisma.$queryRaw(Prisma.sql`
    SELECT
      SUBSTRING(COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')), 5, 2)  AS month,
      SUBSTRING(COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')), 1, 4)  AS year,
      SUM("amount")::float                                                        AS total_amount,
      CASE
        WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
        ELSE CAST(SUM("txCount") AS TEXT)
      END                                                                         AS tx_count
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) BETWEEN ${prevStart} AND ${endPeriodo}
      AND  ${sourceFilter}
      ${familyFilter}
    GROUP  BY year, month
    ORDER  BY year, month
  `);

  // Build lookup keyed by "YYYYMM"
  const byPeriodo = new Map(rows.map(r => [`${r.year}${r.month}`, r]));

  // Produce one output row per period in the requested range
  const result: ComparativoRow[] = [];
  const [startY, startM] = [Number(startPeriodo.slice(0,4)), Number(startPeriodo.slice(4))];
  const [endY,   endM  ] = [Number(endPeriodo.slice(0,4)),   Number(endPeriodo.slice(4))];

  for (let y = startY; y <= endY; y++) {
    const mStart = y === startY ? startM : 1;
    const mEnd   = y === endY   ? endM   : 12;
    for (let m = mStart; m <= mEnd; m++) {
      const periodo   = `${y}${String(m).padStart(2,"0")}`;
      const prevPer   = `${y - 1}${String(m).padStart(2,"0")}`;
      const cur       = byPeriodo.get(periodo) ?? null;
      const prev      = byPeriodo.get(prevPer) ?? null;
      const curAmt    = cur  ? cur.total_amount  : 0;
      const prevAmt   = prev ? prev.total_amount : null;

      result.push({
        periodo,
        year:  y,
        month: m,
        totalAmount:     curAmt,
        txCount:         cur?.tx_count != null ? Number(cur.tx_count) : null,
        prevYearAmount:  prevAmt,
        prevYearTxCount: prev?.tx_count != null ? Number(prev.tx_count) : null,
        pctChange:
          prevAmt != null && prevAmt !== 0
            ? Math.round(((curAmt - prevAmt) / prevAmt) * 10000) / 100
            : null,
      });
    }
  }

  return result;
}

// ── 2. Participación Vendedor ─────────────────────────────────────────────────
// Seller revenue share for a given period range (YYYYMM..YYYYMM).

export async function getParticipacionVendedor(
  organizationId:    string,
  startPeriodo:      string,
  endPeriodo:        string,
  documentFamilies?: SagDocumentFamily[],
  /** Defaults to "revenue_executive" — OFICIAL only. */
  module:            TruthModule = "revenue_executive",
): Promise<ParticipacionVendedorRow[]> {
  const familyFilter = documentFamilies?.length
    ? Prisma.sql`AND sr."sagDocumentFamily" = ANY(ARRAY[${Prisma.join(documentFamilies)}]::"SagDocumentFamily"[])`
    : Prisma.sql``;
  const sourceFilter = Prisma.raw(MODULE_SQL_CONDITION[module]);

  type RawRow = {
    seller_slug: string;
    seller_name: string;
    total_amount: string;
    tx_count: string | null;
  };

  const rows: RawRow[] = await prisma.$queryRaw(Prisma.sql`
    SELECT
      sr."sellerSlug"                            AS seller_slug,
      MAX(sr."sellerName")                       AS seller_name,
      CAST(SUM(sr.amount)    AS TEXT)            AS total_amount,
      CASE
        WHEN COUNT(*) FILTER (WHERE sr."txCount" IS NULL) > 0 THEN NULL
        ELSE CAST(SUM(sr."txCount") AS TEXT)
      END                                        AS tx_count
    FROM   "SaleRecord" sr
    WHERE  sr."organizationId" = ${organizationId}
      AND  sr."periodoAoMes" IS NOT NULL
      AND  sr."periodoAoMes" BETWEEN ${startPeriodo} AND ${endPeriodo}
      AND  ${sourceFilter}
      ${familyFilter}
    GROUP  BY sr."sellerSlug"
    ORDER  BY SUM(sr.amount) DESC
  `);

  const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount), 0);

  return rows.map(r => {
    const amt = Number(r.total_amount);
    return {
      sellerSlug:  r.seller_slug,
      sellerName:  r.seller_name,
      totalAmount: amt,
      txCount:     r.tx_count != null ? Number(r.tx_count) : null,
      share:       totalAmount > 0 ? Math.round((amt / totalAmount) * 10000) / 100 : 0,
    };
  });
}

// ── 4. Dashboard KPIs ────────────────────────────────────────────────────────
// Single-period aggregates used by the executive dashboard cards.

export interface DashboardKpis {
  ventasMesActual:   number;
  pedidosMesActual:  number | null; // null when any row has txCount = NULL
  ticketPromedio:    number | null;
  clientesUnicos:    number;
  topLinea:          string | null;
  topLineaAmount:    number;
  topVendedor:       string | null;
  topVendedorSlug:   string | null;
  topVendedorAmount: number;
}

export async function getDashboardKpis(
  organizationId:    string,
  periodo:           string,
  documentFamilies?: SagDocumentFamily[],
  /** Source truth module. Defaults to "revenue_executive" (OFICIAL only).
   *  Pass "operational" to include F2 in totals (e.g. for operations dashboards). */
  module:            TruthModule = "revenue_executive",
): Promise<DashboardKpis> {
  type KpiRaw  = { ventas: number; pedidos: string | null; clientes: string };
  type TopRaw  = { name: string; ventas: number };

  const familyFilter = documentFamilies?.length
    ? Prisma.sql`AND "sagDocumentFamily" = ANY(ARRAY[${Prisma.join(documentFamilies)}]::"SagDocumentFamily"[])`
    : Prisma.sql``;
  const sourceFilter = Prisma.raw(MODULE_SQL_CONDITION[module]);

  const [kpiRows, lineRows, vendRows] = await Promise.all([
    prisma.$queryRaw<KpiRaw[]>(Prisma.sql`
      SELECT
        SUM("amount")::float   AS ventas,
        CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
             ELSE CAST(SUM("txCount") AS TEXT) END AS pedidos,
        CAST(COUNT(DISTINCT "customerName") AS TEXT) AS clientes
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "periodoAoMes"   = ${periodo}
        AND ${sourceFilter}
        ${familyFilter}
    `),
    prisma.$queryRaw<TopRaw[]>(Prisma.sql`
      SELECT "productLine" AS name, SUM("amount")::float AS ventas
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "periodoAoMes"   = ${periodo}
        AND  ${sourceFilter}
        AND  "productLine"    NOT ILIKE 'Total %'
        AND  "productLine"    NOT ILIKE 'Subtotal%'
        AND  "productLine"    NOT ILIKE 'Gran Total%'
        ${familyFilter}
      GROUP  BY "productLine"
      ORDER  BY ventas DESC
      LIMIT  1
    `),
    prisma.$queryRaw<Array<{ name: string; slug: string; ventas: number }>>(Prisma.sql`
      SELECT "sellerName" AS name, "sellerSlug" AS slug, SUM("amount")::float AS ventas
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "periodoAoMes"   = ${periodo}
        AND  ${sourceFilter}
        ${familyFilter}
      GROUP  BY "sellerName", "sellerSlug"
      ORDER  BY ventas DESC
      LIMIT  1
    `),
  ]);

  const kpi     = kpiRows[0];
  const ventas  = kpi?.ventas  ?? 0;
  const pedidos = kpi?.pedidos != null ? Number(kpi.pedidos) : null;

  return {
    ventasMesActual:   ventas,
    pedidosMesActual:  pedidos,
    ticketPromedio:    pedidos != null && pedidos > 0
                         ? Math.round((ventas / pedidos) * 100) / 100
                         : null,
    clientesUnicos:    kpi?.clientes != null ? Number(kpi.clientes) : 0,
    topLinea:          lineRows[0]?.name  ?? null,
    topLineaAmount:    lineRows[0]?.ventas ?? 0,
    topVendedor:       vendRows[0]?.name  ?? null,
    topVendedorSlug:   vendRows[0]?.slug  ?? null,
    topVendedorAmount: vendRows[0]?.ventas ?? 0,
  };
}

// ── 5. Línea Mix ──────────────────────────────────────────────────────────────
// Revenue / orders / ticket by product line for a single period.

export interface LineaMixRow {
  linea:      string;
  ventas:     number;
  pedidos:    number | null;
  ticketProm: number | null;
  share:      number;  // 0–100
}

export async function getLineaMix(
  organizationId: string,
  periodo:        string
): Promise<LineaMixRow[]> {
  type RawRow = { linea: string; ventas: number; pedidos: string | null };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      "productLine"          AS linea,
      SUM("amount")::float   AS ventas,
      CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
           ELSE CAST(SUM("txCount") AS TEXT) END AS pedidos
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  "periodoAoMes"   = ${periodo}
      AND  "productLine"    NOT ILIKE 'Total %'
      AND  "productLine"    NOT ILIKE 'Subtotal%'
      AND  "productLine"    NOT ILIKE 'Gran Total%'
    GROUP  BY "productLine"
    ORDER  BY ventas DESC
  `);

  const total = rows.reduce((s, r) => s + r.ventas, 0);
  return rows.map(r => {
    const ped = r.pedidos != null ? Number(r.pedidos) : null;
    return {
      linea:      r.linea,
      ventas:     r.ventas,
      pedidos:    ped,
      ticketProm: ped != null && ped > 0 ? Math.round((r.ventas / ped) * 100) / 100 : null,
      share:      total > 0 ? Math.round((r.ventas / total) * 10000) / 100 : 0,
    };
  });
}

// ── 6. Top Clientes ───────────────────────────────────────────────────────────
// Top N customers by revenue for a single period.

export interface TopClienteRow {
  customerName: string;
  customerNit:  string | null;
  ventas:       number;
  pedidos:      number | null;
  ultimaFecha:  string;
}

export async function getTopClientes(
  organizationId: string,
  periodo:        string,
  limit = 10
): Promise<TopClienteRow[]> {
  type RawRow = {
    customer_name: string | null;
    customer_nit:  string | null;
    ventas:        number;
    pedidos:       string | null;
    ultima_fecha:  string;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      "customerName"                           AS customer_name,
      "customerNit"                            AS customer_nit,
      SUM("amount")::float                     AS ventas,
      CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
           ELSE CAST(SUM("txCount") AS TEXT) END AS pedidos,
      TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')  AS ultima_fecha
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  "periodoAoMes"   = ${periodo}
      AND  "customerName"   IS NOT NULL
    GROUP  BY "customerName", "customerNit"
    ORDER  BY ventas DESC
    LIMIT  ${Prisma.raw(String(limit))}
  `);

  return rows.map(r => ({
    customerName: r.customer_name ?? "DESCONOCIDO",
    customerNit:  r.customer_nit,
    ventas:       r.ventas,
    pedidos:      r.pedidos != null ? Number(r.pedidos) : null,
    ultimaFecha:  r.ultima_fecha ?? "",
  }));
}

// ── 3. Pedidos Resumidos ──────────────────────────────────────────────────────
// Order summary grouped by seller + store + line + channel for a period.
// avgTicket is only computed when txCount is known (not null).

export async function getPedidosResumidos(
  organizationId: string,
  startPeriodo:   string,
  endPeriodo:     string
): Promise<PedidosResumidosRow[]> {
  type RawRow = {
    periodo:      string;
    seller_name:  string;
    store_name:   string;
    product_line: string;
    channel:      string;
    total_amount: string;
    tx_count:     string | null;
  };

  const rows: RawRow[] = await prisma.$queryRaw(Prisma.sql`
    SELECT
      sr."periodoAoMes"                           AS periodo,
      MAX(sr."sellerName")                        AS seller_name,
      MAX(sr."storeName")                         AS store_name,
      sr."productLine"                            AS product_line,
      CAST(sr.channel AS TEXT)                    AS channel,
      CAST(SUM(sr.amount)    AS TEXT)             AS total_amount,
      CASE
        WHEN COUNT(*) FILTER (WHERE sr."txCount" IS NULL) > 0 THEN NULL
        ELSE CAST(SUM(sr."txCount") AS TEXT)
      END                                         AS tx_count
    FROM   "SaleRecord" sr
    WHERE  sr."organizationId" = ${organizationId}
      AND  sr."periodoAoMes" IS NOT NULL
      AND  sr."periodoAoMes" BETWEEN ${startPeriodo} AND ${endPeriodo}
    GROUP  BY sr."periodoAoMes", sr."sellerSlug", sr."storeSlug", sr."productLine", sr.channel
    ORDER  BY sr."periodoAoMes", SUM(sr.amount) DESC
  `);

  return rows.map(r => {
    const amt     = Number(r.total_amount);
    const txCount = r.tx_count != null ? Number(r.tx_count) : null;
    return {
      periodo:     r.periodo,
      sellerName:  r.seller_name,
      storeName:   r.store_name,
      productLine: r.product_line,
      channel:     r.channel,
      totalAmount: amt,
      txCount,
      avgTicket:   txCount != null && txCount > 0
                     ? Math.round((amt / txCount) * 100) / 100
                     : null,
    };
  });
}

// ── Drill-down helpers (shared by detail pages) ───────────────────────────────

type TrendRaw = {
  periodo:      string;
  total_amount: number;
  tx_count:     string | null;
};

function mapTrendRow(r: TrendRaw) {
  return {
    periodo:     r.periodo,
    totalAmount: r.total_amount,
    txCount:     r.tx_count != null ? Number(r.tx_count) : null,
  };
}

// ── 7. Seller Detail ──────────────────────────────────────────────────────────

export interface SellerTrendRow  { periodo: string; totalAmount: number; txCount: number | null }
export interface SellerTopLine   { productLine: string; totalAmount: number; txCount: number | null; share: number }
export interface SellerTopClient { customerName: string; customerNit: string | null; totalAmount: number; txCount: number | null }

export interface SellerDetail {
  sellerSlug:      string;
  sellerName:      string;
  uniqueCustomers: number;
  lastSaleDate:    string | null;
  trend:           SellerTrendRow[];
  topLines:        SellerTopLine[];
  topClientes:     SellerTopClient[];
}

export async function getSellerDetail(
  organizationId: string,
  sellerSlug:     string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<SellerDetail> {
  type LineRaw   = { product_line: string; total_amount: number; tx_count: string | null };
  type ClientRaw = { customer_name: string | null; customer_nit: string | null; total_amount: number; tx_count: string | null };
  type NameRaw   = { seller_name: string };

  type StatsRaw = { unique_customers: string; last_sale_date: string | null };

  const [trendRows, lineRows, clientRows, nameRows, statsRows] = await Promise.all([
    prisma.$queryRaw<TrendRaw[]>(Prisma.sql`
      SELECT "periodoAoMes" AS periodo,
             SUM("amount")::float AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "sellerSlug"     = ${sellerSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "periodoAoMes"
      ORDER  BY "periodoAoMes"
    `),
    prisma.$queryRaw<LineRaw[]>(Prisma.sql`
      SELECT "productLine" AS product_line,
             SUM("amount")::float AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "sellerSlug"     = ${sellerSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
        AND  "productLine"    NOT ILIKE 'Total %'
        AND  "productLine"    NOT ILIKE 'Subtotal%'
        AND  "productLine"    NOT ILIKE 'Gran Total%'
      GROUP  BY "productLine"
      ORDER  BY total_amount DESC
      LIMIT  10
    `),
    prisma.$queryRaw<ClientRaw[]>(Prisma.sql`
      SELECT "customerName" AS customer_name,
             "customerNit"  AS customer_nit,
             SUM("amount")::float AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "sellerSlug"     = ${sellerSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
        AND  "customerName"   IS NOT NULL
      GROUP  BY "customerName", "customerNit"
      ORDER  BY total_amount DESC
      LIMIT  15
    `),
    prisma.$queryRaw<NameRaw[]>(Prisma.sql`
      SELECT MAX("sellerName") AS seller_name
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "sellerSlug"     = ${sellerSlug}
    `),
    prisma.$queryRaw<StatsRaw[]>(Prisma.sql`
      SELECT
        CAST(COUNT(DISTINCT "customerName") AS TEXT)  AS unique_customers,
        TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')         AS last_sale_date
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "sellerSlug"     = ${sellerSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
    `),
  ]);

  const totalForShare = lineRows.reduce((s, r) => s + r.total_amount, 0);

  return {
    sellerSlug,
    sellerName:      nameRows[0]?.seller_name  ?? sellerSlug,
    uniqueCustomers: statsRows[0] ? Number(statsRows[0].unique_customers) : 0,
    lastSaleDate:    statsRows[0]?.last_sale_date ?? null,
    trend:           trendRows.map(mapTrendRow),
    topLines:   lineRows.map(r => ({
      productLine: r.product_line,
      totalAmount: r.total_amount,
      txCount:     r.tx_count != null ? Number(r.tx_count) : null,
      share:       totalForShare > 0
        ? Math.round((r.total_amount / totalForShare) * 10000) / 100
        : 0,
    })),
    topClientes: clientRows.map(r => ({
      customerName: r.customer_name ?? "DESCONOCIDO",
      customerNit:  r.customer_nit,
      totalAmount:  r.total_amount,
      txCount:      r.tx_count != null ? Number(r.tx_count) : null,
    })),
  };
}

// ── 8. Line Detail ────────────────────────────────────────────────────────────

export interface LineTopSeller { sellerSlug: string; sellerName: string; totalAmount: number; share: number }
export interface LineTopClient { customerName: string; customerNit: string | null; totalAmount: number }

export interface LineDetail {
  lineName:    string;
  trend:       Array<{ periodo: string; totalAmount: number; txCount: number | null }>;
  topSellers:  LineTopSeller[];
  topClientes: LineTopClient[];
}

export async function getLineDetail(
  organizationId: string,
  lineName:       string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<LineDetail> {
  type SellerRaw = { seller_slug: string; seller_name: string; total_amount: number };
  type ClientRaw = { customer_name: string | null; customer_nit: string | null; total_amount: number };

  const [trendRows, sellerRows, clientRows] = await Promise.all([
    prisma.$queryRaw<TrendRaw[]>(Prisma.sql`
      SELECT "periodoAoMes" AS periodo,
             SUM("amount")::float AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "productLine"    = ${lineName}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "periodoAoMes"
      ORDER  BY "periodoAoMes"
    `),
    prisma.$queryRaw<SellerRaw[]>(Prisma.sql`
      SELECT "sellerSlug"              AS seller_slug,
             MAX("sellerName")         AS seller_name,
             SUM("amount")::float      AS total_amount
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "productLine"    = ${lineName}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "sellerSlug"
      ORDER  BY total_amount DESC
      LIMIT  10
    `),
    prisma.$queryRaw<ClientRaw[]>(Prisma.sql`
      SELECT "customerName" AS customer_name,
             "customerNit"  AS customer_nit,
             SUM("amount")::float AS total_amount
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "productLine"    = ${lineName}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
        AND  "customerName"   IS NOT NULL
      GROUP  BY "customerName", "customerNit"
      ORDER  BY total_amount DESC
      LIMIT  15
    `),
  ]);

  const sellerTotal = sellerRows.reduce((s, r) => s + r.total_amount, 0);

  return {
    lineName,
    trend:      trendRows.map(mapTrendRow),
    topSellers: sellerRows.map(r => ({
      sellerSlug:  r.seller_slug,
      sellerName:  r.seller_name,
      totalAmount: r.total_amount,
      share:       sellerTotal > 0
        ? Math.round((r.total_amount / sellerTotal) * 10000) / 100
        : 0,
    })),
    topClientes: clientRows.map(r => ({
      customerName: r.customer_name ?? "DESCONOCIDO",
      customerNit:  r.customer_nit,
      totalAmount:  r.total_amount,
    })),
  };
}

// ── 9. Customer Detail ────────────────────────────────────────────────────────

export interface CustomerDetailLine   { productLine: string; totalAmount: number; share: number }
export interface CustomerDetailSeller { sellerSlug: string; sellerName: string; totalAmount: number; share: number }

export interface CustomerDetail {
  customerName: string;
  customerNit:  string | null;
  trend:        Array<{ periodo: string; totalAmount: number; txCount: number | null }>;
  topLines:     CustomerDetailLine[];
  topSellers:   CustomerDetailSeller[];
}

export async function getCustomerDetail(
  organizationId:    string,
  customerKey:       string,   // customerNit (preferred) or customerName
  startPeriodo:      string,
  endPeriodo:        string,
): Promise<CustomerDetail> {
  type LineRaw   = { product_line: string; total_amount: number };
  type SellerRaw = { seller_slug: string; seller_name: string; total_amount: number };
  type NameRaw   = { customer_name: string | null; customer_nit: string | null };

  const [trendRows, lineRows, sellerRows, nameRows] = await Promise.all([
    prisma.$queryRaw<TrendRaw[]>(Prisma.sql`
      SELECT "periodoAoMes" AS periodo,
             SUM("amount")::float AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  ("customerNit" = ${customerKey} OR "customerName" = ${customerKey})
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "periodoAoMes"
      ORDER  BY "periodoAoMes"
    `),
    prisma.$queryRaw<LineRaw[]>(Prisma.sql`
      SELECT "productLine" AS product_line,
             SUM("amount")::float AS total_amount
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  ("customerNit" = ${customerKey} OR "customerName" = ${customerKey})
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
        AND  "productLine"    NOT ILIKE 'Total %'
        AND  "productLine"    NOT ILIKE 'Subtotal%'
        AND  "productLine"    NOT ILIKE 'Gran Total%'
      GROUP  BY "productLine"
      ORDER  BY total_amount DESC
      LIMIT  10
    `),
    prisma.$queryRaw<SellerRaw[]>(Prisma.sql`
      SELECT "sellerSlug"         AS seller_slug,
             MAX("sellerName")    AS seller_name,
             SUM("amount")::float AS total_amount
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  ("customerNit" = ${customerKey} OR "customerName" = ${customerKey})
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "sellerSlug"
      ORDER  BY total_amount DESC
      LIMIT  10
    `),
    prisma.$queryRaw<NameRaw[]>(Prisma.sql`
      SELECT MAX("customerName") AS customer_name,
             MAX("customerNit")  AS customer_nit
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  ("customerNit" = ${customerKey} OR "customerName" = ${customerKey})
    `),
  ]);

  const lineTotal   = lineRows.reduce((s, r) => s + r.total_amount, 0);
  const sellerTotal = sellerRows.reduce((s, r) => s + r.total_amount, 0);

  return {
    customerName: nameRows[0]?.customer_name ?? customerKey,
    customerNit:  nameRows[0]?.customer_nit  ?? null,
    trend:        trendRows.map(mapTrendRow),
    topLines:     lineRows.map(r => ({
      productLine: r.product_line,
      totalAmount: r.total_amount,
      share:       lineTotal > 0
        ? Math.round((r.total_amount / lineTotal) * 10000) / 100
        : 0,
    })),
    topSellers: sellerRows.map(r => ({
      sellerSlug:  r.seller_slug,
      sellerName:  r.seller_name,
      totalAmount: r.total_amount,
      share:       sellerTotal > 0
        ? Math.round((r.total_amount / sellerTotal) * 10000) / 100
        : 0,
    })),
  };
}

// ── 10. Branches Summary ──────────────────────────────────────────────────────

export interface BranchSummaryRow {
  storeSlug:      string;
  storeName:      string;
  totalAmount:    number;
  txCount:        number | null;
  avgTicket:      number | null;
  activeSellers:  number;
  lastSaleDate:   string | null;
  share:          number;
}

export async function getBranchesSummary(
  organizationId: string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<BranchSummaryRow[]> {
  type RawRow = {
    store_slug:      string;
    store_name:      string;
    total_amount:    number;
    tx_count:        string | null;
    active_sellers:  string;
    last_sale_date:  string | null;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT "storeSlug"                                           AS store_slug,
           MAX("storeName")                                      AS store_name,
           SUM("amount")::float                                  AS total_amount,
           CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                ELSE CAST(SUM("txCount") AS TEXT) END            AS tx_count,
           CAST(COUNT(DISTINCT "sellerSlug") AS TEXT)            AS active_sellers,
           TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')                AS last_sale_date
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
    GROUP  BY "storeSlug"
    ORDER  BY total_amount DESC
  `);

  const total = rows.reduce((s, r) => s + r.total_amount, 0);
  return rows.map(r => {
    const txCount = r.tx_count != null ? Number(r.tx_count) : null;
    return {
      storeSlug:     r.store_slug,
      storeName:     r.store_name,
      totalAmount:   r.total_amount,
      txCount,
      avgTicket:     txCount != null && txCount > 0
                       ? Math.round((r.total_amount / txCount) * 100) / 100
                       : null,
      activeSellers: Number(r.active_sellers),
      lastSaleDate:  r.last_sale_date,
      share:         total > 0 ? Math.round((r.total_amount / total) * 10000) / 100 : 0,
    };
  });
}

// ── 12. Branch Detail ─────────────────────────────────────────────────────────

export interface BranchTopSeller {
  sellerSlug:  string;
  sellerName:  string;
  totalAmount: number;
  txCount:     number | null;
  share:       number;
}

export interface BranchTopLine {
  productLine: string;
  totalAmount: number;
  txCount:     number | null;
  share:       number;
}

export interface BranchTopClient {
  customerName: string;
  customerNit:  string | null;
  totalAmount:  number;
  txCount:      number | null;
}

export interface BranchDetail {
  storeSlug:       string;
  storeName:       string;
  uniqueCustomers: number;
  activeSellers:   number;
  lastSaleDate:    string | null;
  trend:           Array<{ periodo: string; totalAmount: number; txCount: number | null }>;
  topSellers:      BranchTopSeller[];
  topLines:        BranchTopLine[];
  topClientes:     BranchTopClient[];
}

export async function getBranchDetail(
  organizationId: string,
  storeSlug:      string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<BranchDetail> {
  type SellerRaw = { seller_slug: string; seller_name: string; total_amount: number; tx_count: string | null };
  type LineRaw   = { product_line: string; total_amount: number; tx_count: string | null };
  type ClientRaw = { customer_name: string | null; customer_nit: string | null; total_amount: number; tx_count: string | null };
  type StatsRaw  = {
    store_name:       string | null;
    unique_customers: string;
    active_sellers:   string;
    last_sale_date:   string | null;
  };

  const [trendRows, sellerRows, lineRows, clientRows, statsRows] = await Promise.all([
    prisma.$queryRaw<TrendRaw[]>(Prisma.sql`
      SELECT "periodoAoMes"           AS periodo,
             SUM("amount")::float     AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "storeSlug"      = ${storeSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "periodoAoMes"
      ORDER  BY "periodoAoMes"
    `),
    prisma.$queryRaw<SellerRaw[]>(Prisma.sql`
      SELECT "sellerSlug"              AS seller_slug,
             MAX("sellerName")         AS seller_name,
             SUM("amount")::float      AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "storeSlug"      = ${storeSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "sellerSlug"
      ORDER  BY total_amount DESC
      LIMIT  15
    `),
    prisma.$queryRaw<LineRaw[]>(Prisma.sql`
      SELECT "productLine"         AS product_line,
             SUM("amount")::float  AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "storeSlug"      = ${storeSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
        AND  "productLine"    NOT ILIKE 'Total %'
        AND  "productLine"    NOT ILIKE 'Subtotal%'
        AND  "productLine"    NOT ILIKE 'Gran Total%'
      GROUP  BY "productLine"
      ORDER  BY total_amount DESC
      LIMIT  10
    `),
    prisma.$queryRaw<ClientRaw[]>(Prisma.sql`
      SELECT "customerName"         AS customer_name,
             "customerNit"          AS customer_nit,
             SUM("amount")::float   AS total_amount,
             CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                  ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "storeSlug"      = ${storeSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
        AND  "customerName"   IS NOT NULL
      GROUP  BY "customerName", "customerNit"
      ORDER  BY total_amount DESC
      LIMIT  15
    `),
    prisma.$queryRaw<StatsRaw[]>(Prisma.sql`
      SELECT MAX("storeName")                               AS store_name,
             CAST(COUNT(DISTINCT "customerName") AS TEXT)   AS unique_customers,
             CAST(COUNT(DISTINCT "sellerSlug")   AS TEXT)   AS active_sellers,
             TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')         AS last_sale_date
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "storeSlug"      = ${storeSlug}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
    `),
  ]);

  const sellerTotal = sellerRows.reduce((s, r) => s + r.total_amount, 0);
  const lineTotal   = lineRows.reduce((s, r) => s + r.total_amount, 0);
  const stats       = statsRows[0];

  return {
    storeSlug,
    storeName:       stats?.store_name      ?? storeSlug,
    uniqueCustomers: stats ? Number(stats.unique_customers) : 0,
    activeSellers:   stats ? Number(stats.active_sellers)   : 0,
    lastSaleDate:    stats?.last_sale_date   ?? null,
    trend:      trendRows.map(mapTrendRow),
    topSellers: sellerRows.map(r => ({
      sellerSlug:  r.seller_slug,
      sellerName:  r.seller_name,
      totalAmount: r.total_amount,
      txCount:     r.tx_count != null ? Number(r.tx_count) : null,
      share:       sellerTotal > 0 ? Math.round((r.total_amount / sellerTotal) * 10000) / 100 : 0,
    })),
    topLines: lineRows.map(r => ({
      productLine: r.product_line,
      totalAmount: r.total_amount,
      txCount:     r.tx_count != null ? Number(r.tx_count) : null,
      share:       lineTotal > 0 ? Math.round((r.total_amount / lineTotal) * 10000) / 100 : 0,
    })),
    topClientes: clientRows.map(r => ({
      customerName: r.customer_name ?? "DESCONOCIDO",
      customerNit:  r.customer_nit,
      totalAmount:  r.total_amount,
      txCount:      r.tx_count != null ? Number(r.tx_count) : null,
    })),
  };
}

// ── 13. Vendor Leaderboard ────────────────────────────────────────────────────
// Full leaderboard row: includes avg ticket, unique customers, last sale date,
// and CRM quote count for the same window.

export interface VendorLeaderboardRow {
  sellerSlug:      string;
  sellerName:      string;
  totalAmount:     number;
  txCount:         number | null;
  avgTicket:       number | null;
  uniqueCustomers: number;
  lastSaleDate:    string | null;
  share:           number;
  crmQuotes:       number;
}

export async function getVendorLeaderboard(
  organizationId: string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<VendorLeaderboardRow[]> {
  type SaleRaw = {
    seller_slug:      string;
    seller_name:      string;
    total_amount:     number;
    tx_count:         string | null;
    unique_customers: string;
    last_sale_date:   string | null;
  };
  type CrmRaw = { seller_slug: string; crm_quotes: string };

  const startDate = `${startPeriodo.slice(0, 4)}-${startPeriodo.slice(4)}-01`;
  const ey = Number(endPeriodo.slice(0, 4));
  const em = Number(endPeriodo.slice(4));
  const endDate   = new Date(ey, em, 0).toISOString().slice(0, 10);

  const [saleRows, crmRows] = await Promise.all([
    prisma.$queryRaw<SaleRaw[]>(Prisma.sql`
      SELECT
        "sellerSlug"                              AS seller_slug,
        MAX("sellerName")                         AS seller_name,
        SUM("amount")::float                      AS total_amount,
        CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
             ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count,
        CAST(COUNT(DISTINCT "customerName") AS TEXT) AS unique_customers,
        TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')    AS last_sale_date
      FROM   "SaleRecord"
      WHERE  "organizationId" = ${organizationId}
        AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
      GROUP  BY "sellerSlug"
      ORDER  BY total_amount DESC
    `),
    prisma.$queryRaw<CrmRaw[]>(Prisma.sql`
      SELECT
        "sellerSlug"               AS seller_slug,
        CAST(COUNT(*) AS TEXT)     AS crm_quotes
      FROM   "CRMQuote"
      WHERE  "organizationId" = ${organizationId}
        AND  "sellerSlug"     IS NOT NULL
        AND  "issuedAt"       >= ${startDate}::date
        AND  "issuedAt"       <= ${endDate}::date
      GROUP  BY "sellerSlug"
    `),
  ]);

  const crmMap = new Map(crmRows.map(r => [r.seller_slug, Number(r.crm_quotes)]));
  const total  = saleRows.reduce((s, r) => s + r.total_amount, 0);

  return saleRows.map(r => {
    const txCount = r.tx_count != null ? Number(r.tx_count) : null;
    return {
      sellerSlug:      r.seller_slug,
      sellerName:      r.seller_name,
      totalAmount:     r.total_amount,
      txCount,
      avgTicket:       txCount != null && txCount > 0
                         ? Math.round((r.total_amount / txCount) * 100) / 100
                         : null,
      uniqueCustomers: Number(r.unique_customers),
      lastSaleDate:    r.last_sale_date,
      share:           total > 0 ? Math.round((r.total_amount / total) * 10000) / 100 : 0,
      crmQuotes:       crmMap.get(r.seller_slug) ?? 0,
    };
  });
}

// ── 13. Seller Branch Mix ─────────────────────────────────────────────────────

export interface SellerBranchRow {
  storeSlug:   string;
  storeName:   string;
  totalAmount: number;
  txCount:     number | null;
  share:       number;
}

export async function getSellerBranchMix(
  organizationId: string,
  sellerSlug:     string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<SellerBranchRow[]> {
  type RawRow = {
    store_slug:   string;
    store_name:   string;
    total_amount: number;
    tx_count:     string | null;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      "storeSlug"                               AS store_slug,
      MAX("storeName")                          AS store_name,
      SUM("amount")::float                      AS total_amount,
      CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
           ELSE CAST(SUM("txCount") AS TEXT) END AS tx_count
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  "sellerSlug"     = ${sellerSlug}
      AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
    GROUP  BY "storeSlug"
    ORDER  BY total_amount DESC
  `);

  const total = rows.reduce((s, r) => s + r.total_amount, 0);
  return rows.map(r => ({
    storeSlug:   r.store_slug,
    storeName:   r.store_name,
    totalAmount: r.total_amount,
    txCount:     r.tx_count != null ? Number(r.tx_count) : null,
    share:       total > 0 ? Math.round((r.total_amount / total) * 10000) / 100 : 0,
  }));
}

// ── 14. Seller Recent Quotes (CRM) ────────────────────────────────────────────

export interface SellerQuoteRow {
  id:           string;
  quoteNumber:  string | null;
  status:       string;
  amount:       number;
  issuedAt:     string;
  customerName: string | null;
}

export async function getSellerRecentQuotes(
  organizationId: string,
  sellerSlug:     string,
  limit = 10,
): Promise<SellerQuoteRow[]> {
  type RawRow = {
    id:            string;
    quote_number:  string | null;
    status:        string;
    amount:        number;
    issued_at:     string;
    customer_name: string | null;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      q.id,
      q."quoteNumber"                     AS quote_number,
      q.status::text                      AS status,
      q."amount"::float                   AS amount,
      TO_CHAR(q."issuedAt", 'YYYY-MM-DD') AS issued_at,
      cp.name                             AS customer_name
    FROM   "CRMQuote"              q
    LEFT   JOIN "CustomerProfile"  cp ON cp.id = q."customerId"
    WHERE  q."organizationId" = ${organizationId}
      AND  q."sellerSlug"     = ${sellerSlug}
    ORDER  BY q."issuedAt" DESC
    LIMIT  ${Prisma.raw(String(limit))}
  `);

  return rows.map(r => ({
    id:           r.id,
    quoteNumber:  r.quote_number,
    status:       r.status,
    amount:       r.amount,
    issuedAt:     r.issued_at,
    customerName: r.customer_name,
  }));
}

// ── 15. Seller Overdue Receivables ────────────────────────────────────────────
// CustomerReceivable rows for customers assigned to this seller (via
// CustomerProfile.sellerSlug), open/partial status, daysOverdue > 0.

export interface SellerOverdueRow {
  customerName:  string;
  customerNit:   string | null;
  balanceDue:    number;
  daysOverdue:   number;
  agingBucket:   string;
  invoiceNumber: string | null;
}

export async function getSellerOverdueReceivables(
  organizationId: string,
  sellerSlug:     string,
  limit = 20,
): Promise<SellerOverdueRow[]> {
  type RawRow = {
    customer_name:  string;
    customer_nit:   string | null;
    balance_due:    number;
    days_overdue:   number;
    aging_bucket:   string;
    invoice_number: string | null;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      cr."customerName"          AS customer_name,
      cr."customerNit"           AS customer_nit,
      cr."balanceDue"::float     AS balance_due,
      cr."daysOverdue"           AS days_overdue,
      cr."agingBucket"           AS aging_bucket,
      cr."invoiceNumber"         AS invoice_number
    FROM   "CustomerReceivable" cr
    WHERE  cr."organizationId" = ${organizationId}
      AND  cr.status            NOT IN ('PAID', 'WRITTEN_OFF')
      AND  cr."daysOverdue"     > 0
      AND  (
        cr."customerId" IN (
          SELECT id FROM "CustomerProfile"
          WHERE  "organizationId" = ${organizationId}
            AND  "sellerSlug"     = ${sellerSlug}
        )
        OR cr."customerNit" IN (
          SELECT nit FROM "CustomerProfile"
          WHERE  "organizationId"  = ${organizationId}
            AND  "sellerSlug"      = ${sellerSlug}
            AND  nit               IS NOT NULL
        )
      )
    ORDER  BY cr."daysOverdue" DESC
    LIMIT  ${Prisma.raw(String(limit))}
  `);

  return rows.map(r => ({
    customerName:  r.customer_name,
    customerNit:   r.customer_nit,
    balanceDue:    r.balance_due,
    daysOverdue:   r.days_overdue,
    agingBucket:   r.aging_bucket,
    invoiceNumber: r.invoice_number,
  }));
}

// ── 11. Channels Summary ──────────────────────────────────────────────────────

export interface ChannelSummaryRow {
  channel:      string;
  totalAmount:  number;
  txCount:      number | null;
  avgTicket:    number | null;
  lastSaleDate: string | null;
  share:        number;
}

export async function getChannelsSummary(
  organizationId: string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<ChannelSummaryRow[]> {
  type RawRow = {
    channel:        string;
    total_amount:   number;
    tx_count:       string | null;
    last_sale_date: string | null;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT CAST("channel" AS TEXT)                     AS channel,
           SUM("amount")::float                        AS total_amount,
           CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
                ELSE CAST(SUM("txCount") AS TEXT) END  AS tx_count,
           TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')      AS last_sale_date
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  "periodoAoMes"   BETWEEN ${startPeriodo} AND ${endPeriodo}
    GROUP  BY "channel"
    ORDER  BY total_amount DESC
  `);

  const total = rows.reduce((s, r) => s + r.total_amount, 0);
  return rows.map(r => {
    const txCount = r.tx_count != null ? Number(r.tx_count) : null;
    return {
      channel:      r.channel,
      totalAmount:  r.total_amount,
      txCount,
      avgTicket:    txCount != null && txCount > 0
                      ? Math.round((r.total_amount / txCount) * 100) / 100
                      : null,
      lastSaleDate: r.last_sale_date,
      share:        total > 0 ? Math.round((r.total_amount / total) * 10000) / 100 : 0,
    };
  });
}

// ── Source Mix Report (Fuente 1 vs Fuente 2) ──────────────────────────────────
//
// Returns monthly breakdown of OFICIAL (Fuente 1) vs REMISION (Fuente 2) volume.
// Used in Torre de Control, Finance Planning, and Sales Dashboards.

export interface SourceMixReportRow {
  periodo:        string;   // "YYYYMM"
  oficialAmount:  number;
  remisionAmount: number;
  totalAmount:    number;
  oficialPct:     number;   // 0-100
  remisionPct:    number;   // 0-100
  remisionCount:  number;
}

export async function getSourceMixReport(
  organizationId: string,
  startPeriodo:   string,   // "YYYYMM"
  endPeriodo:     string,   // "YYYYMM"
): Promise<SourceMixReportRow[]> {
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
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) BETWEEN ${startPeriodo} AND ${endPeriodo}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
    GROUP  BY 1, 2
    ORDER  BY 1
  `);

  const byPeriod = new Map<string, SourceMixReportRow>();
  for (const r of rows) {
    const ex = byPeriod.get(r.periodo) ?? {
      periodo: r.periodo, oficialAmount: 0, remisionAmount: 0,
      totalAmount: 0, oficialPct: 0, remisionPct: 0, remisionCount: 0,
    };
    if (r.source === "OFICIAL") {
      ex.oficialAmount += r.amount;
    } else {
      ex.remisionAmount += r.amount;
      ex.remisionCount  += Number(r.count);
    }
    ex.totalAmount = ex.oficialAmount + ex.remisionAmount;
    ex.oficialPct  = ex.totalAmount > 0 ? (ex.oficialAmount  / ex.totalAmount) * 100 : 0;
    ex.remisionPct = ex.totalAmount > 0 ? (ex.remisionAmount / ex.totalAmount) * 100 : 0;
    byPeriod.set(r.periodo, ex);
  }
  return [...byPeriod.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// ── Pending Remision KPIs ─────────────────────────────────────────────────────
//
// Returns seller-level and branch-level remision conversion KPIs for a period.
// "Conversion" = seller has both REMISION and OFICIAL records for the same customer
// within the same period (heuristic — exact matching requires originDocumentRef).

export interface RemisionKpiRow {
  key:             string;   // sellerSlug or storeSlug
  label:           string;   // sellerName or storeName
  remisionAmount:  number;
  oficialAmount:   number;
  conversionRate:  number;   // 0-100 (oficialAmount / totalAmount * 100)
  pendingCount:    number;   // REMISION records with no OFICIAL in same period for same customer
  riskLevel:       "LOW" | "MEDIUM" | "HIGH";
}

export async function getRemisionKpisBySeller(
  organizationId: string,
  periodoAoMes:   string,
): Promise<RemisionKpiRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    seller_slug:    string;
    seller_name:    string;
    source:         string;
    amount:         number;
    rec_count:      string;
  }>>(Prisma.sql`
    SELECT
      "sellerSlug"        AS seller_slug,
      "sellerName"        AS seller_name,
      "sagSourceType"::text AS source,
      SUM("amount")::float8 AS amount,
      CAST(COUNT(*) AS TEXT) AS rec_count
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
    GROUP  BY 1, 2, 3
    ORDER  BY 1
  `);

  const bySlug = new Map<string, { label: string; remisionAmount: number; oficialAmount: number; remisionCount: number }>();
  for (const r of rows) {
    const ex = bySlug.get(r.seller_slug) ?? { label: r.seller_name, remisionAmount: 0, oficialAmount: 0, remisionCount: 0 };
    if (r.source === "OFICIAL")   ex.oficialAmount  += r.amount;
    else                           { ex.remisionAmount += r.amount; ex.remisionCount += Number(r.rec_count); }
    bySlug.set(r.seller_slug, ex);
  }

  return [...bySlug.entries()].map(([slug, v]) => {
    const total          = v.oficialAmount + v.remisionAmount;
    const conversionRate = total > 0 ? (v.oficialAmount / total) * 100 : 100;
    const remisionPct    = 100 - conversionRate;
    return {
      key:             slug,
      label:           v.label,
      remisionAmount:  v.remisionAmount,
      oficialAmount:   v.oficialAmount,
      conversionRate,
      pendingCount:    v.remisionCount,
      riskLevel:       (remisionPct >= 40 ? "HIGH" : remisionPct >= 20 ? "MEDIUM" : "LOW") as "LOW" | "MEDIUM" | "HIGH",
    };
  }).sort((a, b) => a.conversionRate - b.conversionRate); // worst first
}

export async function getRemisionKpisByStore(
  organizationId: string,
  periodoAoMes:   string,
): Promise<RemisionKpiRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    store_slug:   string;
    store_name:   string;
    source:       string;
    amount:       number;
    rec_count:    string;
  }>>(Prisma.sql`
    SELECT
      "storeSlug"           AS store_slug,
      "storeName"           AS store_name,
      "sagSourceType"::text AS source,
      SUM("amount")::float8 AS amount,
      CAST(COUNT(*) AS TEXT) AS rec_count
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
    GROUP  BY 1, 2, 3
    ORDER  BY 1
  `);

  const bySlug = new Map<string, { label: string; remisionAmount: number; oficialAmount: number; remisionCount: number }>();
  for (const r of rows) {
    const ex = bySlug.get(r.store_slug) ?? { label: r.store_name, remisionAmount: 0, oficialAmount: 0, remisionCount: 0 };
    if (r.source === "OFICIAL") ex.oficialAmount  += r.amount;
    else                         { ex.remisionAmount += r.amount; ex.remisionCount += Number(r.rec_count); }
    bySlug.set(r.store_slug, ex);
  }

  return [...bySlug.entries()].map(([slug, v]) => {
    const total          = v.oficialAmount + v.remisionAmount;
    const conversionRate = total > 0 ? (v.oficialAmount / total) * 100 : 100;
    const remisionPct    = 100 - conversionRate;
    return {
      key:             slug,
      label:           v.label,
      remisionAmount:  v.remisionAmount,
      oficialAmount:   v.oficialAmount,
      conversionRate,
      pendingCount:    v.remisionCount,
      riskLevel:       (remisionPct >= 40 ? "HIGH" : remisionPct >= 20 ? "MEDIUM" : "LOW") as "LOW" | "MEDIUM" | "HIGH",
    };
  }).sort((a, b) => a.conversionRate - b.conversionRate);
}

// ── Source-Aware KPI Exports (FUENTE_1 / FUENTE_2) ───────────────────────────
//
// These functions use canonical FUENTE_1 / FUENTE_2 labeling throughout.
// They power:
//   - Sales dashboard source-split cards
//   - Vendor/branch leaderboards with F1/F2 column
//   - Agentik NLP queries ("ventas fuente 1", "remisiones fuente 2", etc.)
//   - Executive tower conversion KPIs
//
// "ventas fuente 1"  → f1Amount (recognized revenue, fiscal truth)
// "remisiones fuente 2" / "ventas despachadas" → f2Amount (dispatch pipeline)
// "conversión despacho a factura" → conversionRate
// "preventa no facturada" → f2Amount where f2 > f1 for same seller/store

export interface SourceKpiRow {
  key:            string;   // sellerSlug or storeSlug or lineSlug
  label:          string;
  // FUENTE_1 — legal revenue (shouldCountForRevenue = true)
  f1Amount:       number;
  f1Label:        "F1 · Oficial";
  // FUENTE_2 — dispatch / remision (shouldCountForRevenue = false)
  f2Amount:       number;
  f2Label:        "F2 · Remisión";
  // Combined
  totalAmount:    number;
  f1SharePct:     number;  // 0-100
  f2SharePct:     number;  // 0-100
  // Conversion
  conversionRate: number;  // F1 / (F1 + F2) × 100
  // Risk
  riskLevel:      "LOW" | "MEDIUM" | "HIGH";
  // Legacy coverage
  legacyCount:    number;  // records with sourceInferredFrom = "legacy"
}

/** Source-split KPIs per seller for a period. Powers "ventas fuente 1 por vendedor". */
export async function getSourceKpisBySeller(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SourceKpiRow[]> {
  return _buildSourceKpis(organizationId, periodoAoMes, "seller");
}

/** Source-split KPIs per store for a period. Powers "sucursales con alta preventa". */
export async function getSourceKpisByStore(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SourceKpiRow[]> {
  return _buildSourceKpis(organizationId, periodoAoMes, "store");
}

/** Source-split KPIs per product line for a period. */
export async function getSourceKpisByLine(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SourceKpiRow[]> {
  return _buildSourceKpis(organizationId, periodoAoMes, "line");
}

async function _buildSourceKpis(
  organizationId: string,
  periodoAoMes:   string,
  dim:            "seller" | "store" | "line",
): Promise<SourceKpiRow[]> {
  const keyCol   = dim === "seller" ? '"sellerSlug"'  : dim === "store" ? '"storeSlug"'  : '"productLine"';
  const labelCol = dim === "seller" ? '"sellerName"'  : dim === "store" ? '"storeName"'  : '"productLine"';

  const rows = await prisma.$queryRaw<Array<{
    dim_key:      string;
    dim_label:    string;
    source:       string;
    amount:       number;
    legacy_count: string;
  }>>(Prisma.sql`
    SELECT
      ${Prisma.raw(keyCol)}   AS dim_key,
      ${Prisma.raw(labelCol)} AS dim_label,
      "sagSourceType"::text   AS source,
      SUM("amount")::float8   AS amount,
      CAST(COUNT(*) FILTER (WHERE "sourceInferredFrom" = 'legacy') AS TEXT) AS legacy_count
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${periodoAoMes}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
    GROUP  BY 1, 2, 3
    ORDER  BY 1
  `);

  const byKey = new Map<string, { label: string; f1: number; f2: number; legacyCount: number }>();
  for (const r of rows) {
    const ex = byKey.get(r.dim_key) ?? { label: r.dim_label, f1: 0, f2: 0, legacyCount: 0 };
    if (r.source === "OFICIAL") ex.f1 += r.amount; else ex.f2 += r.amount;
    ex.legacyCount += Number(r.legacy_count);
    byKey.set(r.dim_key, ex);
  }

  return [...byKey.entries()].map(([key, v]) => {
    const total          = v.f1 + v.f2;
    const conversionRate = total > 0 ? (v.f1 / total) * 100 : 100;
    const f2Pct          = total > 0 ? (v.f2 / total) * 100 : 0;
    return {
      key,
      label:          v.label,
      f1Amount:       v.f1,
      f1Label:        "F1 · Oficial"  as const,
      f2Amount:       v.f2,
      f2Label:        "F2 · Remisión" as const,
      totalAmount:    total,
      f1SharePct:     total > 0 ? (v.f1 / total) * 100 : 100,
      f2SharePct:     f2Pct,
      conversionRate,
      riskLevel:      (f2Pct >= 40 ? "HIGH" : f2Pct >= 20 ? "MEDIUM" : "LOW") as "LOW" | "MEDIUM" | "HIGH",
      legacyCount:    v.legacyCount,
    };
  }).sort((a, b) => a.conversionRate - b.conversionRate);
}

// ── Agentik NLP Query Functions ───────────────────────────────────────────────
//
// Thin wrappers that give the Agentik query layer named intent functions.
// The Agentik orchestrator maps NLP intents to these by function name.

/** "Ventas fuente 1 / ventas facturadas" — recognized revenue only (F1). */
export async function getVentasFuente1(
  organizationId: string,
  periodoAoMes:   string,
): Promise<{ label: string; amount: number; periodo: string }[]> {
  const rows = await getSourceKpisBySeller(organizationId, periodoAoMes);
  const total = rows.reduce((s, r) => s + r.f1Amount, 0);
  return [{ label: "Ventas Fuente 1 (facturadas)", amount: total, periodo: periodoAoMes }];
}

/** "Remisiones fuente 2 / ventas despachadas" — dispatch pipeline only (F2). */
export async function getRemisionesFuente2(
  organizationId: string,
  periodoAoMes:   string,
): Promise<{ label: string; amount: number; periodo: string }[]> {
  const rows = await getSourceKpisBySeller(organizationId, periodoAoMes);
  const total = rows.reduce((s, r) => s + r.f2Amount, 0);
  return [{ label: "Remisiones Fuente 2 (despachadas)", amount: total, periodo: periodoAoMes }];
}

/** "Vendedores con mayor conversión despacho a factura" — best F2→F1 converters. */
export async function getVendedoresMayorConversion(
  organizationId: string,
  periodoAoMes:   string,
  limit           = 10,
): Promise<SourceKpiRow[]> {
  const rows = await getSourceKpisBySeller(organizationId, periodoAoMes);
  return rows
    .filter(r => r.f2Amount > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, limit);
}

/** "Sucursales con alta preventa no facturada" — stores with high F2 exposure. */
export async function getSucursalesAltaPreventa(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SourceKpiRow[]> {
  const rows = await getSourceKpisByStore(organizationId, periodoAoMes);
  return rows
    .filter(r => r.f2Amount > r.f1Amount)   // more dispatch than invoiced
    .sort((a, b) => b.f2Amount - a.f2Amount);
}

/** "Líneas con mayor peso de remisión" — product lines with highest F2 share. */
export async function getLineasAltaRemision(
  organizationId: string,
  periodoAoMes:   string,
): Promise<SourceKpiRow[]> {
  const rows = await getSourceKpisByLine(organizationId, periodoAoMes);
  return rows
    .filter(r => r.f2Amount > 0)
    .sort((a, b) => b.f2SharePct - a.f2SharePct);
}
