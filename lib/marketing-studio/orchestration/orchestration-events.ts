/**
 * lib/marketing-studio/orchestration/orchestration-events.ts
 *
 * MS-12 — Commerce Orchestration Layer: Event System
 *
 * Typed event constants for the orchestration bus.
 * All events are plain data — no class instances, no enums.
 */

// ── Event type registry ────────────────────────────────────────────────────────

export const ORCHESTRATION_EVENT = {
  // Product lifecycle
  PRODUCT_APPROVED:          "PRODUCT_APPROVED",
  PRODUCT_UPDATED:           "PRODUCT_UPDATED",
  PRODUCT_SYNC_REQUIRED:     "PRODUCT_SYNC_REQUIRED",
  PRODUCT_SYNC_SUCCESS:      "PRODUCT_SYNC_SUCCESS",
  PRODUCT_SYNC_FAILED:       "PRODUCT_SYNC_FAILED",

  // Catalog
  CATALOG_UPDATED:           "CATALOG_UPDATED",
  CATALOG_REBUILD_REQUIRED:  "CATALOG_REBUILD_REQUIRED",

  // Shopify
  SHOPIFY_PUBLISH_STARTED:   "SHOPIFY_PUBLISH_STARTED",
  SHOPIFY_PUBLISH_SUCCESS:   "SHOPIFY_PUBLISH_SUCCESS",
  SHOPIFY_PUBLISH_FAILED:    "SHOPIFY_PUBLISH_FAILED",

  // Assets
  ASSET_VARIANT_REQUIRED:    "ASSET_VARIANT_REQUIRED",

  // Readiness
  READINESS_CHANGED:         "READINESS_CHANGED",

  // Publication
  PUBLICATION_REQUIRED:      "PUBLICATION_REQUIRED",
  PUBLICATION_SUCCESS:       "PUBLICATION_SUCCESS",
  PUBLICATION_FAILED:        "PUBLICATION_FAILED",

  // WhatsApp
  WHATSAPP_CATALOG_REQUIRED: "WHATSAPP_CATALOG_REQUIRED",

  // Review
  REVIEW_REQUIRED:           "REVIEW_REQUIRED",
} as const;

export type OrchestrationEventType = typeof ORCHESTRATION_EVENT[keyof typeof ORCHESTRATION_EVENT];

// ── Event payload shapes ───────────────────────────────────────────────────────

export interface OrchestrationEvent {
  id:             string;
  type:           OrchestrationEventType;
  organizationId: string;
  productId:      string | null;
  channel:        string | null;
  occurredAt:     string;      // ISO
  payload:        Record<string, unknown>;
  triggeredBy:    string | null;   // source: user_id, "system", "webhook"
}

// ── Derived jobs from events ───────────────────────────────────────────────────

import type { OrchestrationJobType } from "./orchestration-types";
import { ORCHESTRATION_JOB_TYPE } from "./orchestration-types";

/**
 * Maps an event type to the job types it should create.
 * Pure lookup — no side effects.
 */
export function deriveJobsFromEvent(
  eventType: OrchestrationEventType,
): OrchestrationJobType[] {
  switch (eventType) {
    case ORCHESTRATION_EVENT.PRODUCT_APPROVED:
      return [
        ORCHESTRATION_JOB_TYPE.RECALCULATE_READINESS,
        ORCHESTRATION_JOB_TYPE.REFRESH_RECOMMENDATIONS,
        ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG,
      ];

    case ORCHESTRATION_EVENT.PRODUCT_UPDATED:
      return [
        ORCHESTRATION_JOB_TYPE.RECALCULATE_READINESS,
        ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY,
        ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG,
      ];

    case ORCHESTRATION_EVENT.PRODUCT_SYNC_REQUIRED:
      return [ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY];

    case ORCHESTRATION_EVENT.PRODUCT_SYNC_FAILED:
      return [ORCHESTRATION_JOB_TYPE.RETRY_SYNC];

    case ORCHESTRATION_EVENT.SHOPIFY_PUBLISH_FAILED:
      return [ORCHESTRATION_JOB_TYPE.RETRY_SYNC];

    case ORCHESTRATION_EVENT.PUBLICATION_REQUIRED:
      return [ORCHESTRATION_JOB_TYPE.PUBLISH_PRODUCT];

    case ORCHESTRATION_EVENT.CATALOG_REBUILD_REQUIRED:
      return [ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG];

    case ORCHESTRATION_EVENT.WHATSAPP_CATALOG_REQUIRED:
      return [ORCHESTRATION_JOB_TYPE.UPDATE_WHATSAPP];

    case ORCHESTRATION_EVENT.ASSET_VARIANT_REQUIRED:
      return [ORCHESTRATION_JOB_TYPE.GENERATE_VARIANTS, ORCHESTRATION_JOB_TYPE.GENERATE_SOCIAL_ASSETS];

    case ORCHESTRATION_EVENT.READINESS_CHANGED:
      return [ORCHESTRATION_JOB_TYPE.REFRESH_RECOMMENDATIONS];

    default:
      return [];
  }
}

/**
 * Channels affected by each event type.
 */
export function deriveAffectedChannels(
  eventType: OrchestrationEventType,
): string[] {
  switch (eventType) {
    case ORCHESTRATION_EVENT.PRODUCT_APPROVED:
    case ORCHESTRATION_EVENT.PRODUCT_UPDATED:
      return ["shopify", "catalog", "whatsapp", "ads"];

    case ORCHESTRATION_EVENT.SHOPIFY_PUBLISH_STARTED:
    case ORCHESTRATION_EVENT.SHOPIFY_PUBLISH_SUCCESS:
    case ORCHESTRATION_EVENT.SHOPIFY_PUBLISH_FAILED:
    case ORCHESTRATION_EVENT.PRODUCT_SYNC_REQUIRED:
    case ORCHESTRATION_EVENT.PRODUCT_SYNC_FAILED:
    case ORCHESTRATION_EVENT.PRODUCT_SYNC_SUCCESS:
      return ["shopify"];

    case ORCHESTRATION_EVENT.CATALOG_UPDATED:
    case ORCHESTRATION_EVENT.CATALOG_REBUILD_REQUIRED:
      return ["catalog"];

    case ORCHESTRATION_EVENT.WHATSAPP_CATALOG_REQUIRED:
      return ["whatsapp"];

    case ORCHESTRATION_EVENT.ASSET_VARIANT_REQUIRED:
      return ["ads", "shopify"];

    default:
      return [];
  }
}
