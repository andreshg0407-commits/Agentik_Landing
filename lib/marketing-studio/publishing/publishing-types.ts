/**
 * lib/marketing-studio/publishing/publishing-types.ts
 *
 * MS-17 — Unified Publishing OS: Core type system
 *
 * All types serializable — safe for RSC → client boundary.
 * No Prisma types. No Date objects (ISO strings only).
 */

// ── Destinations ───────────────────────────────────────────────────────────────

export const PUBLISHING_DESTINATION = {
  SHOPIFY:   "shopify",
  INSTAGRAM: "instagram",
  FACEBOOK:  "facebook",
  TIKTOK:    "tiktok",
  WHATSAPP:  "whatsapp",
  YOUTUBE:   "youtube",
  LANDING:   "landing",
  CATALOG:   "catalog",
  ADS:       "ads",
  EMAIL:     "email",
} as const;

export type PublishingDestination = typeof PUBLISHING_DESTINATION[keyof typeof PUBLISHING_DESTINATION];

// ── Status ────────────────────────────────────────────────────────────────────

export const PUBLISHING_STATUS = {
  DRAFT:      "draft",
  PLANNED:    "planned",
  BLOCKED:    "blocked",
  QUEUED:     "queued",
  PREPARING:  "preparing",
  PUBLISHING: "publishing",
  PUBLISHED:  "published",
  PARTIAL:    "partial",
  FAILED:     "failed",
  RETRYING:   "retrying",
  CANCELLED:  "cancelled",
  ARCHIVED:   "archived",
} as const;

export type PublishingStatus = typeof PUBLISHING_STATUS[keyof typeof PUBLISHING_STATUS];

// ── Priority ──────────────────────────────────────────────────────────────────

export const PUBLISHING_PRIORITY = {
  CRITICAL: "critical",
  HIGH:     "high",
  MEDIUM:   "medium",
  LOW:      "low",
} as const;

export type PublishingPriority = typeof PUBLISHING_PRIORITY[keyof typeof PUBLISHING_PRIORITY];

// ── Trigger ───────────────────────────────────────────────────────────────────

export const PUBLISHING_TRIGGER = {
  MANUAL:                "manual",
  SCHEDULE:              "schedule",
  CAMPAIGN:              "campaign",
  DISTRIBUTION_PIPELINE: "distribution_pipeline",
  PRODUCT_APPROVED:      "product_approved",
  CATALOG_UPDATED:       "catalog_updated",
  RETRY:                 "retry",
  WEBHOOK:               "webhook",
} as const;

export type PublishingTrigger = typeof PUBLISHING_TRIGGER[keyof typeof PUBLISHING_TRIGGER];

// ── Dependency types ──────────────────────────────────────────────────────────

export const PUBLISHING_DEPENDENCY_TYPE = {
  PRODUCT_READY:    "product_ready",
  ASSET_READY:      "asset_ready",
  VARIANT_READY:    "variant_ready",
  CATALOG_READY:    "catalog_ready",
  SHOPIFY_PUBLISHED:"shopify_published",
  CAMPAIGN_READY:   "campaign_ready",
  AUTH_CONNECTED:   "auth_connected",
  SCHEDULE_DUE:     "schedule_due",
} as const;

export type PublishingDependencyType = typeof PUBLISHING_DEPENDENCY_TYPE[keyof typeof PUBLISHING_DEPENDENCY_TYPE];

// ── Event types ───────────────────────────────────────────────────────────────

export const PUBLISHING_EVENT = {
  PLAN_CREATED:           "publishing.plan_created",
  STEP_QUEUED:            "publishing.step_queued",
  STEP_STARTED:           "publishing.step_started",
  STEP_PUBLISHED:         "publishing.step_published",
  STEP_FAILED:            "publishing.step_failed",
  STEP_RETRYING:          "publishing.step_retrying",
  PLAN_COMPLETED:         "publishing.plan_completed",
  PLAN_BLOCKED:           "publishing.plan_blocked",
  DEPENDENCY_RESOLVED:    "publishing.dependency_resolved",
  SCHEDULE_MISSED:        "publishing.schedule_missed",
} as const;

export type PublishingEventType = typeof PUBLISHING_EVENT[keyof typeof PUBLISHING_EVENT];

// ── Label maps ────────────────────────────────────────────────────────────────

