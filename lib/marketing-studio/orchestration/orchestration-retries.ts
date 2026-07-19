/**
 * lib/marketing-studio/orchestration/orchestration-retries.ts
 *
 * MS-12 — Commerce Orchestration Layer: Retry + Failure Engine
 *
 * Pure computation — determines retry strategy, stale detection,
 * and failure escalation rules. No side effects.
 */

import type { OrchestrationJob } from "./orchestration-types";
import {
  ORCHESTRATION_JOB_STATUS,
  DESTINATION_HEALTH_LEVEL,
  type DestinationHealth,
} from "./orchestration-types";

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_RETRIES       = 3;
const STALE_AFTER_MS    = 30 * 60 * 1000;    // 30 min
const BACKOFF_BASE_MS   = 60_000;              // 1 min base backoff

// ── Retry strategy output ─────────────────────────────────────────────────────

export interface RetryStrategy {
  shouldRetry:   boolean;
  reason:        string;
  nextRetryAt:   string | null;  // ISO
  backoffMs:     number;
  isCritical:    boolean;
}

// ── computeRetryStrategy ──────────────────────────────────────────────────────

export function computeRetryStrategy(job: OrchestrationJob): RetryStrategy {
  if (job.status !== ORCHESTRATION_JOB_STATUS.FAILED) {
    return { shouldRetry: false, reason: "Job is not in failed state", nextRetryAt: null, backoffMs: 0, isCritical: false };
  }

  if (job.retryCount >= MAX_RETRIES) {
    return {
      shouldRetry:  false,
      reason:       `Máximo de reintentos alcanzado (${MAX_RETRIES})`,
      nextRetryAt:  null,
      backoffMs:    0,
      isCritical:   true,
    };
  }

  const backoffMs   = BACKOFF_BASE_MS * Math.pow(2, job.retryCount);
  const baseTime    = job.completedAt ?? job.createdAt;
  const nextRetryAt = new Date(new Date(baseTime).getTime() + backoffMs).toISOString();
  const isCritical  = job.retryCount >= MAX_RETRIES - 1;

  return {
    shouldRetry:  true,
    reason:       `Retry ${job.retryCount + 1}/${MAX_RETRIES} — backoff ${Math.round(backoffMs / 1000)}s`,
    nextRetryAt,
    backoffMs,
    isCritical,
  };
}

// ── Stale detection ────────────────────────────────────────────────────────────

export function isJobStale(job: OrchestrationJob): boolean {
  if (job.status !== ORCHESTRATION_JOB_STATUS.RUNNING && job.status !== ORCHESTRATION_JOB_STATUS.PENDING) {
    return false;
  }
  const base = job.startedAt ?? job.createdAt;
  return Date.now() - new Date(base).getTime() > STALE_AFTER_MS;
}

// ── Build retry schedule ───────────────────────────────────────────────────────

export function buildRetrySchedule(
  failedJobs: OrchestrationJob[],
): Array<{ job: OrchestrationJob; strategy: RetryStrategy }> {
  return failedJobs
    .map(j => ({ job: j, strategy: computeRetryStrategy(j) }))
    .filter(({ strategy }) => strategy.shouldRetry)
    .sort((a, b) => {
      if (!a.strategy.nextRetryAt) return 1;
      if (!b.strategy.nextRetryAt) return -1;
      return a.strategy.nextRetryAt.localeCompare(b.strategy.nextRetryAt);
    });
}

// ── Health degradation from failures ─────────────────────────────────────────

export function applyFailureDegradation(
  destinations: DestinationHealth[],
  failedJobs:   OrchestrationJob[],
): DestinationHealth[] {
  return destinations.map(dest => {
    const affectingFailures = failedJobs.filter(j =>
      j.affectedDestinations.includes(dest.channel) &&
      j.retryCount >= MAX_RETRIES,
    );

    if (affectingFailures.length === 0) return dest;

    return {
      ...dest,
      healthLevel:  DESTINATION_HEALTH_LEVEL.BLOCKED,
      healthLabel:  "Bloqueado — reintentos agotados",
      errorSummary: `${affectingFailures.length} job(s) sin más reintentos disponibles`,
    };
  });
}
