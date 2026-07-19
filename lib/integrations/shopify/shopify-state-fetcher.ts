/**
 * lib/integrations/shopify/shopify-state-fetcher.ts
 *
 * MS-12 — Shopify External State Fetcher
 *
 * Reads live state from the Shopify Admin API for a published product.
 * Returns a safe DTO — never exposes access tokens.
 *
 * ── DESIGN ──────────────────────────────────────────────────────────────────
 *   All API calls injected via ShopifyAdminClient.
 *   rawHash: SHA-256 of key fields for quick drift detection.
 *   SERVER ONLY — never import from client components.
 */

import { createShopifyClient } from "./shopify-client";
import { ShopifyApiError }     from "./shopify-errors";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface ShopifyExternalVariantState {
  id:                number;
  title:             string;
  sku:               string | null;
  price:             string;
  inventoryQuantity: number;
  inventoryPolicy:   string;
  updatedAt:         string;   // ISO
}

export interface ShopifyExternalImageState {
  id:       number;
  src:      string;
  alt:      string | null;
  position: number;
}

export interface ShopifyExternalProductState {
  externalProductId: number;
  title:             string;
  handle:            string;
  status:            "draft" | "active" | "archived" | string;
  vendor:            string;
  productType:       string;
  tags:              string[];
  publishedAt:       string | null;  // ISO
  updatedAt:         string;         // ISO
  variants:          ShopifyExternalVariantState[];
  images:            ShopifyExternalImageState[];
  rawHash:           string;   // deterministic fingerprint for quick drift detection
  fetchedAt:         string;   // ISO — when we fetched this
}

export type ShopifyFetchError =
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "api_error"
  | "network_error";

export interface ShopifyFetchResult {
  state:        ShopifyExternalProductState | null;
  error:        ShopifyFetchError | null;
  errorMessage: string | null;
}

// ── Raw Shopify REST response types ───────────────────────────────────────────

interface RawShopifyVariant {
  id:                 number;
  title:              string;
  sku:                string | null;
  price:              string;
  inventory_quantity: number;
  inventory_policy:   string;
  updated_at:         string;
}

interface RawShopifyImage {
  id:       number;
  src:      string;
  alt:      string | null;
  position: number;
}

interface RawShopifyProduct {
  id:           number;
  title:        string;
  handle:       string;
  status:       string;
  vendor:       string;
  product_type: string;
  tags:         string;
  published_at: string | null;
  updated_at:   string;
  variants:     RawShopifyVariant[];
  images:       RawShopifyImage[];
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

export async function fetchShopifyProductState(opts: {
  shopDomain:        string;
  accessToken:       string;    // ⚠ server-only — never log
  externalProductId: number | string;
}): Promise<ShopifyFetchResult> {
  const client = createShopifyClient(opts.shopDomain);

  let raw: RawShopifyProduct;
  try {
    const data = await (client as unknown as {
      request<T>(path: string, token: string): Promise<T>;
    }).request<{ product: RawShopifyProduct }>(
      `/products/${opts.externalProductId}.json`,
      opts.accessToken,
    );
    raw = data.product;
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      if (err.statusCode === 404) return { state: null, error: "not_found",     errorMessage: "Product not found on Shopify" };
      if (err.statusCode === 401) return { state: null, error: "unauthorized",  errorMessage: "Shopify access token unauthorized" };
      if (err.statusCode === 429) return { state: null, error: "rate_limited",  errorMessage: "Shopify rate limit reached" };
      return { state: null, error: "api_error", errorMessage: `Shopify API error: HTTP ${err.statusCode}` };
    }
    return { state: null, error: "network_error", errorMessage: "Network error reaching Shopify API" };
  }

  const state = mapRawProductToState(raw);
  return { state, error: null, errorMessage: null };
}

export async function fetchShopifyVariantState(opts: {
  shopDomain:   string;
  accessToken:  string;    // ⚠ server-only
  variantId:    number | string;
}): Promise<ShopifyExternalVariantState | null> {
  const client = createShopifyClient(opts.shopDomain);

  try {
    const data = await (client as unknown as {
      request<T>(path: string, token: string): Promise<T>;
    }).request<{ variant: RawShopifyVariant }>(
      `/variants/${opts.variantId}.json`,
      opts.accessToken,
    );
    return mapRawVariant(data.variant);
  } catch {
    return null;
  }
}

export async function fetchShopifyProductImages(opts: {
  shopDomain:        string;
  accessToken:       string;    // ⚠ server-only
  externalProductId: number | string;
}): Promise<ShopifyExternalImageState[]> {
  const client = createShopifyClient(opts.shopDomain);

  try {
    const data = await (client as unknown as {
      request<T>(path: string, token: string): Promise<T>;
    }).request<{ images: RawShopifyImage[] }>(
      `/products/${opts.externalProductId}/images.json`,
      opts.accessToken,
    );
    return data.images.map(mapRawImage);
  } catch {
    return [];
  }
}

export async function fetchShopifyProductMetafields(opts: {
  shopDomain:        string;
  accessToken:       string;    // ⚠ server-only
  externalProductId: number | string;
}): Promise<Record<string, string>> {
  const client = createShopifyClient(opts.shopDomain);

  try {
    const data = await (client as unknown as {
      request<T>(path: string, token: string): Promise<T>;
    }).request<{ metafields: Array<{ namespace: string; key: string; value: string }> }>(
      `/products/${opts.externalProductId}/metafields.json`,
      opts.accessToken,
    );
    const result: Record<string, string> = {};
    for (const mf of data.metafields) {
      result[`${mf.namespace}.${mf.key}`] = mf.value;
    }
    return result;
  } catch {
    return {};
  }
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapRawVariant(v: RawShopifyVariant): ShopifyExternalVariantState {
  return {
    id:                v.id,
    title:             v.title,
    sku:               v.sku,
    price:             v.price,
    inventoryQuantity: v.inventory_quantity,
    inventoryPolicy:   v.inventory_policy,
    updatedAt:         v.updated_at,
  };
}

function mapRawImage(img: RawShopifyImage): ShopifyExternalImageState {
  return { id: img.id, src: img.src, alt: img.alt, position: img.position };
}

function mapRawProductToState(raw: RawShopifyProduct): ShopifyExternalProductState {
  const tags = raw.tags
    ? raw.tags.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  const variants = (raw.variants ?? []).map(mapRawVariant);
  const images   = (raw.images   ?? []).map(mapRawImage);

  const rawHash = computeStateHash({
    title:       raw.title,
    handle:      raw.handle,
    status:      raw.status,
    productType: raw.product_type,
    vendor:      raw.vendor,
    tags:        raw.tags,
    updatedAt:   raw.updated_at,
    variantCount: variants.length,
    imageCount:   images.length,
    variantPrices: variants.map(v => `${v.id}:${v.price}`).join(","),
  });

  return {
    externalProductId: raw.id,
    title:             raw.title,
    handle:            raw.handle,
    status:            raw.status,
    vendor:            raw.vendor,
    productType:       raw.product_type,
    tags,
    publishedAt:       raw.published_at,
    updatedAt:         raw.updated_at,
    variants,
    images,
    rawHash,
    fetchedAt:         new Date().toISOString(),
  };
}

/** Deterministic hash of key product fields — used for quick drift detection */
function computeStateHash(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields, Object.keys(fields).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr  = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
