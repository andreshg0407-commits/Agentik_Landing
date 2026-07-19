/**
 * lib/comercial/demand/demand-engine.ts
 *
 * Core demand snapshot engine.
 *
 * Reads real data from:
 *   - CustomerOrderLine + CustomerOrderRecord → demand velocity
 *   - ProductInventoryLevel → current stock
 *   - ProductEntity → product metadata (subgrupoSag, productLine)
 *   - CommercialCoverageSnapshot → existing coverage signals
 *
 * NO simulated data. NO heuristics. NO inferred production.
 * Every number comes from Prisma → SAG-synced tables.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */
import "server-only";

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemandRefEntry {
  refCode:         string;
  productName:     string;
  subgrupoSag:     string | null;
  productLine:     string | null;

  // Demand (from CustomerOrderLine)
  totalOrdered:    number;    // all-time units ordered
  last30dOrdered:  number;    // units ordered in last 30 days
  last7dOrdered:   number;    // units ordered in last 7 days
  dailyVelocity:   number;    // last30dOrdered / 30
  orderCount30d:   number;    // distinct orders in last 30 days
  customerCount30d: number;   // distinct customers in last 30 days

  // Stock (from ProductInventoryLevel)
  currentStock:    number;    // sum of quantity across warehouses
  reservedStock:   number;    // sum of reservedQty

  // Coverage
  coverageDays:    number | null;  // currentStock / dailyVelocity (null if velocity=0)
  coverageStatus:  CoverageBand;
}

export type CoverageBand =
  | "sin_stock"            // currentStock <= 0
  | "ruptura_inminente"    // coverageDays < 7
  | "cobertura_baja"       // coverageDays < 15
  | "cobertura_estable"    // coverageDays < 30
  | "cobertura_alta"       // coverageDays >= 30
  | "sin_demanda";         // dailyVelocity = 0

export interface DemandSnapshot {
  organizationId:   string;
  computedAt:       string;  // ISO

  // Summary
  totalRefs:        number;
  refsWithDemand:   number;
  refsWithStock:    number;
  refsInStockout:   number;
  refsRuptureImminent: number;

  // Velocity summary
  totalUnits30d:    number;
  totalOrders30d:   number;
  avgDailyVelocity: number;

  // Stock summary
  totalStock:       number;
  totalReserved:    number;

  // Per-ref data (sorted by dailyVelocity DESC)
  entries:          DemandRefEntry[];
}

// ─── Coverage band logic ──────────────────────────────────────────────────────

