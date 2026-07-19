/**
 * lib/collections/performance.ts
 *
 * Collections performance KPIs — aggregated from completed ActionTasks.
 *
 * Queries:
 *   - CREAR_ACCION_COBRANZA tasks in the window (created + completed)
 *   - Outcome distribution from resultJson
 *   - Recovery metrics (promised amounts, paid outcomes)
 *   - Collector leaderboard (by assignedTo / createdBy)
 *   - Channel breakdown
 *
 * ── Design ───────────────────────────────────────────────────────────────────
 *
 *  All metrics derive from existing ActionTask data. No new tables.
 *  The window defaults to last 30 days.
 *
 * Exports:
 *   CollectionsPerformanceKpis  — main KPI shape
 *   getCollectionsPerformance() — query function
 *   getRecoveryTimeline()       — weekly recovery trend (last 8 weeks)
 */

import { prisma }              from "@/lib/prisma";
import { ActionTaskStatus }    from "@prisma/client";
import type { CollectionOutcomeData, OutcomeType } from "./outcomes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutcomeCount {
  outcomeType: OutcomeType;
  count:       number;
}

export interface ChannelStats {
  channel:  string;
  total:    number;
  paid:     number;
  promise:  number;
}

export interface CollectorStats {
  name:      string;
  completed: number;
  paid:      number;
  promise:   number;
}

export interface CollectionsPerformanceKpis {
  windowDays:          number;
  totalTasksCreated:   number;
  totalCompleted:      number;
  totalPending:        number;
  completionRate:      number;    // 0–100
  // Outcome breakdown
  outcomeCounts:       OutcomeCount[];
  paidCount:           number;
  promiseCount:        number;
  noContactCount:      number;
  brokenPromiseCount:  number;
  disputeCount:        number;
  // Financial
  estimatedRecovery:   number;    // sum of promiseAmount from PROMISE_TO_PAY + partialAmount
  // Leaderboard
  topCollectors:       CollectorStats[];
  byChannel:           ChannelStats[];
  // Trend (last 4 weeks, ISO week labels)
  weeklyTrend: Array<{
    week:      string;
    created:   number;
    completed: number;
    paid:      number;
  }>;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function isoWeek(d: Date): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getCollectionsPerformance(
  orgId:      string,
  windowDays = 30,
): Promise<CollectionsPerformanceKpis> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // ── Fetch all collection tasks in window ───────────────────────────────────
  const allTasks = await prisma.actionTask.findMany({
    where: {
      organizationId: orgId,
      actionType:     "CREAR_ACCION_COBRANZA",
      createdAt:      { gte: since },
    },
    select: {
      id:          true,
      status:      true,
      resultJson:  true,
      completedAt: true,
      createdAt:   true,
      createdBy:   true,
      assignedTo:  true,
    },
    orderBy: { createdAt: "desc" },
    take:    5000,
  });

  const totalTasksCreated = allTasks.length;
  const completed         = allTasks.filter(t => t.status === ActionTaskStatus.COMPLETED);
  const pending           = allTasks.filter(t => t.status === ActionTaskStatus.PENDING);
  const totalCompleted    = completed.length;
  const totalPending      = pending.length;
  const completionRate    = totalTasksCreated > 0
    ? Math.round((totalCompleted / totalTasksCreated) * 100)
    : 0;

  // ── Outcome breakdown ──────────────────────────────────────────────────────
  const outcomeCounts: Record<string, number> = {};
  const channelMap:    Record<string, { total: number; paid: number; promise: number }> = {};
  const collectorMap:  Record<string, { completed: number; paid: number; promise: number }> = {};
  let estimatedRecovery = 0;

  for (const task of completed) {
    if (!task.resultJson || typeof task.resultJson !== "object" || Array.isArray(task.resultJson)) continue;
    const outcome = task.resultJson as unknown as CollectionOutcomeData;
    const ot      = outcome.outcomeType ?? "UNKNOWN";

    // Outcome counts
    outcomeCounts[ot] = (outcomeCounts[ot] ?? 0) + 1;

    // Channel stats
    const ch = outcome.channel ?? "unknown";
    if (!channelMap[ch]) channelMap[ch] = { total: 0, paid: 0, promise: 0 };
    channelMap[ch].total++;
    if (ot === "PAID" || ot === "PARTIAL_PAYMENT") channelMap[ch].paid++;
    if (ot === "PROMISE_TO_PAY") channelMap[ch].promise++;

    // Collector stats
    const collector = task.assignedTo ?? task.createdBy ?? "unknown";
    if (!collectorMap[collector]) collectorMap[collector] = { completed: 0, paid: 0, promise: 0 };
    collectorMap[collector].completed++;
    if (ot === "PAID" || ot === "PARTIAL_PAYMENT") collectorMap[collector].paid++;
    if (ot === "PROMISE_TO_PAY") collectorMap[collector].promise++;

    // Recovery estimation
    if (ot === "PROMISE_TO_PAY" && outcome.promiseAmount)  estimatedRecovery += outcome.promiseAmount;
    if (ot === "PARTIAL_PAYMENT" && outcome.partialAmount) estimatedRecovery += outcome.partialAmount;
  }

