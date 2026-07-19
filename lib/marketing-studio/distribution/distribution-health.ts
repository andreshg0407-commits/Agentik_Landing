/**
 * lib/marketing-studio/distribution/distribution-health.ts
 *
 * MS-14 — Distribution Runtime: Health computation
 *
 * Derives DistributionHealthSummary from live state.
 * Pure computation — no Prisma, no async.
 * SERVER ONLY.
 */

import {
  DISTRIBUTION_HEALTH_LEVEL,
  DISTRIBUTION_STATUS,
  type DistributionHealthSummary,
  type DistributionPipelineDTO,
  type DistributionScheduleDTO,
  type ChannelCoverageItem,
} from "./distribution-types";

// ── Health derivation ──────────────────────────────────────────────────────────

export function computeDistributionHealth(opts: {
  pipelines:       DistributionPipelineDTO[];
  schedules:       DistributionScheduleDTO[];
  channelCoverage: ChannelCoverageItem[];
}): DistributionHealthSummary {
  const { pipelines, schedules, channelCoverage } = opts;

  const staleCount = pipelines.filter(p => p.status === DISTRIBUTION_STATUS.STALE).length;

  const missingVariantCount = channelCoverage.reduce(
    (sum, c) => sum + c.missing,
    0,
  );

  const failedPipelineCount = pipelines.filter(
    p => p.status === DISTRIBUTION_STATUS.FAILED,
  ).length;

  const inactivePipelines = pipelines.filter(
    p => p.status === DISTRIBUTION_STATUS.ARCHIVED ||
         p.status === DISTRIBUTION_STATUS.STALE,
  ).length;

  const unscheduledDrops = schedules.filter(
    s => !s.scheduledAt && s.status === "pending",
  ).length;

  const level = deriveHealthLevel({
    failedPipelineCount,
    missingVariantCount,
    staleCount,
    unscheduledDrops,
    channelCoverage,
  });

  return {
    level,
    label:               getHealthLabel(level),
    staleCount,
    missingVariantCount,
    failedPipelineCount,
    inactivePipelines,
    unscheduledDrops,
  };
}

function deriveHealthLevel(opts: {
  failedPipelineCount: number;
  missingVariantCount: number;
  staleCount:          number;
  unscheduledDrops:    number;
  channelCoverage:     ChannelCoverageItem[];
}): string {
  const { failedPipelineCount, missingVariantCount, staleCount, channelCoverage } = opts;

  // Any failed pipeline = blocked
  if (failedPipelineCount >= 2) return DISTRIBUTION_HEALTH_LEVEL.BLOCKED;

  // Low coverage on a channel = incomplete
  const criticalChannel = channelCoverage.some(c => c.coveragePct < 30 && c.totalProducts > 0);
  if (criticalChannel) return DISTRIBUTION_HEALTH_LEVEL.INCOMPLETE;

  // Significant missing variants or stale pipelines = degraded
  if (missingVariantCount > 20) return DISTRIBUTION_HEALTH_LEVEL.DEGRADED;
  if (staleCount > 5)           return DISTRIBUTION_HEALTH_LEVEL.DEGRADED;
  if (failedPipelineCount >= 1) return DISTRIBUTION_HEALTH_LEVEL.DEGRADED;

  // Any incomplete channel = incomplete
  const incompleteChannel = channelCoverage.some(c => c.coveragePct < 70 && c.totalProducts > 0);
  if (incompleteChannel) return DISTRIBUTION_HEALTH_LEVEL.INCOMPLETE;

  return DISTRIBUTION_HEALTH_LEVEL.HEALTHY;
}

function getHealthLabel(level: string): string {
  const labels: Record<string, string> = {
    healthy:    "Distribución saludable",
    degraded:   "Distribución degradada",
    blocked:    "Distribución bloqueada",
    incomplete: "Cobertura incompleta",
    unknown:    "Estado desconocido",
  };
  return labels[level] ?? level;
}

// ── Channel coverage derivation ────────────────────────────────────────────────

export function deriveChannelHealthLevel(coveragePct: number): string {
  if (coveragePct >= 80) return DISTRIBUTION_HEALTH_LEVEL.HEALTHY;
  if (coveragePct >= 50) return DISTRIBUTION_HEALTH_LEVEL.INCOMPLETE;
  if (coveragePct >= 20) return DISTRIBUTION_HEALTH_LEVEL.DEGRADED;
  return DISTRIBUTION_HEALTH_LEVEL.BLOCKED;
}
