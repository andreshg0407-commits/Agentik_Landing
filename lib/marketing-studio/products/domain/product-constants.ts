/**
 * lib/marketing-studio/products/domain/product-constants.ts
 *
 * MS-05F-B — Product Domain Constants
 *
 * Shared domain constants used across repository, actions, and UI.
 * No magic numbers or inline strings anywhere else.
 */

import { SyncChannel, SyncStatus, PropagationJobStatus } from "./product-enums";

// ── Channel configuration ──────────────────────────────────────────────────────

/** All channels in canonical display order. */
export const ALL_SYNC_CHANNELS = [
  SyncChannel.SHOPIFY,
  SyncChannel.CRM,
  SyncChannel.WHATSAPP,
  SyncChannel.CATALOG,
  SyncChannel.ADS,
  SyncChannel.LANDING,
] as const;

/** Channels that require a price field to be considered ready. */
export const PRICE_REQUIRED_CHANNELS = new Set([
  SyncChannel.SHOPIFY,
  SyncChannel.WHATSAPP,
]);

/** Channels where description is critical. */
export const DESCRIPTION_REQUIRED_CHANNELS = new Set([
  SyncChannel.SHOPIFY,
  SyncChannel.CATALOG,
  SyncChannel.LANDING,
]);

// ── Sync state defaults ────────────────────────────────────────────────────────

/** Status for a channel that is enabled but not yet synced. */
export const INITIAL_SYNC_STATUS: SyncStatus = SyncStatus.PENDING;

/** Status for a channel that was not enabled at product creation. */
export const DISABLED_SYNC_STATUS: SyncStatus = SyncStatus.NOT_CONFIGURED;

// ── Propagation priorities ─────────────────────────────────────────────────────

/** Jobs triggered by name/price changes get highest priority. */
export const PROPAGATION_PRIORITY_HIGH   = 1;
/** Jobs triggered by description/attribute changes. */
export const PROPAGATION_PRIORITY_NORMAL = 5;
/** Jobs triggered by notes / non-critical fields. */
export const PROPAGATION_PRIORITY_LOW    = 9;

// ── Optimistic concurrency ─────────────────────────────────────────────────────

/** Starting version for all new ProductEntity records. */
export const INITIAL_ENTITY_VERSION = 1;

// ── Readiness scoring ──────────────────────────────────────────────────────────

/**
 * Readiness score computation:
 * ready channel    = CHANNEL_SCORE_READY points
 * partial channel  = CHANNEL_SCORE_PARTIAL points
 * not_ready        = 0 points
 * Score normalised to 0–100 across all channels.
 */
export const CHANNEL_SCORE_READY   = 10;
export const CHANNEL_SCORE_PARTIAL = 4;

// ── Activity limits ────────────────────────────────────────────────────────────

/** Maximum events fetched for the timeline UI by default. */
export const ACTIVITY_TIMELINE_DEFAULT_LIMIT = 20;

/** Maximum events fetched for Luca intelligence analysis. */
export const INTELLIGENCE_ACTIVITY_LIMIT = 50;

// ── Duplicate protection ───────────────────────────────────────────────────────

/**
 * Window during which a second approval of the same asset
 * is treated as a duplicate and rejected idempotently.
 */
export const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ── Retry limits ───────────────────────────────────────────────────────────────

/** Maximum propagation retries before marking a job as permanently failed. */
export const MAX_PROPAGATION_RETRIES = 3;

/** Maximum sync retries per channel before marking as failed. */
export const MAX_SYNC_RETRIES = 5;