function toCoverageBand(stock: number, velocity: number, coverageDays: number | null): CoverageBand {
  if (stock <= 0) return "sin_stock";
  if (velocity <= 0) return "sin_demanda";
  if (coverageDays !== null && coverageDays < 7) return "ruptura_inminente";
  if (coverageDays !== null && coverageDays < 15) return "cobertura_baja";
  if (coverageDays !== null && coverageDays < 30) return "cobertura_estable";
  return "cobertura_alta";
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Build a complete demand snapshot from real data.
 * Pure Prisma reads — no side effects.
 */
export async function buildDemandSnapshot(orgId: string): Promise<DemandSnapshot> {
  const db = prisma as any;
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Demand by ref: all-time + 30d + 7d
  const demandRows = await db.$queryRaw`
    SELECT
      l."referenceCode"                                      AS ref,
      SUM(l."quantity")::float                               AS total_ordered,
      SUM(CASE WHEN r."orderDate" >= ${since30d} THEN l."quantity" ELSE 0 END)::float AS last30d,
      SUM(CASE WHEN r."orderDate" >= ${since7d}  THEN l."quantity" ELSE 0 END)::float AS last7d,
      COUNT(DISTINCT CASE WHEN r."orderDate" >= ${since30d} THEN r."id" END)::int     AS orders_30d,
      COUNT(DISTINCT CASE WHEN r."orderDate" >= ${since30d} THEN r."customerNit" END)::int AS customers_30d
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    GROUP BY l."referenceCode"
  ` as any[];

  const demandMap = new Map<string, {
    totalOrdered: number; last30d: number; last7d: number;
    orders30d: number; customers30d: number;
  }>();
  for (const row of demandRows) {
    demandMap.set(row.ref, {
      totalOrdered: row.total_ordered ?? 0,
      last30d:      row.last30d ?? 0,
      last7d:       row.last7d ?? 0,
      orders30d:    row.orders_30d ?? 0,
      customers30d: row.customers_30d ?? 0,
    });
  }

  // 2. Stock by productId (sum across warehouses)
  const stockRows = await db.$queryRaw`
    SELECT
      p."sku"                          AS ref,
      SUM(pil."quantity")::int         AS stock,
      SUM(pil."reservedQty")::int      AS reserved
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId"
    WHERE pil."organizationId" = ${orgId}
    GROUP BY p."sku"
  ` as any[];

  const stockMap = new Map<string, { stock: number; reserved: number }>();
  for (const row of stockRows) {
    if (row.ref) stockMap.set(row.ref, { stock: row.stock ?? 0, reserved: row.reserved ?? 0 });
  }

  // 3. Product metadata
  const products = await db.$queryRaw`
    SELECT "sku", "name", "subgrupoSag", "productLine"
    FROM "ProductEntity"
    WHERE "organizationId" = ${orgId}
    AND "sku" IS NOT NULL
  ` as any[];

  const productMap = new Map<string, { name: string; subgrupoSag: string | null; productLine: string | null }>();
  for (const p of products) {
    if (p.sku) productMap.set(p.sku, {
      name:         p.name ?? p.sku,
      subgrupoSag:  p.subgrupoSag ?? null,
      productLine:  p.productLine ?? null,
    });
  }

  // 4. Build entries — union of all refs from demand + stock + products
  const allRefs = new Set<string>();
  for (const ref of demandMap.keys()) allRefs.add(ref);
  for (const ref of stockMap.keys()) allRefs.add(ref);

  const entries: DemandRefEntry[] = [];

  for (const ref of allRefs) {
    const demand  = demandMap.get(ref);
    const stock   = stockMap.get(ref);
    const product = productMap.get(ref);

    const totalOrdered   = demand?.totalOrdered ?? 0;
    const last30dOrdered = demand?.last30d ?? 0;
    const last7dOrdered  = demand?.last7d ?? 0;
    const dailyVelocity  = last30dOrdered / 30;
    const currentStock   = stock?.stock ?? 0;
    const reservedStock  = stock?.reserved ?? 0;
    const coverageDays   = dailyVelocity > 0
      ? Math.round((currentStock / dailyVelocity) * 10) / 10
      : null;

    entries.push({
      refCode:          ref,
      productName:      product?.name ?? ref,
      subgrupoSag:      product?.subgrupoSag ?? null,
      productLine:      product?.productLine ?? null,
      totalOrdered,
      last30dOrdered,
      last7dOrdered,
      dailyVelocity:    Math.round(dailyVelocity * 100) / 100,
      orderCount30d:    demand?.orders30d ?? 0,
      customerCount30d: demand?.customers30d ?? 0,
      currentStock,
      reservedStock,
      coverageDays,
      coverageStatus:   toCoverageBand(currentStock, dailyVelocity, coverageDays),
    });
  }

  // Sort by dailyVelocity DESC (highest demand first)
  entries.sort((a, b) => b.dailyVelocity - a.dailyVelocity);

  // 5. Summaries
  const refsWithDemand      = entries.filter(e => e.dailyVelocity > 0).length;
  const refsWithStock       = entries.filter(e => e.currentStock > 0).length;
  const refsInStockout      = entries.filter(e => e.coverageStatus === "sin_stock").length;
  const refsRuptureImminent = entries.filter(e => e.coverageStatus === "ruptura_inminente").length;
  const totalUnits30d       = entries.reduce((a, e) => a + e.last30dOrdered, 0);
  const totalOrders30d      = entries.reduce((a, e) => a + e.orderCount30d, 0);
  const totalStock          = entries.reduce((a, e) => a + e.currentStock, 0);
  const totalReserved       = entries.reduce((a, e) => a + e.reservedStock, 0);

  return {
    organizationId: orgId,
    computedAt:     now.toISOString(),
    totalRefs:      entries.length,
    refsWithDemand,
    refsWithStock,
    refsInStockout,
    refsRuptureImminent,
    totalUnits30d:    Math.round(totalUnits30d),
    totalOrders30d,
    avgDailyVelocity: refsWithDemand > 0
      ? Math.round((totalUnits30d / 30) * 100) / 100
      : 0,
    totalStock,
    totalReserved,
    entries,
  };
}