  // ── Weekly trend (last 4 weeks) ────────────────────────────────────────────
  const weeklyMap: Record<string, { created: number; completed: number; paid: number }> = {};
  for (const task of allTasks) {
    const wk = isoWeek(new Date(task.createdAt));
    if (!weeklyMap[wk]) weeklyMap[wk] = { created: 0, completed: 0, paid: 0 };
    weeklyMap[wk].created++;
    if (task.status === ActionTaskStatus.COMPLETED) {
      weeklyMap[wk].completed++;
      if (task.resultJson && typeof task.resultJson === "object" && !Array.isArray(task.resultJson)) {
        const o = task.resultJson as unknown as CollectionOutcomeData;
        if (o.outcomeType === "PAID" || o.outcomeType === "PARTIAL_PAYMENT") {
          weeklyMap[wk].paid++;
        }
      }
    }
  }
  const weeklyTrend = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-4)
    .map(([week, v]) => ({ week, ...v }));

  // ── Sort collectors by completed desc, top 5 ─────────────────────────────
  const topCollectors: CollectorStats[] = Object.entries(collectorMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);

  const byChannel: ChannelStats[] = Object.entries(channelMap)
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.total - a.total);

  const outcomeCountsArr: OutcomeCount[] = Object.entries(outcomeCounts)
    .map(([outcomeType, count]) => ({ outcomeType: outcomeType as OutcomeType, count }))
    .sort((a, b) => b.count - a.count);

  return {
    windowDays,
    totalTasksCreated,
    totalCompleted,
    totalPending,
    completionRate,
    outcomeCounts:       outcomeCountsArr,
    paidCount:           (outcomeCounts["PAID"] ?? 0) + (outcomeCounts["PARTIAL_PAYMENT"] ?? 0),
    promiseCount:        outcomeCounts["PROMISE_TO_PAY"]  ?? 0,
    noContactCount:      outcomeCounts["NO_CONTACT"]      ?? 0,
    brokenPromiseCount:  outcomeCounts["BROKEN_PROMISE"]  ?? 0,
    disputeCount:        outcomeCounts["DISPUTE"]         ?? 0,
    estimatedRecovery,
    topCollectors,
    byChannel,
    weeklyTrend,
  };
}

// ── Recovery timeline ─────────────────────────────────────────────────────────

export interface RecoveryWeek {
  week:      string;
  recovery:  number;
  contacts:  number;
}

/**
 * Weekly recovery trend (last 8 weeks) — sum of promiseAmount + partialAmount.
 */
export async function getRecoveryTimeline(
  orgId:      string,
  weeksBack = 8,
): Promise<RecoveryWeek[]> {
  const since = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);

  const tasks = await prisma.actionTask.findMany({
    where: {
      organizationId: orgId,
      actionType:     "CREAR_ACCION_COBRANZA",
      status:         ActionTaskStatus.COMPLETED,
      completedAt:    { gte: since },
    },
    select: { completedAt: true, resultJson: true },
    take:   2000,
  });

  const weeklyMap: Record<string, RecoveryWeek> = {};

  for (const task of tasks) {
    if (!task.completedAt) continue;
    const wk = isoWeek(new Date(task.completedAt));
    if (!weeklyMap[wk]) weeklyMap[wk] = { week: wk, recovery: 0, contacts: 0 };
    weeklyMap[wk].contacts++;

    if (task.resultJson && typeof task.resultJson === "object" && !Array.isArray(task.resultJson)) {
      const o = task.resultJson as unknown as CollectionOutcomeData;
      if (o.outcomeType === "PROMISE_TO_PAY" && o.promiseAmount)  weeklyMap[wk].recovery += o.promiseAmount;
      if (o.outcomeType === "PARTIAL_PAYMENT" && o.partialAmount) weeklyMap[wk].recovery += o.partialAmount;
    }
  }

  return Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));
}
