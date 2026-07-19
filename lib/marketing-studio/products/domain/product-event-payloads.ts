/**
 * lib/marketing-studio/products/domain/product-event-payloads.ts
 *
 * MS-05F-E — Typed Activity Event Payloads
 *
 * Defines the structure of every product event payload.
 * The ProductActivity.payload Json field is untyped at the DB level,
 * but application code MUST use these typed interfaces and the
 * `createTypedActivityPayload()` helper to write payloads.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - All payload types are plain objects (JSON-serializable)
 *   - No class instances, no Date objects in payloads (use ISO strings)
 *   - Each event type has exactly one payload interface
 *   - `createTypedActivityPayload` enforces correct typing at call sites
 */

import type { SyncChannel } from "./product-enums";

// ── Payload interfaces ─────────────────────────────────────────────────────────

export interface ProductCreatedPayload {
  name:      string;
  sku:       string | null;
  category:  string | null;
  channels:  SyncChannel[];
}

export interface ProductApprovedPayload {
  approvedBy:    string | null;
  readyChannels: SyncChannel[];
  readinessScore: number;
}

export interface ProductUpdatedPayload {
  changedFields: string[];
  version:       number;
}

export interface ProductAttributeUpdatedPayload {
  changedKeys: string[];
  count:       number;
}

export interface ProductVariantCreatedPayload {
  variantId: string;
  sku:       string | null;
  name:      string;
}

export interface ProductChannelEnabledPayload {
  channel: SyncChannel;
}

export interface ProductReadinessChangedPayload {
  readyCount:   number;
  partialCount: number;
  totalEnabled: number;
  readinessScore: number;
}

export interface ProductSyncFailedPayload {
  channel:      SyncChannel;
  errorMessage: string;
  retryCount:   number;
}

export interface ProductPublishedPayload {
  channel:    SyncChannel;
  externalId: string | null;
  url:        string | null;
}

export interface ProductAssetLinkedPayload {
  assetId:       string;
  role:          string;
  sourceType:    string | null;
  sourceProvider: string | null;
}

// ── Discriminated union ────────────────────────────────────────────────────────

export type ProductEventPayloadMap = {
  PRODUCT_CREATED:           ProductCreatedPayload;
  PRODUCT_APPROVED:          ProductApprovedPayload;
  PRODUCT_UPDATED:           ProductUpdatedPayload;
  PRODUCT_ATTRIBUTE_UPDATED: ProductAttributeUpdatedPayload;
  PRODUCT_VARIANT_CREATED:   ProductVariantCreatedPayload;
  PRODUCT_CHANNEL_ENABLED:   ProductChannelEnabledPayload;
  PRODUCT_READINESS_CHANGED: ProductReadinessChangedPayload;
  PRODUCT_SYNC_FAILED:       ProductSyncFailedPayload;
  PRODUCT_PUBLISHED:         ProductPublishedPayload;
  PRODUCT_ASSET_LINKED:      ProductAssetLinkedPayload;
};

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * createTypedActivityPayload — wraps the payload with its event type tag
 * and returns a JSON-safe `Record<string, unknown>` for Prisma storage.
 *
 * Usage:
 *   const payload = createTypedActivityPayload("PRODUCT_CREATED", {
 *     name: "Peluche", sku: null, category: "toys", channels: ["shopify"],
 *   });
 *   // payload is typed as ProductCreatedPayload & { _type: "PRODUCT_CREATED" }
 */
export function createTypedActivityPayload<K extends keyof ProductEventPayloadMap>(
  eventType: K,
  payload:   ProductEventPayloadMap[K],
): Record<string, unknown> {
  return { _type: eventType, ...payload } as Record<string, unknown>;
}

/**
 * parseActivityPayload — reads a typed payload from a raw Json field.
 * Returns null if the payload doesn't match the expected event type.
 */
export function parseActivityPayload<K extends keyof ProductEventPayloadMap>(
  eventType: K,
  raw:       unknown,
): ProductEventPayloadMap[K] | null {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    (raw as Record<string, unknown>)["_type"] !== eventType
  ) {
    return null;
  }
  return raw as ProductEventPayloadMap[K];
}
