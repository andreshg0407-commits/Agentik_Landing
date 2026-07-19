/**
 * lib/marketing-studio/execution/execution-retries.ts
 *
 * MS-13 — Execution Runtime: Retry engine
 *
 * Exponential backoff, retry eligibility, retry audit trail.
 * Pure computation functions + DB-writing schedulers.
 *
 * SERVER ONLY.
 */

import {
  updateExecutionJobStatus,
  createRetryAttemptRecord,
  findExecutionJob,
} from "./execution-repository";
import type { ExecutionJob } from "./execution-types";
import { EXECUTION_JOB_STATUS } from "./execution-types";
import { auditExecution } from "./execution-audit";

// ── Constants ─────────────────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 60_000;   // 60 seconds
const MAX_BACKOFF_MS  = 30 * 60_000; // 30 minutes cap

/** Per-type retry caps override the job's maxRetries */
const RETRY_CAP_OVERRIDES: Record<string, number> = {
  "shopify.publish_draft":       3,
  "shopify.retry_sync":          3,
  "shopify.sync_check":          2,
  "catalog.rebuild":             2,
  "product.recompute_readiness": 5,
  "whatsapp.prepare_catalog":    2,
};

// ── Pure computation ──────────────────────────────────────────────────────────

export function computeExecutionRetryDelay(retryCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

export function shouldRetryExecutionJob(job: ExecutionJob): boolean {
  const cap = RETRY_CAP_OVERRIDES[job.jobType] ?? job.maxRetries;
  return job.retryCount < cap;
}

export function computeNextRetryAt(retryCount: number): Date {
  return new Date(Date.now() + computeExecutionRetryDelay(retryCount));
}

// ── DB-writing operations ─────────────────────────────────────────────────────

/**
 * Schedule a retry for a failed job.
 * Increments retryCount, sets status to retry_scheduled, records audit entry.
 */
export async function scheduleExecutionRetry(
  jobId:          string,
  organizationId: string,
): Promise<{ scheduled: true; nextRetryAt: string } | { scheduled: false; reason: string }> {
  const job = await findExecutionJob(jobId, organizationId);
  if (!job) {
    return { scheduled: false, reason: "job_not_found" };
  }

  if (!shouldRetryExecutionJob(job)) {
    return {
      scheduled: false,
      reason:    `max_retries_reached (${job.retryCount}/${job.maxRetries})`,
    };
  }

  const newRetryCount = job.retryCount + 1;
  const nextRetryAt   = computeNextRetryAt(newRetryCount);

  await updateExecutionJobStatus(jobId, organizationId, EXECUTION_JOB_STATUS.RETRY_SCHEDULED, {
    retryCount:  newRetryCount,
    scheduledAt: nextRetryAt,
    startedAt:   null,
    completedAt: null,
    lastError:   job.lastError,
  });

  // Audit trail
  await createRetryAttemptRecord({
    organizationId,
    jobId,
    attemptNumber: newRetryCount,
    scheduledAt:   nextRetryAt,
  });

  auditExecution({
    ts:             new Date().toISOString(),
    event:          "retry_scheduled",
    organizationId,
    jobId,
    jobType:        job.jobType,
    retryCount:     newRetryCount,
    nextRetryAt:    nextRetryAt.toISOString(),
  });

  return { scheduled: true, nextRetryAt: nextRetryAt.toISOString() };
}

/**
 * Mark a job as permanently failed (retries exhausted).
 */
export async function markPermanentFailure(
  jobId:          string,
  organizationId: string,
  errorMessage:   string,
): Promise<void> {
  await updateExecutionJobStatus(jobId, organizationId, EXECUTION_JOB_STATUS.FAILED, {
    completedAt: new Date(),
    lastError:   errorMessage.slice(0, 500),
  });

  auditExecution({
    ts:             new Date().toISOString(),
    event:          "job_failed",
    organizationId,
    jobId,
    detail:         `Permanent failure: ${errorMessage.slice(0, 200)}`,
  });
}
