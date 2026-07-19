/**
 * lib/marketing-studio/orchestrator/orchestrator-retries.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Retry engine
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import type {
  OrchestratorJobType,
  OrchestratorFailureClass,
  OrchestratorJob,
} from "./orchestrator-types";

// ── Max retries per job type ──────────────────────────────────────────────────

export const MAX_RETRIES: Record<OrchestratorJobType, number> = {
  validation:       2,
  asset_sync:       3,
  shopify_publish:  4,
  social_publish:   3,
  whatsapp_publish: 3,
  campaign_attach:  2,
  catalog_sync:     3,
  retry:            1,
  cleanup:          2,
};

// ── Base delay per failure class (ms) ─────────────────────────────────────────

const BASE_DELAY_MS: Record<OrchestratorFailureClass, number> = {
  network:              30_000,
  validation:           60_000,
  platform_rate_limit: 300_000,
  auth:                      0,   // permanent — no retry
  dependency:           30_000,
  unknown:              60_000,
};

// ── Failure classification ────────────────────────────────────────────────────

const AUTH_PATTERNS   = ["auth", "token", "credential", "unauthorized", "403", "401"];
const NETWORK_PATTERNS = ["network", "timeout", "econnrefused", "enotfound", "etimedout"];
const RATE_PATTERNS   = ["rate limit", "429", "too many requests", "throttle"];
const VALIDATION_PATTERNS = ["validation", "schema", "invalid", "missing field"];
const DEPENDENCY_PATTERNS = ["dependency", "not ready", "blocked", "precondition"];

export function classifyFailure(errorMessage: string): OrchestratorFailureClass {
  const msg = errorMessage.toLowerCase();
  if (AUTH_PATTERNS.some(p => msg.includes(p)))        return "auth";
  if (RATE_PATTERNS.some(p => msg.includes(p)))         return "platform_rate_limit";
  if (NETWORK_PATTERNS.some(p => msg.includes(p)))      return "network";
  if (VALIDATION_PATTERNS.some(p => msg.includes(p)))   return "validation";
  if (DEPENDENCY_PATTERNS.some(p => msg.includes(p)))   return "dependency";
  return "unknown";
}

// ── Retry eligibility ─────────────────────────────────────────────────────────

export function isRetryEligible(job: OrchestratorJob): boolean {
  if (job.status !== "failed") return false;
  const maxRetries = MAX_RETRIES[job.type] ?? 3;
  if (job.retryCount >= maxRetries) return false;
  if (!job.failReason) return true;
  // Auth failures are permanent
  const failClass = classifyFailure(job.failReason);
  return failClass !== "auth";
}

// ── Retry metadata ────────────────────────────────────────────────────────────

export interface RetryMetadata {
  retryCount:   number;
  nextRetryAt:  string;
  delayMs:      number;
  isEligible:   boolean;
  failureClass: OrchestratorFailureClass | null;
  isPermanent:  boolean;
}

export function computeRetryMetadata(job: OrchestratorJob): RetryMetadata {
  const eligible = isRetryEligible(job);
  const failureClass = job.failReason ? classifyFailure(job.failReason) : null;
  const isPermanent  = failureClass === "auth" || job.retryCount >= (MAX_RETRIES[job.type] ?? 3);

  const baseDelay = failureClass ? BASE_DELAY_MS[failureClass] : 30_000;
  // Exponential backoff: base × 2^retryCount, capped at 30min
  const delayMs   = isPermanent ? 0 : Math.min(baseDelay * Math.pow(2, job.retryCount), 30 * 60 * 1000);
  const nextRetryAt = isPermanent
    ? new Date(0).toISOString()
    : new Date(Date.now() + delayMs).toISOString();

  return {
    retryCount:   job.retryCount,
    nextRetryAt,
    delayMs,
    isEligible:   eligible,
    failureClass,
    isPermanent,
  };
}

// ── Stale retry detection ─────────────────────────────────────────────────────

/** A job is "stale retrying" if it's been stuck in retry for more than 1 hour */
export function isStaleRetrying(job: OrchestratorJob): boolean {
  if (job.status !== "running" || job.retryCount === 0) return false;
  if (!job.startedAt) return false;
  const staleThresholdMs = 60 * 60 * 1000; // 1 hour
  return Date.now() - new Date(job.startedAt).getTime() > staleThresholdMs;
}

// ── Retry pressure score ──────────────────────────────────────────────────────

/** Returns 0–100 indicating how much retry pressure the system is under */
export function computeRetryPressure(jobs: OrchestratorJob[]): number {
  if (jobs.length === 0) return 0;
  const retrying = jobs.filter(j => j.retryCount > 0).length;
  return Math.min(100, Math.round((retrying / jobs.length) * 100));
}
