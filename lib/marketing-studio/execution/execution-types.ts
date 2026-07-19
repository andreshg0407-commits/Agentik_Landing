/**
 * lib/marketing-studio/execution/execution-types.ts
 *
 * MS-13 — Execution Runtime: Domain types
 *
 * All types are serializable — safe for RSC → client boundary.
 * No Prisma types. No Date objects (ISO strings only).
 * organizationId-scoped by contract.
 */

// ── Job types ──────────────────────────────────────────────────────────────────

export const EXECUTION_JOB_TYPE = {
  // Shopify
  SHOPIFY_PUBLISH_DRAFT:           "shopify.publish_draft",
  SHOPIFY_RETRY_SYNC:              "shopify.retry_sync",
  SHOPIFY_SYNC_CHECK:              "shopify.sync_check",
  // Catalog
  CATALOG_REBUILD:                 "catalog.rebuild",
  CATALOG_REFRESH_READINESS:       "catalog.refresh_readiness",
  // Product
  PRODUCT_RECOMPUTE_READINESS:     "product.recompute_readiness",
  PRODUCT_REFRESH_RECOMMENDATIONS: "product.refresh_recommendations",
  // WhatsApp
  WHATSAPP_PREPARE_CATALOG:        "whatsapp.prepare_catalog",
  // Assets
  ASSETS_GENERATE_VARIANTS:        "assets.generate_variants_placeholder",
  // Social
  SOCIAL_PUBLISH_INSTAGRAM:        "social.publish_instagram",
  SOCIAL_PUBLISH_TIKTOK:           "social.publish_tiktok",
  SOCIAL_PUBLISH_FACEBOOK:         "social.publish_facebook",
  SOCIAL_PUBLISH_YOUTUBE:          "social.publish_youtube",
  // Ads / Landing / Email
  ADS_PREPARE_PACKAGE:             "ads.prepare_package",
  LANDING_PUBLISH:                 "landing.publish",
  EMAIL_PREPARE:                   "email.prepare",
} as const;

export type ExecutionJobType = typeof EXECUTION_JOB_TYPE[keyof typeof EXECUTION_JOB_TYPE];

// ── Destinations ──────────────────────────────────────────────────────────────

export const EXECUTION_DESTINATION = {
  SHOPIFY:  "shopify",
  CATALOG:  "catalog",
  WHATSAPP: "whatsapp",
  SOCIAL:   "social",
  ADS:      "ads",
  CRM:      "crm",
  INTERNAL: "internal",
} as const;

export type ExecutionDestination = typeof EXECUTION_DESTINATION[keyof typeof EXECUTION_DESTINATION];

// ── Job status ─────────────────────────────────────────────────────────────────

export const EXECUTION_JOB_STATUS = {
  PENDING:          "pending",
  RUNNING:          "running",
  SUCCEEDED:        "succeeded",
  FAILED:           "failed",
  RETRY_SCHEDULED:  "retry_scheduled",
  CANCELLED:        "cancelled",
  SKIPPED:          "skipped",
  PENDING_EXTERNAL: "pending_external",
} as const;

export type ExecutionJobStatus = typeof EXECUTION_JOB_STATUS[keyof typeof EXECUTION_JOB_STATUS];

// ── Destination health ─────────────────────────────────────────────────────────

export const EXECUTION_HEALTH_LEVEL = {
  HEALTHY:  "healthy",
  DEGRADED: "degraded",
  BLOCKED:  "blocked",
  OFFLINE:  "offline",
  UNKNOWN:  "unknown",
} as const;

export type ExecutionHealthLevel = typeof EXECUTION_HEALTH_LEVEL[keyof typeof EXECUTION_HEALTH_LEVEL];

// ── Operational events ─────────────────────────────────────────────────────────

export const OPERATIONAL_EVENT = {
  PRODUCT_APPROVED:          "product.approved",
  PRODUCT_UPDATED:           "product.updated",
  ASSET_APPROVED:            "asset.approved",
  CATALOG_UPDATED:           "catalog.updated",
  SHOPIFY_PUBLISH_FAILED:    "shopify.publish_failed",
  SHOPIFY_SYNC_DRIFT:        "shopify.sync_drift_detected",
  WEBHOOK_RECEIVED:          "webhook.received",
  READINESS_CHANGED:         "readiness.changed",
} as const;

export type OperationalEventType = typeof OPERATIONAL_EVENT[keyof typeof OPERATIONAL_EVENT];

// ── Core DTOs ──────────────────────────────────────────────────────────────────

/** Safe serializable DTO — no secrets, no tokens */
export interface ExecutionJob {
  id:              string;
  organizationId:  string;
  jobType:         string;
  destination:     string;
  productId:       string | null;
  catalogId:       string | null;
  idempotencyKey:  string | null;
  status:          string;
  priority:        number;
  retryCount:      number;
  maxRetries:      number;
  payload:         Record<string, unknown>;
  result:          Record<string, unknown> | null;
  lastError:       string | null;
  scheduledAt:     string;
  startedAt:       string | null;
  completedAt:     string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface DispatchJobInput {
  organizationId:  string;
  jobType:         string;
  destination:     string;
  productId?:      string | null;
  catalogId?:      string | null;
  payload?:        Record<string, unknown>;
  priority?:       number;
  idempotencyKey?: string;
  maxRetries?:     number;
}

export interface DispatchJobResult {
  job:        ExecutionJob;
  wasDeduped: boolean;
}

export interface ExecutionJobRunResult {
  jobId:        string;
  success:      boolean;
  outcome:      string;
  errorMessage: string | null;
  canRetry:     boolean;
  nextRetryAt:  string | null;
}

export interface BatchRunResult {
  processed: number;
  succeeded: number;
  failed:    number;
  skipped:   number;
  errors:    Array<{ jobId: string; error: string }>;
}

export interface DestinationHealthSnapshotDTO {
  id:              string;
  organizationId:  string;
  destination:     string;
  healthLevel:     string;
  failedJobCount:  number;
  pendingJobCount: number;
  staleCount:      number;
  webhookBacklog:  number;
  isAuthValid:     boolean;
  detail:          string | null;
  snapshotAt:      string;
}

export interface ExecutionRetryAttemptDTO {
  id:            string;
  jobId:         string;
  attemptNumber: number;
  scheduledAt:   string;
  executedAt:    string | null;
  outcome:       string | null;
  errorMessage:  string | null;
  createdAt:     string;
}

/** idempotencyKey builders */
export function buildIdempotencyKey(
  jobType: string,
  organizationId: string,
  entityId: string,
): string {
  return `${jobType}:${organizationId}:${entityId}`;
}
