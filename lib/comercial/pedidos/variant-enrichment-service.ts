/**
 * lib/comercial/pedidos/variant-enrichment-service.ts
 *
 * PEDIDOS-VARIANT-ENRICHMENT-01
 *
 * Resolves SAG color codes (AZ3, RJ1, etc.) to real names (AZUL OSCURO, ROJO)
 * and enriches order lines with subgrupoSag + productLine from ProductEntity.
 *
 * Data sources (no heuristics):
 *   - ProductVariant.sku pattern: "REF|TALLA|COLOR_CODE"
 *   - ProductVariant.name pattern: "TALLA / COLOR_NAME"
 *   - ProductVariantAttribute (key="color", externalRef=code, value=name)
 *   - ProductEntity.subgrupoSag, ProductEntity.productLine
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrderLine } from "./order-types";

// ── Color code → name resolution ────────────────────────────────────────────

/** In-memory cache: orgId → Map<colorCode, colorName> */
const colorMapCache = new Map<string, { map: Map<string, string>; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build a color code → name lookup from ProductVariant data.
 * Two sources merged (ProductVariantAttribute takes priority):
 *   1. ProductVariantAttribute where key="color" and externalRef is set
 *   2. ProductVariant.sku "REF|TALLA|CODE" + name "TALLA / NAME"
 */
async function buildColorMap(orgId: string): Promise<Map<string, string>> {
  const cached = colorMapCache.get(orgId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.map;

  const db = prisma as any;
  const map = new Map<string, string>();

  // Source 1: variant name parsing (broader coverage — 91 codes)
  const variants: Array<{ sku: string; name: string }> = await db.$queryRaw`
    SELECT DISTINCT
      SPLIT_PART(v."sku", '|', 3) as code,
      CASE
        WHEN v."name" LIKE '%/%' THEN TRIM(SPLIT_PART(v."name", '/', 2))
        ELSE v."name"
      END as color_name
    FROM "ProductVariant" v
    WHERE v."organizationId" = ${orgId}
    AND v."sku" LIKE '%|%|%'
    AND SPLIT_PART(v."sku", '|', 3) != ''
  `;
  for (const v of variants as any[]) {
    if (v.code && v.color_name) map.set(v.code, v.color_name);
  }

  // Source 2: ProductVariantAttribute (higher quality — overrides)
  const attrs: Array<{ code: string; name: string }> = await db.$queryRaw`
    SELECT DISTINCT a."externalRef" as code, a."value" as name
    FROM "ProductVariantAttribute" a
    WHERE a."organizationId" = ${orgId}
    AND a."key" = 'color'
    AND a."externalRef" IS NOT NULL
  `;
  for (const a of attrs as any[]) {
    if (a.code && a.name) map.set(a.code, a.name);
  }

  colorMapCache.set(orgId, { map, ts: Date.now() });
  return map;
}

/** Resolve a single color code to its name. Returns null if unknown. */
export async function resolveColorName(
  orgId: string,
  colorCode: string | null | undefined,
): Promise<string | null> {
  if (!colorCode) return null;
  const map = await buildColorMap(orgId);
  return map.get(colorCode) ?? null;
}

// ── Product enrichment (subgrupo + productLine) ─────────────────────────────

interface ProductEnrichment {
  subgrupoSag: string | null;
  productLine: string | null;
}

/** In-memory cache: orgId → Map<sku, ProductEnrichment> */
const productCache = new Map<string, { map: Map<string, ProductEnrichment>; ts: number }>();

async function buildProductMap(orgId: string): Promise<Map<string, ProductEnrichment>> {
  const cached = productCache.get(orgId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.map;

  const db = prisma as any;
  const rows: Array<{ sku: string; subgrupoSag: string | null; productLine: string | null }> =
    await db.$queryRaw`
      SELECT "sku", "subgrupoSag", "productLine"
      FROM "ProductEntity"
      WHERE "organizationId" = ${orgId}
      AND "sku" IS NOT NULL
    `;

  const map = new Map<string, ProductEnrichment>();
  for (const r of rows) {
    if (r.sku) {
      map.set(r.sku, { subgrupoSag: r.subgrupoSag, productLine: r.productLine });
    }
  }

  productCache.set(orgId, { map, ts: Date.now() });
  return map;
}

// ── Line enrichment ─────────────────────────────────────────────────────────

/**
 * Enrich order lines with resolved color names, subgrupo, and product line.
 * Mutates lines in place and returns them.
 */
export async function enrichOrderLinesWithVariants(
  orgId: string,
  lines: OrderLine[],
): Promise<OrderLine[]> {
  if (lines.length === 0) return lines;

  const [colorMap, productMap] = await Promise.all([
    buildColorMap(orgId),
    buildProductMap(orgId),
  ]);

  for (const line of lines) {
    // Color resolution
    if (line.color && !line.colorName) {
      line.colorName = colorMap.get(line.color) ?? null;
    }

    // Product enrichment
    if (line.referenceCode && (!line.subgrupoSag || !line.productLine)) {
      const pe = productMap.get(line.referenceCode);
      if (pe) {
        if (!line.subgrupoSag) line.subgrupoSag = pe.subgrupoSag;
        if (!line.productLine) line.productLine = pe.productLine;
      }
    }
  }

  return lines;
}

// ── Commercial variant metrics ──────────────────────────────────────────────

export interface VariantMetricEntry {
  value: string;
  units: number;
  orders: number;
}

export interface CommercialVariantMetrics {
  topSizes:     VariantMetricEntry[];
  topColors:    VariantMetricEntry[];
  topSubgrupos: VariantMetricEntry[];
  period: { label: string; since: Date };
}

/**
 * Compute commercial variant metrics for a given org and time window.
 * Used by Pedidos, Maletas, Tiendas, Inventario, Produccion, Radar Comercial.
 */
export async function getCommercialVariantMetrics(
  orgId: string,
  opts?: { since?: Date; limit?: number },
): Promise<CommercialVariantMetrics> {
  const db = prisma as any;
  const since = opts?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const limit = opts?.limit ?? 10;

  const colorMap = await buildColorMap(orgId);

  // Top sizes
  const sizeRows: Array<{ size: string; units: number; orders: number }> = await db.$queryRaw`
    SELECT l."size" as size,
           SUM(l."quantity")::float as units,
           COUNT(DISTINCT l."orderId")::int as orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND l."size" IS NOT NULL AND l."size" != 'GEN'
    GROUP BY l."size"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  `;

  // Top colors (resolved)
  const colorRows: Array<{ color: string; units: number; orders: number }> = await db.$queryRaw`
    SELECT l."color" as color,
           SUM(l."quantity")::float as units,
           COUNT(DISTINCT l."orderId")::int as orders
    FROM "CustomerOrderLine" l
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND l."color" IS NOT NULL AND l."color" != 'GEN'
    GROUP BY l."color"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  `;

  // Top subgrupos
  const subgrupoRows: Array<{ subgrupo: string; units: number; orders: number }> = await db.$queryRaw`
    SELECT p."subgrupoSag" as subgrupo,
           SUM(l."quantity")::float as units,
           COUNT(DISTINCT l."orderId")::int as orders
    FROM "CustomerOrderLine" l
    JOIN "ProductEntity" p ON p."organizationId" = l."organizationId" AND p."sku" = l."referenceCode"
    JOIN "CustomerOrderRecord" r ON r."id" = l."orderId"
    WHERE l."organizationId" = ${orgId}
    AND r."orderDate" >= ${since}
    AND p."subgrupoSag" IS NOT NULL
    GROUP BY p."subgrupoSag"
    ORDER BY SUM(l."quantity") DESC
    LIMIT ${limit}
  `;

  // Resolve color names
  const topColors = colorRows.map(r => ({
    value: colorMap.get(r.color) ?? r.color,
    units: r.units,
    orders: r.orders,
  }));

  return {
    topSizes: sizeRows.map(r => ({ value: r.size, units: r.units, orders: r.orders })),
    topColors,
    topSubgrupos: subgrupoRows.map(r => ({ value: r.subgrupo, units: r.units, orders: r.orders })),
    period: { label: "Ultimos 30 dias", since },
  };
}
