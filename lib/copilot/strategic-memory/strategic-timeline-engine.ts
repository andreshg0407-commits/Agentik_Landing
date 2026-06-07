// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Timeline Engine — see strategic evolution

import type {
  StrategicMemoryEntry,
  StrategicMemoryType,
  StrategicMemoryDomain,
} from "./strategic-memory-types";

export interface StrategicTimelineEntry {
  readonly entry: StrategicMemoryEntry;
  readonly timestamp: string; // ISO8601
  readonly eventLabel: string;
}

export interface StrategicPeriodComparison {
  readonly periodA: { start: string; end: string; items: StrategicMemoryEntry[] };
  readonly periodB: { start: string; end: string; items: StrategicMemoryEntry[] };
  readonly newInB: StrategicMemoryEntry[];
  readonly completedInB: StrategicMemoryEntry[];
  readonly escalatedInB: StrategicMemoryEntry[];
  readonly droppedInB: StrategicMemoryEntry[];
}

export function buildTimeline(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicTimelineEntry[] {
  const filtered = entries.filter((e) => e.orgSlug === orgSlug);
  const timeline: StrategicTimelineEntry[] = [];

  for (const entry of filtered) {
    timeline.push({
      entry,
      timestamp: entry.createdAt,
      eventLabel: `Created: ${entry.type} — "${entry.title}"`,
    });
    if (entry.updatedAt !== entry.createdAt) {
      timeline.push({
        entry,
        timestamp: entry.updatedAt,
        eventLabel: `Updated: ${entry.type} — "${entry.title}" [${entry.status}]`,
      });
    }
  }

  return timeline.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function getRecentStrategicEvents(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  limitMs = 7 * 24 * 60 * 60 * 1000 // 7 days
): StrategicMemoryEntry[] {
  const cutoff = Date.now() - limitMs;
  return entries
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        new Date(e.updatedAt).getTime() >= cutoff
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getStrategicEvolution(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  type: StrategicMemoryType
): StrategicMemoryEntry[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.type === type)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function comparePeriods(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  periodAStart: string,
  periodAEnd: string,
  periodBStart: string,
  periodBEnd: string
): StrategicPeriodComparison {
  const inRange = (e: StrategicMemoryEntry, start: string, end: string) => {
    const ts = new Date(e.createdAt).getTime();
    return ts >= new Date(start).getTime() && ts <= new Date(end).getTime();
  };

  const orgEntries = entries.filter((e) => e.orgSlug === orgSlug);
  const itemsA = orgEntries.filter((e) => inRange(e, periodAStart, periodAEnd));
  const itemsB = orgEntries.filter((e) => inRange(e, periodBStart, periodBEnd));

  const idsA = new Set(itemsA.map((e) => e.id));
  const idsB = new Set(itemsB.map((e) => e.id));

  const newInB = itemsB.filter((e) => !idsA.has(e.id));
  const completedInB = orgEntries.filter(
    (e) => idsA.has(e.id) && e.status === "COMPLETED"
  );
  const escalatedInB = orgEntries.filter(
    (e) =>
      idsA.has(e.id) &&
      idsB.has(e.id) &&
      (e.priority === "CRITICAL" || e.priority === "HIGH")
  );
  const droppedInB = itemsA.filter(
    (e) => !idsB.has(e.id) && e.status === "INVALIDATED"
  );

  return {
    periodA: { start: periodAStart, end: periodAEnd, items: itemsA },
    periodB: { start: periodBStart, end: periodBEnd, items: itemsB },
    newInB,
    completedInB,
    escalatedInB,
    droppedInB,
  };
}

export function groupByDomain(
  entries: StrategicMemoryEntry[]
): Map<StrategicMemoryDomain, StrategicMemoryEntry[]> {
  const map = new Map<StrategicMemoryDomain, StrategicMemoryEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.domain) ?? [];
    list.push(entry);
    map.set(entry.domain, list);
  }
  return map;
}
