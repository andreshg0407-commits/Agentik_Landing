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
  "read_price_rules",
  "write_price_rules",
  "read_orders",           // SHOPIFY-OPERATIONS-01
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

// ── Price Rules + Discount Codes (SHOPIFY-PROMOTIONS-04) ─────────────────────
// Shopify Admin REST API: /admin/api/{version}/price_rules.json
//
// A PriceRule defines the discount mechanics (value, scope, dates).
// A DiscountCode is an optional redemption code attached to a price rule.
// "Automatic" discounts are applied without a code (target_selection = "all",
// no code created). Future: Shopify native automatic discounts use GraphQL only.

export interface ShopifyPriceRule {
  id:                       number;
  title:                    string;
  target_type:              "line_item" | "shipping_line";
  target_selection:         "all" | "entitled";
  allocation_method:        "each" | "across";
  value_type:               "fixed_amount" | "percentage";
  /** Negative string: "-20.0" means 20% off or $20 off */
  value:                    string;
  once_per_customer:        boolean;
  usage_limit:              number | null;
  customer_selection:       "all" | "prerequisite";
  starts_at:                string;         // ISO8601
  ends_at:                  string | null;  // ISO8601, null = no expiry
  created_at:               string;
  updated_at:               string;
  entitled_product_ids:     number[];
  entitled_variant_ids:     number[];
  entitled_collection_ids:  number[];
  entitled_country_ids:     number[];
}

export interface ShopifyDiscountCode {
  id:            number;
  price_rule_id: number;
  code:          string;
  usage_count:   number;
  created_at:    string;
  updated_at:    string;
  errors:        Record<string, string[]>;
}

export interface ShopifyPriceRuleCreateInput {
  title:                    string;
  target_type:              "line_item" | "shipping_line";
  target_selection:         "all" | "entitled";
  allocation_method:        "each" | "across";
  value_type:               "fixed_amount" | "percentage";
  /** Negative: "-20.0" for 20% off or $20 off */
  value:                    string;
  customer_selection:       "all" | "prerequisite";
  starts_at:                string;
  ends_at?:                 string | null;
  usage_limit?:             number | null;
  once_per_customer?:       boolean;
  entitled_product_ids?:    number[];
  entitled_variant_ids?:    number[];
  entitled_collection_ids?: number[];
}

export interface ShopifyDiscountCodeCreateInput {
  code: string;
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

// ── Orders (SHOPIFY-OPERATIONS-01) ────────────────────────────────────────────
// Shopify Admin REST API: /admin/api/{version}/orders.json
//
// Orders include inline fulfillments and refunds when fetched with the
// default field set. No extra API calls needed for the operations domain.
// Requires: read_orders scope.

export interface ShopifyOrder {
  id:                  number;
  /** Display name shown to customer: "#1001" */
  name:                string;
  order_number:        number;
  email:               string | null;
  phone:               string | null;
  created_at:          string;   // ISO8601
  updated_at:          string;
  cancelled_at:        string | null;
  cancel_reason:       string | null;
  /**
   * Payment state of the order.
   * "voided" = payment was cancelled/reversed.
   */
  financial_status:
    | "pending"
    | "authorized"
    | "partially_paid"
    | "paid"
    | "partially_refunded"
    | "refunded"
    | "voided";
  /**
   * Fulfilment state of the order.
   * null = not yet fulfilled, "partial" = some items, "fulfilled" = all items.
   */
  fulfillment_status:  "fulfilled" | "partial" | "restocked" | null;
  total_price:         string;   // e.g. "120.00"
  subtotal_price:      string;
  currency:            string;   // e.g. "COP"
  tags:                string;   // comma-separated
  note:                string | null;
  customer:            ShopifyOrderCustomer | null;
  line_items:          ShopifyOrderLineItem[];
  fulfillments:        ShopifyFulfillment[];
  refunds:             ShopifyRefund[];
  shipping_address:    ShopifyOrderAddress | null;
}

export interface ShopifyOrderCustomer {
  id:          number;
  first_name:  string | null;
  last_name:   string | null;
  email:       string | null;
  phone:       string | null;
}

export interface ShopifyOrderLineItem {
  id:                   number;
  title:                string;
  quantity:             number;
  price:                string;
  sku:                  string | null;
  fulfillable_quantity: number;
  fulfillment_status:   string | null;
  variant_id:           number | null;
  product_id:           number | null;
}

export interface ShopifyOrderAddress {
  first_name: string | null;
  last_name:  string | null;
  address1:   string | null;
  city:       string | null;
  province:   string | null;
  country:    string | null;
  zip:        string | null;
}

export interface ShopifyFulfillment {
  id:               number;
  order_id:         number;
  /** Operational state of the fulfillment process. */
  status:           "pending" | "open" | "success" | "cancelled" | "error" | "failure";
  created_at:       string;
  updated_at:       string;
  tracking_company: string | null;   // "Servientrega", "FedEx", etc.
  tracking_number:  string | null;
  tracking_url:     string | null;
  /**
   * Carrier-reported delivery state.
   * null = not yet reported by carrier.
   */
  shipment_status:
    | "label_printed"
    | "label_purchased"
    | "attempted_delivery"
    | "ready_for_pickup"
    | "confirmed"
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "failure"
    | null;
  destination:      ShopifyFulfillmentDestination | null;
  line_items:       Array<{ id: number; quantity: number; title: string }>;
}

export interface ShopifyFulfillmentDestination {
  first_name: string | null;
  last_name:  string | null;
  address1:   string | null;
  city:       string | null;
  country:    string | null;
}

export interface ShopifyRefund {
  id:                 number;
  order_id:           number;
  created_at:         string;
  processed_at:       string | null;
  note:               string | null;
  refund_line_items:  ShopifyRefundLineItem[];
  transactions:       ShopifyRefundTransaction[];
}

export interface ShopifyRefundLineItem {
  id:           number;
  quantity:     number;
  line_item_id: number;
  line_item:    ShopifyOrderLineItem;
}

export interface ShopifyRefundTransaction {
  id:         number;
  kind:       "refund" | "void";
  status:     "pending" | "failure" | "success" | "error";
  amount:     string;
  currency:   string;
  gateway:    string;
  created_at: string;
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
