/**
 * lib/marketing-studio/orchestration/orchestration-queue.ts
 *
 * MS-12 — Commerce Orchestration Layer: Queue Management
 *
 * Pure computation — builds sorted/grouped queue views and statistics.
 * No Prisma, no fetch, no side effects.
 */

import type { OrchestrationJob, OrchestrationQueueStats } from "./orchestration-types";
import { ORCHESTRATION_JOB_STATUS } from "./orchestration-types";

// ── Queue view ─────────────────────────────────────────────────────────────────

export interface QueueView {
  active:     OrchestrationJob[];   // RUNNING + PENDING, sorted by priority
  failed:     OrchestrationJob[];   // FAILED, sorted by retryCount desc
  retrying:   OrchestrationJob[];   // RETRYING, sorted by scheduledAt
  stale:      OrchestrationJob[];   // STALE
  completed:  OrchestrationJob[];   // SUCCEEDED, most recent 10
}

export function buildQueueView(jobs: OrchestrationJob[]): QueueView {
  const byStatus = (status: string) => jobs.filter(j => j.status === status);

  const active = byStatus(ORCHESTRATION_JOB_STATUS.RUNNING)
    .concat(byStatus(ORCHESTRATION_JOB_STATUS.PENDING))
    .sort((a, b) => a.priority - b.priority);

  const failed = byStatus(ORCHESTRATION_JOB_STATUS.FAILED)
    .sort((a, b) => b.retryCount - a.retryCount);

  const retrying = byStatus(ORCHESTRATION_JOB_STATUS.RETRYING)
    .sort((a, b) => {
      if (!a.scheduledAt) return 1;
      if (!b.scheduledAt) return -1;
      return a.scheduledAt.localeCompare(b.scheduledAt);
    });

  const stale = byStatus(ORCHESTRATION_JOB_STATUS.STALE);

  const completed = byStatus(ORCHESTRATION_JOB_STATUS.SUCCEEDED)
    .sort((a, b) => {
      const at = a.completedAt ?? a.createdAt;
      const bt = b.completedAt ?? b.createdAt;
      return bt.localeCompare(at);
    })
    .slice(0, 10);

  return { active, failed, retrying, stale, completed };
}

// ── Queue statistics ───────────────────────────────────────────────────────────

export function computeQueueStats(jobs: OrchestrationJob[]): OrchestrationQueueStats {
  return {
    totalJobs:     jobs.length,
    pendingJobs:   jobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.PENDING).length,
    runningJobs:   jobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.RUNNING).length,
    succeededJobs: jobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.SUCCEEDED).length,
    failedJobs:    jobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.FAILED).length,
    retryingJobs:  jobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.RETRYING).length,
    staleJobs:     jobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.STALE).length,
    backlogDepth:  jobs.filter(j =>
      j.status === ORCHESTRATION_JOB_STATUS.PENDING ||
      j.status === ORCHESTRATION_JOB_STATUS.RETRYING,
    ).length,
  };
}

// ── Priority scoring ───────────────────────────────────────────────────────────

/**
 * Computes an effective priority for a job, factoring in retry count.
 * Higher retryCount increases urgency (lower number = more urgent).
 */
export function effectivePriority(job: OrchestrationJob): number {
  return Math.max(1, job.priority - job.retryCount);
}
