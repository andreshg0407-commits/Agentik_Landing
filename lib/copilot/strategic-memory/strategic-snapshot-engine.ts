// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Snapshot Engine — executive state summaries

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicMemorySnapshot,
} from "./strategic-memory-types";
import { generateStrategicSnapshotId } from "./strategic-memory-identity";
import { rankByImportance, filterRelevantItems } from "./strategic-relevance-engine";

function buildNarrative(
  goals: StrategicMemoryEntry[],
  risks: StrategicMemoryEntry[],
  decisions: StrategicMemoryEntry[],
  criticalItems: number
): string {
  const parts: string[] = [];

  if (goals.length > 0) {
    parts.push(`${goals.length} active strategic goal(s)`);
  }
  if (risks.length > 0) {
    const critical = risks.filter((r) => r.priority === "CRITICAL").length;
    parts.push(critical > 0 ? `${critical} critical risk(s)` : `${risks.length} active risk(s)`);
  }
  if (decisions.length > 0) {
    parts.push(`${decisions.length} recent decision(s)`);
  }
  if (criticalItems > 0) {
    parts.push(`${criticalItems} items require immediate attention`);
  }

  return parts.length > 0
    ? `Strategic state: ${parts.join(", ")}.`
    : "No active strategic items.";
}

function computeSnapshotStrategicScore(entries: StrategicMemoryEntry[]): number {
  if (entries.length === 0) return 0;
  const active = entries.filter((e) => e.status === "ACTIVE");
  if (active.length === 0) return 0;
  return active.reduce((sum, e) => sum + e.strategicScore, 0) / active.length;
}

export function buildSnapshot(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  relations: StrategicMemoryRelation[],
  period: StrategicMemorySnapshot["period"] = "CURRENT",
  metadata?: Record<string, unknown>
): StrategicMemorySnapshot {
  const orgEntries = entries.filter((e) => e.orgSlug === orgSlug);
  const orgRelations = relations.filter((r) => r.orgSlug === orgSlug);

  const relevant = filterRelevantItems(orgEntries);
  const ranked = rankByImportance(relevant);

  const goals = ranked.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const risks = ranked.filter((e) => e.type === "RISK");
  const opportunities = ranked.filter((e) => e.type === "OPPORTUNITY");
  const decisions = ranked.filter((e) => e.type === "DECISION");
  const commitments = ranked.filter((e) => e.type === "COMMITMENT");
  const lessons = ranked.filter((e) => e.type === "LESSON");
  const policies = ranked.filter((e) => e.type === "POLICY");

  const activeItems = relevant.filter((e) => e.status === "ACTIVE").length;
  const criticalItems = relevant.filter(
    (e) => e.priority === "CRITICAL" && e.status === "ACTIVE"
  ).length;

  const narrative = buildNarrative(goals, risks, decisions, criticalItems);
  const strategicScore = computeSnapshotStrategicScore(relevant);

  return {
    id: generateStrategicSnapshotId(),
    orgSlug,
    period,
    goals: goals.slice(0, 10),
    risks: risks.slice(0, 10),
    opportunities: opportunities.slice(0, 10),
    decisions: decisions.slice(0, 5),
    commitments: commitments.slice(0, 10),
    lessons: lessons.slice(0, 5),
    policies: policies.slice(0, 5),
    relations: orgRelations.slice(0, 20),
    totalItems: orgEntries.length,
    activeItems,
    criticalItems,
    strategicScore,
    narrative,
    metadata: metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

export function buildExecutiveSnapshot(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  relations: StrategicMemoryRelation[]
): StrategicMemorySnapshot {
  return buildSnapshot(orgSlug, entries, relations, "CURRENT", {
    snapshotType: "EXECUTIVE",
  });
}

export function buildQuarterSnapshot(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  relations: StrategicMemoryRelation[],
  quarterStart: string,
  quarterEnd: string
): StrategicMemorySnapshot {
  const quarterEntries = entries.filter((e) => {
    const ts = new Date(e.createdAt).getTime();
    return ts >= new Date(quarterStart).getTime() && ts <= new Date(quarterEnd).getTime();
  });
  return buildSnapshot(orgSlug, quarterEntries, relations, "QUARTER", {
    snapshotType: "QUARTER",
    quarterStart,
    quarterEnd,
  });
}

export function buildYearSnapshot(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  relations: StrategicMemoryRelation[],
  year: number
): StrategicMemorySnapshot {
  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd = `${year}-12-31T23:59:59.999Z`;
  const yearEntries = entries.filter((e) => {
    const ts = new Date(e.createdAt).getTime();
    return ts >= new Date(yearStart).getTime() && ts <= new Date(yearEnd).getTime();
  });
  return buildSnapshot(orgSlug, yearEntries, relations, "YEAR", {
    snapshotType: "YEAR",
    year,
  });
}
