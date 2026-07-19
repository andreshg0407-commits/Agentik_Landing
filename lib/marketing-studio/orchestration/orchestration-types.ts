/**
 * lib/marketing-studio/orchestration/orchestration-types.ts
 *
 * MS-12 — Commerce Orchestration Layer: Core types
 *
 * All types are plain serializable objects — safe for RSC → client boundary.
 * No Prisma types. No Date objects (ISO strings only).
 * No enums — all discriminants use `as const` objects.
 */

// ── Job types ──────────────────────────────────────────────────────────────────

export const ORCHESTRATION_JOB_TYPE = {
  SYNC_SHOPIFY:             "SYNC_SHOPIFY",
  REBUILD_CATALOG:          "REBUILD_CATALOG",
  GENERATE_VARIANTS:        "GENERATE_VARIANTS",
  GENERATE_SOCIAL_ASSETS:   "GENERATE_SOCIAL_ASSETS",
  UPDATE_WHATSAPP:          "UPDATE_WHATSAPP",
  PUBLISH_PRODUCT:          "PUBLISH_PRODUCT",
  RETRY_SYNC:               "RETRY_SYNC",
  RECALCULATE_READINESS:    "RECALCULATE_READINESS",
  REFRESH_RECOMMENDATIONS:  "REFRESH_RECOMMENDATIONS",
} as const;

export type OrchestrationJobType = typeof ORCHESTRATION_JOB_TYPE[keyof typeof ORCHESTRATION_JOB_TYPE];

// ── Job status ─────────────────────────────────────────────────────────────────

export const ORCHESTRATION_JOB_STATUS = {
  PENDING:    "PENDING",
  RUNNING:    "RUNNING",
  SUCCEEDED:  "SUCCEEDED",
  FAILED:     "FAILED",
  RETRYING:   "RETRYING",
  CANCELLED:  "CANCELLED",
  STALE:      "STALE",
} as const;

export type OrchestrationJobStatus = typeof ORCHESTRATION_JOB_STATUS[keyof typeof ORCHESTRATION_JOB_STATUS];

// ── Destination health ─────────────────────────────────────────────────────────

export const DESTINATION_HEALTH_LEVEL = {
  HEALTHY:    "healthy",
  DEGRADED:   "degraded",
  BLOCKED:    "blocked",
  OFFLINE:    "offline",
  UNKNOWN:    "unknown",
} as const;

export type DestinationHealthLevel = typeof DESTINATION_HEALTH_LEVEL[keyof typeof DESTINATION_HEALTH_LEVEL];

// ── System health ──────────────────────────────────────────────────────────────

export const SYSTEM_HEALTH_LEVEL = {
  OPERATIONAL: "operational",
  DEGRADED:    "degraded",
  CRITICAL:    "critical",
  UNKNOWN:     "unknown",
} as const;

export type SystemHealthLevel = typeof SYSTEM_HEALTH_LEVEL[keyof typeof SYSTEM_HEALTH_LEVEL];

// ── Propagation change types ───────────────────────────────────────────────────

export const PROPAGATION_CHANGE_TYPE = {
  PRICE:        "price",
  AVAILABILITY: "availability",
  VARIANTS:     "variants",
  METADATA:     "metadata",
  CATEGORY:     "category",
  ASSETS:       "assets",
  READINESS:    "readiness",
} as const;

export type PropagationChangeType = typeof PROPAGATION_CHANGE_TYPE[keyof typeof PROPAGATION_CHANGE_TYPE];

// ── Core interfaces ────────────────────────────────────────────────────────────

export interface OrchestrationJob {
  id:                   string;
  productId:            string | null;
  productName:          string | null;
  type:                 OrchestrationJobType;
  priority:             number;            // 1 = highest, 10 = lowest
  status:               OrchestrationJobStatus;
  retryCount:           number;
  createdAt:            string;            // ISO
  startedAt:            string | null;     // ISO
  completedAt:          string | null;     // ISO
  failureReason:        string | null;
  dependencies:         string[];          // job IDs this depends on
  affectedDestinations: string[];          // channel names
  scheduledAt:          string | null;     // ISO — for retries
}

export interface DestinationHealth {
  channel:        string;
  label:          string;
  healthLevel:    DestinationHealthLevel;
  healthLabel:    string;
  activeJobs:     number;
  failedJobs:     number;
  retryJobs:      number;
  syncedProducts: number;
  totalProducts:  number;
  lastActivityAt: string | null;   // ISO
  errorSummary:   string | null;
}

export interface PropagationImpact {
  changeType:           PropagationChangeType;
  affectedDestinations: string[];
  affectedProductIds:   string[];
  severity:             "blocking" | "warning" | "info";
  description:          string;
  jobsRequired:         OrchestrationJobType[];
}

export interface OrchestrationQueueStats {
  totalJobs:     number;
  pendingJobs:   number;
  runningJobs:   number;
  succeededJobs: number;
  failedJobs:    number;
  retryingJobs:  number;
  staleJobs:     number;
  backlogDepth:  number;    // pending + retrying
}

export interface OrchestrationRecommendedAction {
  key:               string;
  label:             string;
  detail:            string;
  urgency:           "critical" | "high" | "medium" | "low";
  affectedCount:     number;
  actionType:        "review" | "sync" | "publish" | "rebuild" | "retry";
  targetProductIds?: string[];
  targetChannel?:    string;
}

// ── Main orchestration output ──────────────────────────────────────────────────

export interface OrchestrationState {
  organizationId:       string;
  computedAt:           string;            // ISO
  systemHealth:         SystemHealthLevel;
  systemHealthLabel:    string;

  // Job queues
  activeJobs:           OrchestrationJob[];
  failedJobs:           OrchestrationJob[];
  retryQueue:           OrchestrationJob[];
  completedRecent:      OrchestrationJob[];

  // Destination health
  destinations:         DestinationHealth[];

  // Propagation
  propagationAlerts:    PropagationImpact[];

  // Queue metrics
  queueStats:           OrchestrationQueueStats;

  // Action recommendations
  recommendations:      OrchestrationRecommendedAction[];

  // Publication backlog
  publicationBacklog:   number;   // products ready but not published
  syncBacklog:          number;   // products needing sync

  // Webhook + webhook pending count (from MS-12 sync layer)
  webhookPending:       number;
}
