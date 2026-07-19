/**
 * lib/integrations/shopify/shopify-client.ts
 *
 * MS-10 — Shopify Admin API Client
 *
 * Thin wrapper over the Shopify Admin REST API.
 * All API calls are authenticated via X-Shopify-Access-Token header.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Access token is injected at call time — never stored on the client instance.
 *   No token logging anywhere in this file.
 *   SERVER ONLY — never import from client components.
 *
 * ── MS-10 SCOPE ───────────────────────────────────────────────────────────────
 *   MS-10: client structure + shop info + health check only.
 *   MS-11: product create / update / sync calls.
 */

import { SHOPIFY_API_VERSION_DEFAULT } from "./shopify-types";
import type {
  ShopifyShopInfo,
  ShopifyHealthCheckResult,
  ShopifyAdminProductCreatePayload,
  ShopifyCreatedProduct,
  ShopifyCustomCollection,
  ShopifyCustomCollectionCreateInput,
  ShopifyCollect,
  ShopifyPriceRule,
  ShopifyPriceRuleCreateInput,
  ShopifyDiscountCode,
  ShopifyDiscountCodeCreateInput,
  ShopifyOrder,
} from "./shopify-types";
import { ShopifyApiError, ShopifyConfigError, ShopifyProductCreateError } from "./shopify-errors";

// ── Client config ─────────────────────────────────────────────────────────────

export interface ShopifyClientConfig {
  shopDomain:  string;
  apiVersion?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class ShopifyAdminClient {
  private readonly shopDomain:  string;
  private readonly apiVersion:  string;

  constructor(config: ShopifyClientConfig) {
    this.shopDomain = config.shopDomain;
    this.apiVersion = config.apiVersion ?? SHOPIFY_API_VERSION_DEFAULT;
  }

  private baseUrl(): string {
    return `https://${this.shopDomain}/admin/api/${this.apiVersion}`;
  }

  private async request<T>(
    path:        string,
    accessToken: string,   // ⚠ server-only — never log
    options:     RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl()}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type":            "application/json",
        "X-Shopify-Access-Token":  accessToken,  // ⚠ never log
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Extract Shopify error code if present, but never log the token
      const errorCode = (() => {
        try {
          const json = JSON.parse(body);
          return json.errors ?? undefined;
        } catch {
          return undefined;
        }
      })();
      throw new ShopifyApiError(res.status, typeof errorCode === "string" ? errorCode : undefined);
    }

