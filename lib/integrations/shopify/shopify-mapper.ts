/**
 * lib/integrations/shopify/shopify-mapper.ts
 *
 * MS-10 — Shopify Product Payload Mapper
 *
 * Transforms an Agentik ProductConsoleItem into a Shopify Admin API
 * product draft payload, ready for POST /admin/api/{version}/products.json.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Builds on MS-09's shopify-mapping.ts (internal DTO layer).
 *   This mapper outputs the actual Shopify REST API snake_case format.
 *   Pure computation — no Prisma, no fetch, no side effects.
 */

import type { ProductConsoleItem } from "@/lib/marketing-studio/products/product-display";
import { buildShopifyPayload }     from "@/lib/marketing-studio/commerce/shopify-mapping";
import type {
  ShopifyAdminProductDraft,
  ShopifyAdminVariantDraft,
  ShopifyAdminImageDraft,
} from "./shopify-types";

// ── Mapper ────────────────────────────────────────────────────────────────────

/**
 * Maps an Agentik product to a Shopify Admin API draft payload.
 *
 * The returned payload targets POST /admin/api/{version}/products.json.
 * status is always "draft" — never "active" until MS-11 operator confirms.
 *
 * Returns null if the product is not publishable (missing required fields).
 */
export function mapAgentikProductToShopifyDraftPayload(
  product: ProductConsoleItem,
): ShopifyAdminProductDraft | null {
  const dto = buildShopifyPayload(product);

  // Never map unpublishable products to avoid bad data in Shopify
  if (!dto.isPublishable) return null;

  const variants: ShopifyAdminVariantDraft[] = dto.variants.map(v => ({
    sku:                v.sku ?? null,
    title:              v.title,
    price:              v.price,
    inventory_policy:   v.inventoryPolicy,
    inventory_quantity: v.inventoryQuantity,
    requires_shipping:  v.requiresShipping,
    taxable:            v.taxable,
  }));

  const images: ShopifyAdminImageDraft[] = dto.images.map(img => ({
    src:      img.src,
    alt:      img.altText,
    position: img.position,
  }));

  return {
    product: {
      title:        dto.title,
      body_html:    dto.bodyHtml,
      vendor:       dto.vendor,
      product_type: dto.productType,
      tags:         dto.tags.join(", "),
      status:       "draft",   // always draft — MS-11 will handle activation
      variants,
      images,
    },
  };
}

// ── Publishability check ──────────────────────────────────────────────────────

export function getShopifyPublishabilityReport(product: ProductConsoleItem): {
  isPublishable:     boolean;
  missingFields:     string[];
  shopifyHandle:     string;
  suggestedCollections: string[];
} {
  const dto = buildShopifyPayload(product);
  return {
    isPublishable:        dto.isPublishable,
    missingFields:        dto.missingForPublish,
    shopifyHandle:        dto.handle,
    suggestedCollections: dto.suggestedCollections,
  };
}
