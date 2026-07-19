/**
 * lib/finance/temporal-snapshots.ts
 *
 * FASE 1 — Temporal Financial Snapshot Layer
 *
 * Reads FinancialRuntimeSnapshot rows from Prisma and enriches each with
 * the event counts that occurred in the preceding interval.
 *
 * All org-scoped. No cross-tenant. No interpolation.
 *
 * Sprint: AGENTIK-FINANCIAL-TEMPORAL-INTELLIGENCE-01
 */

import { prisma } from "@/lib/prisma";

// ── Window types ───────────────────────────────────────────────────────────────

export type TemporalWindow = "24h" | "7d" | "30d" | "90d";

export const WINDOW_HOURS: Record<TemporalWindow, number> = {
  "24h":  24,
  "7d":   168,
  "30d":  720,
  "90d":  2160,
};

// ── Snapshot type ──────────────────────────────────────────────────────────────

export interface TemporalFinancialSnapshot {
  organizationId:      string;
  generatedAt:         Date;
  graphIntegrityPct:   number;
  liquidityConfidence: number;
  reconciliationHealth: number;
  unresolvedCount:     number;
  closeBlockers:       number;
  staleSources:        number;
  eventCount:          number;
  criticalEventCount:  number;
  overallState:        "HEALTHY" | "DEGRADED" | "CRITICAL";
}

export type TemporalSnapshotsResult =
  | { status: "READY";               snapshots: TemporalFinancialSnapshot[] }
  | { status: "INSUFFICIENT_HISTORY"; snapshots: TemporalFinancialSnapshot[] }
  | { status: "NO_DATA" };

// ── Window boundary ────────────────────────────────────────────────────────────

export function windowSince(window: TemporalWindow): Date {
  return new Date(Date.now() - WINDOW_HOURS[window] * 60 * 60 * 1000);
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function getTemporalFinancialSnapshots(
  orgId:  string,
  window: TemporalWindow,
): Promise<TemporalSnapshotsResult> {
  const since = windowSince(window);

  const [rawSnapshots, rawEvents] = await Promise.all([
    prisma.financialRuntimeSnapshot.findMany({
      where:   { organizationId: orgId, generatedAt: { gte: since } },
      orderBy: { generatedAt: "asc" },
    }).catch(() => []),

    prisma.financialRuntimeEvent.findMany({
      where:   { organizationId: orgId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select:  { severity: true, createdAt: true },
    }).catch(() => []),
  ]);

  if (rawSnapshots.length === 0) return { status: "NO_DATA" };

  // Bucket events into snapshot intervals.
  // For each snapshot, count events between previousSnapshot.generatedAt and snapshot.generatedAt.
  const snapshots: TemporalFinancialSnapshot[] = rawSnapshots.map((snap, i) => {
    const intervalStart = i === 0 ? since : rawSnapshots[i - 1].generatedAt;
    const intervalEnd   = snap.generatedAt;

    const intervalEvents = rawEvents.filter(
      e => e.createdAt >= intervalStart && e.createdAt <= intervalEnd,
    );

    const criticalCount = intervalEvents.filter(e => e.severity === "critical").length;

    // Normalize overallState
    const overallState: TemporalFinancialSnapshot["overallState"] =
      snap.overallState === "CRITICAL" ? "CRITICAL" :
      snap.overallState === "DEGRADED" ? "DEGRADED"  :
      "HEALTHY";

    return {
      organizationId:       orgId,
      generatedAt:          snap.generatedAt,
      graphIntegrityPct:    snap.graphIntegrityPct,
      liquidityConfidence:  snap.liquidityConfidence,
      reconciliationHealth: snap.reconciliationHealth,
      unresolvedCount:      snap.unresolvedCount,
      closeBlockers:        snap.closeBlockers,
      staleSources:         snap.staleSources,
      eventCount:           intervalEvents.length,
      criticalEventCount:   criticalCount,
      overallState,
    };
  });

  const status: TemporalSnapshotsResult["status"] =
    snapshots.length >= 3 ? "READY" : "INSUFFICIENT_HISTORY";

  return { status, snapshots };
}
