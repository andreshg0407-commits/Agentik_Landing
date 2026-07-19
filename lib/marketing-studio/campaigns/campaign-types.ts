/**
 * lib/marketing-studio/campaigns/campaign-types.ts
 *
 * MS-15 — Campaign Operating System: Core type system
 *
 * All types serializable — safe for RSC → client boundary.
 * No Prisma types, no Date objects (ISO strings only).
 */

// ── Campaign types ─────────────────────────────────────────────────────────────

export const CAMPAIGN_TYPE = {
  LAUNCH:              "launch",
  EVERGREEN:           "evergreen",
  SEASONAL:            "seasonal",
  FLASH_SALE:          "flash_sale",
  DROPSHIPPING:        "dropshipping",
  BRANDING:            "branding",
  RETENTION:           "retention",
  AWARENESS:           "awareness",
  WHATSAPP_PUSH:       "whatsapp_push",
  SHOPIFY_COLLECTION:  "shopify_collection",
} as const;

export type CampaignType = typeof CAMPAIGN_TYPE[keyof typeof CAMPAIGN_TYPE];

// ── Campaign status ────────────────────────────────────────────────────────────

export const CAMPAIGN_STATUS = {
  DRAFT:     "draft",
  PLANNING:  "planning",
  SCHEDULED: "scheduled",
  ACTIVE:    "active",
  PAUSED:    "paused",
  COMPLETED: "completed",
  FAILED:    "failed",
} as const;

export type CampaignStatus = typeof CAMPAIGN_STATUS[keyof typeof CAMPAIGN_STATUS];

// ── Campaign priority ──────────────────────────────────────────────────────────

export const CAMPAIGN_PRIORITY = {
  CRITICAL: "critical",
  HIGH:     "high",
  MEDIUM:   "medium",
  LOW:      "low",
} as const;

export type CampaignPriority = typeof CAMPAIGN_PRIORITY[keyof typeof CAMPAIGN_PRIORITY];

// ── Content types ──────────────────────────────────────────────────────────────

export const CONTENT_TYPE = {
  REEL:              "reel",
  STORY:             "story",
  CAROUSEL:          "carousel",
  PRODUCT_POST:      "product_post",
  BANNER:            "banner",
  EMAIL:             "email",
  WHATSAPP_PUSH:     "whatsapp_push",
  LANDING_HERO:      "landing_hero",
  COLLECTION_BANNER: "collection_banner",
  UGC_VIDEO:         "ugc_video",
} as const;

export type ContentType = typeof CONTENT_TYPE[keyof typeof CONTENT_TYPE];

// ── Channel types ──────────────────────────────────────────────────────────────

export const CHANNEL_TYPE = {
  INSTAGRAM: "instagram",
  TIKTOK:    "tiktok",
  FACEBOOK:  "facebook",
  WHATSAPP:  "whatsapp",
  SHOPIFY:   "shopify",
  LANDING:   "landing",
  ADS:       "ads",
  EMAIL:     "email",
} as const;

export type ChannelType = typeof CHANNEL_TYPE[keyof typeof CHANNEL_TYPE];

// ── Launch phases ──────────────────────────────────────────────────────────────

export const LAUNCH_PHASE = {
  TEASER:       "teaser",
  REVEAL:       "reveal",
  LAUNCH:       "launch",
  REINFORCEMENT:"reinforcement",
  URGENCY:      "urgency",
  RETENTION:    "retention",
} as const;

export type LaunchPhase = typeof LAUNCH_PHASE[keyof typeof LAUNCH_PHASE];

// ── Readiness levels ───────────────────────────────────────────────────────────

export const CAMPAIGN_READINESS_LEVEL = {
  BLOCKED:   "blocked",
  PARTIAL:   "partial",
  READY:     "ready",
  EXCELLENT: "excellent",
} as const;

export type CampaignReadinessLevel = typeof CAMPAIGN_READINESS_LEVEL[keyof typeof CAMPAIGN_READINESS_LEVEL];

// ── Health levels ──────────────────────────────────────────────────────────────

export const CAMPAIGN_HEALTH_LEVEL = {
  HEALTHY:  "healthy",
  WARNING:  "warning",
  CRITICAL: "critical",
  STALLED:  "stalled",
} as const;

export type CampaignHealthLevel = typeof CAMPAIGN_HEALTH_LEVEL[keyof typeof CAMPAIGN_HEALTH_LEVEL];

// ── Label maps ─────────────────────────────────────────────────────────────────

export const CAMPAIGN_TYPE_LABEL: Record<CampaignType, string> = {
  launch:             "Lanzamiento",
  evergreen:          "Evergreen",
  seasonal:           "Temporada",
  flash_sale:         "Flash Sale",
  dropshipping:       "Dropshipping",
  branding:           "Branding",
  retention:          "Retención",
  awareness:          "Awareness",
  whatsapp_push:      "Push WhatsApp",
  shopify_collection: "Colección Shopify",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft:     "Borrador",
  planning:  "Planificación",
  scheduled: "Programado",
  active:    "Activo",
  paused:    "Pausado",
  completed: "Completado",
  failed:    "Fallido",
};

export const CAMPAIGN_PRIORITY_LABEL: Record<CampaignPriority, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Media",
  low:      "Baja",
};

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  reel:              "Reel",
  story:             "Story",
  carousel:          "Carrusel",
  product_post:      "Post Producto",
  banner:            "Banner",
  email:             "Email",
  whatsapp_push:     "Push WhatsApp",
  landing_hero:      "Hero Landing",
  collection_banner: "Banner Colección",
  ugc_video:         "Video UGC",
};

