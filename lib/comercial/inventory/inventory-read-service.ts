/**
 * lib/comercial/inventory/inventory-read-service.ts
 *
 * Read services for Agentik's enterprise inventory layer.
 *
 * These services read from ProductVariant + ProductInventoryLevel.
 * They will be consumed by Pedidos, Tiendas, Maletas, and David.
 *
 * Sprint: SAG-INVENTORY-SYNC-01
 */

import { prisma } from "@/lib/prisma";
import type {
  InventorySnapshot,
  InventoryVariantSnapshot,
  InventoryWarehouseSnapshot,
  InventorySearchParams,
} from "./inventory-types";

// ── Get inventory by product ────────────────────────────────────────────────

/**
 * Returns full inventory snapshot for a single product:
 * product → variants → warehouses → available.
 */
export async function getInventoryByProduct(
  orgId: string,
  productId: string,
): Promise<InventorySnapshot | null> {
  const product = await (prisma as any).productEntity.findFirst({
    where: { id: productId, organizationId: orgId },
    select: { id: true, externalId: true, name: true },
  });

  if (!product) return null;

  const levels = await (prisma as any).productInventoryLevel.findMany({
    where: { productId, organizationId: orgId },
    include: {
      variant: {
        select: {
          id: true,
          externalId: true,
          name: true,
          attributes: true,
        },
      },
    },
  });

  return buildProductSnapshot(product, levels);
}

/**
 * Returns full inventory snapshot for a product identified by its SAG code.
 */
export async function getInventoryByProductCode(
  orgId: string,
  productCode: string,
): Promise<InventorySnapshot | null> {
  const product = await (prisma as any).productEntity.findFirst({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      externalId: productCode.toUpperCase(),
    },
    select: { id: true, externalId: true, name: true },
  });

  if (!product) return null;
  return getInventoryByProduct(orgId, product.id);
}

// ── Get inventory by variant ────────────────────────────────────────────────

/**
 * Returns inventory for a specific variant across all warehouses.
 */
export async function getInventoryByVariant(
  orgId: string,
  variantId: string,
): Promise<InventoryVariantSnapshot | null> {
  const variant = await (prisma as any).productVariant.findFirst({
    where: { id: variantId, organizationId: orgId },
    select: { id: true, externalId: true, name: true, attributes: true },
  });

  if (!variant) return null;

  const levels = await (prisma as any).productInventoryLevel.findMany({
    where: { variantId, organizationId: orgId },
  });

  const attrs = parseVariantAttributes(variant.attributes);

  const warehouses: InventoryWarehouseSnapshot[] = levels.map((l: any) => ({
    warehouseId:   l.warehouseId,
    warehouseCode: l.externalRef ?? l.warehouseId,
    warehouseName: l.externalRef ?? `Bodega ${l.warehouseId}`,
    available:     l.quantity ?? 0,
    reserved:      l.reservedQty ?? 0,
    syncedAt:      l.syncedAt ?? l.updatedAt,
  }));

  return {
    variantId:      variant.id,
    productCode:    extractProductCode(variant.externalId),
    sizeCode:       attrs.talla,
    sizeName:       attrs.tallaName || attrs.talla,
    colorCode:      attrs.color,
    colorName:      attrs.colorName || attrs.color,
    totalAvailable: warehouses.reduce((s, w) => s + w.available, 0),
    totalReserved:  warehouses.reduce((s, w) => s + w.reserved, 0),
    warehouses,
  };
}

// ── Get inventory by warehouse ──────────────────────────────────────────────

/**
 * Returns all variant inventory for a specific warehouse.
 */
