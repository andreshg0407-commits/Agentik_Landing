/**
 * lib/marketing-studio/products/product-query-service.ts
 *
 * MS-06 — Product Console Query Service
 *
 * Server-only. Orchestrates repository calls into display-ready
 * ProductConsoleItem objects for Biblioteca.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - Composes repository functions (no direct Prisma)
 *   - Joins GeneratedAsset URLs through batched lookup
 *   - Returns ProductConsoleItem[] — safe for Server → Client prop passing
 *   - All organizationId-scoped
 */

import { prisma } from "@/lib/prisma";
import {
  listOrgProducts,
  getProductWithRelations,
  findProductByAssetId,
  getProductActivity,
} from "./product-repository";
import {
  buildProductConsoleItem,
  type ProductConsoleItem,
} from "./product-display";

// ── Asset URL resolver ─────────────────────────────────────────────────────────

/**
 * resolveAssetUrls — batch fetches CDN URLs from GeneratedAsset
 * for a set of assetIds. Returns a Map<assetId, assetUrl>.
 */
async function resolveAssetUrls(
  assetIds: string[],
): Promise<Map<string, string | null>> {
  if (assetIds.length === 0) return new Map();

  const assets = await prisma.generatedAsset.findMany({
    where:  { id: { in: assetIds } },
    select: { id: true, assetUrl: true },
  });

  return new Map(assets.map(a => [a.id, a.assetUrl ?? null]));
}

/**
 * getPrimaryAssetUrl — finds the hero assetId from an entity's links
 * and returns its resolved URL.
 */
function getPrimaryAssetUrl(
  assetLinks: Array<{ assetId: string; role: string }>,
  urlMap:     Map<string, string | null>,
): string | null {
  const hero = assetLinks.find(l => l.role === "hero") ?? assetLinks[0];
  if (!hero) return null;
  return urlMap.get(hero.assetId) ?? null;
}

// ── Main query functions ───────────────────────────────────────────────────────

/**
 * listProductConsoleItems — loads all ProductEntities for an org and
 * hydrates them into ProductConsoleItem display objects.
 *
 * Used by biblioteca/page.tsx to populate the product grid.
 */
export async function listProductConsoleItems(
  organizationId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ProductConsoleItem[]> {
  // 1. Load products (basic fields + persisted readiness)
  const products = await listOrgProducts(organizationId, {
    limit:  opts.limit ?? 100,
    offset: opts.offset ?? 0,
  });

  if (products.length === 0) return [];

  // 2. Load full relations for each product in parallel (batched)
  const fullProducts = await Promise.all(
    products.map(p => getProductWithRelations(organizationId, p.id))
  );
  const loaded = fullProducts.filter((p): p is NonNullable<typeof p> => p !== null);

  // 3. Collect all hero assetIds and batch-resolve URLs
  const allAssetIds = loaded.flatMap(p => p.assetLinks.map(l => l.assetId));
  const urlMap      = await resolveAssetUrls(allAssetIds);

  // 4. Load activity (last 5 events per product for summary)
  const activityMap = new Map<string, Awaited<ReturnType<typeof getProductActivity>>>();
  await Promise.all(
    loaded.map(async p => {
      const events = await getProductActivity(organizationId, p.id, 5);
      activityMap.set(p.id, events);
    })
  );

  // 5. Build display items
  return loaded.map(p => {
    const primaryUrl  = getPrimaryAssetUrl(p.assetLinks, urlMap);
    const activity    = activityMap.get(p.id) ?? [];
    const assetDetails = p.assetLinks.map(l => ({
      id:        l.assetId,
      assetUrl:  urlMap.get(l.assetId) ?? null,
      role:      l.role,
      createdAt: l.createdAt.toISOString(),
    }));
    return buildProductConsoleItem(p, primaryUrl, activity, assetDetails);
  });
}

/**
 * getProductConsoleDetail — loads a single product's full detail
 * for the ProductDetailDrawer.
 *
 * Returns null if product not found or not owned by org.
 */
export async function getProductConsoleDetail(
  organizationId: string,
  productId:      string,
): Promise<{
  item:           ProductConsoleItem;
  attributes:     { key: string; label: string; valueText: string | null; valueNumber: number | null; valueBoolean: boolean | null; valueJson: string[] | null; type: string; destination: string | null }[];
  activityEvents: { id: string; eventType: string; actorLabel: string | null; occurredAt: string; payload: Record<string, unknown> }[];
} | null> {
  const product = await getProductWithRelations(organizationId, productId);
  if (!product) return null;

  const allAssetIds = product.assetLinks.map(l => l.assetId);
  const urlMap      = await resolveAssetUrls(allAssetIds);
  const primaryUrl  = getPrimaryAssetUrl(product.assetLinks, urlMap);
  const activity    = await getProductActivity(organizationId, productId, 30);

  const assetDetails = product.assetLinks.map(l => ({
    id:        l.assetId,
    assetUrl:  urlMap.get(l.assetId) ?? null,
    role:      l.role,
    createdAt: l.createdAt.toISOString(),
  }));
  const item = buildProductConsoleItem(product, primaryUrl, activity, assetDetails);

  return {
    item,
    attributes: product.attributes.map(a => ({
      key:          a.key,
      label:        a.label,
      valueText:    a.valueText,
      valueNumber:  a.valueNumber,
      valueBoolean: a.valueBoolean,
      valueJson:    a.valueJson,
      type:         a.type,
      destination:  a.destination,
    })),
    activityEvents: activity.map(e => ({
      id:         e.id,
      eventType:  e.eventType,
      actorLabel: e.actorLabel,
      occurredAt: e.occurredAt.toISOString(),
      payload:    e.payload,
    })),
  };
}

/**
 * findProductByAssetIdForConsole — looks up the product linked to an asset
 * and returns its console item. Used to bridge legacy asset approval flow.
 */
export async function findProductByAssetIdForConsole(
  organizationId: string,
  assetId:        string,
): Promise<ProductConsoleItem | null> {
  const product = await findProductByAssetId(organizationId, assetId);
  if (!product) return null;

  const full = await getProductWithRelations(organizationId, product.id);
  if (!full) return null;

  const urlMap     = await resolveAssetUrls(full.assetLinks.map(l => l.assetId));
  const primaryUrl = getPrimaryAssetUrl(full.assetLinks, urlMap);
  const activity   = await getProductActivity(organizationId, full.id, 5);

  const assetDetails = full.assetLinks.map(l => ({
    id:        l.assetId,
    assetUrl:  urlMap.get(l.assetId) ?? null,
    role:      l.role,
    createdAt: l.createdAt.toISOString(),
  }));
  return buildProductConsoleItem(full, primaryUrl, activity, assetDetails);
}
