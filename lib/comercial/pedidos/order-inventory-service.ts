/**
 * lib/comercial/pedidos/order-inventory-service.ts
 *
 * Inventory service for Pedidos — reads exclusively from local Agentik data.
 * NO SOAP. NO SAG calls. NO external integrations.
 *
 * Consumes: ProductVariant, ProductInventoryLevel, ProductEntity
 * Consumers: order-product-search.ts, pedidos-client.tsx, David signals
 *
 * Sprint: COMERCIAL-PEDIDOS-INVENTARIO-01
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InventoryStatus = "high" | "medium" | "low" | "out";

export interface VariantInventoryInfo {
  variantId:     string;
  size:          string;
  sizeName:      string;
  color:         string;
  colorName:     string;
  /** Net available = Math.max(0, quantity - reservedQty) summed across warehouses */
  availableQty:  number;
  reservedQty:   number;
  status:        InventoryStatus;
  warehouseCount: number;
}

export interface ReferenceInventoryInfo {
  productId:     string;
  productCode:   string;
  productName:   string;
  /** Total available across all variants and warehouses */
  totalAvailable: number;
  /** How many variants exist */
  variantCount:  number;
  /** How many variants have stock > 0 */
  variantsInStock: number;
  /** Whether this reference has any stock at all */
  inStock:       boolean;
  status:        InventoryStatus;
  /** Per-variant breakdown */
  variants:      VariantInventoryInfo[];
}

export interface InventorySummaryForOrder {
  /** Total products (references) in the order */
  productsCount: number;
  /** Total distinct variants */
  variantsCount: number;
  /** Total units requested */
  totalUnitsRequested: number;
  /** Total units available (for what's requested) */
  totalUnitsAvailable: number;
  /** Lines where requested > available */
  linesOverAvailable: number;
  /** Lines where available = 0 */
  linesOutOfStock: number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLD_HIGH   = 20;
const THRESHOLD_MEDIUM = 5;

export function computeStatus(available: number): InventoryStatus {
  if (available >= THRESHOLD_HIGH)   return "high";
  if (available >= THRESHOLD_MEDIUM) return "medium";
  if (available > 0)                 return "low";
  return "out";
}

// ── Get inventory for a single variant ────────────────────────────────────────

export async function getVariantInventory(
  orgId: string,
  variantId: string,
): Promise<VariantInventoryInfo | null> {
  const variant = await (prisma as any).productVariant.findFirst({
    where: { id: variantId, organizationId: orgId },
    select: { id: true, attributes: true },
  });
  if (!variant) return null;

  const levels = await (prisma as any).productInventoryLevel.findMany({
    where: { variantId, organizationId: orgId },
    select: { quantity: true, reservedQty: true },
  });

  const attrs = parseAttrs(variant.attributes);
  let totalAvailable = 0;
  let totalReserved  = 0;

  for (const l of levels) {
    const qty = l.quantity ?? 0;
    const res = l.reservedQty ?? 0;
    totalAvailable += Math.max(0, qty - res);
    totalReserved  += res;
  }

  return {
    variantId:      variant.id,
    size:           attrs.talla,
    sizeName:       attrs.tallaName,
    color:          attrs.color,
    colorName:      attrs.colorName,
    availableQty:   totalAvailable,
    reservedQty:    totalReserved,
    status:         computeStatus(totalAvailable),
    warehouseCount: levels.length,
  };
}

// ── Get inventory for a reference (all variants) ─────────────────────────────

export async function getReferenceInventory(
  orgId: string,
  productCode: string,
): Promise<ReferenceInventoryInfo | null> {
  const product = await (prisma as any).productEntity.findFirst({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      externalId: productCode.toUpperCase(),
    },
    select: { id: true, externalId: true, name: true },
  });
  if (!product) return null;

  const variants = await (prisma as any).productVariant.findMany({
    where: { productId: product.id, organizationId: orgId, status: "active" },
    select: { id: true, attributes: true },
  });

  const variantIds = variants.map((v: any) => v.id);

  // Single query for all inventory levels of all variants
  const levels = await (prisma as any).productInventoryLevel.findMany({
    where: {
      organizationId: orgId,
      variantId: { in: variantIds },
    },
    select: { variantId: true, quantity: true, reservedQty: true },
  });

  // Group levels by variant
  const levelsByVariant = new Map<string, { quantity: number; reservedQty: number }[]>();
  for (const l of levels) {
    const arr = levelsByVariant.get(l.variantId) ?? [];
    arr.push({ quantity: l.quantity ?? 0, reservedQty: l.reservedQty ?? 0 });
    levelsByVariant.set(l.variantId, arr);
  }

  const variantInfos: VariantInventoryInfo[] = [];
  let totalAvailable = 0;
  let variantsInStock = 0;

  for (const v of variants) {
    const attrs = parseAttrs(v.attributes);
    const vLevels = levelsByVariant.get(v.id) ?? [];

    let vAvail = 0;
    let vReserved = 0;
    for (const l of vLevels) {
      vAvail += Math.max(0, l.quantity - l.reservedQty);
      vReserved += l.reservedQty;
    }

    if (vAvail > 0) variantsInStock++;
    totalAvailable += vAvail;

    variantInfos.push({
      variantId:      v.id,
      size:           attrs.talla,
      sizeName:       attrs.tallaName,
      color:          attrs.color,
      colorName:      attrs.colorName,
      availableQty:   vAvail,
      reservedQty:    vReserved,
      status:         computeStatus(vAvail),
      warehouseCount: vLevels.length,
    });
  }

  return {
    productId:       product.id,
    productCode:     product.externalId ?? productCode,
    productName:     product.name ?? productCode,
    totalAvailable,
    variantCount:    variants.length,
    variantsInStock,
    inStock:         totalAvailable > 0,
    status:          computeStatus(totalAvailable),
    variants:        variantInfos,
  };
}

// ── Get available variants for a reference (for the selector) ────────────────

export async function getAvailableVariants(
  orgId: string,
  productCode: string,
  options: { includeOutOfStock?: boolean } = {},
): Promise<VariantInventoryInfo[]> {
  const ref = await getReferenceInventory(orgId, productCode);
  if (!ref) return [];

  if (options.includeOutOfStock) return ref.variants;
  return ref.variants; // Always return all — UI decides what to grey out
}

// ── Compute inventory summary for an order ──────────────────────────────────

export function getInventorySummary(
  lines: Array<{
    referenceCode: string;
    size: string;
    color: string;
    quantity: number;
    availableUnits: number | null;
  }>,
): InventorySummaryForOrder {
  const refs = new Set<string>();
  const variants = new Set<string>();
  let totalUnitsRequested = 0;
  let totalUnitsAvailable = 0;
  let linesOverAvailable = 0;
  let linesOutOfStock = 0;

  for (const line of lines) {
    refs.add(line.referenceCode);
    variants.add(`${line.referenceCode}|${line.size}|${line.color}`);
    totalUnitsRequested += line.quantity;

    const avail = line.availableUnits;
    if (avail !== null) {
      totalUnitsAvailable += Math.max(0, avail);
      if (avail <= 0) linesOutOfStock++;
      else if (line.quantity > avail) linesOverAvailable++;
    }
  }

  return {
    productsCount:       refs.size,
    variantsCount:       variants.size,
    totalUnitsRequested,
    totalUnitsAvailable,
    linesOverAvailable,
    linesOutOfStock,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────────

function parseAttrs(attrs: any): {
  talla: string; tallaName: string; color: string; colorName: string;
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
