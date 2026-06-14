/**
 * lib/integrations/shopify/shopify-types.ts
 *
 * MS-10 — Shopify Integration Types
 *
 * Type contracts for the Shopify Admin API integration.
 * No API calls, no secrets, no side effects.
 */

// ── Config ────────────────────────────────────────────────────────────────────

export const SHOPIFY_API_VERSION_DEFAULT = "2024-01";

export const SHOPIFY_SCOPES_REQUIRED = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_collections",
  "write_collections",
] as const;

export type ShopifyScope = typeof SHOPIFY_SCOPES_REQUIRED[number];

// ── Connection config ─────────────────────────────────────────────────────────

export interface ShopifyConnectionConfig {
  shopDomain:   string;   // e.g. "my-store.myshopify.com"
  apiVersion:   string;   // e.g. "2024-01"
  scopes:       string[];
}

// ── OAuth types ───────────────────────────────────────────────────────────────

export interface ShopifyAuthUrlParams {
  shopDomain:    string;
  clientId:      string;
  redirectUri:   string;
  scopes:        string[];
  state:         string;  // anti-CSRF nonce
}

export interface ShopifyAuthUrl {
  url:   string;
  state: string;
}

export interface ShopifyTokenExchangeParams {
  shopDomain:    string;
  code:          string;
  clientId:      string;
  clientSecret:  string;  // ⚠ server-only — never log
}

/** Result of token exchange — server-only, never send to client */
export interface ShopifyAccessTokenResult {
  accessToken:       string;   // ⚠ server-only
  scope:             string;   // comma-separated granted scopes
  associatedUser?:   ShopifyAssociatedUser;
  expiresIn?:        number;   // seconds, if present
}

export interface ShopifyAssociatedUser {
  id:         number;
  email:      string;
  firstName:  string;
  lastName:   string;
  accountOwner: boolean;
}

// ── Shop info (from GET /admin/api/{version}/shop.json) ───────────────────────

export interface ShopifyShopInfo {
  id:                  number;
  name:                string;
  email:               string;
  domain:              string;
  myshopifyDomain:     string;
  planName:            string;
  currency:            string;
  country:             string;
  primaryLocale:       string;
  timezone:            string;
  ianaTimezone:        string;
}

// ── Webhook types ─────────────────────────────────────────────────────────────

export const SHOPIFY_WEBHOOK_TOPIC = {
  PRODUCTS_CREATE:   "products/create",
  PRODUCTS_UPDATE:   "products/update",
  PRODUCTS_DELETE:   "products/delete",
  INVENTORY_UPDATE:  "inventory_items/update",
  APP_UNINSTALLED:   "app/uninstalled",
  SHOP_UPDATE:       "shop/update",
} as const;
export type ShopifyWebhookTopic = typeof SHOPIFY_WEBHOOK_TOPIC[keyof typeof SHOPIFY_WEBHOOK_TOPIC];

export interface ShopifyWebhookHeaders {
  "x-shopify-hmac-sha256":    string;
  "x-shopify-shop-domain":    string;
  "x-shopify-topic":          string;
  "x-shopify-webhook-id":     string;
  "x-shopify-api-version":    string;
}

// ── Product draft payload (Shopify Admin API) ─────────────────────────────────
// See: https://shopify.dev/docs/api/admin-rest/2024-01/resources/product

export interface ShopifyAdminProductDraft {
  product: {
    title:         string;
    body_html:     string;
    vendor:        string;
    product_type:  string;
    tags:          string;     // comma-separated
    status:        "draft" | "active" | "archived";
    variants:      ShopifyAdminVariantDraft[];
    images:        ShopifyAdminImageDraft[];
  };
}

export interface ShopifyAdminVariantDraft {
  sku:                 string | null;
  title:               string;
  price:               string;           // string per Shopify API
  inventory_policy:    "deny" | "continue";
  inventory_quantity:  number;
  requires_shipping:   boolean;
  taxable:             boolean;
}

export interface ShopifyAdminImageDraft {
  src:     string;
  alt:     string;
  position: number;
}

// ── Shopify created product response ─────────────────────────────────────────

export interface ShopifyCreatedProduct {
  id:       number;
  handle:   string;
  status:   string;
  adminUrl: string;
  variants: Array<{
    id:    number;
    sku:   string | null;
    title: string;
  }>;
  images: Array<{
    id:  number;
    src: string;
  }>;
}

// ── Shopify product options (for multi-variant products) ──────────────────────

export interface ShopifyProductOption {
  name:   string;
  values: string[];
}

// ── Full product create payload (with options) ────────────────────────────────

export interface ShopifyAdminProductCreatePayload {
  product: {
    title:        string;
    body_html:    string;
    vendor:       string;
    product_type: string;
    tags:         string;
    status:       "draft" | "active" | "archived";
    options?:     ShopifyProductOption[];
    variants:     Array<{
      sku:                 string | null;
      title:               string;
      price:               string;
      option1?:            string | null;
      option2?:            string | null;
      option3?:            string | null;
      inventory_policy:    "deny" | "continue";
      inventory_quantity:  number;
      requires_shipping:   boolean;
      taxable:             boolean;
    }>;
    images: Array<{
      src:      string;
      alt:      string;
      position: number;
    }>;
  };
}

// ── Custom Collections (SHOPIFY-COLLECTIONS-03) ───────────────────────────────
// Shopify Admin REST API: /admin/api/{version}/custom_collections.json

export interface ShopifyCustomCollection {
  id:             number;
  handle:         string;
  title:          string;
  body_html:      string | null;
  published_at:   string | null;
  updated_at:     string | null;
  sort_order:     string;
  products_count: number;
}

/** A "collect" is the membership record linking a product to a collection. */
export interface ShopifyCollect {
  id:            number;
  collection_id: number;
  product_id:    number;
  created_at:    string;
  sort_value:    string;
}

export interface ShopifyCustomCollectionCreateInput {
  title:      string;
  handle?:    string;
  body_html?: string;
  published?: boolean;
}

// ── Health check result ───────────────────────────────────────────────────────

export interface ShopifyHealthCheckResult {
  ok:            boolean;
  shopDomain:    string | null;
  shopName:      string | null;
  planName:      string | null;
  apiVersion:    string;
  grantedScopes: string[];
  checkedAt:     string;  // ISO
  errorMessage:  string | null;
}
