/**
 * lib/comercial/pedidos/order-product-search.ts
 *
 * Product search service for the Pedidos POS flow.
 *
 * Data sources (queried in order, results merged):
 *   1. ProductEntity — real catalog products (name, sku, category, price, productLine)
 *   2. ProductVariant + ProductInventoryLevel — real variant-level inventory
 *   3. CRMQuoteLine — real CRM quotes with variant-level data (size, color, price)
 *
 * Never invents data. If no real data exists, returns empty results.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-POS-02
 * Sprint: COMERCIAL-PEDIDOS-PRODUCTOS-MOBILE-03
 * Sprint: COMERCIAL-PEDIDOS-TEST-DATA-06
 * Sprint: COMERCIAL-PEDIDOS-PRODUCTOS-SAG-09
 * Sprint: COMERCIAL-PEDIDOS-INVENTARIO-01
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  OrderProductSearchResult,
  OrderProductVariant,
  OrderVariantAvailability,
  OrderLineCandidate,
  OrderInventoryStatus,
} from "./order-product-types";
import { computeStatus } from "./order-inventory-service";

// ── Internal product map entry ──────────────────────────────────────────────

interface ProductMapEntry {
  refCode:      string;
  productId:    string;
  productName:  string;
  line:         string;
  category:     string;
  description:  string;
  unitPrice:    number;
  lastSyncAt:   string | null;
  variants:     OrderProductVariant[];
}

// ── Search products ───────────────────────────────────────────────────────────

export async function searchOrderProducts(
  orgId: string,
  query: string,
  limit = 20,
): Promise<OrderProductSearchResult[]> {
  if (!query.trim()) return [];

  const q = query.trim();
  const map = new Map<string, ProductMapEntry>();

  // ── Source 1: ProductEntity — real catalog (sku, name, category, price) ────
  try {
    const products = await (prisma as any).productEntity.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { name:        { contains: q, mode: "insensitive" } },
          { sku:         { contains: q, mode: "insensitive" } },
          { category:    { contains: q, mode: "insensitive" } },
          { productLine: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    for (const p of (products ?? []) as any[]) {
      const ref = (p.sku ?? "").toUpperCase();
      if (!ref || map.has(ref)) continue;

      map.set(ref, {
        refCode:     ref,
        productId:   p.id,
        productName: p.name ?? ref,
        line:        p.productLine ?? "",
        category:    p.category ?? "",
        description: p.description ?? "",
        unitPrice:   p.price != null ? Number(p.price) : 0,
        lastSyncAt:  p.updatedAt ? String(p.updatedAt) : null,
        variants:    [],
      });
    }
  } catch {
    // ProductEntity may not exist — degrade silently
  }

  // ── Source 2: ProductVariant + ProductInventoryLevel — real inventory ──────
  if (map.size > 0) {
    try {
      const productIds = [...map.values()].map(e => e.productId).filter(Boolean);

      if (productIds.length > 0) {
        const variants = await (prisma as any).productVariant.findMany({
          where: {
            organizationId: orgId,
            productId: { in: productIds },
            status: "active",
          },
          select: {
            id: true,
            productId: true,
            externalId: true,
            attributes: true,
          },
        });

        const variantIds = variants.map((v: any) => v.id);

        // Single query for all inventory levels
        const levels = variantIds.length > 0
          ? await (prisma as any).productInventoryLevel.findMany({
              where: {
                organizationId: orgId,
                variantId: { in: variantIds },
              },
              select: { variantId: true, quantity: true, reservedQty: true, syncedAt: true },
            })
          : [];

        // Group levels by variant
        const levelsByVariant = new Map<string, Array<{ quantity: number; reservedQty: number; syncedAt: any }>>();
        for (const l of levels) {
          const arr = levelsByVariant.get(l.variantId) ?? [];
          arr.push({ quantity: l.quantity ?? 0, reservedQty: l.reservedQty ?? 0, syncedAt: l.syncedAt });
          levelsByVariant.set(l.variantId, arr);
        }

        // Group variants by productId → refCode
        const productIdToRef = new Map<string, string>();
        for (const entry of map.values()) {
          if (entry.productId) productIdToRef.set(entry.productId, entry.refCode);
        }

        for (const v of variants as any[]) {
          const ref = productIdToRef.get(v.productId);
          if (!ref) continue;
          const entry = map.get(ref);
          if (!entry) continue;

          const attrs = parseAttrs(v.attributes);
          const vLevels = levelsByVariant.get(v.id) ?? [];

          let availableQty = 0;
          let latestSync: string | null = null;
          for (const l of vLevels) {
            availableQty += Math.max(0, l.quantity - l.reservedQty);
            if (l.syncedAt) latestSync = String(l.syncedAt);
          }

          const hasSyncData = vLevels.length > 0;
          const variantStatus: OrderInventoryStatus = hasSyncData
            ? mapStatus(computeStatus(availableQty))
            : "unsynced";

          entry.variants.push({
            variantId: v.id,
            size:  attrs.tallaName || attrs.talla,
            color: attrs.colorName || attrs.color,
            availability: {
              availableUnits:      hasSyncData ? availableQty : null,
              sourceWarehouseCode: null,
              lastSyncAt:          latestSync,
            },
            inventoryStatus: variantStatus,
          });
        }
      }
    } catch {
      // ProductVariant/ProductInventoryLevel may not exist — degrade silently
    }
  }

  // ── Source 3: CRMQuoteLine — real variant-level data (size, color, price) ──
  try {
    const quoteLines = await (prisma as any).cRMQuoteLine.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { reference:   { contains: q, mode: "insensitive" } },
          { productName: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { syncedAt: "desc" },
      take: limit * 10,
    });

    for (const ql of (quoteLines ?? []) as any[]) {
      const ref = (ql.reference ?? "").toUpperCase();
      if (!ref) continue;

      if (!map.has(ref)) {
        map.set(ref, {
          refCode:     ref,
          productId:   "",
          productName: ql.productName ?? ref,
          line:        "",
          category:    "",
          description: "",
          unitPrice:   ql.unitPrice != null ? Number(ql.unitPrice) : 0,
          lastSyncAt:  ql.syncedAt ? String(ql.syncedAt) : null,
          variants:    [],
        });
      }

      const entry = map.get(ref)!;
      const size  = ql.size ?? "";
      const color = ql.color ?? "";
      const variantId = `${ref}-${size || "?"}-${color || "?"}`;

      // Only add if we don't already have real variants from inventory
      if (entry.variants.length === 0 || !entry.variants.some(v => v.size === size && v.color === color)) {
        if (!entry.variants.some(v => v.variantId === variantId)) {
          entry.variants.push({
            variantId,
            size,
            color,
            availability: {
              availableUnits:      null,
              sourceWarehouseCode: ql.warehouseId ?? ql.warehouseName ?? null,
              lastSyncAt:          ql.syncedAt ? String(ql.syncedAt) : null,
            },
            inventoryStatus: "unsynced",
          });
        }
      }

      if (ql.unitPrice != null && Number(ql.unitPrice) > 0 && entry.unitPrice === 0) {
        entry.unitPrice = Number(ql.unitPrice);
      }
    }
  } catch {
    // CRMQuoteLine may not be populated — degrade silently
  }

  // ── Build results ─────────────────────────────────────────────────────────
  const results: OrderProductSearchResult[] = [];
  for (const [ref, entry] of map) {
    // Detect: product exists in catalog (has productId) but has no variant inventory
    const hasProductId = Boolean(entry.productId);
    const hadRealVariants = entry.variants.some(v => v.availability.availableUnits !== null);

    if (entry.variants.length === 0) {
      // Product with productId but 0 variants = SAG has no movimientos for this code
      const fallbackStatus: OrderInventoryStatus = hasProductId ? "no_variants" : "unsynced";
      entry.variants.push({
        variantId: `${ref}-?-?`,
        size:  "",
        color: "",
        availability: {
          availableUnits:      null,
          sourceWarehouseCode: null,
          lastSyncAt:          entry.lastSyncAt,
        },
        inventoryStatus: fallbackStatus,
      });
    }

    // Compute reference-level inventory from variants
    const syncedVariants = entry.variants.filter(v => v.availability.availableUnits !== null);
    const totalAvailable = syncedVariants.reduce((s, v) => s + (v.availability.availableUnits ?? 0), 0);
    const hasSyncData = syncedVariants.length > 0;
    const inStock = totalAvailable > 0;
    const refStatus: OrderInventoryStatus = hasSyncData
      ? mapStatus(computeStatus(totalAvailable))
      : hasProductId && !hadRealVariants ? "no_variants" : "unsynced";

    results.push({
      referenceCode: ref,
      productName:   entry.productName,
      sku:           ref,
      category:      entry.category,
      categoryName:  extractDescField(entry.description, "Grupo"),
      line:          entry.line,
      lineName:      extractDescField(entry.description, "Línea"),
      unitPrice:     entry.unitPrice,
      variants:      entry.variants,
      thumbnailUrl:  null,
      lastSyncAt:    entry.lastSyncAt,
      description:   entry.description,
      availableQty:  hasSyncData ? totalAvailable : null,
      variantCount:  entry.variants.length,
      inStock,
      inventoryStatus: refStatus,
    });
    if (results.length >= limit) break;
  }

  return results;
}

// ── Get variants for a specific reference ─────────────────────────────────────

export async function getProductVariants(
  orgId: string,
  referenceCode: string,
): Promise<OrderProductVariant[]> {
  const results = await searchOrderProducts(orgId, referenceCode, 1);
  const match = results.find(
    r => r.referenceCode.toUpperCase() === referenceCode.toUpperCase(),
  );
  return match?.variants ?? [];
}

// ── Get availability for a single variant ─────────────────────────────────────

export async function getVariantAvailability(
  orgId: string,
  referenceCode: string,
  _size: string,
  _color: string,
): Promise<OrderVariantAvailability> {
  // Try inventory levels first (real data)
  try {
    const product = await (prisma as any).productEntity.findFirst({
      where: {
        organizationId: orgId,
        externalSource: "sag",
        externalId: referenceCode.toUpperCase(),
      },
      select: { id: true },
    });

    if (product) {
      const variants = await (prisma as any).productVariant.findMany({
        where: {
          organizationId: orgId,
          productId: product.id,
          status: "active",
        },
        select: { id: true, attributes: true },
      });

      for (const v of variants as any[]) {
        const attrs = parseAttrs(v.attributes);
        const vSize = attrs.tallaName || attrs.talla;
        const vColor = attrs.colorName || attrs.color;
        if (vSize === _size && vColor === _color) {
          const levels = await (prisma as any).productInventoryLevel.findMany({
            where: { variantId: v.id, organizationId: orgId },
            select: { quantity: true, reservedQty: true, syncedAt: true },
          });

          let avail = 0;
          let latestSync: string | null = null;
          for (const l of levels) {
            avail += Math.max(0, (l.quantity ?? 0) - (l.reservedQty ?? 0));
            if (l.syncedAt) latestSync = String(l.syncedAt);
          }

          return {
            availableUnits:      levels.length > 0 ? avail : null,
            sourceWarehouseCode: null,
            lastSyncAt:          latestSync,
          };
        }
      }
    }
  } catch {
    // fall through to null
  }

  return { availableUnits: null, sourceWarehouseCode: null, lastSyncAt: null };
}

// ── Normalize a product + variant selection into an OrderLineCandidate ────────

export function normalizeProductForOrder(
  product: OrderProductSearchResult,
  variant: OrderProductVariant,
  quantity: number,
): OrderLineCandidate {
  return {
    referenceCode:  product.referenceCode,
    productName:    product.productName,
    size:           variant.size,
    color:          variant.color,
    quantity:       Math.max(1, quantity),
    availableUnits: variant.availability.availableUnits,
    unitPrice:      product.unitPrice,
    thumbnailUrl:   product.thumbnailUrl,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractDescField(desc: string, fieldName: string): string {
  if (!desc) return "";
  const re = new RegExp(`${fieldName}:\\s*([^|]+)`);
  const m = desc.match(re);
  return m ? m[1].trim() : "";
}

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

function mapStatus(s: "high" | "medium" | "low" | "out"): OrderInventoryStatus {
  return s;
}
