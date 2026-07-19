/**
 * lib/integrations/shopify/shopify-errors.ts
 *
 * MS-10 — Shopify-Specific Errors
 *
 * Extends the base integration error hierarchy with Shopify-specific codes.
 * Error messages MUST NOT contain access tokens or API secrets.
 */

import {
  IntegrationError,
  IntegrationAuthError,
  IntegrationApiError,
} from "../integration-errors";

// ── Config errors ─────────────────────────────────────────────────────────────

export class ShopifyConfigError extends IntegrationError {
  constructor(message: string) {
    super(message, "SHOPIFY_CONFIG_ERROR", "shopify");
    this.name = "ShopifyConfigError";
  }
}

export class ShopifyInvalidShopDomainError extends IntegrationError {
  constructor(domain: string) {
    // Only log the domain pattern, not the full value, to avoid injection
    super(
      `Invalid Shopify shop domain format: "${domain.slice(0, 40)}"`,
      "INVALID_SHOP_DOMAIN",
      "shopify",
    );
    this.name = "ShopifyInvalidShopDomainError";
  }
}

// ── OAuth errors ──────────────────────────────────────────────────────────────

export class ShopifyOAuthError extends IntegrationAuthError {
  constructor(message: string, organizationId: string) {
    super(message, "shopify", organizationId);
    this.name = "ShopifyOAuthError";
  }
}

export class ShopifyCodeExchangeError extends IntegrationAuthError {
  constructor(organizationId: string, statusCode: number) {
    super(
      `Shopify code exchange failed with HTTP ${statusCode}`,
      "shopify",
      organizationId,
    );
    this.name = "ShopifyCodeExchangeError";
  }
}

// ── API errors ────────────────────────────────────────────────────────────────

export class ShopifyApiError extends IntegrationApiError {
  constructor(statusCode: number, apiCode?: string) {
    super("shopify", statusCode, apiCode);
    this.name = "ShopifyApiError";
  }
}

export class ShopifyProductCreateError extends ShopifyApiError {
  constructor(message: string) {
    super(0);
    this.message = message.slice(0, 300);
    this.name    = "ShopifyProductCreateError";
  }
}

// ── Webhook errors ────────────────────────────────────────────────────────────

export class ShopifyWebhookHmacError extends IntegrationError {
  constructor() {
    super(
      "Shopify webhook HMAC verification failed",
      "SHOPIFY_WEBHOOK_HMAC_FAILED",
      "shopify",
    );
    this.name = "ShopifyWebhookHmacError";
  }
}

export class ShopifyWebhookReplayError extends IntegrationError {
  constructor() {
    super(
      "Shopify webhook appears to be a replay (ID already processed)",
      "SHOPIFY_WEBHOOK_REPLAY",
      "shopify",
    );
    this.name = "ShopifyWebhookReplayError";
  }
}
