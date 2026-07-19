/**
 * lib/marketing-studio/orchestrator/orchestrator-types.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Core type system
 *
 * All types serializable — safe for RSC → client boundary.
 * No Prisma types. No Date objects (ISO strings only).
 */

// ── Plan type ────────────────────────────────────────────────────────────────

export const ORCHESTRATOR_PLAN_TYPE = {
  PRODUCT_LAUNCH:       "product_launch",
  CAMPAIGN_LAUNCH:      "campaign_launch",
  CATALOG_DISTRIBUTION: "catalog_distribution",
  SOCIAL_PUSH:          "social_push",
  SHOPIFY_SYNC:         "shopify_sync",
  WHATSAPP_BROADCAST:   "whatsapp_broadcast",
  MULTI_CHANNEL_LAUNCH: "multi_channel_launch",
} as const;

export type OrchestratorPlanType = typeof ORCHESTRATOR_PLAN_TYPE[keyof typeof ORCHESTRATOR_PLAN_TYPE];

// ── Status ────────────────────────────────────────────────────────────────────

export const ORCHESTRATOR_STATUS = {
  DRAFT:               "draft",
  VALIDATING:          "validating",
  BLOCKED:             "blocked",
  QUEUED:              "queued",
  RUNNING:             "running",
  PARTIALLY_COMPLETED: "partially_completed",
  COMPLETED:           "completed",
  FAILED:              "failed",
  PAUSED:              "paused",
  ARCHIVED:            "archived",
} as const;

export type OrchestratorStatus = typeof ORCHESTRATOR_STATUS[keyof typeof ORCHESTRATOR_STATUS];

// ── Stage status ──────────────────────────────────────────────────────────────

export const ORCHESTRATOR_STAGE_STATUS = {
  PENDING:   "pending",
  READY:     "ready",
  RUNNING:   "running",
  COMPLETED: "completed",
  BLOCKED:   "blocked",
  FAILED:    "failed",
  SKIPPED:   "skipped",
} as const;

export type OrchestratorStageStatus = typeof ORCHESTRATOR_STAGE_STATUS[keyof typeof ORCHESTRATOR_STAGE_STATUS];

// ── Job type ──────────────────────────────────────────────────────────────────

export const ORCHESTRATOR_JOB_TYPE = {
  VALIDATION:       "validation",
  ASSET_SYNC:       "asset_sync",
  SHOPIFY_PUBLISH:  "shopify_publish",
  SOCIAL_PUBLISH:   "social_publish",
  WHATSAPP_PUBLISH: "whatsapp_publish",
  CAMPAIGN_ATTACH:  "campaign_attach",
  CATALOG_SYNC:     "catalog_sync",
  RETRY:            "retry",
  CLEANUP:          "cleanup",
} as const;

export type OrchestratorJobType = typeof ORCHESTRATOR_JOB_TYPE[keyof typeof ORCHESTRATOR_JOB_TYPE];

// ── Target channel ────────────────────────────────────────────────────────────

export const ORCHESTRATOR_CHANNEL = {
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

export type OrchestratorChannel = typeof ORCHESTRATOR_CHANNEL[keyof typeof ORCHESTRATOR_CHANNEL];

// ── Source entity type ────────────────────────────────────────────────────────

export type OrchestratorSourceEntityType = "product" | "campaign" | "catalog" | "asset" | "custom";

// ── Failure class ─────────────────────────────────────────────────────────────

export type OrchestratorFailureClass =
  | "network"
  | "validation"
  | "platform_rate_limit"
  | "auth"
  | "dependency"
  | "unknown";

// ── Blocker severity ──────────────────────────────────────────────────────────

export type OrchestratorBlockerSeverity = "error" | "warning" | "info";

// ── Health level ──────────────────────────────────────────────────────────────

export type OrchestratorHealthLevel = "healthy" | "warning" | "degraded" | "critical";

// ── Recommendation source ─────────────────────────────────────────────────────

export type RecommendationSource = "luca" | "mila";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface OrchestratorBlocker {
  id:          string;
  planId:      string;
  stageId:     string | null;
  severity:    OrchestratorBlockerSeverity;
  code:        string;
  description: string;
  autoAction:  string | null;
  resolvedAt:  string | null;
}

export interface OrchestratorJob {
  id:          string;
  stageId:     string;
  type:        OrchestratorJobType;
  label:       string;
  status:      OrchestratorStageStatus;
  startedAt:   string | null;
  completedAt: string | null;
  failedAt:    string | null;
  failReason:  string | null;
  retryCount:  number;
  executionJobId: string | null;
}

export interface OrchestratorStage {
  id:          string;
  planId:      string;
  type:        OrchestratorJobType;
  label:       string;
  status:      OrchestratorStageStatus;
  order:       number;
  dependsOn:   string[];   // stage ids
  jobs:        OrchestratorJob[];
  startedAt:   string | null;
  completedAt: string | null;
  failedReason: string | null;
}

export interface OrchestratorPlan {
  id:                 string;
  organizationId:     string;
  type:               OrchestratorPlanType;
  status:             OrchestratorStatus;
  priority:           "critical" | "high" | "medium" | "low";
  sourceEntityType:   OrchestratorSourceEntityType;
  sourceEntityId:     string | null;
  targetChannels:     OrchestratorChannel[];
  createdBy:          string;
  scheduledAt:        string | null;
  startedAt:          string | null;
  completedAt:        string | null;
  failedAt:           string | null;
  healthScore:        number;   // 0–100
  readinessScore:     number;   // 0–100
  retryCount:         number;
  stages:             OrchestratorStage[];
  blockers:           OrchestratorBlocker[];
  executionSummary:   OrchestratorExecutionSummary;
  metadata:           Record<string, unknown>;
  createdAt:          string;
  updatedAt:          string;
  // Computed progress
  progress:           number;   // 0–100
  completedStages:    number;
  totalStages:        number;
}

export interface OrchestratorExecutionSummary {
  totalJobs:       number;
  completedJobs:   number;
  failedJobs:      number;
  blockedJobs:     number;
  retryingJobs:    number;
  avgDurationMs:   number | null;
  lastActivityAt:  string | null;
}

export interface OrchestratorHealthSummary {
  level:             OrchestratorHealthLevel;
  label:             string;
  activePlans:       number;
  blockedPlans:      number;
  failedPlans:       number;
  completedToday:    number;
  successRate:       number;   // 0–100
  retryPressure:     number;   // total retrying jobs
  avgCompletionMs:   number | null;
  topBlockers:       string[];
}

export interface OrchestratorRecommendation {
  id:          string;
  source:      RecommendationSource;
  priority:    "high" | "medium" | "low";
  title:       string;
  description: string;
  action:      string | null;
  planId:      string | null;
  metadata:    Record<string, unknown>;
}

export interface OrchestratorRuntimeState {
  organizationId:  string;
  computedAt:      string;
  plans:           OrchestratorPlan[];
  health:          OrchestratorHealthSummary;
  recommendations: OrchestratorRecommendation[];
  totalPlans:      number;
  activePlanIds:   string[];
}
