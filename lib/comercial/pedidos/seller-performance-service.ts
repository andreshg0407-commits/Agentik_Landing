/**
 * lib/comercial/pedidos/seller-performance-service.ts
 *
 * Executive seller performance dashboard.
 *
 * Data sources:
 *   - SAG MOVIMIENTOS.ka_nl_tercero_vend → vendor identity
 *   - CustomerOrderRecord + CustomerOrderLine → order metrics
 *   - ProductEntity → subgrupo enrichment
 *   - variant-enrichment-service → color name resolution
 *
 * Sprint: PEDIDOS-VENDEDOR-PERFORMANCE-01
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SellerKpis {
  totalOrders:       number;
  totalValue:        number;
  totalUnits:        number;
  totalCustomers:    number;
  avgTicket:         number;
}

export interface SellerRecentOrder {
  consecutivo:   number;
  customerName:  string;
  orderDate:     string;  // ISO
  totalValue:    number;
  totalUnits:    number;
}

export interface SellerTopClient {
  customerName:  string;
  customerNit:   string;
  orders:        number;
  totalValue:    number;
}

export interface SellerRankEntry {
  key:     string;
  label:   string;
  units:   number;
  value:   number;
  pct:     number;
}

export interface SellerAlert {
  type:    "stockout" | "low_stock" | "top_rotation" | "inactive_client";
  label:   string;
  detail:  string;
}

export interface SellerPerformance {
  sellerName:      string;
  sellerCode:      string | null;
  source:          string;

  kpis:            SellerKpis;
  recentOrders:    SellerRecentOrder[];
  topClients:      SellerTopClient[];
  topSubgrupos:    SellerRankEntry[];
  topSizes:        SellerRankEntry[];
  topColors:       SellerRankEntry[];
  alerts:          SellerAlert[];

  computedAt:      string;
}

// ─── SAG config ───────────────────────────────────────────────────────────────

function getSagConfig() {
  return {
    token: process.env.PYA_SOAP_TOKEN ?? "",
    endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    database: process.env.PYA_SAG_BD ?? "",
  };
}

// ─── Color map cache ──────────────────────────────────────────────────────────

let colorCache: Map<string, string> | null = null;
let colorCacheAt = 0;

async function getColorMap(orgId: string): Promise<Map<string, string>> {
  if (colorCache && Date.now() - colorCacheAt < 5 * 60 * 1000) return colorCache;
  const db = prisma as any;
  const map = new Map<string, string>();

  const attrs = await db.$queryRaw`
    SELECT DISTINCT "externalRef" AS code, "value" AS name
    FROM "ProductVariantAttribute"
    WHERE "organizationId" = ${orgId}
    AND "key" = 'color' AND "externalRef" IS NOT NULL
  ` as any[];
  for (const a of attrs) if (a.code && a.name) map.set(a.code, a.name);

  const variants = await db.$queryRaw`
    SELECT DISTINCT SPLIT_PART(v."sku", '|', 3) AS code,
      CASE WHEN v."name" LIKE '%/%' THEN TRIM(SPLIT_PART(v."name", '/', 2)) ELSE v."name" END AS color_name
    FROM "ProductVariant" v
    WHERE v."organizationId" = ${orgId}
    AND v."sku" LIKE '%|%|%' AND SPLIT_PART(v."sku", '|', 3) != ''
  ` as any[];
  for (const v of variants) if (v.code && v.color_name && !map.has(v.code)) map.set(v.code, v.color_name);

  colorCache = map;
  colorCacheAt = Date.now();
  return map;
}

// ─── Resolve seller's SAG orders ──────────────────────────────────────────────

/**
 * Get all SAG erpMovIds for a specific vendor (ka_nl_tercero_vend).
 */
async function getSellerOrderIds(sellerCode: string): Promise<number[]> {
  const config = getSagConfig();
  if (!config.token || !config.database) return [];

  try {
    const rows = await consultaSagJson(config, `
      SELECT ka_nl_movimiento
      FROM MOVIMIENTOS
      WHERE ka_ni_fuente = 40
      AND sc_anulado = 'N'
      AND ka_nl_tercero_vend = ${Number(sellerCode)}
    `);
    return rows.map((r: any) => Number(r.ka_nl_movimiento));
  } catch {
    return [];
  }
}

// ─── Main performance builder ─────────────────────────────────────────────────

