/**
 * lib/marketing-studio/library/intelligence/usage.ts
 *
 * MARKETING-STUDIO-LIBRARY-INTELLIGENCE — Sprint MS-03
 *
 * Asset usage intelligence — publication history, popularity, staleness.
 *
 * ── DESIGN PRINCIPLE ──────────────────────────────────────────────────────────
 *
 *   "An asset's value is proven by its usage."
 *
 *   The Biblioteca tracks how, where, and how often assets are used.
 *   Usage data drives:
 *     - Asset scoring (popular assets rank higher)
 *     - Stale detection (assets not used in 90+ days)
 *     - Underused discovery (approved but never deployed)
 *     - High performer identification (heavy multi-channel usage)
 *     - Catalog slot priority (most-used products go first)
 *
 * ── DATA SOURCES ──────────────────────────────────────────────────────────────
 *
 *   Usage events come from:
 *     - Shopify push (pushed to Shopify product page)
 *     - Catalog publication (included in a compiled catalog)
 *     - WhatsApp catalog send (included in a Mila response)
 *     - CRM campaign (used in a Mila / email campaign)
 *     - Social post (scheduled / posted via Redes Sociales module)
 *     - Pauta IA (used as creative in a paid ad)
 *     - Manual operator download
 *
 * ── FUTURE ────────────────────────────────────────────────────────────────────
 *
 *   When analytics integrations are live:
 *     - Engagement metrics (CTR, saves, shares) from social platforms
 *     - Shopify click data from product pages
 *     - WhatsApp message read/response rate
 *   Will be incorporated into AssetUsageInsight.performanceScore.
 */

import type { AssetChannel } from "../types";

// ── Usage insight ─────────────────────────────────────────────────────────────

/**
 * AssetUsageInsight — the operational usage summary for a single asset.
 *
 * Computed from AssetUsageEvent records.
 * Stored as a denormalized snapshot on MarketingAsset for fast access.
 */
export interface AssetUsageInsight {
  assetId:       string;
  /** Total deployment/publication events. */
  usageCount:    number;
  /** Channels where this asset has been used. */
  channels:      AssetChannel[];
  /** Most recent use (ISO timestamp). */
  lastUsedAt?:   string;
  /** Whether this asset has not been used in 90+ days (or never used). */
  stale?:        boolean;
  /** Whether this asset is approved but has never been deployed. */
  underused?:    boolean;
  /** Whether this asset has been used in 5+ channels or 10+ times. */
  highPerformer?: boolean;
  /**
   * Future: aggregated engagement performance score (0–1).
   * Currently: null until analytics integrations are live.
   */
  performanceScore?: number;
}

// ── Usage event ────────────────────────────────────────────────────────────────

/**
 * AssetUsageEvent — a single recorded use of an asset.
 *
 * Written at the moment of publication / deployment.
 * Immutable — usage history is never edited or deleted.
 */
export interface AssetUsageEvent {
  id:           string;
  assetId:      string;
  tenantId:     string;
  /** Where this asset was used. */
  channel:      AssetChannel;
  /** The broader event type. */
  eventType:    UsageEventType;
  /** Optional reference to the destination entity (catalog ID, campaign ID, etc.). */
  referenceId?: string;
  /** UserId of the operator or "system" for automated events. */
  performedBy:  string;
  recordedAt:   string;
  /** Future: engagement metrics snapshot at the time of this event. */
  metrics?:     UsageMetricsSnapshot;
}

/**
 * UsageEventType — the type of publication/deployment event.
 */
export type UsageEventType =
  | "shopify_push"       // pushed to Shopify product page
  | "catalog_compile"    // included in a catalog compilation
  | "whatsapp_send"      // included in a Mila WhatsApp message
  | "crm_campaign"       // used in a Mila / email CRM campaign
  | "social_post"        // posted / scheduled on a social channel
  | "pauta_creative"     // used as creative in Pauta IA (paid ad)
  | "manual_download"    // operator manually downloaded the asset
  | "preview_share";     // shared as a preview link (not a full publish)

/**
 * UsageMetricsSnapshot — engagement metrics at the time of an event.
 * All values are optional — populated only when analytics integrations are live.
 */
export interface UsageMetricsSnapshot {
  impressions?: number;
  clicks?:      number;
  ctr?:         number;      // click-through rate (0–1)
  saves?:       number;
  shares?:      number;
  orders?:      number;      // for Shopify events
  revenue?:     number;      // attributed revenue (future)
}

// ── Usage aggregation ─────────────────────────────────────────────────────────

/**
 * AssetUsageAggregate — the pre-computed usage summary for an asset.
 *
 * Computed from all AssetUsageEvent records for a given asset.
 * Updated after each new usage event.
 */
