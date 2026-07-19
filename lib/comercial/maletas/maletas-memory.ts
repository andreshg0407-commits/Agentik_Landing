/**
 * lib/comercial/maletas/maletas-memory.ts
 *
 * Operational memory builder for Maletas.
 * Combines live runtime context with persistent snapshot history,
 * temporal evolution, and recent events into a unified memory object.
 *
 * This is the "working memory" of the commercial operation — the structure
 * that David (copilot) and future AI agents will query.
 *
 * Server-only — never import from client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 */

import { prisma } from "@/lib/prisma";
import type { MaletasOperationalContext } from "./maletas-types";
import type { CommercialEventRecord } from "./maletas-events";
import type { TemporalEvolutionReport } from "./maletas-temporal";
import { loadRecentOperationalEvents } from "./maletas-events";
import { buildTemporalEvolution } from "./maletas-temporal";

// ─── Memory status ────────────────────────────────────────────────────────────

export type MemoryStatus = "READY" | "INSUFFICIENT_HISTORY" | "NO_DATA";

// ─── Extended copilot context ─────────────────────────────────────────────────

/**
 * Enriched copilot intelligence derived from historical memory.
 * These signals are ONLY available when sufficient history exists.
 */
export interface MaletasHistoricalIntelligence {
  strongestOperationalRisk: string | null;   // refCode with worst recurring breakdown
  weakestCoverageLine:      string | null;   // "LT" | "CS" with more degrading refs
  hottestReference:         string | null;   // caliente + lowest coverage days
  recurringBreakdowns:      string[];        // refs that entered critical 3+ times
  productionPressureRefs:   string[];        // refs with recurring production urgente/critica
  vendedorMasAfectado:      string | null;   // sales rep with highest avg pressure
}

// ─── Full operational memory ─────────────────────────────────────────────────

export interface MaletasOperationalMemory {
  status:       MemoryStatus;
  orgId:        string;
  generatedAt:  string;

  // Live snapshot (from buildMaletasRuntime)
  live: MaletasOperationalContext;

  // Recent operational events (last 30d)
  recentEvents: CommercialEventRecord[];

  // Temporal evolution (last 30d snapshots)
  temporal: TemporalEvolutionReport;

  // Derived historical intelligence for copilot
  historicalIntelligence: MaletasHistoricalIntelligence | null;

  // How many snapshots exist for this org (data depth indicator)
  snapshotDepth: number;

  // When was the first snapshot taken
  firstSnapshotAt: string | null;
}

// ─── Historical intelligence builder ─────────────────────────────────────────

function buildHistoricalIntelligence(
  temporal: TemporalEvolutionReport,
  live: MaletasOperationalContext,
): MaletasHistoricalIntelligence | null {
  if (temporal.status !== "READY") return null;

  // Strongest operational risk: most degraded ref still in critical state
  const criticalDegrading = temporal.degradingRefs.find(
    (r) => r.lastStatus === "sin_stock" || r.lastStatus === "ruptura_inminente",
  );
  const strongestOperationalRisk = criticalDegrading?.refCode ?? temporal.recurringRefs[0]?.refCode ?? null;

  // Weakest coverage line: which line has more degrading refs
  const ltDegrading = temporal.degradingRefs.filter((r) => r.line === "LT").length;
  const csDegrading = temporal.degradingRefs.filter((r) => r.line === "CS").length;
  const weakestCoverageLine =
    ltDegrading === 0 && csDegrading === 0 ? null :
    ltDegrading >= csDegrading ? "LT" : "CS";

  // Hottest reference: caliente classification + lowest coverage days
  const coverage = live.intelligence?.coverage ?? [];
  const hotCoverage = coverage
    .filter((c) => c.dailyVelocity !== null && c.dailyVelocity > 1)
    .sort((a, b) => (a.coverageDays ?? 999) - (b.coverageDays ?? 999));
  const hottestReference = hotCoverage[0]?.refCode ?? null;

  // Recurring breakdowns
  const recurringBreakdowns = temporal.recurringRefs.map((r) => r.refCode);

  // Production pressure refs: refs that had urgente/critica production in timeline
  const productionPressureRefs = temporal.degradingRefs
    .filter((r) => r.criticalRunCount >= 2)
    .map((r) => r.refCode);

  // Vendedor más afectado
  const vendedorMasAfectado = temporal.highPressureReps[0]
    ? `${temporal.highPressureReps[0].salesRepName} (${temporal.highPressureReps[0].line})`
    : null;

  return {
    strongestOperationalRisk,
    weakestCoverageLine,
    hottestReference,
    recurringBreakdowns,
    productionPressureRefs,
    vendedorMasAfectado,
  };
}