export async function getSellerPerformance(
  orgId: string,
  sellerName: string,
  sellerCode: string | null,
  source: string,
): Promise<SellerPerformance> {
  const db = prisma as any;
  const empty: SellerPerformance = {
    sellerName, sellerCode, source,
    kpis: { totalOrders: 0, totalValue: 0, totalUnits: 0, totalCustomers: 0, avgTicket: 0 },
    recentOrders: [], topClients: [], topSubgrupos: [], topSizes: [], topColors: [], alerts: [],
    computedAt: new Date().toISOString(),
  };

  if (!sellerName) return empty;

  const t0 = Date.now();
  const log = (step: string, detail?: any) =>
    console.log(`[seller-perf] ${step}`, { ms: Date.now() - t0, ...detail });

  // Step 1: Get this seller's SAG order IDs
  let erpMovIds: number[] = [];
  const validCode = sellerCode && sellerCode.trim() !== "" && Number(sellerCode) > 0;
  if (validCode) {
    erpMovIds = await getSellerOrderIds(sellerCode);
    log("step1:sag_order_ids", { count: erpMovIds.length, sellerCode });
  } else {
    log("step1:skip_invalid_code", { sellerCode });
  }

  if (erpMovIds.length === 0) return empty;

  // Step 2: Find matching CustomerOrderRecords
  const erpMovIdStrings = erpMovIds.map(String);
  const orders = await db.$queryRaw`
    SELECT r."id", r."erpMovId", r."orderDate", r."customerNit",
           r."customerName", r."amount"
    FROM "CustomerOrderRecord" r
    WHERE r."organizationId" = ${orgId}
    AND r."erpMovId"::text = ANY(${erpMovIdStrings})
    ORDER BY r."orderDate" DESC
  ` as any[];

  log("step2:customer_orders", { count: orders.length });

  if (orders.length === 0) return empty;

  const orderIds = orders.map((o: any) => o.id);

  // Step 3: KPIs
  const lineAgg = await db.$queryRaw`
    SELECT SUM(l."quantity")::float AS total_units,
           SUM(l."quantity" * l."unitValue")::float AS total_value
    FROM "CustomerOrderLine" l
    WHERE l."orderId" = ANY(${orderIds})
  ` as any[];

  const totalUnits = Math.round(lineAgg[0]?.total_units ?? 0);
  const totalValue = Math.round(lineAgg[0]?.total_value ?? 0);
  const customers = new Set(orders.map((o: any) => o.customerNit).filter(Boolean));

  const kpis: SellerKpis = {
    totalOrders:   orders.length,
    totalValue,
    totalUnits,
    totalCustomers: customers.size,
    avgTicket:      orders.length > 0 ? Math.round(totalValue / orders.length) : 0,
  };
  log("step3:kpis", { totalOrders: orders.length, totalUnits, totalValue });

  // Step 4: Recent orders
  const recentOrders: SellerRecentOrder[] = orders.slice(0, 10).map((o: any) => ({
    consecutivo:  Number(o.erpMovId) || 0,
    customerName: o.customerName ?? "\u2014",
    orderDate:    o.orderDate instanceof Date ? o.orderDate.toISOString() : String(o.orderDate ?? ""),
    totalValue:   Number(o.amount) || 0,
    totalUnits:   0, // enriched below
  }));

  // Enrich recent orders with line totals
  for (const ro of recentOrders) {
    const match = orders.find((o: any) => (Number(o.erpMovId) || 0) === ro.consecutivo);
    if (match) {
      const lu = await db.$queryRaw`
        SELECT SUM("quantity")::float AS units FROM "CustomerOrderLine" WHERE "orderId" = ${match.id}
      ` as any[];
      ro.totalUnits = Math.round(lu[0]?.units ?? 0);
    }
  }

  // Step 5: Top clients
  const clientRows = await db.$queryRaw`
    SELECT r."customerNit", r."customerName",
           COUNT(*)::int AS orders,
           SUM(r."amount")::float AS total_value
    FROM "CustomerOrderRecord" r
    WHERE r."organizationId" = ${orgId}
    AND r."erpMovId"::text = ANY(${erpMovIdStrings})
    AND r."customerName" IS NOT NULL
    GROUP BY r."customerNit", r."customerName"
    ORDER BY SUM(r."amount") DESC
    LIMIT 10
  ` as any[];

  const topClients: SellerTopClient[] = clientRows.map((c: any) => ({
    customerName: c.customerName ?? "\u2014",
    customerNit:  c.customerNit ?? "",
    orders:       c.orders,
    totalValue:   Math.round(c.total_value ?? 0),
  }));

  // Step 6: Top subgrupos
  const subRows = await db.$queryRaw`
    SELECT p."subgrupoSag" AS key,
           SUM(l."quantity")::float AS units,
           SUM(l."quantity" * l."unitValue")::float AS value
    FROM "CustomerOrderLine" l
    JOIN "ProductEntity" p ON p."organizationId" = l."organizationId" AND p."sku" = l."referenceCode"
    WHERE l."orderId" = ANY(${orderIds})
    AND p."subgrupoSag" IS NOT NULL
    GROUP BY p."subgrupoSag"
    ORDER BY SUM(l."quantity") DESC
    LIMIT 10
  ` as any[];

  const topSubgrupos: SellerRankEntry[] = subRows.map((r: any) => ({
    key:   r.key,
    label: r.key,
    units: Math.round(r.units ?? 0),
    value: Math.round(r.value ?? 0),
    pct:   totalUnits > 0 ? Math.round(((r.units ?? 0) / totalUnits) * 1000) / 10 : 0,
  }));

  // Step 7: Top sizes
  const sizeRows = await db.$queryRaw`
    SELECT l."size" AS key, SUM(l."quantity")::float AS units
    FROM "CustomerOrderLine" l
    WHERE l."orderId" = ANY(${orderIds})
    AND l."size" IS NOT NULL AND l."size" != 'GEN'
    GROUP BY l."size"
    ORDER BY SUM(l."quantity") DESC
    LIMIT 10
  ` as any[];

  const topSizes: SellerRankEntry[] = sizeRows.map((r: any) => ({
    key:   r.key,
    label: r.key,
    units: Math.round(r.units ?? 0),
    value: 0,
    pct:   totalUnits > 0 ? Math.round(((r.units ?? 0) / totalUnits) * 1000) / 10 : 0,
  }));

  // Step 8: Top colors
  const colorMap = await getColorMap(orgId);
  const colorRows = await db.$queryRaw`
    SELECT l."color" AS key, SUM(l."quantity")::float AS units
    FROM "CustomerOrderLine" l
    WHERE l."orderId" = ANY(${orderIds})
    AND l."color" IS NOT NULL AND l."color" != 'GEN'
    GROUP BY l."color"
    ORDER BY SUM(l."quantity") DESC
    LIMIT 10
  ` as any[];

  const topColors: SellerRankEntry[] = colorRows.map((r: any) => ({
    key:   r.key,
    label: colorMap.get(r.key) ?? r.key,
    units: Math.round(r.units ?? 0),
    value: 0,
    pct:   totalUnits > 0 ? Math.round(((r.units ?? 0) / totalUnits) * 1000) / 10 : 0,
  }));

  // Step 9: Alerts
  const alerts: SellerAlert[] = [];

  // Stockout refs sold by this seller
  const stockoutRefs = await db.$queryRaw`
    SELECT DISTINCT l."referenceCode" AS ref, l."articleName" AS name
    FROM "CustomerOrderLine" l
    JOIN "ProductEntity" p ON p."organizationId" = l."organizationId" AND p."sku" = l."referenceCode"
    LEFT JOIN (
      SELECT "productId", SUM("quantity") AS stock
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${orgId}
      GROUP BY "productId"
    ) inv ON inv."productId" = p."id"
    WHERE l."orderId" = ANY(${orderIds})
    AND (inv.stock IS NULL OR inv.stock <= 0)
    LIMIT 5
  ` as any[];

  for (const r of stockoutRefs) {
    alerts.push({
      type: "stockout",
      label: r.ref,
      detail: `${r.name ?? r.ref} \u2014 sin stock`,
    });
  }

  // Inactive clients (ordered > 90 days ago, not since)
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const inactiveClients = await db.$queryRaw`
    SELECT r."customerName", MAX(r."orderDate") AS last_order
    FROM "CustomerOrderRecord" r
    WHERE r."organizationId" = ${orgId}
    AND r."erpMovId"::text = ANY(${erpMovIdStrings})
    GROUP BY r."customerName"
    HAVING MAX(r."orderDate") < ${since90}
    ORDER BY MAX(r."orderDate") ASC
    LIMIT 3
  ` as any[];

  for (const c of inactiveClients) {
    const lastDate = c.last_order instanceof Date ? c.last_order.toISOString().slice(0, 10) : "";
    alerts.push({
      type: "inactive_client",
      label: c.customerName ?? "\u2014",
      detail: `Ultimo pedido: ${lastDate}`,
    });
  }

  return {
    sellerName, sellerCode, source,
    kpis,
    recentOrders,
    topClients,
    topSubgrupos,
    topSizes,
    topColors,
    alerts,
    computedAt: new Date().toISOString(),
  };
}
