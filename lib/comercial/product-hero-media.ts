/**
 * lib/comercial/product-hero-media.ts
 *
 * Sprint: AGENTIK-SELLER-APP-PRODUCT-VISUAL-SYSTEM-01
 *
 * Canonical batch hero image resolver for product references.
 *
 * Authority chain:
 *   ProductEntity → ProductAssetLink(role="hero") → GeneratedAsset.assetUrl
 *
 * Contract:
 *   - Exact referenceCode/SKU → exact ProductEntity → hero link → assetUrl
 *   - NO fuzzy matching. NO description matching. NO filename guessing.
 *   - Missing hero → null (neutral placeholder in UI)
 *   - Batch: bounded queries, never N+1
 *   - Non-critical: image failure never breaks data flow
 *
 * Consumers:
 *   - order-product-search.ts (product search)
 *   - customer-purchase-intelligence.ts (top products)
 *   - order-service.ts (order thumbnail enrichment)
 *   - store-distribution-service.ts (tiendas)
 *   - vendor-sample-loader.ts (maletas)
 *   - import-service.ts (importaciones)
 *
 * SERVER ONLY.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ── Org-wide hero image map ─────────────────────────────────────────────────

/**
 * Loads ALL hero images for an organization in a single bounded batch.
 * Returns Map<productId, assetUrl>.
 *
 * Query count: 2 (ProductAssetLink + GeneratedAsset).
 * Call once per request, reuse across surfaces.
 */
export async function loadHeroImageMap(orgId: string): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  try {
    const heroLinks = await db.productAssetLink.findMany({
      where: { organizationId: orgId, role: "hero" },
      select: { productId: true, assetId: true },
    });
    if (heroLinks.length > 0) {
      const assets = await db.generatedAsset.findMany({
        where: { id: { in: heroLinks.map((l: { assetId: string }) => l.assetId) }, assetUrl: { not: null } },
        select: { id: true, assetUrl: true },
      });
      const assetMap = new Map<string, string>();
      for (const a of assets) { if (a.assetUrl) assetMap.set(a.id, a.assetUrl); }
      for (const link of heroLinks) {
        const url = assetMap.get(link.assetId);
        if (url) imageMap.set(link.productId, url);
      }
    }
  } catch {
    // Images are non-critical — degrade gracefully
  }
  return imageMap;
}

// ── Reference-scoped hero image map ─────────────────────────────────────────

/**
 * Resolves hero images for a specific set of reference codes.
 * Returns Map<referenceCode, assetUrl>.
 *
 * Uses EXACT match: referenceCode → ProductEntity.sku (case-insensitive).
 * NO fuzzy matching. Unmatched references → absent from map (= null).
 *
 * Query count: 3 (ProductEntity + ProductAssetLink + GeneratedAsset).
 */
export async function resolveHeroImagesByReferenceCodes(
  orgId: string,
  referenceCodes: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (referenceCodes.length === 0) return result;

  try {
    // 1. Exact reference → ProductEntity
    const products = await prisma.productEntity.findMany({
      where: { organizationId: orgId, sku: { in: referenceCodes } },
      select: { id: true, sku: true },
    });
    if (products.length === 0) return result;

    const skuToProductId = new Map<string, string>();
    const productIds: string[] = [];
    for (const p of products) {
      if (p.sku) {
        skuToProductId.set(p.sku.toUpperCase(), p.id);
        productIds.push(p.id);
      }
    }

    // 2. ProductAssetLink(role="hero")
    const heroLinks = await db.productAssetLink.findMany({
      where: { organizationId: orgId, productId: { in: productIds }, role: "hero" },
      select: { productId: true, assetId: true },
    });
    if (heroLinks.length === 0) return result;

    // 3. GeneratedAsset.assetUrl
    const assets = await db.generatedAsset.findMany({
      where: { id: { in: heroLinks.map((l: any) => l.assetId) } },
      select: { id: true, assetUrl: true },
    });
    const assetMap = new Map<string, string>();
    for (const a of assets) { if (a.assetUrl) assetMap.set(a.id, a.assetUrl); }

    const heroImageMap = new Map<string, string>();
    for (const link of heroLinks) {
      const url = assetMap.get(link.assetId);
      if (url) heroImageMap.set(link.productId, url);
    }

    // Map back to reference codes
    for (const [sku, pid] of skuToProductId) {
      const url = heroImageMap.get(pid);
      if (url) {
        // Find original-case reference code
        const original = referenceCodes.find(r => r.toUpperCase() === sku);
        if (original) result.set(original, url);
      }
    }
  } catch {
    // Images are non-critical — degrade gracefully
  }
  return result;
}
