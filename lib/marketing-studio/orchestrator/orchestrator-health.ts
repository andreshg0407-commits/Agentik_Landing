/**
 * lib/marketing-studio/orchestrator/orchestrator-health.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Health computation engine
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import type {
  OrchestratorPlan,
  OrchestratorHealthSummary,
  OrchestratorHealthLevel,
} from "./orchestrator-types";
import { getHealthLabel } from "./orchestrator-display";

// ── Success rate ──────────────────────────────────────────────────────────────

export function computeSuccessRate(plans: OrchestratorPlan[]): number {
  const terminal = plans.filter(p =>
    p.status === "completed" || p.status === "failed" || p.status === "partially_completed"
  );
  if (terminal.length === 0) return 100;
  const succeeded = terminal.filter(p => p.status === "completed").length;
  return Math.round((succeeded / terminal.length) * 100);
}

// ── Average completion time ───────────────────────────────────────────────────

export function computeAvgCompletionMs(plans: OrchestratorPlan[]): number | null {
  const completed = plans.filter(p =>
    p.status === "completed" && p.startedAt && p.completedAt
  );
  if (completed.length === 0) return null;
  const totalMs = completed.reduce((sum, p) => {
    return sum + (new Date(p.completedAt!).getTime() - new Date(p.startedAt!).getTime());
  }, 0);
  return Math.round(totalMs / completed.length);
}

// ── Determine health level ────────────────────────────────────────────────────

export function deriveHealthLevel(
  activePlans:   number,
  blockedPlans:  number,
  failedPlans:   number,
  successRate:   number,
  retryPressure: number,
): OrchestratorHealthLevel {
  const criticalBlockRate = activePlans > 0 ? (blockedPlans / activePlans) : 0;

  if (failedPlans > 0 && successRate < 50)   return "critical";
  if (criticalBlockRate > 0.5)               return "critical";
  if (failedPlans > 0 || successRate < 70)   return "degraded";
  if (blockedPlans > 0 || retryPressure > 30) return "warning";
  return "healthy";
}

// ── Top blockers ──────────────────────────────────────────────────────────────

export function extractTopBlockers(plans: OrchestratorPlan[], maxCount = 3): string[] {
  const codes: Map<string, number> = new Map();
  for (const plan of plans) {
    for (const blocker of plan.blockers) {
      codes.set(blocker.code, (codes.get(blocker.code) ?? 0) + 1);
    }
  }
  return [...codes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([code]) => code);
}

// ── Main health engine ────────────────────────────────────────────────────────

export function computeOrchestratorHealth(plans: OrchestratorPlan[]): OrchestratorHealthSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activePlans    = plans.filter(p => ["running", "queued", "validating", "partially_completed"].includes(p.status)).length;
  const blockedPlans   = plans.filter(p => p.status === "blocked").length;
  const failedPlans    = plans.filter(p => p.status === "failed").length;
  const completedToday = plans.filter(p =>
    p.status === "completed" && p.completedAt && new Date(p.completedAt) >= today
  ).length;

  const successRate  = computeSuccessRate(plans);
  const avgCompMs    = computeAvgCompletionMs(plans);

  // Retry pressure: count retrying jobs across all plans
  const allJobs = plans.flatMap(p => p.stages.flatMap(s => s.jobs));
  const retryingJobs = allJobs.filter(j => j.retryCount > 0).length;
  const retryPressure = allJobs.length > 0
    ? Math.round((retryingJobs / allJobs.length) * 100)
    : 0;

  const level = deriveHealthLevel(activePlans, blockedPlans, failedPlans, successRate, retryPressure);

  return {
    level,
    label:           getHealthLabel(level),
    activePlans,
    blockedPlans,
    failedPlans,
    completedToday,
    successRate,
    retryPressure,
    avgCompletionMs: avgCompMs,
    topBlockers:     extractTopBlockers(plans),
  };
}
