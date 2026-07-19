/**
 * lib/marketing-studio/social/social-types.ts
 *
 * MS-16 — Social Publishing Execution Engine: Core type system
 *
 * All types serializable — safe for RSC → client boundary.
 * No Prisma types, no Date objects (ISO strings only), no Maps/Sets.
 */

// ── Channels ───────────────────────────────────────────────────────────────────

export const SOCIAL_CHANNEL = {
  TIKTOK:    "tiktok",
  INSTAGRAM: "instagram",
  FACEBOOK:  "facebook",
  WHATSAPP:  "whatsapp",
  YOUTUBE:   "youtube",
} as const;

export type SocialChannel = typeof SOCIAL_CHANNEL[keyof typeof SOCIAL_CHANNEL];

// ── Publication status ─────────────────────────────────────────────────────────

export const SOCIAL_STATUS = {
  DRAFT:      "draft",
  QUEUED:     "queued",
  PREPARING:  "preparing",
  PUBLISHING: "publishing",
  PUBLISHED:  "published",
  FAILED:     "failed",
  RETRYING:   "retrying",
  SCHEDULED:  "scheduled",
  PAUSED:     "paused",
  CANCELLED:  "cancelled",
} as const;

export type SocialStatus = typeof SOCIAL_STATUS[keyof typeof SOCIAL_STATUS];

// ── Content types ──────────────────────────────────────────────────────────────

export const SOCIAL_CONTENT_TYPE = {
  SHORT_VIDEO:     "short_video",
  REEL:            "reel",
  STORY:           "story",
  CAROUSEL:        "carousel",
  IMAGE_POST:      "image_post",
  PRODUCT_DROP:    "product_drop",
  CAMPAIGN_LAUNCH: "campaign_launch",
  UGC:             "ugc",
} as const;

export type SocialContentType = typeof SOCIAL_CONTENT_TYPE[keyof typeof SOCIAL_CONTENT_TYPE];

// ── Queue priorities ───────────────────────────────────────────────────────────

export const SOCIAL_PRIORITY = {
  CRITICAL: "critical",
  HIGH:     "high",
  MEDIUM:   "medium",
  LOW:      "low",
} as const;

export type SocialPriority = typeof SOCIAL_PRIORITY[keyof typeof SOCIAL_PRIORITY];

// ── Retry policies ─────────────────────────────────────────────────────────────

export const SOCIAL_RETRY_POLICY = {
  IMMEDIATE:     "immediate",
  EXPONENTIAL:   "exponential",
  MANUAL_REVIEW: "manual_review",
} as const;

export type SocialRetryPolicy = typeof SOCIAL_RETRY_POLICY[keyof typeof SOCIAL_RETRY_POLICY];

// ── Failure types ──────────────────────────────────────────────────────────────

export const SOCIAL_FAILURE_TYPE = {
  AUTH_FAILURE:       "auth_failure",
  NETWORK_FAILURE:    "network_failure",
  RATE_LIMIT:         "rate_limit",
  INVALID_MEDIA:      "invalid_media",
  CAPTION_ERROR:      "caption_error",
  PLATFORM_REJECTION: "platform_rejection",
  TIMEOUT:            "timeout",
  UNKNOWN:            "unknown",
} as const;

export type SocialFailureType = typeof SOCIAL_FAILURE_TYPE[keyof typeof SOCIAL_FAILURE_TYPE];

// ── Label maps ─────────────────────────────────────────────────────────────────

export const SOCIAL_CHANNEL_LABEL: Record<SocialChannel, string> = {
  tiktok:    "TikTok",
  instagram: "Instagram",
  facebook:  "Facebook",
  whatsapp:  "WhatsApp",
  youtube:   "YouTube",
};

export const SOCIAL_STATUS_LABEL: Record<SocialStatus, string> = {
  draft:      "Borrador",
  queued:     "En Cola",
  preparing:  "Preparando",
  publishing: "Publicando",
  published:  "Publicado",
  failed:     "Fallido",
  retrying:   "Reintentando",
  scheduled:  "Programado",
  paused:     "Pausado",
  cancelled:  "Cancelado",
};

