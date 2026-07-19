/**
 * lib/marketing-studio/commerce/shopify-mapping.ts
 *
 * MS-09A — Shopify Transformation Layer
 *
 * Pure transformation: ProductConsoleItem → Shopify-ready payload DTO.
 * NO API calls, NO fetch, NO side effects.
 *
 * When MS-10 implements real Shopify sync, this payload is POSTed as-is
 * to the Shopify Admin API or sent through the n8n integration gateway.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   All output is a flat, serializable DTO.
 *   Shopify REST API-compatible field names (snake_case on the payload side,
 *   camelCase in the TS interface for type safety).
 */

import type { ProductConsoleItem } from "../products/product-display";

// ── Shopify DTOs ──────────────────────────────────────────────────────────────

export interface ShopifyVariantPayload {
  sku:              string | null;
  title:            string;
  price:            string;           // Shopify expects string prices
  inventoryPolicy:  "deny" | "continue";
  inventoryQuantity: number;
  weight:           number | null;
  weightUnit:       "kg" | "g" | "lb" | "oz";
  requiresShipping: boolean;
  taxable:          boolean;
}

export interface ShopifyImagePayload {
  src:      string;
  altText:  string;
  position: number;
}

export interface ShopifySeoPayload {
  title:       string | null;
  description: string | null;
}

export interface ShopifyProductPayload {
  // ── Core fields ──
  title:       string;
  handle:      string;         // URL-safe slug
  bodyHtml:    string;         // product description as HTML
  vendor:      string;
  productType: string;
  tags:        string[];
  status:      "draft" | "active" | "archived";

  // ── Variants ──
  variants:  ShopifyVariantPayload[];

  // ── Images ──
  images:    ShopifyImagePayload[];

  // ── SEO ──
  seo:       ShopifySeoPayload;

  // ── Collections ──
  suggestedCollections: string[];

  // ── Publication readiness ──
  isPublishable:     boolean;
  missingForPublish: string[];

  // ── Inventory ──
  tracksInventory: boolean;
}

// ── Slug generator ────────────────────────────────────────────────────────────

function toHandle(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")    // remove accents
    .replace(/[^a-z0-9\s-]/g, "")       // keep alphanumeric and hyphens
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 255);
}

// ── Tag builder ───────────────────────────────────────────────────────────────

function buildTags(product: ProductConsoleItem): string[] {
  const tags: string[] = [];
  if (product.category)   tags.push(product.category.toLowerCase().replace(/\s+/g, "-"));
  if (product.sku)        tags.push(`sku-${product.sku.toLowerCase()}`);
  if (product.readinessScore >= 70) tags.push("high-readiness");
  if (product.variantCount > 0) tags.push("has-variants");
  if (product.readyDestinations.includes("shopify" as never)) tags.push("shopify-ready");
  return tags;
}

// ── Variant builder ───────────────────────────────────────────────────────────

function buildVariants(product: ProductConsoleItem): ShopifyVariantPayload[] {
  // Default variant (Shopify requires at least one)
  const baseVariant: ShopifyVariantPayload = {
    sku:               product.sku,
    title:             "Default",
    price:             "0.00",      // PLACEHOLDER — price field not in ProductConsoleItem yet
    inventoryPolicy:   "deny",
    inventoryQuantity: 0,
    weight:            null,
    weightUnit:        "kg",
    requiresShipping:  true,
    taxable:           true,
  };

  if (product.variantCount <= 1) return [baseVariant];

  // Generate placeholder variant entries for additional variants
  // Real variant data will come from ProductVariant records in MS-10
  return [
    baseVariant,
    ...Array.from({ length: product.variantCount - 1 }, (_, i) => ({
      ...baseVariant,
      title: `Variante ${i + 2}`,
      sku:   product.sku ? `${product.sku}-V${i + 2}` : null,
    })),
  ];
}

// ── Image builder ─────────────────────────────────────────────────────────────

function buildImages(product: ProductConsoleItem): ShopifyImagePayload[] {
  if (!product.primaryAssetUrl) return [];
  return [
    {
      src:      product.primaryAssetUrl,
      altText:  product.name,
      position: 1,
    },
  ];
}

// ── SEO builder ───────────────────────────────────────────────────────────────

function buildSeo(product: ProductConsoleItem): ShopifySeoPayload {
  const title = product.name
    ? `${product.name}${product.sku ? ` — ${product.sku}` : ""}${product.category ? ` | ${product.category}` : ""}`
    : null;

  return {
    title:       title?.slice(0, 70) ?? null,
    description: null,   // description field not yet in ProductConsoleItem — will be wired in MS-10
  };
}

// ── Collection suggestions ────────────────────────────────────────────────────

function buildSuggestedCollections(product: ProductConsoleItem): string[] {
  const collections: string[] = [];
  if (product.category)          collections.push(product.category);
  if (product.readinessScore >= 70) collections.push("Featured");
  if (product.variantCount > 1)     collections.push("Multi-variant");
  if (product.readyDestinations.includes("ads" as never)) collections.push("Advertisable");
  return [...new Set(collections)];
}

// ── Publishability check ──────────────────────────────────────────────────────

function checkPublishability(product: ProductConsoleItem): {
  isPublishable:     boolean;
  missingForPublish: string[];
} {
  const missing: string[] = [];

  if (!product.name?.trim())        missing.push("Nombre comercial");
  if (!product.sku)                 missing.push("SKU");
  if (!product.category)            missing.push("Categoría / Product Type");
  if (!product.primaryAssetUrl)     missing.push("Imagen principal");
  if (product.milaSignals.some(s => s.key === "missing_commercial_data")) {
    missing.push("Precio");
  }

  return { isPublishable: missing.length === 0, missingForPublish: missing };
}

// ── Main transformer ──────────────────────────────────────────────────────────

export function buildShopifyPayload(product: ProductConsoleItem): ShopifyProductPayload {
  const { isPublishable, missingForPublish } = checkPublishability(product);

  return {
    title:       product.name,
    handle:      toHandle(product.name),
    bodyHtml:    "",    // description not in ProductConsoleItem yet — wired in MS-10
    vendor:      "Agentik",
    productType: product.category ?? "",
    tags:        buildTags(product),
    status:      isPublishable ? "draft" : "draft",   // "active" only after operator confirms publish

    variants:  buildVariants(product),
    images:    buildImages(product),
    seo:       buildSeo(product),

    suggestedCollections: buildSuggestedCollections(product),
    isPublishable,
    missingForPublish,
    tracksInventory: true,
  };
}
