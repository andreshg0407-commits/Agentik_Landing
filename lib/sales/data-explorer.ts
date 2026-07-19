/**
 * Data Explorer — flexible query layer for SaleRecord exploration.
 *
 * Provides filter options, dataset queries (sales rows, customer aggregates,
 * product-line mix), and KPI aggregation for the interactive Data Explorer UI.
 * All money values are cast to float8 in SQL so JS receives plain numbers.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ── Public types ──────────────────────────────────────────────────────────────

export type ExplorerDataset = "sales" | "orders" | "customers" | "line_mix";

export interface ExplorerFilters {
  period?:      string;   // "YYYYMM"
  seller?:      string;   // sellerSlug
  customer?:    string;   // partial match on customerName
  productLine?: string;   // exact match
  channel?:     string;   // SaleChannel value
  q?:           string;   // free text: matches sellerName, customerName, productLine
  amountMin?:   number;
  amountMax?:   number;
}

export interface ExplorerKpis {
  totalSales:      number;
  totalOrders:     number | null;  // null when any row has txCount NULL
  uniqueCustomers: number;
  avgTicket:       number | null;
  rowCount:        number;
}

export interface FilterOptions {
  periods:      string[];                            // YYYYMM, desc order
  sellers:      Array<{ slug: string; name: string }>;
  productLines: string[];
  channels:     string[];
}

// Row types for each dataset
export interface SalesRow {
  id:           string;
  saleDate:     string;           // YYYY-MM-DD
  periodoAoMes: string | null;
  sellerName:   string;
  storeName:    string;
  productLine:  string;
  channel:      string;
  amount:       number;
  txCount:      number | null;
  customerName: string | null;
  customerNit:  string | null;
}

export interface CustomerRow {
  customerName:  string;
  customerNit:   string | null;
  totalVentas:   number;
  totalPedidos:  number | null;
  avgTicket:     number | null;
  ultimaFecha:   string;
  periodos:      number;          // distinct periodoAoMes count
}

export interface LineMixRow {
  productLine: string;
  ventas:      number;
  pedidos:     number | null;
  avgTicket:   number | null;
  share:       number;            // 0–100
}

export type DatasetRow = SalesRow | CustomerRow | LineMixRow;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the shared WHERE conditions array from an organizationId + filters.
 * Always includes the technical product-line exclusions.
 */
