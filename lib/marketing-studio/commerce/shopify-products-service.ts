/**
 * lib/marketing-studio/commerce/shopify-products-service.ts
 *
 * SHOPIFY-PRODUCTS-01 — Productos Module Data Layer
 *
 * SERVER ONLY — never import from client components.
 *
 * Aggregates product data using existing engines.
 * No new logic. No Shopify API calls. Reads from the Agentik DB only.
 * Sources: listProductConsoleItems → buildPublicationQueue → ui-selectors.
 *
 * Copilot preparation surface:
 *   shopify.findUnpublishedProducts
 *   shopify.auditProductReadiness
 *   shopify.generateSeo
 *   shopify.enrichProductContent
 *   shopify.publishAfterEnrichment
 */

import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";
import { buildPublicationQueue }    from "@/lib/marketing-studio/commerce/publication-engine";
import { PUBLICATION_STATUS }       from "@/lib/marketing-studio/commerce/commerce-types";
import {
  needsShopifyCatalogEnrichment,
  isShopifyCatalogItemModified,
}                                   from "@/lib/marketing-studio/commerce/shopify-catalog-ui-selectors";

// ── Serializable types (RSC → client boundary safe) ───────────────────────────

/**
 * A single product row — all fields are plain JSON-safe values.
 */
export interface ProductRow {
  productId:         string;
  name:              string;
  sku:               string | null;
  category:          string | null;
  primaryAssetUrl:   string | null;
  publicationStatus: string;
  isPublishable:     boolean;
  readinessScore:    number;
  blockingCount:     number;
  warningCount:      number;
  hasSeo:            boolean;
  /** true if the product has at least one asset linked */
  hasImage:          boolean;
  /** non-null = product has been synced to Shopify */
  externalId:        string | null;
  updatedAt:         string;
}

/**
 * Catalog-level summary. All counters are derived — no extra queries.
 */
export interface ProductsSummary {
  total:                    number;
  publicados:               number;
  pendientes:               number;
  requierenAtencion:        number;
  sinImagen:                number;
  sinSeo:                   number;
  sinCategoria:             number;
  necesitanEnriquecimiento: number;
  modificados:              number;
  /** ISO string of the most recent product sync, or null */
  lastSyncAt:               string | null;
  /** All products, prioritized: blocked → pending → by readiness asc */
  items:                    ProductRow[];
}

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * Returns a fully serializable snapshot of the Shopify product catalog.
 *
 * Does NOT call the Shopify API.
 * Does NOT read from vault.
 * Does NOT require an access token.
 */
export async function getProductsSummary(
  organizationId: string,
): Promise<ProductsSummary> {
  const consoleItems = await listProductConsoleItems(organizationId);
  const queue        = buildPublicationQueue(consoleItems, "shopify");

  const rows: ProductRow[] = queue.map(q => ({
    productId:         q.productId,
    name:              q.productName,
    sku:               q.sku,
    category:          q.category,
    primaryAssetUrl:   q.primaryAssetUrl,
    publicationStatus: q.publicationStatus,
    isPublishable:     q.isPublishable,
    readinessScore:    q.readinessScore,
    blockingCount:     q.blockingCount,
    warningCount:      q.warningCount,
    hasSeo:            !!(q.shopifyPayload.seo.title && q.shopifyPayload.seo.description),
    hasImage:          q.assetCount > 0,
    externalId:        q.externalId,
    updatedAt:         q.updatedAt,
  }));

  // ── Priority sort: blocked → pending → low readiness ─────────────────────
  const items = [...rows].sort((a, b) => {
    if (b.blockingCount !== a.blockingCount) return b.blockingCount - a.blockingCount;
    const aActive = a.publicationStatus === PUBLICATION_STATUS.PUBLISHED;
    const bActive = b.publicationStatus === PUBLICATION_STATUS.PUBLISHED;
    if (aActive && !bActive) return 1;
    if (!aActive && bActive) return -1;
    return a.readinessScore - b.readinessScore;
  });

  // ── Counters ─────────────────────────────────────────────────────────────
  const publicados    = items.filter(i => i.publicationStatus === PUBLICATION_STATUS.PUBLISHED).length;
  const pendientes    = items.filter(i =>
    i.publicationStatus === PUBLICATION_STATUS.DRAFT ||
    i.publicationStatus === PUBLICATION_STATUS.QUEUED,
  ).length;
  const requierenAtencion        = items.filter(i => i.blockingCount > 0).length;
  const sinImagen                = items.filter(i => !i.hasImage).length;
  const sinSeo                   = items.filter(i => !i.hasSeo).length;
  const sinCategoria             = items.filter(i => !i.category).length;
  const necesitanEnriquecimiento = queue.filter(q => needsShopifyCatalogEnrichment(q)).length;
  const modificados              = queue.filter(q => isShopifyCatalogItemModified(q)).length;

  const lastSyncAt = queue.reduce<string | null>((best, q) => {
    if (!q.lastSyncAt) return best;
    if (!best)         return q.lastSyncAt;
    return q.lastSyncAt > best ? q.lastSyncAt : best;
  }, null);

  return {
    total: items.length,
    publicados,
    pendientes,
    requierenAtencion,
    sinImagen,
    sinSeo,
    sinCategoria,
    necesitanEnriquecimiento,
    modificados,
    lastSyncAt,
    items,
  };
}

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * One-line Spanish label for the OperationalWorkspaceHeader statusLabel.
 */
export function buildProductsStatusLabel(
  connected: boolean,
  summary:   ProductsSummary | null,
): string {
  if (!connected) return "Integración requerida";
  if (!summary)   return "Error al cargar catálogo";
  if (summary.requierenAtencion > 0) {
    const n = summary.requierenAtencion;
    return `${n} producto${n !== 1 ? "s" : ""} require${n !== 1 ? "n" : ""} atención`;
  }
  if (summary.total === 0) return "Sin productos en el catálogo";
  const pub = summary.publicados;
  const pen = summary.pendientes;
  return `${pub} publicado${pub !== 1 ? "s" : ""} · ${pen} pendiente${pen !== 1 ? "s" : ""}`;
}
