// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory Health — server-only health check
import "server-only";

import type { StrategicMemoryEntry } from "./strategic-memory-types";

export type StrategicMemoryHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface StrategicMemoryHealthReport {
  readonly status: StrategicMemoryHealthStatus;
  readonly orgSlug: string;
  readonly activeEntries: number;
  readonly criticalEntries: number;
  readonly avgStrategicScore: number;
  readonly staleEntries: number;
  readonly issues: string[];
  readonly checkedAt: string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const HEALTH_THRESHOLDS = {
  minActiveEntries: 1,
  maxStaleRatio: 0.5,
  minAvgScore: 0.3,
  staleDaysThreshold: 90,
} as const;

// ── Health Check ──────────────────────────────────────────────────────────────

export function checkStrategicMemoryHealth(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryHealthReport {
  try {
    const scoped = entries.filter((e) => e.orgSlug === orgSlug);
    const active = scoped.filter((e) => e.status === "ACTIVE");
    const critical = active.filter((e) => e.priority === "CRITICAL");

    const avgScore =
      active.length > 0
        ? active.reduce((s, e) => s + e.strategicScore, 0) / active.length
        : 0;

    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - HEALTH_THRESHOLDS.staleDaysThreshold);
    const stale = active.filter(
      (e) => new Date(e.updatedAt).getTime() < staleCutoff.getTime()
    );

    const issues: string[] = [];

    if (active.length < HEALTH_THRESHOLDS.minActiveEntries) {
      issues.push("No active strategic entries — memory is empty");
    }
    if (active.length > 0 && avgScore < HEALTH_THRESHOLDS.minAvgScore) {
      issues.push(`Low average strategic score: ${(avgScore * 100).toFixed(0)}%`);
    }
    if (active.length > 0 && stale.length / active.length > HEALTH_THRESHOLDS.maxStaleRatio) {
      issues.push(`${stale.length} entries are stale (>90 days without update)`);
    }

    const status: StrategicMemoryHealthStatus =
      active.length === 0 ? "UNAVAILABLE" :
      issues.length >= 2 ? "DEGRADED" :
      issues.length === 1 ? "DEGRADED" :
      "HEALTHY";

    return {
      status,
      orgSlug,
      activeEntries: active.length,
      criticalEntries: critical.length,
      avgStrategicScore: avgScore,
      staleEntries: stale.length,
      issues,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      orgSlug,
      activeEntries: 0,
      criticalEntries: 0,
      avgStrategicScore: 0,
      staleEntries: 0,
      issues: ["Health check failed — strategic memory unavailable"],
      checkedAt: new Date().toISOString(),
    };
  }
}