    return res.json() as Promise<T>;
  }

  // ── Shop info ───────────────────────────────────────────────────────────────

  async getShop(accessToken: string): Promise<ShopifyShopInfo> {
    const data = await this.request<{ shop: {
      id:             number;
      name:           string;
      email:          string;
      domain:         string;
      myshopify_domain: string;
      plan_name:      string;
      currency:       string;
      country:        string;
      primary_locale: string;
      timezone:       string;
      iana_timezone:  string;
    } }>("/shop.json", accessToken);

    const s = data.shop;
    return {
      id:              s.id,
      name:            s.name,
      email:           s.email,
      domain:          s.domain,
      myshopifyDomain: s.myshopify_domain,
      planName:        s.plan_name,
      currency:        s.currency,
      country:         s.country,
      primaryLocale:   s.primary_locale,
      timezone:        s.timezone,
      ianaTimezone:    s.iana_timezone,
    };
  }

  // ── Health check ────────────────────────────────────────────────────────────

  async checkHealth(accessToken: string): Promise<ShopifyHealthCheckResult> {
    try {
      const shop = await this.getShop(accessToken);
      return {
        ok:            true,
        shopDomain:    shop.myshopifyDomain,
        shopName:      shop.name,
        planName:      shop.planName,
        apiVersion:    this.apiVersion,
        grantedScopes: [],  // populated separately from stored scopes
        checkedAt:     new Date().toISOString(),
        errorMessage:  null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        ok:            false,
        shopDomain:    this.shopDomain,
        shopName:      null,
        planName:      null,
        apiVersion:    this.apiVersion,
        grantedScopes: [],
        checkedAt:     new Date().toISOString(),
        errorMessage:  message,  // safe — no token in ShopifyApiError messages
      };
    }
  }

  // ── Product creation (MS-11) ────────────────────────────────────────────────

  /**
   * Creates a product draft via POST /admin/api/{version}/products.json
   * Returns the created product with Shopify IDs, handle, variant IDs.
   *
   * ⚠ SERVER ONLY — accessToken is never logged.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateProduct(
    accessToken:       string,    // ⚠ server-only — never log
    shopifyProductId:  number | string,
    patch:             Record<string, unknown>,
  ): Promise<ShopifyCreatedProduct> {
    type RawProductResponse = {
      product: {
        id:     number;
        handle: string;
        status: string;
        admin_graphql_api_id: string;
        variants: Array<{ id: number; sku: string | null; title: string }>;
        images:   Array<{ id: number; src: string }>;
      };
    };

    let data: RawProductResponse;
    try {
      data = await this.request<RawProductResponse>(`/products/${shopifyProductId}.json`, accessToken, {
        method: "PUT",
        body:   JSON.stringify({ product: { id: shopifyProductId, ...patch } }),
      });
    } catch (err) {
      const message = err instanceof ShopifyApiError
        ? `Shopify API ${err.statusCode}: ${err.message}`
        : "Shopify product update failed";
      throw new ShopifyProductCreateError(message);
    }

    const p = data.product;
    return {
      id:       p.id,
      handle:   p.handle,
      status:   p.status,
      adminUrl: `https://${this.shopDomain}/admin/products/${p.id}`,
      variants: p.variants.map(v => ({ id: v.id, sku: v.sku ?? null, title: v.title })),
      images:   p.images.map(img => ({ id: img.id, src: img.src })),
    };
  }

  /**
   * Archives (soft-unpublishes) a Shopify product by setting status = "archived".
   * Does NOT delete the product from Shopify.
   *
   * ⚠ SERVER ONLY — accessToken is never logged.
   */
  async archiveProduct(
    accessToken:      string,    // ⚠ server-only — never log
    shopifyProductId: number | string,
  ): Promise<{ id: number; status: string; handle: string }> {
    type RawResponse = { product: { id: number; status: string; handle: string } };
    try {
      const data = await this.request<RawResponse>(`/products/${shopifyProductId}.json`, accessToken, {
        method: "PUT",
        body:   JSON.stringify({ product: { id: shopifyProductId, status: "archived" } }),
      });
      return { id: data.product.id, status: data.product.status, handle: data.product.handle };
    } catch (err) {
      const message = err instanceof ShopifyApiError
        ? `Shopify API ${err.statusCode}: ${err.message}`
        : "Shopify product archive failed";
      throw new ShopifyProductCreateError(message);
    }
  }

  /**
   * Activates a Shopify product by setting status = "active".
   * Use after createDraftProduct() to make the product visible in the store.
   *
   * ⚠ SERVER ONLY — accessToken is never logged.
   */
  async activateProduct(
    accessToken:      string,    // ⚠ server-only — never log
    shopifyProductId: number | string,
  ): Promise<{ id: number; status: string; handle: string }> {
    type RawResponse = { product: { id: number; status: string; handle: string } };
    try {
      const data = await this.request<RawResponse>(`/products/${shopifyProductId}.json`, accessToken, {
        method: "PUT",
        body:   JSON.stringify({ product: { id: shopifyProductId, status: "active" } }),
      });
      return { id: data.product.id, status: data.product.status, handle: data.product.handle };
    } catch (err) {
      const message = err instanceof ShopifyApiError
        ? `Shopify API ${err.statusCode}: ${err.message}`
        : "Shopify product activation failed";
      throw new ShopifyProductCreateError(message);
    }
  }

  /**
   * Upsert a batch of metafields on a product.
   * Called after create/update to push ProductContent fields.
   *
   * ⚠ SERVER ONLY — accessToken is never logged.
   */
  async upsertProductMetafields(
    accessToken:       string,    // ⚠ server-only — never log
    shopifyProductId:  number | string,
    metafields:        Array<{ namespace: string; key: string; value: string; type: string }>,
  ): Promise<void> {
    if (metafields.length === 0) return;
    // Shopify REST: PUT /admin/api/{version}/products/{id}.json with metafields array
    try {
      await this.request(`/products/${shopifyProductId}.json`, accessToken, {
        method: "PUT",
        body: JSON.stringify({ product: { id: shopifyProductId, metafields } }),
      });
    } catch {
      // Non-blocking — metafield sync failure does not fail the publication
    }
  }

  async createDraftProduct(
    accessToken: string,    // ⚠ server-only — never log
    payload:     ShopifyAdminProductCreatePayload,
  ): Promise<ShopifyCreatedProduct> {
    type RawProductResponse = {
      product: {
        id:     number;
        handle: string;
        status: string;
        admin_graphql_api_id: string;
        variants: Array<{
          id:    number;
          sku:   string | null;
          title: string;
        }>;
        images: Array<{
          id:  number;
          src: string;
        }>;
      };
    };

    let data: RawProductResponse;
    try {
      data = await this.request<RawProductResponse>("/products.json", accessToken, {
        method: "POST",
        body:   JSON.stringify(payload),
      });
    } catch (err) {
      const message = err instanceof ShopifyApiError
        ? `Shopify API ${err.statusCode}: ${err.message}`
        : "Shopify product create failed";
      throw new ShopifyProductCreateError(message);
    }

    const p = data.product;
    const adminUrl = `https://${this.shopDomain}/admin/products/${p.id}`;

    return {
      id:       p.id,
      handle:   p.handle,
      status:   p.status,
      adminUrl,
      variants: p.variants.map(v => ({ id: v.id, sku: v.sku ?? null, title: v.title })),
      images:   p.images.map(img => ({ id: img.id, src: img.src })),
    };
  }

  // ── Custom Collections (SHOPIFY-COLLECTIONS-03) ────────────────────────────

  /**
   * Lists all custom collections in the store.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async listCustomCollections(
    accessToken: string,    // ⚠ server-only
  ): Promise<ShopifyCustomCollection[]> {
    const data = await this.request<{ custom_collections: ShopifyCustomCollection[] }>(
      "/custom_collections.json?limit=250",
      accessToken,
    );
    return data.custom_collections;
  }

  /**
   * Creates a new custom collection.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async createCustomCollection(
    accessToken: string,    // ⚠ server-only
    input:       ShopifyCustomCollectionCreateInput,
  ): Promise<ShopifyCustomCollection> {
    const data = await this.request<{ custom_collection: ShopifyCustomCollection }>(
      "/custom_collections.json",
      accessToken,
      { method: "POST", body: JSON.stringify({ custom_collection: input }) },
    );
    return data.custom_collection;
  }

  /**
   * Updates an existing custom collection.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async updateCustomCollection(
    accessToken:  string,    // ⚠ server-only
    collectionId: number | string,
    patch:        Partial<ShopifyCustomCollectionCreateInput>,
  ): Promise<ShopifyCustomCollection> {
    const data = await this.request<{ custom_collection: ShopifyCustomCollection }>(
      `/custom_collections/${collectionId}.json`,
      accessToken,
      { method: "PUT", body: JSON.stringify({ custom_collection: { id: collectionId, ...patch } }) },
    );
    return data.custom_collection;
  }

  /**
   * Adds a product to a collection (creates a "collect" membership record).
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async addProductToCollection(
    accessToken:  string,    // ⚠ server-only
    collectionId: number | string,
    productId:    number | string,
  ): Promise<ShopifyCollect> {
    const data = await this.request<{ collect: ShopifyCollect }>(
      "/collects.json",
      accessToken,
      { method: "POST", body: JSON.stringify({ collect: { collection_id: collectionId, product_id: productId } }) },
    );
    return data.collect;
  }

  /**
   * Removes a product from a collection by deleting the collect record.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async removeProductFromCollection(
    accessToken: string,    // ⚠ server-only
    collectId:   number | string,
  ): Promise<void> {
    await this.request(`/collects/${collectId}.json`, accessToken, { method: "DELETE" });
  }

  /**
   * Lists all collection memberships for a product.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async listCollectsByProduct(
    accessToken: string,    // ⚠ server-only
    productId:   number | string,
  ): Promise<ShopifyCollect[]> {
    const data = await this.request<{ collects: ShopifyCollect[] }>(
      `/collects.json?product_id=${productId}`,
      accessToken,
    );
    return data.collects;
  }

  /**
   * Lists all products in a collection.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async listProductsInCollection(
    accessToken:  string,    // ⚠ server-only
    collectionId: number | string,
  ): Promise<Array<{ id: number; handle: string; title: string; status: string }>> {
    const data = await this.request<{
      products: Array<{ id: number; handle: string; title: string; status: string }>;
    }>(
      `/collections/${collectionId}/products.json?limit=250`,
      accessToken,
    );
    return data.products;
  }

  // ── Price Rules (SHOPIFY-PROMOTIONS-04) ───────────────────────────────────

  /**
   * Lists all price rules in the store (up to 250).
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async listPriceRules(accessToken: string): Promise<ShopifyPriceRule[]> {
    const data = await this.request<{ price_rules: ShopifyPriceRule[] }>(
      "/price_rules.json?limit=250",
      accessToken,
    );
    return data.price_rules;
  }

  /**
   * Creates a new price rule (discount mechanics).
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async createPriceRule(
    accessToken: string,
    input:       ShopifyPriceRuleCreateInput,
  ): Promise<ShopifyPriceRule> {
    const data = await this.request<{ price_rule: ShopifyPriceRule }>(
      "/price_rules.json",
      accessToken,
      { method: "POST", body: JSON.stringify({ price_rule: input }) },
    );
    return data.price_rule;
  }

  /**
   * Updates an existing price rule.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async updatePriceRule(
    accessToken:  string,
    priceRuleId:  number | string,
    patch:        Partial<ShopifyPriceRuleCreateInput>,
  ): Promise<ShopifyPriceRule> {
    const data = await this.request<{ price_rule: ShopifyPriceRule }>(
      `/price_rules/${priceRuleId}.json`,
      accessToken,
      { method: "PUT", body: JSON.stringify({ price_rule: { id: priceRuleId, ...patch } }) },
    );
    return data.price_rule;
  }

  /**
   * Deletes a price rule (and all its discount codes).
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async deletePriceRule(accessToken: string, priceRuleId: number | string): Promise<void> {
    await this.request(`/price_rules/${priceRuleId}.json`, accessToken, { method: "DELETE" });
  }

  // ── Discount Codes ─────────────────────────────────────────────────────────

  /**
   * Lists all discount codes for a given price rule.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async listDiscountCodes(
    accessToken:  string,
    priceRuleId:  number | string,
  ): Promise<ShopifyDiscountCode[]> {
    const data = await this.request<{ discount_codes: ShopifyDiscountCode[] }>(
      `/price_rules/${priceRuleId}/discount_codes.json`,
      accessToken,
    );
    return data.discount_codes;
  }

  /**
   * Creates a discount code for an existing price rule.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async createDiscountCode(
    accessToken:  string,
    priceRuleId:  number | string,
    input:        ShopifyDiscountCodeCreateInput,
  ): Promise<ShopifyDiscountCode> {
    const data = await this.request<{ discount_code: ShopifyDiscountCode }>(
      `/price_rules/${priceRuleId}/discount_codes.json`,
      accessToken,
      { method: "POST", body: JSON.stringify({ discount_code: input }) },
    );
    return data.discount_code;
  }

  /**
   * Deletes a specific discount code.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async deleteDiscountCode(
    accessToken:  string,
    priceRuleId:  number | string,
    codeId:       number | string,
  ): Promise<void> {
    await this.request(
      `/price_rules/${priceRuleId}/discount_codes/${codeId}.json`,
      accessToken,
      { method: "DELETE" },
    );
  }

  // ── Orders (SHOPIFY-OPERATIONS-01) ─────────────────────────────────────────

  /**
   * Lists orders from the store.
   * Includes inline fulfillments and refunds (no extra calls needed).
   * Default: returns up to 250 most recent orders across all statuses.
   * ⚠ SERVER ONLY — accessToken never logged.
   * Requires: read_orders scope.
   */
  async listOrders(
    accessToken: string,   // ⚠ server-only
    options?: {
      status?:             "open" | "closed" | "cancelled" | "any";
      financial_status?:   string;
      fulfillment_status?: string;
      limit?:              number;
      /** ISO8601 lower bound for order.created_at (inclusive). Used by statistics. */
      createdAtMin?:       string;
      /** ISO8601 upper bound for order.created_at (inclusive). Used by statistics. */
      createdAtMax?:       string;
    },
  ): Promise<ShopifyOrder[]> {
    const p = new URLSearchParams();
    p.set("limit", String(options?.limit ?? 250));
    p.set("status", options?.status ?? "any");
    if (options?.financial_status)   p.set("financial_status",   options.financial_status);
    if (options?.fulfillment_status) p.set("fulfillment_status", options.fulfillment_status);
    if (options?.createdAtMin)       p.set("created_at_min",     options.createdAtMin);
    if (options?.createdAtMax)       p.set("created_at_max",     options.createdAtMax);

    const data = await this.request<{ orders: ShopifyOrder[] }>(
      `/orders.json?${p.toString()}`,
      accessToken,
    );
    return data.orders;
  }

  /**
   * Fetches a single order by ID, with full fulfillment and refund detail.
   * ⚠ SERVER ONLY — accessToken never logged.
   */
  async getOrder(
    accessToken: string,   // ⚠ server-only
    orderId:     number | string,
  ): Promise<ShopifyOrder> {
    const data = await this.request<{ order: ShopifyOrder }>(
      `/orders/${orderId}.json`,
      accessToken,
    );
    return data.order;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createShopifyClient(shopDomain: string): ShopifyAdminClient {
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? SHOPIFY_API_VERSION_DEFAULT;
  return new ShopifyAdminClient({ shopDomain, apiVersion });
}
