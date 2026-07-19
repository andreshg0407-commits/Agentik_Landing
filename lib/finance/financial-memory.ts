/**
 * lib/finance/financial-memory.ts
 *
 * FASE 4 — Financial Memory Layer
 *
 * Builds a financial memory object combining temporal snapshots,
 * runtime events, trend analysis, and pattern detection.
 *
 * Sprint: AGENTIK-FINANCIAL-TEMPORAL-INTELLIGENCE-01
 */

import { prisma }                        from "@/lib/prisma";
import { getTemporalFinancialSnapshots } from "./temporal-snapshots";
import { analyzeFinancialTrends }        from "./trend-engine";
import { detectFinancialPatterns }       from "./pattern-engine";
import type { TemporalWindow }           from "./temporal-snapshots";
import type { FinancialTrend }           from "./trend-engine";
import type { FinancialTemporalPattern, PatternEvent } from "./pattern-engine";
import { windowSince }                   from "./temporal-snapshots";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MemoryState = "READY" | "INSUFFICIENT_HISTORY" | "NO_DATA";

export interface FinancialMemory {
  organizationId:  string;
  window:          TemporalWindow;
  snapshotCount:   number;
  eventCount:      number;
  trends:          FinancialTrend[];
  patterns:        FinancialTemporalPattern[];
  recurringIssues: FinancialTemporalPattern[];
  recoveredIssues: FinancialTemporalPattern[];
  memoryState:     MemoryState;
  generatedAt:     Date;
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function buildFinancialMemory(
  orgId:  string,
  window: TemporalWindow,
): Promise<FinancialMemory> {
  const generatedAt = new Date();
  const since       = windowSince(window);

  // Load snapshots and events in parallel
  const [snapshotResult, rawEvents] = await Promise.all([
    getTemporalFinancialSnapshots(orgId, window),
    prisma.financialRuntimeEvent.findMany({
      where:   { organizationId: orgId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select:  {
        id:        true,
        type:      true,
        severity:  true,
        source:    true,
        createdAt: true,
      },
    }).catch(() => [] as PatternEvent[]),
  ]);

  // NO_DATA: no snapshots at all
  if (snapshotResult.status === "NO_DATA") {
    return {
      organizationId: orgId,
      window,
      snapshotCount:  0,
      eventCount:     rawEvents.length,
      trends:         [],
      patterns:       [],
      recurringIssues: [],
      recoveredIssues: [],
      memoryState:    "NO_DATA",
      generatedAt,
    };
  }

  const { snapshots } = snapshotResult;
  const memoryState: MemoryState = snapshotResult.status === "READY"
    ? "READY"
    : "INSUFFICIENT_HISTORY";

  // Map raw events to PatternEvent shape
  const patternEvents: PatternEvent[] = rawEvents.map(e => ({
    id:        e.id,
    type:      e.type,
    severity:  e.severity,
    source:    e.source ?? undefined,
    createdAt: e.createdAt,
  }));

  // Trends: only if READY (3+ snapshots)
  const trends = memoryState === "READY"
    ? analyzeFinancialTrends(snapshots, window)
    : [];

  // Patterns: from events (can run with any count — requires 2+ occurrences internally)
  const patterns = detectFinancialPatterns(patternEvents, window);

  // Recurring issues = patterns with severity critical or warning, frequency 2+
  const recurringIssues = patterns.filter(
    p => p.type !== "recovery_after_degradation" && p.frequency >= 2
  );

  // Recovered issues = recovery_after_degradation patterns
  const recoveredIssues = patterns.filter(
    p => p.type === "recovery_after_degradation"
  );

  return {
    organizationId:  orgId,
    window,
    snapshotCount:   snapshots.length,
    eventCount:      rawEvents.length,
    trends,
    patterns,
    recurringIssues,
    recoveredIssues,
    memoryState,
    generatedAt,
  };
}
