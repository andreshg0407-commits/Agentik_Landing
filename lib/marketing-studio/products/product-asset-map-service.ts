/**
 * lib/marketing-studio/products/product-asset-map-service.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Section J
 *
 * Commercial service: maps normalized product references to their primary
 * (hero) asset URLs.
 *
 * ── API ────────────────────────────────────────────────────────────────────
 *   getPrimaryAssetUrlMap({ organizationId, normalizedReferences })
 *     → Map<normalizedRef, assetUrl>
 *
 * ── Future integration points ──────────────────────────────────────────────
 *   1. Comercial / Tiendas — product grid thumbnails
 *   2. Seller App — product catalog images
 *   3. Shopify sync — hero image for product listing
 *   4. WhatsApp catalogs — product card images
 *   5. PDF export / fichas técnicas — product photos
 *   6. Commercial coverage dashboards — reference visual identification
 *
 * ── Guarantees ────────────────────────────────────────────────────────────
 *   - Read-only, zero writes
 *   - organizationId-scoped (no cross-tenant)
 *   - Returns empty map on no matches (never throws for missing refs)
 *   - Hero role prioritized; falls back to oldest gallery if no hero
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeReference } from "@/lib/marketing-studio/bulk-import/reference-normalizer";

export interface PrimaryAssetUrlMapInput {
  organizationId:       string;
  normalizedReferences: string[];
}

/**
 * Returns a Map<normalizedRef, assetUrl> for the given references.
 *
 * For each reference:
 *   1. Find ProductEntity by normalized SKU
 *   2. Find primary asset link (role=hero preferred, else oldest gallery)
 *   3. Resolve GeneratedAsset.assetUrl
 *
 * Read-only. Zero writes.
 */
export async function getPrimaryAssetUrlMap(
  input: PrimaryAssetUrlMapInput,
): Promise<Map<string, string>> {
  const { organizationId, normalizedReferences } = input;
  const result = new Map<string, string>();

  if (normalizedReferences.length === 0) return result;

  // 1. Find all products matching the normalized SKUs
  //    SKUs in ProductEntity are stored as-is, so we query all products
  //    and normalize for comparison
  const products = await prisma.productEntity.findMany({
    where: {
      organizationId,
      sku: { not: null },
    },
    select: {
      id:  true,
      sku: true,
    },
  });

  // Build normalized SKU → productId map
  const refSet = new Set(normalizedReferences);
  const skuToProductId = new Map<string, string>();
  for (const p of products) {
    if (!p.sku) continue;
    const norm = normalizeReference(p.sku);
    if (refSet.has(norm)) {
      skuToProductId.set(norm, p.id);
    }
  }

  if (skuToProductId.size === 0) return result;

  // 2. Find hero asset links for matched products
  const productIds = [...skuToProductId.values()];
  const assetLinks = await prisma.productAssetLink.findMany({
    where: {
      organizationId,
      productId: { in: productIds },
    },
    select: {
      productId: true,
      assetId:   true,
      role:      true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by productId, prefer hero
  const productToAssetId = new Map<string, string>();
  for (const link of assetLinks) {
    const existing = productToAssetId.get(link.productId);
    if (!existing || link.role === "hero") {
      productToAssetId.set(link.productId, link.assetId);
    }
  }

  if (productToAssetId.size === 0) return result;

  // 3. Resolve asset URLs
  const assetIds = [...productToAssetId.values()];
  const assets = await prisma.generatedAsset.findMany({
    where: {
      id: { in: assetIds },
      assetUrl: { not: null },
    },
    select: {
      id:       true,
      assetUrl: true,
    },
  });

  const assetUrlMap = new Map<string, string>();
  for (const a of assets) {
    if (a.assetUrl) assetUrlMap.set(a.id, a.assetUrl);
  }

  // 4. Compose final map: normalizedRef → assetUrl
  for (const [normRef, productId] of skuToProductId) {
    const assetId = productToAssetId.get(productId);
    if (!assetId) continue;
    const url = assetUrlMap.get(assetId);
    if (url) result.set(normRef, url);
  }

  return result;
}

/**
 * Builds the dry-run context maps for a given organization.
 * Used by the Drive dry-run engine.
 *
 * Returns:
 *   - skuToProduct:     Map<normalizedSku, productId>
 *   - skuCounts:        Map<normalizedSku, count>
 *   - productsWithHero: Set<productId>
 */
export async function buildProductMapsForDryRun(organizationId: string): Promise<{
  skuToProduct:     Map<string, string>;
  skuCounts:        Map<string, number>;
  productsWithHero: Set<string>;
}> {
  // All products with SKUs
  const products = await prisma.productEntity.findMany({
    where: { organizationId, sku: { not: null } },
    select: { id: true, sku: true },
  });

  const skuToProduct = new Map<string, string>();
  const skuCounts    = new Map<string, number>();

  for (const p of products) {
    if (!p.sku) continue;
    const norm = normalizeReference(p.sku);
    skuCounts.set(norm, (skuCounts.get(norm) ?? 0) + 1);
    skuToProduct.set(norm, p.id); // last one wins if duplicates
  }

  // Products that already have a hero asset
  const heroLinks = await prisma.productAssetLink.findMany({
    where: { organizationId, role: "hero" },
    select: { productId: true },
  });
  const productsWithHero = new Set(heroLinks.map(l => l.productId));

  return { skuToProduct, skuCounts, productsWithHero };
}

/**
 * Returns Set<driveFileId> of Drive files already imported for this org.
 * Uses providerMeta.sourceType === "drive_import" on GeneratedAsset.
 *
 * NOTE: This queries providerMeta JSON field. For 04A (dry-run only),
 * this will return an empty set since no Drive imports have been executed.
 * Included for completeness of the idempotency contract.
 */
export async function getImportedDriveFileIds(
  organizationId: string,
): Promise<Set<string>> {
  // Query GeneratedAssets linked to this org's products
  // that were sourced from Drive imports
  const links = await prisma.productAssetLink.findMany({
    where: {
      organizationId,
      sourceType: "drive_import",
    },
    select: { assetId: true },
  });

  if (links.length === 0) return new Set();

  const assets = await prisma.generatedAsset.findMany({
    where: {
      id: { in: links.map(l => l.assetId) },
    },
    select: { providerMeta: true },
  });

  const driveIds = new Set<string>();
  for (const a of assets) {
    const meta = a.providerMeta as Record<string, unknown> | null;
    if (meta && typeof meta.driveFileId === "string") {
      driveIds.add(meta.driveFileId);
    }
  }

  return driveIds;
}
