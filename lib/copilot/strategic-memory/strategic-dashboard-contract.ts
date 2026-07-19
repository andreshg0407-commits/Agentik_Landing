// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Dashboard Contract — pure domain payload, no server-only

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicMemorySnapshot,
  StrategicMemoryResult,
  StrategicMemoryDomain,
} from "./strategic-memory-types";

export interface StrategicDomainSummary {
  readonly domain: StrategicMemoryDomain;
  readonly activeItems: number;
  readonly criticalItems: number;
  readonly averageStrategicScore: number;
  readonly topTitle?: string;
}

export interface StrategicDashboardPayload {
  readonly orgSlug: string;
  readonly goals: number;
  readonly risks: number;
  readonly opportunities: number;
  readonly decisions: number;
  readonly commitments: number;
  readonly lessons: number;
  readonly activeItems: number;
  readonly criticalItems: number;
  readonly strategicScore: number; // 0–1
  readonly domainSummaries: StrategicDomainSummary[];
  readonly topItems: StrategicMemoryEntry[];
  readonly recentItems: StrategicMemoryEntry[];
  readonly latestSnapshot: StrategicMemorySnapshot | null;
  readonly latestResult: StrategicMemoryResult | null;
  readonly totalRelations: number;
  readonly generatedAt: string; // ISO8601
}

export function buildStrategicDashboard(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  relations: StrategicMemoryRelation[],
  snapshots: StrategicMemorySnapshot[],
  latestResult: StrategicMemoryResult | null
): StrategicDashboardPayload {
  const orgEntries = entries.filter((e) => e.orgSlug === orgSlug);
  const orgRelations = relations.filter((r) => r.orgSlug === orgSlug);
  const orgSnapshots = snapshots.filter((s) => s.orgSlug === orgSlug);

  const activeEntries = orgEntries.filter((e) => e.status === "ACTIVE");
  const criticalEntries = activeEntries.filter((e) => e.priority === "CRITICAL");

  const count = (type: string) =>
    activeEntries.filter((e) => e.type === type).length;

  // Domain summaries
  const domainMap = new Map<StrategicMemoryDomain, StrategicMemoryEntry[]>();
  for (const e of activeEntries) {
    const list = domainMap.get(e.domain) ?? [];
    list.push(e);
    domainMap.set(e.domain, list);
  }

  const domainSummaries: StrategicDomainSummary[] = Array.from(domainMap.entries()).map(
    ([domain, items]) => {
      const critical = items.filter((i) => i.priority === "CRITICAL").length;
      const avgScore =
        items.length > 0
          ? items.reduce((s, i) => s + i.strategicScore, 0) / items.length
          : 0;
      const top = [...items].sort((a, b) => b.strategicScore - a.strategicScore)[0];
      return {
        domain,
        activeItems: items.length,
        criticalItems: critical,
        averageStrategicScore: avgScore,
        topTitle: top?.title,
      };
    }
  );

  // Top items by strategic score
  const topItems = [...activeEntries]
    .sort((a, b) => b.strategicScore - a.strategicScore)
    .slice(0, 10);

  // Recent items
  const recentItems = [...activeEntries]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  const strategicScore =
    activeEntries.length > 0
      ? activeEntries.reduce((s, e) => s + e.strategicScore, 0) / activeEntries.length
      : 0;

  const latestSnapshot =
    orgSnapshots.length > 0
      ? orgSnapshots.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0]
      : null;

  return {
    orgSlug,
    goals: count("GOAL") + count("OBJECTIVE"),
    risks: count("RISK"),
    opportunities: count("OPPORTUNITY"),
    decisions: count("DECISION"),
    commitments: count("COMMITMENT"),
    lessons: count("LESSON"),
    activeItems: activeEntries.length,
    criticalItems: criticalEntries.length,
    strategicScore,
    domainSummaries,
    topItems,
    recentItems,
    latestSnapshot,
    latestResult,
    totalRelations: orgRelations.length,
    generatedAt: new Date().toISOString(),
  };
}