function buildConditions(
  organizationId: string,
  filters: ExplorerFilters,
): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"organizationId" = ${organizationId}`,
    Prisma.sql`"productLine" NOT ILIKE 'Total %'`,
    Prisma.sql`"productLine" NOT ILIKE 'Subtotal%'`,
  ];

  if (filters.period)      conditions.push(Prisma.sql`"periodoAoMes" = ${filters.period}`);
  if (filters.seller)      conditions.push(Prisma.sql`"sellerSlug" = ${filters.seller}`);
  if (filters.productLine) conditions.push(Prisma.sql`"productLine" = ${filters.productLine}`);
  if (filters.channel)     conditions.push(Prisma.sql`CAST("channel" AS TEXT) = ${filters.channel}`);

  if (filters.customer) {
    const pat = `%${filters.customer}%`;
    conditions.push(Prisma.sql`"customerName" ILIKE ${pat}`);
  }

  if (filters.q) {
    const pat = `%${filters.q}%`;
    conditions.push(
      Prisma.sql`(
        "sellerName"   ILIKE ${pat} OR
        "customerName" ILIKE ${pat} OR
        "productLine"  ILIKE ${pat}
      )`,
    );
  }

  if (filters.amountMin != null) conditions.push(Prisma.sql`"amount" >= ${filters.amountMin}`);
  if (filters.amountMax != null) conditions.push(Prisma.sql`"amount" <= ${filters.amountMax}`);

  return conditions;
}

// ── getFilterOptions ──────────────────────────────────────────────────────────

export async function getFilterOptions(organizationId: string): Promise<FilterOptions> {
  type PeriodRaw  = { periodoaomes: string };
  type SellerRaw  = { slug: string; name: string };
  type LineRaw    = { productline: string };
  type ChanRaw    = { channel: string };

  const [periodRows, sellerRows, lineRows, chanRows] = await Promise.all([
    prisma.$queryRaw<PeriodRaw[]>(Prisma.sql`
      SELECT DISTINCT "periodoAoMes" AS periodoaomes
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "periodoAoMes" IS NOT NULL
      ORDER BY 1 DESC
      LIMIT 36
    `),
    prisma.$queryRaw<SellerRaw[]>(Prisma.sql`
      SELECT DISTINCT "sellerSlug" AS slug, MAX("sellerName") AS name
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
      GROUP BY "sellerSlug"
      ORDER BY name
    `),
    prisma.$queryRaw<LineRaw[]>(Prisma.sql`
      SELECT DISTINCT "productLine" AS productline
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "productLine" NOT ILIKE 'Total %'
        AND "productLine" NOT ILIKE 'Subtotal%'
      ORDER BY 1
    `),
    prisma.$queryRaw<ChanRaw[]>(Prisma.sql`
      SELECT DISTINCT CAST("channel" AS TEXT) AS channel
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
      ORDER BY 1
    `),
  ]);

  return {
    periods:      periodRows.map(r => r.periodoaomes),
    sellers:      sellerRows.map(r => ({ slug: r.slug, name: r.name })),
    productLines: lineRows.map(r => r.productline),
    channels:     chanRows.map(r => r.channel),
  };
}

// ── querySalesRows ────────────────────────────────────────────────────────────

export async function querySalesRows(
  organizationId: string,
  filters: ExplorerFilters,
  grain: "TRANSACTION" | "AGGREGATED" | "ALL" = "ALL",
): Promise<SalesRow[]> {
  type RawRow = {
    id:           string;
    sale_date:    string;
    periodoaomes: string | null;
    seller_name:  string;
    store_name:   string;
    product_line: string;
    channel:      string;
    amount:       number;
    tx_count:     string | null;
    customer_name: string | null;
    customer_nit:  string | null;
  };

  const conditions = buildConditions(organizationId, filters);
  if (grain !== "ALL") {
    conditions.push(Prisma.sql`"grain" = ${grain}::"SaleGrain"`);
  }

  const where = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      id,
      TO_CHAR("saleDate", 'YYYY-MM-DD')          AS sale_date,
      "periodoAoMes"                              AS periodoaomes,
      "sellerName"                                AS seller_name,
      "storeName"                                 AS store_name,
      "productLine"                               AS product_line,
      CAST("channel" AS TEXT)                     AS channel,
      "amount"::float8                            AS amount,
      CAST("txCount" AS TEXT)                     AS tx_count,
      "customerName"                              AS customer_name,
      "customerNit"                               AS customer_nit
    FROM "SaleRecord"
    WHERE ${where}
    ORDER BY "saleDate" DESC
    LIMIT 500
  `);

  return rows.map(r => ({
    id:           r.id,
    saleDate:     r.sale_date,
    periodoAoMes: r.periodoaomes,
    sellerName:   r.seller_name,
    storeName:    r.store_name,
    productLine:  r.product_line,
    channel:      r.channel,
    amount:       r.amount,
    txCount:      r.tx_count != null ? Number(r.tx_count) : null,
    customerName: r.customer_name,
    customerNit:  r.customer_nit,
  }));
}

// ── queryCustomerRows ─────────────────────────────────────────────────────────

