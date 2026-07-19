/**
 * lib/comercial/inventory/inventory-coverage.ts
 *
 * Computes commercial inventory coverage indicators.
 *
 * Reads from ProductVariant + ProductInventoryLevel to produce
 * aggregate metrics about inventory health.
 *
 * Sprint: SAG-INVENTORY-SYNC-01
 */

import { prisma } from "@/lib/prisma";
import type { InventoryCoverageIndicators } from "./inventory-types";

/**
 * Compute inventory coverage indicators for an organization.
 *
 * All data comes from ProductInventoryLevel (synced from SAG).
 */
export async function computeInventoryCoverage(
  orgId: string,
): Promise<InventoryCoverageIndicators> {
  const now = new Date();

  // Total commercial products (SAG source, active)
  const productsTotal = await (prisma as any).productEntity.count({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      commercialStatus: "active",
    },
  });

  // Total variants
  const variantsTotal = await (prisma as any).productVariant.count({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      status: "active",
    },
  });

  // Total snapshot records
  const snapshotRecords = await (prisma as any).productInventoryLevel.count({
    where: {
      organizationId: orgId,
      source: "sag",
    },
  });

  // Variants with stock > 0
  const variantsInStockResult = await (prisma as any).productInventoryLevel.groupBy({
    by: ["variantId"],
    where: {
      organizationId: orgId,
      source: "sag",
      quantity: { gt: 0 },
    },
    _sum: { quantity: true },
  });
  const variantsInStock = variantsInStockResult.length;

  // Products with stock > 0 (at least one inventory level with qty > 0)
  const productsWithStockResult = await (prisma as any).productInventoryLevel.groupBy({
    by: ["productId"],
    where: {
      organizationId: orgId,
      source: "sag",
      quantity: { gt: 0 },
    },
  });
  const productsWithStock = productsWithStockResult.length;

  // Warehouses with stock
  const warehousesWithStockResult = await (prisma as any).productInventoryLevel.groupBy({
    by: ["warehouseId"],
    where: {
      organizationId: orgId,
      source: "sag",
      quantity: { gt: 0 },
    },
  });
  const warehousesWithStock = warehousesWithStockResult.length;

  // Total distinct warehouses
  const warehousesTotalResult = await (prisma as any).productInventoryLevel.groupBy({
    by: ["warehouseId"],
    where: {
      organizationId: orgId,
      source: "sag",
    },
  });
  const warehousesTotal = warehousesTotalResult.length;

  const productsOutOfStock = productsTotal - productsWithStock;
  const variantsOutOfStock = variantsTotal - variantsInStock;
  const coverageRatio = productsTotal > 0 ? productsWithStock / productsTotal : 0;

  return {
    productsWithStock,
    productsOutOfStock: Math.max(0, productsOutOfStock),
    productsTotal,
    variantsInStock,
    variantsOutOfStock: Math.max(0, variantsOutOfStock),
    variantsTotal,
    warehousesWithStock,
    warehousesTotal,
    snapshotRecords,
    coverageRatio,
    computedAt: now,
  };
}
