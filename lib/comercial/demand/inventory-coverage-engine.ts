/**
 * lib/comercial/demand/inventory-coverage-engine.ts
 *
 * Inventory coverage engine for the demand layer.
 *
 * Crosses demand velocity (CustomerOrderLine) with current stock
 * (ProductInventoryLevel) to produce coverage snapshots per ref.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { CoverageBand, DemandRefEntry } from "./demand-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoverageRefSnapshot {
  refCode:          string;
  productName:      string;
  subgrupoSag:      string | null;

  // Stock
  currentStock:     number;
  reservedStock:    number;
  netStock:         number;    // currentStock - reservedStock

  // Demand
  dailyVelocity:    number;
  last30dOrdered:   number;

  // Coverage
  coverageDays:     number | null;
  coverageStatus:   CoverageBand;

  // Warehouse distribution
  warehouseCount:   number;
  primaryWarehouse: string | null;
}

export interface CoverageDistribution {
  sin_stock:           number;
  ruptura_inminente:   number;
  cobertura_baja:      number;
  cobertura_estable:   number;
  cobertura_alta:      number;
  sin_demanda:         number;
}

export interface CoverageSummary {
  computedAt:        string;
  totalRefs:         number;
  refsWithCoverage:  number;
  avgCoverageDays:   number | null;
  distribution:      CoverageDistribution;
  critical:          CoverageRefSnapshot[];  // sin_stock + ruptura_inminente with demand
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Build coverage summary from demand entries (pre-computed by demand-engine).
 * Pure function — no Prisma calls, works from DemandRefEntry[].
 */
export function buildCoverageSummary(entries: DemandRefEntry[]): CoverageSummary {
  const distribution: CoverageDistribution = {
    sin_stock: 0,
    ruptura_inminente: 0,
    cobertura_baja: 0,
    cobertura_estable: 0,
    cobertura_alta: 0,
    sin_demanda: 0,
  };

  const snapshots: CoverageRefSnapshot[] = [];

  for (const e of entries) {
    distribution[e.coverageStatus]++;

    snapshots.push({
      refCode:         e.refCode,
      productName:     e.productName,
      subgrupoSag:     e.subgrupoSag,
      currentStock:    e.currentStock,
      reservedStock:   e.reservedStock,
      netStock:        e.currentStock - e.reservedStock,
      dailyVelocity:   e.dailyVelocity,
      last30dOrdered:  e.last30dOrdered,
      coverageDays:    e.coverageDays,
      coverageStatus:  e.coverageStatus,
      warehouseCount:  0,  // enriched separately if needed
      primaryWarehouse: null,
    });
  }

  // Critical = has demand + sin_stock or ruptura_inminente
  const critical = snapshots
    .filter(s => s.dailyVelocity > 0 && (s.coverageStatus === "sin_stock" || s.coverageStatus === "ruptura_inminente"))
    .sort((a, b) => b.dailyVelocity - a.dailyVelocity);

  // Avg coverage days (only where velocity > 0)
  const withVelocity = snapshots.filter(s => s.coverageDays !== null && s.dailyVelocity > 0);
  const avgCoverageDays = withVelocity.length > 0
    ? Math.round((withVelocity.reduce((a, s) => a + (s.coverageDays ?? 0), 0) / withVelocity.length) * 10) / 10
    : null;

  return {
    computedAt:       new Date().toISOString(),
    totalRefs:        entries.length,
    refsWithCoverage: entries.filter(e => e.currentStock > 0 && e.dailyVelocity > 0).length,
    avgCoverageDays,
    distribution,
    critical,
  };
}

/**
 * Enrich coverage snapshots with warehouse distribution from Prisma.
 * Call this after buildCoverageSummary when warehouse detail is needed.
 */
export async function enrichWarehouseDistribution(
  orgId: string,
  snapshots: CoverageRefSnapshot[],
): Promise<void> {
  if (snapshots.length === 0) return;

  const db = prisma as any;
  const refCodes = snapshots.map(s => s.refCode);

  const whRows = await db.$queryRaw`
    SELECT p."sku" AS ref,
           COUNT(DISTINCT pil."warehouseId")::int AS wh_count,
           (ARRAY_AGG(pil."warehouseId" ORDER BY pil."quantity" DESC))[1] AS primary_wh
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId"
    WHERE pil."organizationId" = ${orgId}
    AND p."sku" = ANY(${refCodes})
    AND pil."quantity" > 0
    GROUP BY p."sku"
  ` as any[];

  const whMap = new Map<string, { count: number; primary: string | null }>();
  for (const row of whRows) {
    whMap.set(row.ref, { count: row.wh_count, primary: row.primary_wh });
  }

  for (const s of snapshots) {
    const wh = whMap.get(s.refCode);
    if (wh) {
      s.warehouseCount = wh.count;
      s.primaryWarehouse = wh.primary;
    }
  }
}
