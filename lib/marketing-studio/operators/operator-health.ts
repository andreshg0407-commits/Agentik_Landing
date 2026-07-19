/**
 * lib/marketing-studio/operators/operator-health.ts
 *
 * MS-19 — Channel Operator Layer: Health computation + snapshot persistence
 *
 * SERVER ONLY — never import in client components.
 */

import { prisma }                  from "@/lib/prisma";
import { getOperatorReceiptStats } from "./operator-receipts";
import {
  OPERATOR_CHANNEL,
  OPERATOR_HEALTH,
  type OperatorChannel,
  type OperatorHealth,
  type OperatorHealthSummary,
  type OperatorSystemHealth,
} from "./operator-types";

// ── Health derivation ─────────────────────────────────────────────────────────

export function deriveChannelHealth(opts: {
  total:      number;
  confirmed:  number;
  failed:     number;
}): OperatorHealth {
  if (opts.total === 0) return OPERATOR_HEALTH.UNKNOWN;
  const failRate = opts.failed / opts.total;
  if (failRate >= 0.5)  return OPERATOR_HEALTH.UNAVAILABLE;
  if (failRate >= 0.2)  return OPERATOR_HEALTH.DEGRADED;
  return OPERATOR_HEALTH.HEALTHY;
}

// ── Per-channel health summary ────────────────────────────────────────────────

export async function computeChannelHealth(
  organizationId: string,
  channel:        OperatorChannel,
): Promise<OperatorHealthSummary> {
  const stats = await getOperatorReceiptStats({
    organizationId,
    channel,
    sinceMs: 60 * 60 * 1000, // last 1h
  });

  const successRate = stats.total > 0
    ? Math.round((stats.confirmed / stats.total) * 100) / 100
    : 0;

  // avg duration from recent receipts
  const recent = await prisma.operatorReceipt.findMany({
    where: {
      organizationId,
      channel,
      status: "confirmed",
      dispatchedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { durationMs: true },
    take: 50,
  });

  const durations = recent.map(r => r.durationMs ?? 0).filter(d => d > 0);
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return {
    channel,
    health:          deriveChannelHealth(stats),
    successRate,
    avgDurationMs,
    totalDispatched: stats.total,
    totalFailed:     stats.failed,
    lastCheckedAt:   new Date().toISOString(),
  };
}

// ── System-wide health ────────────────────────────────────────────────────────

export async function computeOperatorSystemHealth(
  organizationId: string,
): Promise<OperatorSystemHealth> {
  const channels = Object.values(OPERATOR_CHANNEL) as OperatorChannel[];

  const summaries = await Promise.all(
    channels.map(ch => computeChannelHealth(organizationId, ch)),
  );

  // Overall health = worst channel
  let overallHealth: OperatorHealth = OPERATOR_HEALTH.HEALTHY;
  for (const s of summaries) {
    if (s.health === OPERATOR_HEALTH.UNAVAILABLE) {
      overallHealth = OPERATOR_HEALTH.UNAVAILABLE;
      break;
    }
    if (s.health === OPERATOR_HEALTH.DEGRADED) {
      overallHealth = OPERATOR_HEALTH.DEGRADED;
    }
  }

  return {
    overallHealth,
    channels:    summaries,
    computedAt:  new Date().toISOString(),
  };
}

// ── Snapshot persistence ──────────────────────────────────────────────────────

export async function snapshotOperatorHealth(
  organizationId: string,
  summary:        OperatorHealthSummary,
): Promise<void> {
  await prisma.operatorHealthSnapshot.create({
    data: {
      organizationId,
      channel:         summary.channel,
      health:          summary.health,
      successRate:     summary.successRate,
      avgDurationMs:   summary.avgDurationMs,
      totalDispatched: summary.totalDispatched,
      totalFailed:     summary.totalFailed,
      summary:         summary as object,
    },
  });
}
