/**
 * lib/marketing-studio/commerce/shopify-banner-asset-query.ts
 *
 * SHOPIFY-BANNERS-PRODUCTION-02 — Approved Asset Query for Banner Selector
 *
 * SERVER ONLY — never import from client components.
 *
 * Queries approved assets from Biblioteca for the banner selector.
 * Uses AgentExecution as persistence (same pattern as landing drafts).
 *
 * When LibraryAsset Prisma model is added (sprint MS-DB),
 * update this to query that table instead.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { ShopifyBannerAsset } from "./shopify-banner-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

const MODULE = "marketing_studio";
const ASSET_OP = "BIBLIOTECA_APPROVED_ASSET";

export interface ApprovedAssetFilter {
  search?:       string;
  assetTypes?:   string[];
  referenceId?:  string;
  collectionId?: string;
  campaignId?:   string;
  limit?:        number;
  offset?:       number;
}

export interface ApprovedAssetResult {
  assets:  ShopifyBannerAsset[];
  total:   number;
  hasMore: boolean;
}

/**
 * Queries approved assets available for banner selection.
 *
 * Searches across:
 *   - AgentExecution records with BIBLIOTECA_APPROVED_ASSET operation
 *   - Foto Estudio approved outputs
 *   - Any asset with status "approved" or "published"
 */
export async function queryApprovedAssets(
  tenantId: string,
  filter:   ApprovedAssetFilter = {},
): Promise<ApprovedAssetResult> {
  const limit  = Math.min(filter.limit ?? 50, 100);
  const offset = filter.offset ?? 0;

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId,
    module:    MODULE,
    operation: { in: [ASSET_OP, "FOTO_ESTUDIO_OUTPUT", "BIBLIOTECA_ASSET"] },
    status:    { in: ["approved", "published"] },
  };

  const rows = await execDb().findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take:    limit + 1,
    skip:    offset,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let assets: ShopifyBannerAsset[] = rows.map((r: any) => {
    const m = (r.metadataJson ?? {}) as Record<string, unknown>;
    return {
      assetId:      r.id,
      assetType:    (m.assetType as ShopifyBannerAsset["assetType"]) ?? "banner",
      nombre:       (m.name as string) ?? (m.nombre as string) ?? "Sin nombre",
      url:          (m.url as string | null) ?? null,
      thumbnailUrl: (m.thumbnailUrl as string | null) ?? (m.url as string | null) ?? null,
      referencia:   (m.sku as string | null) ?? (m.referenceId as string | null) ?? null,
      coleccion:    (m.collection as string | null) ?? (m.coleccion as string | null) ?? null,
      aprobadoAt:   (m.approvedAt as string | null) ?? (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? "")),
    };
  });

  // Apply client-side filters (DB-level JSON filtering is limited)
  if (filter.search) {
    const q = filter.search.toLowerCase();
    assets = assets.filter(a =>
      a.nombre.toLowerCase().includes(q) ||
      (a.referencia?.toLowerCase().includes(q) ?? false) ||
      (a.coleccion?.toLowerCase().includes(q) ?? false),
    );
  }

  if (filter.assetTypes && filter.assetTypes.length > 0) {
    assets = assets.filter(a => filter.assetTypes!.includes(a.assetType));
  }

  if (filter.referenceId) {
    assets = assets.filter(a => a.referencia === filter.referenceId);
  }

  if (filter.collectionId) {
    assets = assets.filter(a => a.coleccion === filter.collectionId);
  }

  const hasMore = rows.length > limit;
  if (hasMore) assets = assets.slice(0, limit);

  // Count total (simplified — in production use a count query)
  const total = offset + assets.length + (hasMore ? 1 : 0);

  return { assets, total, hasMore };
}

/**
 * Returns collections available for filtering.
 */
export async function getAvailableCollections(tenantId: string): Promise<string[]> {
  const result = await queryApprovedAssets(tenantId, { limit: 100 });
  const collections = new Set<string>();
  for (const a of result.assets) {
    if (a.coleccion) collections.add(a.coleccion);
  }
  return [...collections].sort();
}