export const SOCIAL_CONTENT_TYPE_LABEL: Record<SocialContentType, string> = {
  short_video:     "Video Corto",
  reel:            "Reel",
  story:           "Story",
  carousel:        "Carrusel",
  image_post:      "Post Imagen",
  product_drop:    "Product Drop",
  campaign_launch: "Lanzamiento",
  ugc:             "UGC",
};

export const SOCIAL_PRIORITY_LABEL: Record<SocialPriority, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Media",
  low:      "Baja",
};

export const SOCIAL_FAILURE_LABEL: Record<SocialFailureType, string> = {
  auth_failure:       "Error de autenticación",
  network_failure:    "Fallo de red",
  rate_limit:         "Rate limit",
  invalid_media:      "Media inválido",
  caption_error:      "Error en caption",
  platform_rejection: "Rechazado por plataforma",
  timeout:            "Timeout",
  unknown:            "Error desconocido",
};

// ── DTOs ───────────────────────────────────────────────────────────────────────

export interface SocialAssetReference {
  assetId:    string | null;
  assetUrl:   string | null;
  contentType:SocialContentType;
  ratio:      string | null;
  width:      number | null;
  height:     number | null;
  isReady:    boolean;
  notes:      string | null;
}

export interface SocialCampaignLink {
  campaignId:   string;
  campaignName: string;
  launchPhase:  string;
  channelRole:  string;
}

export interface SocialRetryState {
  retryCount:    number;
  maxRetries:    number;
  policy:        SocialRetryPolicy;
  nextRetryAt:   string | null;
  lastFailureAt: string | null;
  failureType:   SocialFailureType | null;
  errorMessage:  string | null;
}

export interface SocialPublication {
  id:              string;
  organizationId:  string;
  channel:         SocialChannel;
  contentType:     SocialContentType;
  status:          SocialStatus;
  priority:        SocialPriority;
  caption:         string | null;
  asset:           SocialAssetReference | null;
  campaignLink:    SocialCampaignLink | null;
  distributionId:  string | null;      // links to DistributionSchedule/Pipeline
  scheduledAt:     string | null;
  publishedAt:     string | null;
  platformPostId:  string | null;
  platformUrl:     string | null;
  retry:           SocialRetryState;
  blockers:        string[];
  createdAt:       string;
  updatedAt:       string;
}

export interface SocialQueueItem {
  publicationId:   string;
  channel:         SocialChannel;
  contentType:     SocialContentType;
  status:          SocialStatus;
  priority:        SocialPriority;
  campaignName:    string | null;
  scheduledAt:     string | null;
  isOverdue:       boolean;
  retryCount:      number;
  blockers:        string[];
  readinessScore:  number;  // 0–100
}

export interface SocialChannelState {
  channel:          SocialChannel;
  isAuthValid:      boolean;
  queuedCount:      number;
  publishingCount:  number;
  failedCount:      number;
  retriesCount:     number;
  lastPublishedAt:  string | null;
  healthLevel:      "healthy" | "degraded" | "blocked" | "offline";
  healthDetail:     string | null;
}

export interface SocialExecutionResult {
  publicationId:  string;
  channel:        SocialChannel;
  success:        boolean;
  platformPostId: string | null;
  platformUrl:    string | null;
  errorType:      SocialFailureType | null;
  errorMessage:   string | null;
  durationMs:     number;
  executedAt:     string;
}

export interface SocialLiveActivity {
  id:          string;
  type:        "started" | "success" | "failed" | "retrying" | "campaign_advanced";
  channel:     SocialChannel;
  contentType: SocialContentType;
  message:     string;
  timestamp:   string;
  campaignId?: string;
}

export interface SocialHealthSummary {
  level:             "healthy" | "degraded" | "blocked" | "offline";
  label:             string;
  queuedCount:       number;
  publishingCount:   number;
  failedCount:       number;
  retryingCount:     number;
  overdueCount:      number;
  campaignLinked:    number;
  liveNow:           number;
  retryPressure:     "low" | "medium" | "high" | "critical";
}

export interface SocialRuntimeState {
  organizationId:   string;
  computedAt:       string;
  queue:            SocialQueueItem[];
  publications:     SocialPublication[];
  channelStates:    SocialChannelState[];
  recentActivity:   SocialLiveActivity[];
  health:           SocialHealthSummary;
  failedByType:     { failureType: SocialFailureType; count: number; recoveryHint: string }[];
  totalPublications:number;
}