export const CHANNEL_TYPE_LABEL: Record<ChannelType, string> = {
  instagram: "Instagram",
  tiktok:    "TikTok",
  facebook:  "Facebook",
  whatsapp:  "WhatsApp",
  shopify:   "Shopify",
  landing:   "Landing",
  ads:       "Ads",
  email:     "Email",
};

export const LAUNCH_PHASE_LABEL: Record<LaunchPhase, string> = {
  teaser:        "Teaser",
  reveal:        "Reveal",
  launch:        "Lanzamiento",
  reinforcement: "Refuerzo",
  urgency:       "Urgencia",
  retention:     "Retención",
};

// ── Required content per channel ───────────────────────────────────────────────

export const CHANNEL_REQUIRED_CONTENT: Record<ChannelType, ContentType[]> = {
  instagram: ["reel", "story", "carousel"],
  tiktok:    ["reel", "ugc_video"],
  facebook:  ["product_post", "banner"],
  whatsapp:  ["whatsapp_push"],
  shopify:   ["collection_banner", "product_post"],
  landing:   ["landing_hero", "banner"],
  ads:       ["banner", "product_post"],
  email:     ["email", "banner"],
};

// ── Campaign phase recommended sequence ───────────────────────────────────────

export const LAUNCH_PHASE_SEQUENCE: LaunchPhase[] = [
  "teaser",
  "reveal",
  "launch",
  "reinforcement",
  "urgency",
  "retention",
];

// ── Domain DTOs ────────────────────────────────────────────────────────────────

export interface CampaignContentSlot {
  id:          string;
  contentType: ContentType;
  channel:     ChannelType;
  phase:       LaunchPhase;
  isReady:     boolean;
  assetId:     string | null;
  notes:       string | null;
  scheduledAt: string | null;
}

export interface CampaignSequence {
  phase:        LaunchPhase;
  label:        string;
  channels:     ChannelType[];
  contentTypes: ContentType[];
  startOffset:  number; // days from campaign start
  endOffset:    number;
  isComplete:   boolean;
  missingSlots: number;
}

export interface CampaignEntity {
  id:              string;
  name:            string;
  type:            CampaignType;
  status:          CampaignStatus;
  priority:        CampaignPriority;
  channels:        ChannelType[];
  productIds:      string[];
  startDate:       string | null;
  endDate:         string | null;
  sequences:       CampaignSequence[];
  contentSlots:    CampaignContentSlot[];
  readinessScore:  number;
  readinessLevel:  CampaignReadinessLevel;
  sourceId:        string | null; // links back to DistributionPipeline id
  createdAt:       string;
  updatedAt:       string;
}

export interface CampaignLaunchWindow {
  campaignId:   string;
  campaignName: string;
  phase:        LaunchPhase;
  startsAt:     string | null;
  endsAt:       string | null;
  channels:     ChannelType[];
  isLive:       boolean;
  isOverdue:    boolean;
  daysToLaunch: number | null;
}

export interface CampaignCalendarEvent {
  id:          string;
  campaignId:  string;
  campaignName:string;
  contentType: ContentType;
  channel:     ChannelType;
  phase:       LaunchPhase;
  scheduledAt: string;
  isReady:     boolean;
  priority:    CampaignPriority;
}

export interface CampaignHealthSummary {
  level:              CampaignHealthLevel;
  label:              string;
  activeCampaigns:    number;
  blockedLaunches:    number;
  overduePublications:number;
  missingAssets:      number;
  staleCampaigns:     number;
  tiktokReadiness:    number; // 0-100
  whatsappReadiness:  number; // 0-100
  shopifySync:        number; // 0-100
  launchPressure:     "low" | "medium" | "high" | "critical";
}

export interface CampaignRecommendation {
  key:               string;
  label:             string;
  detail:            string;
  urgency:           "critical" | "high" | "medium" | "low";
  campaignId?:       string;
  campaignName?:     string;
  channel?:          ChannelType;
  contentType?:      ContentType;
  affectedCount:     number;
  recommendedAction: string;
  agentLabel:        "Luca" | "Mila";
}

export interface CampaignDistributionPlan {
  campaignId:     string;
  channels:       ChannelType[];
  requiredContent:{ channel: ChannelType; contentType: ContentType; isReady: boolean }[];
  coverageScore:  number;
  isReadyToLaunch:boolean;
  missingItems:   string[];
}

export interface CoordinationWarning {
  key:         string;
  label:       string;
  detail:      string;
  channels:    ChannelType[];
  campaignId?: string;
  severity:    "critical" | "warning" | "info";
}

export interface CoordinationSuggestion {
  key:               string;
  label:             string;
  detail:            string;
  fromChannel:       ChannelType;
  toChannel:         ChannelType;
  triggerType:       string;
  recommendedAction: string;
}

export interface DependencyEdge {
  fromChannel: ChannelType;
  toChannel:   ChannelType;
  description: string;
  isMet:       boolean;
}

// ── Runtime state ──────────────────────────────────────────────────────────────

export interface CampaignRuntimeState {
  organizationId:    string;
  computedAt:        string;
  campaigns:         CampaignEntity[];
  calendarEvents:    CampaignCalendarEvent[];
  launchWindows:     CampaignLaunchWindow[];
  health:            CampaignHealthSummary;
  lucaRecos:         CampaignRecommendation[];
  milaRecos:         CampaignRecommendation[];
  coordinationWarnings:    CoordinationWarning[];
  coordinationSuggestions: CoordinationSuggestion[];
  productCount:      number;
  activeCampaignIds: string[];
}
