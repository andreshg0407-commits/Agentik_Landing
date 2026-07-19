/**
 * lib/comercial/pedidos/inventory-link-service.ts
 *
 * Resolves CRMQuoteLine → ProductVariant → ProductInventoryLevel.
 * READ-ONLY: never creates, modifies, or deletes inventory data.
 *
 * Sprint: COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  normalizeReference,
  normalizeSize,
  normalizeColor,
  buildVariantCompositeKey,
} from "./inventory-link-normalizer";

// ── Types ────────────────────────────────────────────────────────────────────

export type VariantMatchConfidence =
  | "exact"            // composite SKU match (ref|size|color)
  | "normalized"       // match after normalization
  | "reference_only"   // ref matched but size/color didn't narrow
  | "not_found";       // no match

export interface VariantMatchResult {
  variantId: string | null;
  productId: string | null;
  matched: boolean;
  confidence: VariantMatchConfidence;
}

export interface WarehouseBreakdown {
  warehouseId: string;
  quantity: number;
}

export interface VariantAvailability {
  availableUnits: number;
  warehouseCount: number;
  warehouseBreakdown: WarehouseBreakdown[];
}

export interface EnrichedOrderLine {
  lineId: string;
  reference: string;
  size: string;
  color: string;
  variantId: string | null;
  productId: string | null;
  matchConfidence: VariantMatchConfidence;
  availableUnits: number | null;
  warehouseCount: number;
  inventoryStatus: "available" | "partial" | "out_of_stock" | "inventory_unknown";
  quantity: number;
}

// ── Variant Resolution ───────────────────────────────────────────────────────

/**
 * Resolves a single order line to a ProductVariant using composite SKU matching.
 *
 * Strategy (ordered by confidence):
 * 1. Exact composite SKU: `{ref}|{size}|{color}` → ProductVariant.sku
 * 2. Normalized composite: same after trim/uppercase
 * 3. Reference-only: ProductEntity.sku matches ref, pick first variant
 * 4. Not found
 */
export async function resolveVariantForOrderLine(
  orgId: string,
  reference: string,
  size: string,
  color: string,
): Promise<VariantMatchResult> {
  const compositeKey = buildVariantCompositeKey(reference, size, color);

  // Strategy 1+2: composite SKU match (already normalized)
  const variant = await prisma.productVariant.findFirst({
    where: {
      organizationId: orgId,
      sku: compositeKey,
    },
    select: { id: true, productId: true },
  });

  if (variant) {
    return {
      variantId: variant.id,
      productId: variant.productId,
      matched: true,
      confidence: "exact",
    };
  }

  // Strategy 3: reference-only via ProductEntity.sku
  const normRef = normalizeReference(reference);
  const product = await prisma.productEntity.findFirst({
    where: {
      organizationId: orgId,
      sku: normRef,
    },
    include: {
      variants: {
        take: 1,
        select: { id: true, productId: true },
      },
    },
  });

  if (product?.variants?.[0]) {
    return {
      variantId: product.variants[0].id,
      productId: product.id,
      matched: true,
      confidence: "reference_only",
    };
  }

  return {
    variantId: null,
    productId: null,
    matched: false,
    confidence: "not_found",
  };
}

// ── Availability ─────────────────────────────────────────────────────────────

/**
 * Gets total available inventory for a variant across all warehouses.
 * SUM(quantity) WHERE quantity > 0.
 */
export async function getVariantAvailability(
  variantId: string,
): Promise<VariantAvailability> {
  const levels = await prisma.productInventoryLevel.findMany({
    where: { variantId },
    select: { warehouseId: true, quantity: true },
  });

  const warehouseBreakdown: WarehouseBreakdown[] = levels
    .filter((l) => l.quantity > 0)
    .map((l) => ({ warehouseId: l.warehouseId, quantity: l.quantity }));

  const availableUnits = warehouseBreakdown.reduce((sum, w) => sum + w.quantity, 0);

  return {
    availableUnits,
    warehouseCount: warehouseBreakdown.length,
    warehouseBreakdown,
  };
}

// ── Batch Enrichment ─────────────────────────────────────────────────────────

/**
 * Enriches CRMQuoteLines with real inventory data.
 * Batch-optimized: builds a variant SKU index in one query, then resolves all lines.
 */