export const PUBLISHING_DESTINATION_LABEL: Record<PublishingDestination, string> = {
  shopify:   "Shopify",
  instagram: "Instagram",
  facebook:  "Facebook",
  tiktok:    "TikTok",
  whatsapp:  "WhatsApp",
  youtube:   "YouTube",
  landing:   "Landing Page",
  catalog:   "Catálogo",
  ads:       "Pauta / Ads",
  email:     "Email",
};

export const PUBLISHING_STATUS_LABEL: Record<PublishingStatus, string> = {
  draft:      "Borrador",
  planned:    "Planificado",
  blocked:    "Bloqueado",
  queued:     "En Cola",
  preparing:  "Preparando",
  publishing: "Publicando",
  published:  "Publicado",
  partial:    "Parcial",
  failed:     "Fallido",
  retrying:   "Reintentando",
  cancelled:  "Cancelado",
  archived:   "Archivado",
};

export const PUBLISHING_PRIORITY_LABEL: Record<PublishingPriority, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Media",
  low:      "Baja",
};

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface PublishingDependency {
  type:        PublishingDependencyType;
  entityId:    string | null;
  description: string;
  isResolved:  boolean;
  resolvedAt:  string | null;
}

export interface PublishingPlanStep {
  id:             string;
  organizationId: string;
  planId:         string;
  destination:    PublishingDestination;
  status:         PublishingStatus;
  dependencies:   PublishingDependency[];
  payload:        Record<string, unknown>;
  executionJobId: string | null;
  retryCount:     number;
  lastError:      string | null;
  scheduledAt:    string | null;
  startedAt:      string | null;
  completedAt:    string | null;
  createdAt:      string;
  updatedAt:      string;
  // Computed
  canExecute:     boolean;
  isBlocked:      boolean;
  isOverdue:      boolean;
  executionJobType: string;
}

export interface PublishingPlan {
  id:                 string;
  organizationId:     string;
  campaignId:         string | null;
  productId:          string | null;
  catalogId:          string | null;
  status:             PublishingStatus;
  priority:           PublishingPriority;
  trigger:            PublishingTrigger;
  destinationSummary: Record<string, string>;   // destination → status
  progress:           number;                   // 0–100
  scheduledAt:        string | null;
  startedAt:          string | null;
  completedAt:        string | null;
  createdAt:          string;
  updatedAt:          string;
  steps:              PublishingPlanStep[];
}

export interface PublishingDestinationState {
  destination:      PublishingDestination;
  totalSteps:       number;
  publishedSteps:   number;
  failedSteps:      number;
  blockedSteps:     number;
  pendingSteps:     number;
  healthLevel:      "healthy" | "degraded" | "blocked" | "offline";
  lastPublishedAt:  string | null;
}

export interface PublishingHealthSummary {
  level:            "healthy" | "degraded" | "blocked" | "critical";
  label:            string;
  activePlans:      number;
  blockedPlans:     number;
  failedSteps:      number;
  overdueSteps:     number;
  retryingSteps:    number;
  completedToday:   number;
  destinationHealth:PublishingDestinationState[];
  bottlenecks:      string[];
}

export interface PublishingExecutionContext {
  organizationId: string;
  planId:         string;
  stepId:         string;
  destination:    PublishingDestination;
  payload:        Record<string, unknown>;
  priority:       number;
  maxRetries:     number;
}

export interface PublishingResult {
  stepId:         string;
  success:        boolean;
  executionJobId: string | null;
  errorMessage:   string | null;
  isPendingExternal: boolean;
}

export interface PublishingAction {
  id:          string;
  label:       string;
  description: string;
  actionType:  "create_plan" | "execute_plan" | "execute_step" | "retry_step" | "cancel_plan" | "archive_plan" | "recalculate_deps";
  planId:      string | null;
  stepId:      string | null;
  isAvailable: boolean;
  unavailableReason: string | null;
}

export interface PublishingEventRecord {
  id:             string;
  organizationId: string;
  planId:         string | null;
  stepId:         string | null;
  eventType:      PublishingEventType;
  payload:        Record<string, unknown>;
  occurredAt:     string;
}

export interface PublishingRuntimeState {
  organizationId: string;
  computedAt:     string;
  plans:          PublishingPlan[];
  health:         PublishingHealthSummary;
  recentEvents:   PublishingEventRecord[];
  destinationStates: PublishingDestinationState[];
  totalPlans:     number;
  activePlanIds:  string[];
}
