/**
 * lib/comercial/tiendas/store-intelligence-service.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-MVP-01 — Store Sales Intelligence Service
 *
 * Period: 2026 only (orderDate >= 2026-01-01 AND < 2027-01-01).
 *
 * Answers 4 commercial questions per store:
 *   1. Which references sell the most in 2026?  → topReferences
 *   2. Which have low rotation?                 → lowRotation
 *   3. How much does the store sell monthly?    → monthlySales (2026 months only)
 *   4. What's the growth trend?                 → monthlySales
 *
 * Data source: CustomerOrderLine (product-level) + CustomerOrderRecord (FACTURADO).
 * SaleRecord is NOT used — it has 0% productCode coverage.
 *
 * Architecture:
 *   - Pure SQL aggregation via Prisma $queryRawUnsafe
 *   - 2026-only filter on all queries
 *   - Enriched with imageUrl (via loadHeroImageMap), currentQty (via detail)
 *   - Cached per (orgId, storeId) with 5 min TTL
 *   - Zero SOAP, zero external calls
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { CANONICAL_STORE_IDENTITY, getCanonicalStoreDetail, loadHeroImageMap } from "./store-distribution-service";
import { computeDaysInStore, resolveDiscountTier } from "./store-discount-types";
import { loadStoreSales } from "./store-sales-service";
import type {
  StoreIntelligenceResponse,
  StoreTopReference,
  StoreMonthSales,
  StoreLowRotationRef,
  StoreIntelligenceKpis,
} from "./store-intelligence-types";
import { INTELLIGENCE_YEAR, MONTH_LABELS, resolveDataQuality, resolveRotationSpeed } from "./store-intelligence-types";

// ── Period boundaries ───────────────────────────────────────────────────────

const YEAR_START = `${INTELLIGENCE_YEAR}-01-01`;
const YEAR_END   = `${INTELLIGENCE_YEAR + 1}-01-01`;

// ── Slug → warehouseId mapping (reverse of CANONICAL_STORE_IDENTITY) ────────

const SLUG_TO_WAREHOUSE_PK: Record<string, number> = {};
for (const [pk, identity] of Object.entries(CANONICAL_STORE_IDENTITY)) {
  SLUG_TO_WAREHOUSE_PK[identity.slug] = Number(pk);
}

// ── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: StoreIntelligenceResponse; ts: number }>();
const inflight = new Map<string, Promise<StoreIntelligenceResponse>>();

function getCached(key: string): StoreIntelligenceResponse | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function loadStoreIntelligence(
  orgId: string,
  storeId: string,
): Promise<StoreIntelligenceResponse> {
  const cacheKey = `storeIntel:${orgId}:${storeId}:${INTELLIGENCE_YEAR}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = loadStoreIntelligenceImpl(orgId, storeId, cacheKey);
  inflight.set(cacheKey, promise);
  promise.finally(() => inflight.delete(cacheKey));
  return promise;
}

// ── Implementation ──────────────────────────────────────────────────────────

async function loadStoreIntelligenceImpl(
  orgId: string,
  storeId: string,
  cacheKey: string,
): Promise<StoreIntelligenceResponse> {
  const warehousePk = SLUG_TO_WAREHOUSE_PK[storeId];
  const identity = Object.values(CANONICAL_STORE_IDENTITY).find(i => i.slug === storeId);

  if (warehousePk === undefined || !identity) {
    return buildEmptyResponse(storeId, storeId);
  }

  const db = prisma as any;

  // Parallel: SQL aggregations + canonical detail + hero images + certified sales
  const [topRefsRaw, monthlyRaw, totalRefsRaw, detail, heroImageMap, certifiedSales] = await Promise.all([
    // Top references by units sold (2026 only, FACTURADO)
    db.$queryRawUnsafe(`
      SELECT l."referenceCode",
             MAX(l."articleName") as article_name,
             SUM(CASE WHEN l.quantity > 0 THEN l.quantity ELSE 0 END)::int as units_sold,
             SUM(CASE WHEN l.quantity > 0 THEN l.quantity * l."unitValue" ELSE 0 END)::float as revenue,
             COUNT(DISTINCT r.id)::int as order_count,
             MAX(r."orderDate") as last_sale
      FROM "CustomerOrderLine" l
      JOIN "CustomerOrderRecord" r ON l."orderId" = r.id
      WHERE l."organizationId" = $1
        AND l."warehouseId" = $2
        AND r.status = 'FACTURADO'
        AND r."orderDate" >= $3
        AND r."orderDate" < $4
        AND l."referenceCode" != ''
        AND l.quantity > 0
      GROUP BY l."referenceCode"
      ORDER BY units_sold DESC
      LIMIT 20
    `, orgId, warehousePk, YEAR_START, YEAR_END),

    // Monthly sales (2026 only, FACTURADO)
    db.$queryRawUnsafe(`
      SELECT DATE_TRUNC('month', r."orderDate") as month,
             SUM(CASE WHEN l.quantity > 0 THEN l.quantity ELSE 0 END)::int as units_sold,
             SUM(CASE WHEN l.quantity < 0 THEN ABS(l.quantity) ELSE 0 END)::int as returned,
             SUM(CASE WHEN l.quantity > 0 THEN l.quantity * l."unitValue" ELSE 0 END)::float as revenue,
             COUNT(DISTINCT l."referenceCode")::int as unique_refs
      FROM "CustomerOrderLine" l
      JOIN "CustomerOrderRecord" r ON l."orderId" = r.id
      WHERE l."organizationId" = $1
        AND l."warehouseId" = $2
        AND r.status = 'FACTURADO'
        AND r."orderDate" >= $3
        AND r."orderDate" < $4
      GROUP BY DATE_TRUNC('month', r."orderDate")
      ORDER BY month ASC
    `, orgId, warehousePk, YEAR_START, YEAR_END),

    // Total unique references count in 2026
    db.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT l."referenceCode")::int as total_refs
      FROM "CustomerOrderLine" l
      JOIN "CustomerOrderRecord" r ON l."orderId" = r.id
      WHERE l."organizationId" = $1
        AND l."warehouseId" = $2
        AND r.status = 'FACTURADO'
        AND r."orderDate" >= $3
        AND r."orderDate" < $4
        AND l."referenceCode" != ''
        AND l.quantity > 0
    `, orgId, warehousePk, YEAR_START, YEAR_END),

    // Canonical store detail for inventory + low rotation
    getCanonicalStoreDetail(orgId, storeId),

    // Hero images
    loadHeroImageMap(orgId),

    // Certified store sales from SaleRecord (fuente code → store mapping)
    loadStoreSales(orgId, storeId),
  ]);

  // ── Build image + inventory lookup from detail ─────────────────────────

  const refToProductId = new Map<string, string>();
  const refToQty = new Map<string, number>();
  const refToProductName = new Map<string, string>();
  const refToEntryDate = new Map<string, string | null>();

  if (detail) {
    for (const item of detail.items) {
      refToQty.set(item.referenceCode, (refToQty.get(item.referenceCode) ?? 0) + item.currentUnits);
      if (!refToProductName.has(item.referenceCode)) {
        refToProductName.set(item.referenceCode, item.productName);
      }
      if (!refToEntryDate.has(item.referenceCode)) {
        refToEntryDate.set(item.referenceCode, item.entryDate);
      }
    }
  }

  // Build refCode → imageUrl via detail.refToProductId + heroImageMap
  // The detail exposes refToProductId indirectly via items
  const refToImage = new Map<string, string | null>();
  if (detail) {
    for (const item of detail.items) {
      if (!refToImage.has(item.referenceCode)) {
        refToImage.set(item.referenceCode, item.imageUrl);
      }
    }
  }

  // ── Top references ──────────────────────────────────────────────────────

  const dataMonthsCount = (monthlyRaw as any[]).length;

  const topReferences: StoreTopReference[] = (topRefsRaw as any[]).map(r => {
    const lastSale = r.last_sale ? (r.last_sale as Date).toISOString().slice(0, 10) : null;
    const unitsSold = r.units_sold ?? 0;
    return {
      referenceCode: r.referenceCode,
      articleName:   r.article_name ?? refToProductName.get(r.referenceCode) ?? "",
      imageUrl:      refToImage.get(r.referenceCode) ?? null,
      unitsSold,
      revenue:       r.revenue ?? 0,
      orderCount:    r.order_count ?? 0,
      lastSaleDate:  lastSale,
      currentQty:    refToQty.get(r.referenceCode) ?? 0,
      rotationSpeed: resolveRotationSpeed(unitsSold, dataMonthsCount),
    };
  });

  // ── Monthly sales ───────────────────────────────────────────────────────

  const monthlySales: StoreMonthSales[] = (monthlyRaw as any[]).map(m => {
    const monthStr = m.month ? (m.month as Date).toISOString().slice(0, 7) : "????-??";
    const mm = monthStr.slice(5, 7);
    return {
      month:      monthStr,
      label:      MONTH_LABELS[mm] ?? mm,
      unitsSold:  m.units_sold ?? 0,
      returned:   m.returned ?? 0,
      revenue:    m.revenue ?? 0,
      uniqueRefs: m.unique_refs ?? 0,
    };
  });

  // ── Low rotation (cross-reference inventory with 2026 sales) ────────────

  const lowRotation: StoreLowRotationRef[] = [];
  if (detail) {
    // Get 2026 sales per reference
    const sales2026Raw = await db.$queryRawUnsafe(`
      SELECT l."referenceCode",
             SUM(CASE WHEN l.quantity > 0 THEN l.quantity ELSE 0 END)::int as units_sold,
             SUM(CASE WHEN l.quantity > 0 THEN l.quantity * l."unitValue" ELSE 0 END)::float as revenue,
             MAX(r."orderDate") as last_sale
      FROM "CustomerOrderLine" l
      JOIN "CustomerOrderRecord" r ON l."orderId" = r.id
      WHERE l."organizationId" = $1
        AND l."warehouseId" = $2
        AND r.status = 'FACTURADO'
        AND r."orderDate" >= $3
        AND r."orderDate" < $4
        AND l."referenceCode" != ''
      GROUP BY l."referenceCode"
    `, orgId, warehousePk, YEAR_START, YEAR_END);

    const salesByRef = new Map<string, { units: number; revenue: number; lastSale: string | null }>();
    for (const s of sales2026Raw as any[]) {
      salesByRef.set(s.referenceCode, {
        units: s.units_sold ?? 0,
        revenue: s.revenue ?? 0,
        lastSale: s.last_sale ? (s.last_sale as Date).toISOString().slice(0, 10) : null,
      });
    }

    // Deduplicate by referenceCode (detail.items has one row per variant)
    const seenRefs = new Set<string>();

    for (const item of detail.items) {
      if (seenRefs.has(item.referenceCode)) continue;
      seenRefs.add(item.referenceCode);

      const totalQty = refToQty.get(item.referenceCode) ?? 0;
      if (totalQty <= 0) continue;

      const days = computeDaysInStore(item.entryDate);
      if (days === null || days < 30) continue;

      const sales = salesByRef.get(item.referenceCode);
      const unitsSold2026 = sales?.units ?? 0;

      // Low rotation: 30+ days with <=2 units sold in 2026
      if (unitsSold2026 <= 2) {
        const { percent, tier } = resolveDiscountTier(days);
        const lastSaleDate = sales?.lastSale ?? null;
        const daysSinceLastSale = lastSaleDate
          ? Math.floor((Date.now() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        lowRotation.push({
          referenceCode:    item.referenceCode,
          articleName:      item.productName ?? item.referenceCode,
          imageUrl:         item.imageUrl,
          daysInStore:      days,
          currentQty:       totalQty,
          unitsSold2026,
          revenue2026:      sales?.revenue ?? 0,
          lastSaleDate,
          daysSinceLastSale,
          discountPercent:  percent,
          discountTier:     tier,
        });
      }
    }

    // Sort by daysInStore DESC, limit to 30
    lowRotation.sort((a, b) => (b.daysInStore ?? 0) - (a.daysInStore ?? 0));
    lowRotation.splice(30);
  }

  // ── KPIs (from monthly totals — includes ALL refs, not just top 20) ──────

  const totalUnitsSold = monthlySales.reduce((s, m) => s + m.unitsSold, 0);
  const totalRevenue   = monthlySales.reduce((s, m) => s + m.revenue, 0);
  const uniqueRefs     = (totalRefsRaw as any[])[0]?.total_refs ?? topReferences.length;
  const dataMonths     = monthlySales.length;
  const avgMonthlyRevenue = dataMonths > 0 ? Math.round(totalRevenue / dataMonths) : 0;

  const kpis: StoreIntelligenceKpis = {
    totalRevenue,
    totalUnitsSold,
    uniqueReferences: uniqueRefs,
    dataMonths,
    avgMonthlyRevenue,
  };

  // ── Data quality ────────────────────────────────────────────────────────

  const { quality, note } = resolveDataQuality(dataMonths, uniqueRefs);

  // ── Certified sales from SaleRecord (fuente code → store mapping) ─────────

  const hasCertifiedSales = certifiedSales != null && certifiedSales.kpis.invoiceCount > 0;

  const result: StoreIntelligenceResponse = {
    storeId,
    storeName: identity.name,
    year: INTELLIGENCE_YEAR,
    kpis,
    topReferences,
    monthlySales,
    lowRotation,
    dataQuality: quality,
    dataQualityNote: note,
    salesSourceStatus: hasCertifiedSales ? "CERTIFIED" : "NOT_CERTIFIED",
    salesSourceNote: hasCertifiedSales
      ? `Ventas certificadas por codigo documental SAG (${certifiedSales!.kpis.invoiceCount} facturas, ` +
        `${certifiedSales!.kpis.creditNoteCount} notas credito). ` +
        `Fuente: SaleRecord con mapeo canonico FC/FD/FG/FA → tienda.`
      : "Ventas por tienda pendientes de certificacion. " +
        "SAG factura el 90% de las ventas contra Bodega Principal (B01), no contra bodegas de tienda. " +
        "Se requiere ID_BODEGA en vw_agentik_ventas para mapeo confiable.",
    certifiedSales: certifiedSales ? certifiedSales.kpis : null,
    certifiedMonthly: certifiedSales?.monthly ?? [],
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ── Empty response ──────────────────────────────────────────────────────────

function buildEmptyResponse(storeId: string, storeName: string): StoreIntelligenceResponse {
  return {
    storeId,
    storeName,
    year: INTELLIGENCE_YEAR,
    kpis: {
      totalRevenue: 0,
      totalUnitsSold: 0,
      uniqueReferences: 0,
      dataMonths: 0,
      avgMonthlyRevenue: 0,
    },
    topReferences: [],
    monthlySales: [],
    lowRotation: [],
    dataQuality: "SIN_DATOS",
    dataQualityNote: "Sin ventas facturadas registradas en 2026.",
    salesSourceStatus: "NOT_CERTIFIED",
    salesSourceNote: "Ventas por tienda pendientes de certificacion. " +
      "SAG factura contra Bodega Principal (B01), no contra bodegas de tienda.",
    certifiedSales: null,
    certifiedMonthly: [],
  };
}