// ─── Main memory builder ──────────────────────────────────────────────────────

/**
 * Build the full operational memory for Maletas.
 * Combines live runtime + historical snapshots + temporal evolution.
 *
 * Safe to call from Server Components.
 * Always returns a valid object, even with no history.
 */
export async function buildMaletasOperationalMemory(
  orgId: string,
  live: MaletasOperationalContext,
  opts: { daysBack?: number } = {},
): Promise<MaletasOperationalMemory> {
  const generatedAt = new Date().toISOString();
  const daysBack    = opts.daysBack ?? 30;

  const [recentEvents, temporal, snapshotDepth, firstSnapshot] = await Promise.all([
    loadRecentOperationalEvents(orgId, { daysBack }).catch(() => [] as CommercialEventRecord[]),
    buildTemporalEvolution(orgId, { daysBack }).catch((): TemporalEvolutionReport => ({
      status:           "NO_DATA",
      orgId,
      windowDays:       daysBack,
      snapshotCount:    0,
      generatedAt,
      degradingRefs:    [],
      recoveringRefs:   [],
      recurringRefs:    [],
      highPressureReps: [],
      summary: {
        totalRefsTracked:  0,
        criticalTrends:    0,
        recoveringTrends:  0,
        avgDegradationPct: null,
        mostDegradedRef:   null,
        mostAffectedRep:   null,
      },
    })),
    prisma.commercialCoverageSnapshot.count({ where: { organizationId: orgId } }).catch(() => 0),
    prisma.commercialCoverageSnapshot.findFirst({
      where:   { organizationId: orgId },
      orderBy: { snapshotAt: "asc" },
      select:  { snapshotAt: true },
    }).catch(() => null),
  ]);

  const status: MemoryStatus =
    snapshotDepth === 0       ? "NO_DATA" :
    snapshotDepth < 10        ? "INSUFFICIENT_HISTORY" :
    temporal.status === "READY" ? "READY" :
    "INSUFFICIENT_HISTORY";

  const historicalIntelligence = buildHistoricalIntelligence(temporal, live);

  return {
    status,
    orgId,
    generatedAt,
    live,
    recentEvents,
    temporal,
    historicalIntelligence,
    snapshotDepth,
    firstSnapshotAt: firstSnapshot?.snapshotAt.toISOString() ?? null,
  };
}

// ─── Memory summary for page header ──────────────────────────────────────────

export interface MaletasMemorySummary {
  hasHistory:       boolean;
  snapshotDepth:    number;
  firstSnapshotAt:  string | null;
  mostDegradedRef:  string | null;
  mostAffectedRep:  string | null;
  recurringCount:   number;
  recentEventCount: number;
}

export function extractMemorySummary(memory: MaletasOperationalMemory): MaletasMemorySummary {
  return {
    hasHistory:      memory.snapshotDepth >= 10,
    snapshotDepth:   memory.snapshotDepth,
    firstSnapshotAt: memory.firstSnapshotAt,
    mostDegradedRef: memory.temporal.summary.mostDegradedRef,
    mostAffectedRep: memory.temporal.summary.mostAffectedRep,
    recurringCount:  memory.temporal.recurringRefs.length,
    recentEventCount: memory.recentEvents.length,
  };
}
