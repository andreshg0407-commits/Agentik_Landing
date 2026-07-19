/**
 * lib/integrations/shopify/shopify-webhooks.ts
 *
 * MS-10 — Shopify Webhook Verification
 *
 * Handles incoming Shopify webhook signature verification.
 * Deduplication check via stored webhook event IDs.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Webhook secret is read from SHOPIFY_WEBHOOK_SECRET env var.
 *   Verification uses timing-safe comparison to prevent timing attacks.
 *   Raw body must be used for HMAC (not parsed JSON).
 *   SERVER ONLY.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { ShopifyWebhookHmacError } from "./shopify-errors";
import type { ShopifyWebhookTopic } from "./shopify-types";

// ── HMAC verification ─────────────────────────────────────────────────────────

/**
 * Verifies the X-Shopify-Hmac-Sha256 header against the raw request body.
 *
 * @param rawBody   Raw request body as Buffer (NOT parsed JSON)
 * @param hmacHeader  Value of X-Shopify-Hmac-Sha256 header
 * @returns true if valid
 *
 * ⚠ Use the raw body buffer, not a string. Parsing can alter whitespace.
 */
export function verifyShopifyWebhook(rawBody: Buffer, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!hmacHeader) return false;

  const computed = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  try {
    const recv = Buffer.from(hmacHeader, "base64");
    const expt = Buffer.from(computed,   "base64");
    if (recv.length !== expt.length) return false;
    return timingSafeEqual(recv, expt);
  } catch {
    return false;
  }
}

/**
 * Asserts webhook HMAC validity. Throws ShopifyWebhookHmacError if invalid.
 */
export function assertShopifyWebhookValid(rawBody: Buffer, hmacHeader: string): void {
  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    throw new ShopifyWebhookHmacError();
  }
}

// ── Webhook header extraction ─────────────────────────────────────────────────

export interface ShopifyWebhookMeta {
  shopDomain:  string;
  topic:       string;
  webhookId:   string;
  apiVersion:  string;
}

export function extractShopifyWebhookMeta(headers: Headers): ShopifyWebhookMeta {
  return {
    shopDomain:  headers.get("x-shopify-shop-domain")  ?? "",
    topic:       headers.get("x-shopify-topic")        ?? "",
    webhookId:   headers.get("x-shopify-webhook-id")   ?? "",
    apiVersion:  headers.get("x-shopify-api-version")  ?? "",
  };
}
