/**
 * lib/marketing-studio/products/domain/product-guards.ts
 *
 * MS-05F-B — Product Domain Type Guards
 *
 * Runtime validation functions for domain values coming from:
 * - Prisma records (String fields)
 * - External form inputs
 * - API payloads
 * - Webhook data
 *
 * Use these at system boundaries — never inside pure domain logic.
 */

import {
  PRODUCT_STATUS_VALUES,
  COMMERCIAL_STATUS_VALUES,
  USAGE_PERMISSION_VALUES,
  SYNC_CHANNEL_VALUES,
  SYNC_STATUS_VALUES,
  PUBLICATION_STATUS_VALUES,
  PRODUCT_ASSET_ROLE_VALUES,
  PRODUCT_EVENT_TYPE_VALUES,
  READINESS_LEVEL_VALUES,
  PROPAGATION_JOB_STATUS_VALUES,
  ATTRIBUTE_VALUE_TYPE_VALUES,
  type ProductStatus,
  type CommercialStatus,
  type UsagePermission,
  type SyncChannel,
  type SyncStatus,
  type PublicationStatus,
  type ProductAssetRole,
  type ProductEventType,
  type ReadinessLevel,
  type PropagationJobStatus,
  type AttributeValueType,
} from "./product-enums";

// ── Generic guard builder ──────────────────────────────────────────────────────

function makeGuard<T extends string>(
  values: readonly T[],
  fallback: T,
) {
  return {
    is:       (v: unknown): v is T => typeof v === "string" && (values as readonly string[]).includes(v),
    parse:    (v: unknown): T => (typeof v === "string" && (values as readonly string[]).includes(v)) ? v as T : fallback,
    assert:   (v: unknown, label: string): T => {
      if (typeof v === "string" && (values as readonly string[]).includes(v)) return v as T;
      throw new Error(`Invalid ${label}: "${String(v)}". Expected one of: ${values.join(", ")}`);
    },
  };
}

// ── Guards ─────────────────────────────────────────────────────────────────────

export const productStatusGuard      = makeGuard(PRODUCT_STATUS_VALUES, "pending" as ProductStatus);
export const commercialStatusGuard   = makeGuard(COMMERCIAL_STATUS_VALUES, "active" as CommercialStatus);
export const usagePermissionGuard    = makeGuard(USAGE_PERMISSION_VALUES, "commercial" as UsagePermission);
export const syncChannelGuard        = makeGuard(SYNC_CHANNEL_VALUES, "shopify" as SyncChannel);
export const syncStatusGuard         = makeGuard(SYNC_STATUS_VALUES, "pending" as SyncStatus);
export const publicationStatusGuard  = makeGuard(PUBLICATION_STATUS_VALUES, "unpublished" as PublicationStatus);
export const productAssetRoleGuard   = makeGuard(PRODUCT_ASSET_ROLE_VALUES, "gallery" as ProductAssetRole);
export const productEventTypeGuard   = makeGuard(PRODUCT_EVENT_TYPE_VALUES, "PRODUCT_UPDATED" as ProductEventType);
export const readinessLevelGuard     = makeGuard(READINESS_LEVEL_VALUES, "not_ready" as ReadinessLevel);
export const propagationJobGuard     = makeGuard(PROPAGATION_JOB_STATUS_VALUES, "pending" as PropagationJobStatus);
export const attributeValueTypeGuard = makeGuard(ATTRIBUTE_VALUE_TYPE_VALUES, "text" as AttributeValueType);

// ── Channel array guard ────────────────────────────────────────────────────────

/**
 * parseChannels — filters an unknown array to valid SyncChannel values.
 * Safe to use directly on form inputs, API payloads, and DB records.
 */
export function parseChannels(raw: unknown): SyncChannel[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is SyncChannel => syncChannelGuard.is(v));
}

/**
 * assertChannel — throws if the value is not a valid SyncChannel.
 */
export const assertChannel = (v: unknown): SyncChannel =>
  syncChannelGuard.assert(v, "SyncChannel");

// ── Payload guard ──────────────────────────────────────────────────────────────

/**
 * isJsonObject — true if the value is a plain object (not array, not null).
 * Used for safe Json field access on Prisma records.
 */
export function isJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * safeJsonObject — returns the value as a plain object or an empty object.
 */
export function safeJsonObject(v: unknown): Record<string, unknown> {
  return isJsonObject(v) ? v : {};
}

/**
 * safeJsonStringArray — extracts a string[] from a Json field or returns [].
 */
export function safeJsonStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string");
}