export async function getInventoryByWarehouse(
  orgId: string,
  warehouseId: string,
  options: { inStockOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<InventoryVariantSnapshot[]> {
  const { inStockOnly = false, limit = 500, offset = 0 } = options;

  const where: any = {
    organizationId: orgId,
    warehouseId,
  };
  if (inStockOnly) {
    where.quantity = { gt: 0 };
  }

  const levels = await (prisma as any).productInventoryLevel.findMany({
    where,
    include: {
      variant: {
        select: { id: true, externalId: true, name: true, attributes: true },
      },
    },
    orderBy: { quantity: "desc" },
    skip: offset,
    take: limit,
  });

  return levels
    .filter((l: any) => l.variant)
    .map((l: any) => {
      const attrs = parseVariantAttributes(l.variant.attributes);
      return {
        variantId:      l.variant.id,
        productCode:    extractProductCode(l.variant.externalId),
        sizeCode:       attrs.talla,
        sizeName:       attrs.tallaName || attrs.talla,
        colorCode:      attrs.color,
        colorName:      attrs.colorName || attrs.color,
        totalAvailable: l.quantity ?? 0,
        totalReserved:  l.reservedQty ?? 0,
        warehouses: [{
          warehouseId:   l.warehouseId,
          warehouseCode: l.externalRef ?? l.warehouseId,
          warehouseName: l.externalRef ?? `Bodega ${l.warehouseId}`,
          available:     l.quantity ?? 0,
          reserved:      l.reservedQty ?? 0,
          syncedAt:      l.syncedAt ?? l.updatedAt,
        }],
      } as InventoryVariantSnapshot;
    });
}

// ── Search available variants ───────────────────────────────────────────────

/**
 * Search for variants matching filters, optionally restricted to in-stock only.
 * Returns variant snapshots with warehouse breakdown.
 */
export async function searchAvailableVariants(
  params: InventorySearchParams,
): Promise<InventoryVariantSnapshot[]> {
  const { orgId, productCode, warehouseId, sizeCode, colorCode, inStockOnly = true, limit = 100, offset = 0 } = params;

  // Build variant filter
  const variantWhere: any = {
    organizationId: orgId,
    status: "active",
  };

  if (productCode) {
    // Find product by code
    const product = await (prisma as any).productEntity.findFirst({
      where: {
        organizationId: orgId,
        externalSource: "sag",
        externalId: productCode.toUpperCase(),
      },
      select: { id: true },
    });
    if (!product) return [];
    variantWhere.productId = product.id;
  }

  if (sizeCode || colorCode) {
    variantWhere.variantAttributes = {
      some: {
        OR: [
          ...(sizeCode ? [{ key: "talla", value: sizeCode }] : []),
          ...(colorCode ? [{ key: "color", value: colorCode }] : []),
        ],
      },
    };
  }

  const variants = await (prisma as any).productVariant.findMany({
    where: variantWhere,
    select: { id: true, externalId: true, name: true, attributes: true },
    skip: offset,
    take: limit,
  });

  const results: InventoryVariantSnapshot[] = [];

  for (const v of variants) {
    const levelWhere: any = {
      variantId: v.id,
      organizationId: orgId,
    };
    if (warehouseId) levelWhere.warehouseId = warehouseId;
    if (inStockOnly) levelWhere.quantity = { gt: 0 };

    const levels = await (prisma as any).productInventoryLevel.findMany({
      where: levelWhere,
    });

    if (inStockOnly && levels.length === 0) continue;

    const attrs = parseVariantAttributes(v.attributes);
    const warehouses: InventoryWarehouseSnapshot[] = levels.map((l: any) => ({
      warehouseId:   l.warehouseId,
      warehouseCode: l.externalRef ?? l.warehouseId,
      warehouseName: l.externalRef ?? `Bodega ${l.warehouseId}`,
      available:     l.quantity ?? 0,
      reserved:      l.reservedQty ?? 0,
      syncedAt:      l.syncedAt ?? l.updatedAt,
    }));

    results.push({
      variantId:      v.id,
      productCode:    extractProductCode(v.externalId),
      sizeCode:       attrs.talla,
      sizeName:       attrs.tallaName || attrs.talla,
      colorCode:      attrs.color,
      colorName:      attrs.colorName || attrs.color,
      totalAvailable: warehouses.reduce((s, w) => s + w.available, 0),
      totalReserved:  warehouses.reduce((s, w) => s + w.reserved, 0),
      warehouses,
    });
  }

  return results;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function buildProductSnapshot(
  product: { id: string; externalId?: string; name?: string },
  levels: any[],
): InventorySnapshot {
  // Group levels by variant
  const variantMap = new Map<string, {
    variant: any;
    levels: any[];
  }>();

  for (const level of levels) {
    if (!level.variant) continue;
    const vid = level.variant.id;
    let group = variantMap.get(vid);
    if (!group) {
      group = { variant: level.variant, levels: [] };
      variantMap.set(vid, group);
    }
    group.levels.push(level);
  }

  const variants: InventoryVariantSnapshot[] = [];

  for (const [, g] of variantMap) {
    const attrs = parseVariantAttributes(g.variant.attributes);
    const warehouses: InventoryWarehouseSnapshot[] = g.levels.map((l: any) => ({
      warehouseId:   l.warehouseId,
      warehouseCode: l.externalRef ?? l.warehouseId,
      warehouseName: l.externalRef ?? `Bodega ${l.warehouseId}`,
      available:     l.quantity ?? 0,
      reserved:      l.reservedQty ?? 0,
      syncedAt:      l.syncedAt ?? l.updatedAt,
    }));

    const totalAvailable = warehouses.reduce((s, w) => s + w.available, 0);
    const totalReserved = warehouses.reduce((s, w) => s + w.reserved, 0);

    variants.push({
      variantId:      g.variant.id,
      productCode:    extractProductCode(g.variant.externalId),
      sizeCode:       attrs.talla,
      sizeName:       attrs.tallaName || attrs.talla,
      colorCode:      attrs.color,
      colorName:      attrs.colorName || attrs.color,
      totalAvailable,
      totalReserved,
      warehouses,
    });
  }

  const totalAvailable = variants.reduce((s, v) => s + v.totalAvailable, 0);
  const totalReserved = variants.reduce((s, v) => s + v.totalReserved, 0);
  const variantsInStock = variants.filter(v => v.totalAvailable > 0).length;

  return {
    productId:       product.id,
    productCode:     product.externalId ?? "",
    productName:     product.name ?? "",
    totalAvailable,
    totalReserved,
    variantsInStock,
    variantsTotal:   variants.length,
    variants,
  };
}

function parseVariantAttributes(attrs: any): {
  talla: string;
  tallaName: string;
  color: string;
  colorName: string;
} {
  if (!attrs || typeof attrs !== "object") {
    return { talla: "", tallaName: "", color: "", colorName: "" };
  }
  return {
    talla:     String(attrs.talla ?? ""),
    tallaName: String(attrs.tallaName ?? attrs.talla ?? ""),
    color:     String(attrs.color ?? ""),
    colorName: String(attrs.colorName ?? attrs.color ?? ""),
  };
}

function extractProductCode(externalId: string | null | undefined): string {
  if (!externalId) return "";
  // variantKey format: "PRODUCT_CODE|SIZE|COLOR"
  const idx = externalId.indexOf("|");
  return idx > 0 ? externalId.slice(0, idx) : externalId;
}
