// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 29 — Simulation Dashboard Contract
// Pure domain — safe for client and server. No Prisma. No server-only.

import type {
  SimulationResult, SimulationRecord, SimulationCategory,
  SimulationConfidence, SimulationStatus,
} from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";

// ── Dashboard contract ────────────────────────────────────────────────────────

export interface SimulationDashboardContract {
  readonly orgSlug:              string;
  readonly totalSimulations:     number;
  readonly recentSimulations:    SimulationRecord[];
  readonly simulationsByCategory: Record<SimulationCategory | string, number>;
  readonly simulationsByDomain:   Record<StrategicDomain | string, number>;
  readonly avgConfidenceScore:    number;
  readonly lastSimulatedAt:       string | null;
  readonly status:                SimulationDashboardStatus;
  readonly isEmpty:               boolean;
}

export type SimulationDashboardStatus =
  | "READY"
  | "EMPTY"
  | "STALE"
  | "DEGRADED";

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildSimulationDashboard(
  orgSlug: string,
  records: SimulationRecord[]
): SimulationDashboardContract {
  const scoped = records.filter((r) => r.orgSlug === orgSlug);
  const sorted = [...scoped].sort((a, b) => b.simulatedAt.localeCompare(a.simulatedAt));

  const byCategory: Record<string, number> = {};
  const byDomain:   Record<string, number> = {};

  for (const r of scoped) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    byDomain[r.domain]     = (byDomain[r.domain] ?? 0) + 1;
  }

  const avgConf = scoped.length === 0 ? 0
    : Math.round(scoped.reduce((s, r) => s + r.confidenceScore, 0) / scoped.length * 100) / 100;

  const lastSimulatedAt = sorted[0]?.simulatedAt ?? null;
  const status          = _computeStatus(scoped, lastSimulatedAt);

  return {
    orgSlug,
    totalSimulations:      scoped.length,
    recentSimulations:     sorted.slice(0, 5),
    simulationsByCategory: byCategory,
    simulationsByDomain:   byDomain,
    avgConfidenceScore:    avgConf,
    lastSimulatedAt,
    status,
    isEmpty:               scoped.length === 0,
  };
}

export function buildEmptySimulationDashboard(orgSlug: string): SimulationDashboardContract {
  return {
    orgSlug,
    totalSimulations:      0,
    recentSimulations:     [],
    simulationsByCategory: {},
    simulationsByDomain:   {},
    avgConfidenceScore:    0,
    lastSimulatedAt:       null,
    status:                "EMPTY",
    isEmpty:               true,
  };
}

export function buildSimulationSummaryCard(result: SimulationResult): {
  scenarioCount:      number;
  bestVariant:        string;
  bestConfidence:     number;
  criticalRiskCount:  number;
  largeOppCount:      number;
  limitations:        string[];
} {
  const bestScenario = [...result.scenarios].sort((a, b) => b.confidenceScore - a.confidenceScore)[0];
  const critRisks    = result.scenarios.flatMap((s) => s.risks).filter((r) => r.level === "CRITICAL").length;
  const largeOpps    = result.scenarios.flatMap((s) => s.opportunities).filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").length;

  return {
    scenarioCount:     result.scenarios.length,
    bestVariant:       bestScenario?.variant ?? "N/A",
    bestConfidence:    bestScenario?.confidenceScore ?? 0,
    criticalRiskCount: critRisks,
    largeOppCount:     largeOpps,
    limitations:       result.limitations,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeStatus(records: SimulationRecord[], lastAt: string | null): SimulationDashboardStatus {
  if (records.length === 0) return "EMPTY";
  if (!lastAt) return "EMPTY";

  const daysSince = (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 30) return "STALE";

  const failedCount = records.filter((r) => r.status === "FAILED").length;
  if (failedCount > records.length * 0.5) return "DEGRADED";

  return "READY";
}
