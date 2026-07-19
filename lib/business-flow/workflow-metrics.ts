/**
 * workflow-metrics.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Performance metrics for workflow instances.
 *
 * Reusable across Production, Purchasing, Collection, HR, etc.
 * Any domain that uses the Workflow Engine gets these metrics for free.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { StageProgress } from "./workflow-state";

// ── Instance Metrics ─────────────────────────────────────────────────────────

/** Performance metrics for a single workflow instance. */
export interface WorkflowInstanceMetrics {
  /** Total elapsed time from start (minutes). */
  totalDurationMinutes: number;
  /** Time actively running (not paused/blocked). */
  activeDurationMinutes: number;
  /** Time spent paused. */
  pausedDurationMinutes: number;
  /** Time spent blocked. */
  blockedDurationMinutes: number;
  /** Number of stages completed. */
  stagesCompleted: number;
  /** Number of stages skipped. */
  stagesSkipped: number;
  /** Number of approvals granted. */
  approvalCount: number;
  /** Number of approvals rejected. */
  rejectionCount: number;
  /** Number of times the workflow was blocked. */
  blockCount: number;
  /** Number of retries. */
  retryCount: number;
  /** Number of SLA breaches. */
  slaBreachCount: number;
  /** Average time per completed stage (minutes). Null if none completed. */
  averageStageMinutes: number | null;
  /** Code of the longest stage. Null if none completed. */
  longestStageCode: string | null;
  /** Duration of the longest stage (minutes). Null if none completed. */
  longestStageMinutes: number | null;
}

// ── Stage Timing ─────────────────────────────────────────────────────────────

/** Timing breakdown for a single stage. */
export interface StageTiming {
  stageCode: string;
  stageName: string;
  durationMinutes: number | null;
  slaHours: number | null;
  slaBreach: boolean;
  waitingMinutes: number;
}

// ── Aggregate Metrics ────────────────────────────────────────────────────────

/** Aggregate metrics across multiple workflow instances (for dashboards). */
export interface WorkflowAggregateMetrics {
  /** Total instances. */
  totalInstances: number;
  /** Instances currently running. */
  runningInstances: number;
  /** Instances completed. */
  completedInstances: number;
  /** Instances blocked. */
  blockedInstances: number;
  /** Instances cancelled. */
  cancelledInstances: number;
  /** Average total duration (minutes). */
  avgDurationMinutes: number;
  /** Average completion rate (0-100). */
  avgCompletionPercent: number;
  /** Total SLA breaches across all instances. */
  totalSlaBreaches: number;
  /** Throughput: completions per day. */
  completionsPerDay: number;
}

// ── Metrics Computation ──────────────────────────────────────────────────────

/** Compute instance metrics from stage progress map. */
export function computeInstanceMetrics(
  stageProgress: Record<string, StageProgress>,
  startedAt: string | null,
): WorkflowInstanceMetrics {
  let stagesCompleted = 0;
  let stagesSkipped = 0;
  let totalStageDuration = 0;
  let longestCode: string | null = null;
  let longestMinutes: number | null = null;

  for (const [code, sp] of Object.entries(stageProgress)) {
    if (sp.status === "completed") {
      stagesCompleted++;
      if (sp.durationMinutes != null) {
        totalStageDuration += sp.durationMinutes;
        if (longestMinutes === null || sp.durationMinutes > longestMinutes) {
          longestMinutes = sp.durationMinutes;
          longestCode = code;
        }
      }
    }
    if (sp.status === "skipped") stagesSkipped++;
  }

  const totalDuration = startedAt
    ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
    : 0;

  return {
    totalDurationMinutes: totalDuration,
    activeDurationMinutes: totalDuration, // V2: subtract paused + blocked time
    pausedDurationMinutes: 0,
    blockedDurationMinutes: 0,
    stagesCompleted,
    stagesSkipped,
    approvalCount: 0,
    rejectionCount: 0,
    blockCount: 0,
    retryCount: 0,
    slaBreachCount: 0,
    averageStageMinutes: stagesCompleted > 0 ? Math.round(totalStageDuration / stagesCompleted) : null,
    longestStageCode: longestCode,
    longestStageMinutes: longestMinutes,
  };
}
