/**
 * lib/marketing-studio/distribution/distribution-types.ts
 *
 * MS-14 — Distribution Runtime: Core type system
 *
 * All types serializable — safe for RSC → client boundary.
 * No Prisma types, no Date objects (ISO strings only).
 */

// ── Channels ──────────────────────────────────────────────────────────────────

export const DISTRIBUTION_CHANNEL = {
  SHOPIFY:   "shopify",
  WHATSAPP:  "whatsapp",
  INSTAGRAM: "instagram",
  FACEBOOK:  "facebook",
  TIKTOK:    "tiktok",
  ADS:       "ads",
  LANDING:   "landing",
  CATALOG:   "catalog",
  EMAIL:     "email",
} as const;

export type DistributionChannel = typeof DISTRIBUTION_CHANNEL[keyof typeof DISTRIBUTION_CHANNEL];

export const DISTRIBUTION_CHANNEL_LABEL: Record<DistributionChannel, string> = {
  shopify:   "Shopify",
  whatsapp:  "WhatsApp",
  instagram: "Instagram",
  facebook:  "Facebook",
  tiktok:    "TikTok",
  ads:       "Ads",
  landing:   "Landing",
  catalog:   "Catálogo",
  email:     "Email",
};

// ── Status ────────────────────────────────────────────────────────────────────

export const DISTRIBUTION_STATUS = {
  DRAFT:      "draft",
  SCHEDULED:  "scheduled",
  QUEUED:     "queued",
  PUBLISHING: "publishing",
  PUBLISHED:  "published",
  PARTIAL:    "partial",
  FAILED:     "failed",
  STALE:      "stale",
  ARCHIVED:   "archived",
} as const;

export type DistributionStatus = typeof DISTRIBUTION_STATUS[keyof typeof DISTRIBUTION_STATUS];

// ── Pipeline types ────────────────────────────────────────────────────────────

export const DISTRIBUTION_PIPELINE_TYPE = {
  NEW_COLLECTION_LAUNCH: "new_collection_launch",
  WHATSAPP_DROP:         "whatsapp_drop",
  CAMPAIGN_LAUNCH:       "campaign_launch",
  EVERGREEN_ROTATION:    "evergreen_rotation",
  SEASONAL_RELEASE:      "seasonal_release",
  RECOVERY_CAMPAIGN:     "recovery_campaign",
} as const;

export type DistributionPipelineType = typeof DISTRIBUTION_PIPELINE_TYPE[keyof typeof DISTRIBUTION_PIPELINE_TYPE];

export const PIPELINE_TYPE_LABEL: Record<DistributionPipelineType, string> = {
  new_collection_launch: "Lanzamiento de Colección",
  whatsapp_drop:         "Drop WhatsApp",
  campaign_launch:       "Lanzamiento de Campaña",
  evergreen_rotation:    "Rotación Evergreen",
  seasonal_release:      "Lanzamiento Temporada",
  recovery_campaign:     "Campaña de Recuperación",
};

// ── Variant purposes ──────────────────────────────────────────────────────────

export const VARIANT_PURPOSE = {
  FEED:             "feed",
  STORY:            "story",
  REEL:             "reel",
  AD:               "ad",
  CATALOG:          "catalog",
  WHATSAPP:         "whatsapp",
  HERO:             "hero",
  THUMBNAIL:        "thumbnail",
  COLLECTION_COVER: "collection_cover",
  LANDING_BANNER:   "landing_banner",
} as const;

export type VariantPurpose = typeof VARIANT_PURPOSE[keyof typeof VARIANT_PURPOSE];

export const VARIANT_PURPOSE_LABEL: Record<VariantPurpose, string> = {
  feed:             "Feed",
  story:            "Story",
  reel:             "Reel",
  ad:               "Ad",
  catalog:          "Catálogo",
  whatsapp:         "WhatsApp",
  hero:             "Hero",
  thumbnail:        "Thumbnail",
  collection_cover: "Cover Colección",
  landing_banner:   "Banner Landing",
};

/** Required ratio per purpose */
export const VARIANT_RATIO: Record<VariantPurpose, string> = {
  feed:             "1:1",
  story:            "9:16",
  reel:             "9:16",
  ad:               "1:1",
  catalog:          "1:1",
  whatsapp:         "1:1",
  hero:             "16:9",
  thumbnail:        "1:1",
  collection_cover: "16:9",
  landing_banner:   "16:9",
};