export interface AssetUsageAggregate {
  assetId:        string;
  tenantId:       string;
  /** Total event count. */
  totalEvents:    number;
  /** Unique channels where this asset has been used. */
  usedChannels:   AssetChannel[];
  /** Event type breakdown. */
  byEventType:    Partial<Record<UsageEventType, number>>;
  /** ISO timestamp of first use. */
  firstUsedAt?:   string;
  /** ISO timestamp of most recent use. */
  lastUsedAt?:    string;
  /** Whether this asset is currently live on Shopify. */
  liveOnShopify?: boolean;
  /** Whether this asset is currently live on social. */
  liveOnSocial?:  boolean;
  /** Computed at time of aggregation (ISO). */
  computedAt:     string;
}

// ── Staleness classification ───────────────────────────────────────────────────

/**
 * AssetStalenessLevel — how stale an asset is.
 */
export type AssetStalenessLevel =
  | "fresh"         // used within last 30 days
  | "cooling"       // used 31–90 days ago
  | "stale"         // used 91–180 days ago — consider refreshing
  | "very_stale"    // used 181–365 days ago — likely outdated
  | "never_used"    // approved but never deployed
  | "archived";     // retired asset

// ── Intelligence functions ────────────────────────────────────────────────────

/**
 * computeUsageInsight — computes the AssetUsageInsight from a raw aggregate.
 *
 * Determines staleness, underuse, and high-performer status.
 */
export function computeUsageInsight(
  assetId:    string,
  aggregate?: AssetUsageAggregate,
  status?:    string,
  now?:       string,
): AssetUsageInsight {
  const nowMs = Date.parse(now ?? new Date().toISOString());

  if (!aggregate || aggregate.totalEvents === 0) {
    const neverUsed = status === "approved" || status === "published";
    return {
      assetId,
      usageCount:  0,
      channels:    [],
      stale:       neverUsed,
      underused:   neverUsed,
      highPerformer: false,
    };
  }

  const lastMs  = aggregate.lastUsedAt ? Date.parse(aggregate.lastUsedAt) : 0;
  const ageDays = lastMs > 0 ? (nowMs - lastMs) / (1000 * 60 * 60 * 24) : Infinity;

  const stale        = ageDays > 90;
  const underused    = aggregate.totalEvents < 2;
  const highPerformer = aggregate.totalEvents >= 10 || aggregate.usedChannels.length >= 5;

  return {
    assetId,
    usageCount:  aggregate.totalEvents,
    channels:    aggregate.usedChannels,
    lastUsedAt:  aggregate.lastUsedAt,
    stale,
    underused,
    highPerformer,
  };
}

/**
 * classifyStaleness — returns the staleness level for an asset.
 */
export function classifyStaleness(
  insight: AssetUsageInsight,
  status?: string,
): AssetStalenessLevel {
  if (status === "archived") return "archived";
  if (insight.usageCount === 0) return "never_used";
  if (!insight.lastUsedAt)  return "never_used";

  const ageDays = (Date.now() - Date.parse(insight.lastUsedAt)) / (1000 * 60 * 60 * 24);

  if (ageDays <= 30)  return "fresh";
  if (ageDays <= 90)  return "cooling";
  if (ageDays <= 180) return "stale";
  if (ageDays <= 365) return "very_stale";
  return "very_stale";
}

/**
 * findUnderusedAssets — filters a list of insights to surface underused assets.
 *
 * Returns approved assets that have never been deployed (usage = 0) or
 * have very low usage (< 2 events).
 */
export function findUnderusedAssets(
  insights: AssetUsageInsight[],
): AssetUsageInsight[] {
  return insights.filter(i => i.underused || i.usageCount === 0);
}

/**
 * findStaleAssets — filters a list of insights to surface stale assets.
 *
 * Returns assets not used in the last 90 days.
 */
export function findStaleAssets(insights: AssetUsageInsight[]): AssetUsageInsight[] {
  return insights.filter(i => i.stale);
}

/**
 * findHighPerformers — returns assets with heavy multi-channel usage.
 */
export function findHighPerformers(insights: AssetUsageInsight[]): AssetUsageInsight[] {
  return insights.filter(i => i.highPerformer);
}

/**
 * rankByUsage — sorts assets by usage count descending.
 */
export function rankByUsage(insights: AssetUsageInsight[]): AssetUsageInsight[] {
  return [...insights].sort((a, b) => b.usageCount - a.usageCount);
}

// ── Tenant-level usage summary ─────────────────────────────────────────────────

/**
 * TenantUsageSummary — aggregate usage statistics for a tenant's full Biblioteca.
 *
 * Used by the Biblioteca dashboard to show operational health.
 */
export interface TenantUsageSummary {
  tenantId:         string;
  totalAssets:      number;
  approvedAssets:   number;
  everUsedAssets:   number;
  neverUsedAssets:  number;
  staleAssets:      number;
  highPerformers:   number;
  /** Most used asset IDs (top 5). */
  topAssets:        string[];
  /** Channels with most publication events. */
  topChannels:      AssetChannel[];
  computedAt:       string;
}
