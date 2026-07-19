/**
 * lib/comercial/demand/variant-demand-analytics.ts
 *
 * Variant-level demand analytics.
 *
 * Answers: what tallas, colores, combinaciones, refs, and subgrupos
 * are driving demand? Uses real CustomerOrderLine data + variant enrichment.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */
import "server-only";

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VariantDemandEntry {
  key:       string;    // e.g., "4" for size, "AZ3" for color code
  label:     string;    // resolved name: "AZUL OSCURO", "PIJAMA LL 2-8"
  units:     number;
  orders:    number;
  pct:       number;    // percentage of total units
}

export interface CombinationDemandEntry {
  size:      string;
  color:     string;
  colorName: string;
  units:     number;
  orders:    number;
}

export interface VariantDemandMetrics {
  computedAt:       string;
  windowDays:       number;
  totalUnits:       number;
  totalOrders:      number;

  topSizes:         VariantDemandEntry[];
  topColors:        VariantDemandEntry[];
  topCombinations:  CombinationDemandEntry[];
  topRefs:          VariantDemandEntry[];
  topSubgrupos:     VariantDemandEntry[];
}

// ─── Color map builder (reuses variant-enrichment-service pattern) ────────────

async function buildColorMap(orgId: string): Promise<Map<string, string>> {
  const db = prisma as any;
  const map = new Map<string, string>();

  // Source 1: ProductVariantAttribute
  const attrs = await db.$queryRaw`
    SELECT DISTINCT "externalRef" AS code, "value" AS name
    FROM "ProductVariantAttribute"
    WHERE "organizationId" = ${orgId}
    AND "key" = 'color'
    AND "externalRef" IS NOT NULL
  ` as any[];
  for (const a of attrs) {
    if (a.code && a.name) map.set(a.code, a.name);
  }

  // Source 2: ProductVariant name parsing (e.g., "4 / AZUL REY" → code from SKU)
  const variants = await db.$queryRaw`
    SELECT DISTINCT
      SPLIT_PART(v."sku", '|', 3) AS code,
      CASE
        WHEN v."name" LIKE '%/%' THEN TRIM(SPLIT_PART(v."name", '/', 2))
        ELSE v."name"
      END AS color_name
    FROM "ProductVariant" v
    WHERE v."organizationId" = ${orgId}
    AND v."sku" LIKE '%|%|%'
    AND SPLIT_PART(v."sku", '|', 3) != ''
  ` as any[];
  for (const v of variants) {
    if (v.code && v.color_name && !map.has(v.code)) map.set(v.code, v.color_name);
  }

  return map;
}

// ─── Main analytics ───────────────────────────────────────────────────────────

export async function getVariantDemandMetrics(
  orgId: string,
  opts: { days?: number; limit?: number } = {},
): Promise<VariantDemandMetrics> {
  const db = prisma as any;
  const days  = opts.days ?? 30;
  const limit = opts.limit ?? 10;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const colorMap = await buildColorMap(orgId);

  // Total units + orders in window
  const totalRow = await db.$queryRaw`
    SELECT SUM(l."quantity")::float AS units,
           COUNT(DISTINCT r."id")::int AS orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
  ` as any[];
  const totalUnits  = totalRow[0]?.units ?? 0;
  const totalOrders = totalRow[0]?.orders ?? 0;

  // Top sizes
  const sizeRows = await db.$queryRaw`
    SELECT l."size" AS key, SUM(l."quantity")::float AS units,
           COUNT(DISTINCT r."id")::int AS orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND l."size" IS NOT NULL AND l."size" != 'GEN'
    GROUP BY l."size"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  ` as any[];

  const topSizes: VariantDemandEntry[] = sizeRows.map((r: any) => ({
    key:   r.key,
    label: r.key, // sizes are already human-readable
    units: Math.round(r.units),
    orders: r.orders,
    pct:   totalUnits > 0 ? Math.round((r.units / totalUnits) * 1000) / 10 : 0,
  }));

  // Top colors
  const colorRows = await db.$queryRaw`
    SELECT l."color" AS key, SUM(l."quantity")::float AS units,
           COUNT(DISTINCT r."id")::int AS orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND l."color" IS NOT NULL AND l."color" != 'GEN'
    GROUP BY l."color"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  ` as any[];

  const topColors: VariantDemandEntry[] = colorRows.map((r: any) => ({
    key:   r.key,
    label: colorMap.get(r.key) ?? r.key,
    units: Math.round(r.units),
    orders: r.orders,
    pct:   totalUnits > 0 ? Math.round((r.units / totalUnits) * 1000) / 10 : 0,
  }));

  // Top combinations (size × color)
  const comboRows = await db.$queryRaw`
    SELECT l."size", l."color", SUM(l."quantity")::float AS units,
           COUNT(DISTINCT r."id")::int AS orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND l."size" IS NOT NULL AND l."size" != 'GEN'
    AND l."color" IS NOT NULL AND l."color" != 'GEN'
    GROUP BY l."size", l."color"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  ` as any[];

  const topCombinations: CombinationDemandEntry[] = comboRows.map((r: any) => ({
    size:      r.size,
    color:     r.color,
    colorName: colorMap.get(r.color) ?? r.color,
    units:     Math.round(r.units),
    orders:    r.orders,
  }));

  // Top refs
  const refRows = await db.$queryRaw`
    SELECT l."referenceCode" AS key, l."articleName" AS label,
           SUM(l."quantity")::float AS units,
           COUNT(DISTINCT r."id")::int AS orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    GROUP BY l."referenceCode", l."articleName"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  ` as any[];

  const topRefs: VariantDemandEntry[] = refRows.map((r: any) => ({
    key:   r.key,
    label: r.label ?? r.key,
    units: Math.round(r.units),
    orders: r.orders,
    pct:   totalUnits > 0 ? Math.round((r.units / totalUnits) * 1000) / 10 : 0,
  }));

  // Top subgrupos
  const subRows = await db.$queryRaw`
    SELECT p."subgrupoSag" AS key, SUM(l."quantity")::float AS units,
           COUNT(DISTINCT r."id")::int AS orders
    FROM "CustomerOrderLine" l
    JOIN "ProductEntity" p ON p."organizationId" = l."organizationId" AND p."sku" = l."referenceCode"
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND p."subgrupoSag" IS NOT NULL
    GROUP BY p."subgrupoSag"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  ` as any[];

  const topSubgrupos: VariantDemandEntry[] = subRows.map((r: any) => ({
    key:   r.key,
    label: r.key,
    units: Math.round(r.units),
    orders: r.orders,
    pct:   totalUnits > 0 ? Math.round((r.units / totalUnits) * 1000) / 10 : 0,
  }));

  return {
    computedAt:      new Date().toISOString(),
    windowDays:      days,
    totalUnits:      Math.round(totalUnits),
    totalOrders,
    topSizes,
    topColors,
    topCombinations,
    topRefs,
    topSubgrupos,
  };
}