export async function enrichOrderLinesWithInventory(
  orgId: string,
  quoteLines: Array<{
    id: string;
    reference: string;
    size: string | null;
    color: string | null;
    qty: number;
  }>,
): Promise<EnrichedOrderLine[]> {
  if (quoteLines.length === 0) return [];

  // Collect all composite keys we need
  const compositeKeys = quoteLines.map((ql) =>
    buildVariantCompositeKey(ql.reference, ql.size, ql.color)
  );
  const uniqueKeys = [...new Set(compositeKeys)];

  // Batch fetch all matching variants by SKU
  const matchedVariants = await prisma.productVariant.findMany({
    where: {
      organizationId: orgId,
      sku: { in: uniqueKeys },
    },
    select: { id: true, productId: true, sku: true },
  });

  const variantBySku = new Map<string, { id: string; productId: string }>();
  for (const v of matchedVariants) {
    if (v.sku) variantBySku.set(v.sku.toUpperCase(), { id: v.id, productId: v.productId });
  }

  // Collect all matched variant IDs for batch inventory fetch
  const matchedVariantIds = new Set<string>();
  for (const v of matchedVariants) matchedVariantIds.add(v.id);

  // Batch fetch inventory for all matched variants
  const inventoryLevels = matchedVariantIds.size > 0
    ? await prisma.productInventoryLevel.findMany({
        where: { variantId: { in: [...matchedVariantIds] } },
        select: { variantId: true, warehouseId: true, quantity: true },
      })
    : [];

  // Build inventory index: variantId → { availableUnits, warehouseCount }
  const inventoryByVariant = new Map<string, { availableUnits: number; warehouseCount: number }>();
  for (const il of inventoryLevels) {
    if (!il.variantId) continue;
    const entry = inventoryByVariant.get(il.variantId) ?? { availableUnits: 0, warehouseCount: 0 };
    if (il.quantity > 0) {
      entry.availableUnits += il.quantity;
      entry.warehouseCount += 1;
    }
    inventoryByVariant.set(il.variantId, entry);
  }

  // For unmatched lines, try reference-only fallback
  const unmatchedRefs = new Set<string>();
  for (let i = 0; i < quoteLines.length; i++) {
    const key = compositeKeys[i];
    if (!variantBySku.has(key)) {
      unmatchedRefs.add(normalizeReference(quoteLines[i].reference));
    }
  }

  // Batch fetch products by SKU for reference-only fallback
  const fallbackProducts = unmatchedRefs.size > 0
    ? await prisma.productEntity.findMany({
        where: {
          organizationId: orgId,
          sku: { in: [...unmatchedRefs] },
        },
        include: {
          variants: {
            take: 1,
            select: { id: true, productId: true },
          },
        },
      })
    : [];

  const fallbackByRef = new Map<string, { variantId: string; productId: string }>();
  for (const p of fallbackProducts) {
    if (p.sku && p.variants[0]) {
      fallbackByRef.set(p.sku.toUpperCase(), {
        variantId: p.variants[0].id,
        productId: p.id,
      });
    }
  }

  // Fetch inventory for fallback variants too
  const fallbackVariantIds = [...fallbackByRef.values()].map((f) => f.variantId);
  if (fallbackVariantIds.length > 0) {
    const fallbackInventory = await prisma.productInventoryLevel.findMany({
      where: { variantId: { in: fallbackVariantIds } },
      select: { variantId: true, warehouseId: true, quantity: true },
    });
    for (const il of fallbackInventory) {
      if (!il.variantId) continue;
      const entry = inventoryByVariant.get(il.variantId) ?? { availableUnits: 0, warehouseCount: 0 };
      if (il.quantity > 0) {
        entry.availableUnits += il.quantity;
        entry.warehouseCount += 1;
      }
      inventoryByVariant.set(il.variantId, entry);
    }
  }

  // Build enriched lines
  return quoteLines.map((ql, i) => {
    const key = compositeKeys[i];
    const qty = Number(ql.qty) || 0;

    // Try composite match
    let match = variantBySku.get(key);
    let confidence: VariantMatchConfidence = match ? "exact" : "not_found";

    // Fallback to reference-only
    if (!match) {
      const normRef = normalizeReference(ql.reference);
      const fb = fallbackByRef.get(normRef);
      if (fb) {
        match = { id: fb.variantId, productId: fb.productId };
        confidence = "reference_only";
      }
    }

    if (!match) {
      return {
        lineId: ql.id,
        reference: ql.reference,
        size: ql.size ?? "",
        color: ql.color ?? "",
        variantId: null,
        productId: null,
        matchConfidence: "not_found",
        availableUnits: null,
        warehouseCount: 0,
        inventoryStatus: "inventory_unknown" as const,
        quantity: qty,
      };
    }

    const inv = inventoryByVariant.get(match.id);
    const availableUnits = inv?.availableUnits ?? 0;
    const warehouseCount = inv?.warehouseCount ?? 0;

    let inventoryStatus: EnrichedOrderLine["inventoryStatus"];
    if (availableUnits <= 0) {
      inventoryStatus = "out_of_stock";
    } else if (availableUnits < qty) {
      inventoryStatus = "partial";
    } else {
      inventoryStatus = "available";
    }

    return {
      lineId: ql.id,
      reference: ql.reference,
      size: ql.size ?? "",
      color: ql.color ?? "",
      variantId: match.id,
      productId: match.productId,
      matchConfidence: confidence,
      availableUnits,
      warehouseCount,
      inventoryStatus,
      quantity: qty,
    };
  });
}