/** Required variants per channel (minimum set) */
export const CHANNEL_REQUIRED_VARIANTS: Record<DistributionChannel, VariantPurpose[]> = {
  shopify:   ["hero", "catalog"],
  whatsapp:  ["whatsapp", "catalog"],
  instagram: ["feed", "story"],
  facebook:  ["feed", "ad"],
  tiktok:    ["reel"],
  ads:       ["ad"],
  landing:   ["hero", "landing_banner"],
  catalog:   ["catalog", "thumbnail"],
  email:     ["hero"],
};

// ── Slot types ────────────────────────────────────────────────────────────────

export const DISTRIBUTION_SLOT_TYPE = {
  IMMEDIATE:         "immediate",
  SCHEDULED:         "scheduled",
  RECURRING:         "recurring",
  LAUNCH_WINDOW:     "launch_window",
  CAMPAIGN_SEQUENCE: "campaign_sequence",
} as const;

export type DistributionSlotType = typeof DISTRIBUTION_SLOT_TYPE[keyof typeof DISTRIBUTION_SLOT_TYPE];

// ── Health levels ─────────────────────────────────────────────────────────────

export const DISTRIBUTION_HEALTH_LEVEL = {
  HEALTHY:    "healthy",
  DEGRADED:   "degraded",
  BLOCKED:    "blocked",
  INCOMPLETE: "incomplete",
  UNKNOWN:    "unknown",
} as const;

export type DistributionHealthLevel = typeof DISTRIBUTION_HEALTH_LEVEL[keyof typeof DISTRIBUTION_HEALTH_LEVEL];

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface DistributionVariantDTO {
  id:             string;
  organizationId: string;
  productId:      string | null;
  assetId:        string | null;
  purpose:        string;
  channel:        string;
  ratio:          string | null;
  width:          number | null;
  height:         number | null;
  isReady:        boolean;
  sourceAssetUrl: string | null;
  notes:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface DistributionPipelineDTO {
  id:             string;
  organizationId: string;
  name:           string;
  pipelineType:   string;
  status:         string;
  channels:       string[];
  stages:         PipelineStage[];
  productIds:     string[];
  catalogId:      string | null;
  scheduledAt:    string | null;
  startedAt:      string | null;
  completedAt:    string | null;
  lastError:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface PipelineStage {
  key:         string;
  label:       string;
  channel:     string;
  jobType:     string;
  status:      string;
  dependsOn:   string[];
  isRequired:  boolean;
}

export interface DistributionScheduleDTO {
  id:             string;
  organizationId: string;
  label:          string;
  slotType:       string;
  channel:        string;
  timezone:       string;
  scheduledAt:    string | null;
  productIds:     string[];
  pipelineId:     string | null;
  status:         string;
  notes:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

// ── Intelligence types ────────────────────────────────────────────────────────

export interface ChannelCoverageItem {
  channel:        string;
  totalProducts:  number;
  covered:        number;
  missing:        number;
  coveragePct:    number;
  healthLevel:    string;
  lastPublishedAt: string | null;
}

export interface VariantGapSummary {
  purpose:      string;
  channel:      string;
  required:     boolean;
  missingCount: number;
  productIds:   string[];
}

export interface ChannelReadiness {
  channel:      string;
  isReady:      boolean;
  missingItems: string[];
  score:        number;
}

export interface DistributionRecommendation {
  key:               string;
  label:             string;
  detail:            string;
  urgency:           "critical" | "high" | "medium" | "low";
  channel?:          string;
  affectedCount:     number;
  recommendedAction: string;
  agentLabel:        string;
}

export interface DistributionHealthSummary {
  level:               string;
  label:               string;
  staleCount:          number;
  missingVariantCount: number;
  failedPipelineCount: number;
  inactivePipelines:   number;
  unscheduledDrops:    number;
}

/** Full computed distribution state — passed to Distribution Center UI */
export interface DistributionState {
  organizationId:      string;
  computedAt:          string;
  productCount:        number;
  activePipelines:     DistributionPipelineDTO[];
  scheduledDrops:      DistributionScheduleDTO[];
  channelCoverage:     ChannelCoverageItem[];
  variantGaps:         VariantGapSummary[];
  health:              DistributionHealthSummary;
  lucaRecos:           DistributionRecommendation[];
  milaRecos:           DistributionRecommendation[];
}