export async function queryCustomerRows(
  organizationId: string,
  filters: ExplorerFilters,
): Promise<CustomerRow[]> {
  type RawRow = {
    customer_name:  string;
    customer_nit:   string | null;
    total_ventas:   number;
    total_pedidos:  string | null;
    ultima_fecha:   string;
    periodos:       string;
  };

  const conditions = buildConditions(organizationId, filters);
  conditions.push(Prisma.sql`"customerName" IS NOT NULL`);

  const where = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      "customerName"                                  AS customer_name,
      "customerNit"                                   AS customer_nit,
      SUM("amount")::float8                           AS total_ventas,
      CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
           ELSE CAST(SUM("txCount") AS TEXT) END      AS total_pedidos,
      TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')          AS ultima_fecha,
      CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)    AS periodos
    FROM "SaleRecord"
    WHERE ${where}
    GROUP BY "customerName", "customerNit"
    ORDER BY total_ventas DESC
    LIMIT 200
  `);

  return rows.map(r => {
    const pedidos = r.total_pedidos != null ? Number(r.total_pedidos) : null;
    return {
      customerName: r.customer_name,
      customerNit:  r.customer_nit,
      totalVentas:  r.total_ventas,
      totalPedidos: pedidos,
      avgTicket:    pedidos != null && pedidos > 0
                      ? Math.round((r.total_ventas / pedidos) * 100) / 100
                      : null,
      ultimaFecha:  r.ultima_fecha,
      periodos:     Number(r.periodos),
    };
  });
}

// ── queryLineMixRows ──────────────────────────────────────────────────────────

export async function queryLineMixRows(
  organizationId: string,
  filters: ExplorerFilters,
): Promise<LineMixRow[]> {
  type RawRow = {
    product_line:  string;
    ventas:        number;
    pedidos:       string | null;
  };

  const conditions = buildConditions(organizationId, filters);
  const where = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      "productLine"                                    AS product_line,
      SUM("amount")::float8                            AS ventas,
      CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
           ELSE CAST(SUM("txCount") AS TEXT) END       AS pedidos
    FROM "SaleRecord"
    WHERE ${where}
    GROUP BY "productLine"
    ORDER BY ventas DESC
  `);

  const total = rows.reduce((s, r) => s + r.ventas, 0);

  return rows.map(r => {
    const pedidos = r.pedidos != null ? Number(r.pedidos) : null;
    return {
      productLine: r.product_line,
      ventas:      r.ventas,
      pedidos,
      avgTicket:   pedidos != null && pedidos > 0
                     ? Math.round((r.ventas / pedidos) * 100) / 100
                     : null,
      share:       total > 0 ? Math.round((r.ventas / total) * 10000) / 100 : 0,
    };
  });
}

// ── queryDataset ──────────────────────────────────────────────────────────────

export async function queryDataset(
  organizationId: string,
  dataset: ExplorerDataset,
  filters: ExplorerFilters,
): Promise<DatasetRow[]> {
  switch (dataset) {
    case "sales":     return querySalesRows(organizationId, filters, "ALL");
    case "orders":    return querySalesRows(organizationId, filters, "AGGREGATED");
    case "customers": return queryCustomerRows(organizationId, filters);
    case "line_mix":  return queryLineMixRows(organizationId, filters);
  }
}

// ── queryExplorerKpis ─────────────────────────────────────────────────────────

export async function queryExplorerKpis(
  organizationId: string,
  _dataset: ExplorerDataset,
  filters: ExplorerFilters,
): Promise<ExplorerKpis> {
  type KpiRaw = {
    total_sales:      number;
    total_orders:     string | null;
    unique_customers: string;
    row_count:        string;
  };

  const conditions = buildConditions(organizationId, filters);
  const where = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<KpiRaw[]>(Prisma.sql`
    SELECT
      SUM("amount")::float8                                                AS total_sales,
      CASE WHEN COUNT(*) FILTER (WHERE "txCount" IS NULL) > 0 THEN NULL
           ELSE CAST(SUM("txCount") AS TEXT) END                          AS total_orders,
      CAST(COUNT(DISTINCT "customerName") AS TEXT)                        AS unique_customers,
      CAST(COUNT(*) AS TEXT)                                              AS row_count
    FROM "SaleRecord"
    WHERE ${where}
  `);

  const row = rows[0];
  const totalSales  = row?.total_sales ?? 0;
  const totalOrders = row?.total_orders != null ? Number(row.total_orders) : null;

  return {
    totalSales,
    totalOrders,
    uniqueCustomers: row?.unique_customers != null ? Number(row.unique_customers) : 0,
    avgTicket:       totalOrders != null && totalOrders > 0
                       ? Math.round((totalSales / totalOrders) * 100) / 100
                       : null,
    rowCount: row?.row_count != null ? Number(row.row_count) : 0,
  };
}
