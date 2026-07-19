// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 30 — Simulation Health Check
// Pure domain — no Prisma, no server-only.

import type { SimulationRecord } from "./strategic-simulation-types";

export type SimulationHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "EMPTY";

export interface SimulationHealthReport {
  readonly status:            SimulationHealthStatus;
  readonly orgSlug:           string;
  readonly simulationCount:   number;
  readonly completionRate:    number;   // 0–1
  readonly avgConfidence:     number;   // 0–1
  readonly staleDataWarning:  boolean;
  readonly warnings:          string[];
  readonly checkedAt:         string;
}

// ── Health check ──────────────────────────────────────────────────────────────

export function checkSimulationHealth(
  orgSlug: string,
  records: SimulationRecord[]
): SimulationHealthReport {
  const scoped    = records.filter((r) => r.orgSlug === orgSlug);
  const warnings: string[] = [];

  if (scoped.length === 0) {
    return {
      status:           "EMPTY",
      orgSlug,
      simulationCount:  0,
      completionRate:   0,
      avgConfidence:    0,
      staleDataWarning: false,
      warnings:         ["No simulations found for this tenant"],
      checkedAt:        new Date().toISOString(),
    };
  }

  const completed     = scoped.filter((r) => r.status === "COMPLETED");
  const failed        = scoped.filter((r) => r.status === "FAILED");
  const completionRate = Math.round((completed.length / scoped.length) * 100) / 100;
  const avgConfidence  = Math.round(scoped.reduce((s, r) => s + r.confidenceScore, 0) / scoped.length * 100) / 100;

  const sorted  = [...scoped].sort((a, b) => b.simulatedAt.localeCompare(a.simulatedAt));
  const lastAt  = sorted[0]?.simulatedAt;
  const daysSinceLast = lastAt
    ? (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  const staleDataWarning = daysSinceLast > 14;

  if (failed.length > 0) warnings.push(`${failed.length} failed simulation(s)`);
  if (avgConfidence < 0.4) warnings.push("Average confidence below 40% — simulation data may be unreliable");
  if (staleDataWarning) warnings.push("No simulations in last 14 days — data may be stale");

  const status: SimulationHealthStatus = failed.length > scoped.length * 0.5 ? "DEGRADED"
    : avgConfidence < 0.3 ? "DEGRADED"
    : "HEALTHY";

  return {
    status,
    orgSlug,
    simulationCount: scoped.length,
    completionRate,
    avgConfidence,
    staleDataWarning,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

export function isSimulationHealthy(report: SimulationHealthReport): boolean {
  return report.status === "HEALTHY";
}
