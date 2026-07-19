// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Search Engine — query strategic memory

import type {
  StrategicMemoryEntry,
  StrategicMemoryQuery,
  StrategicMemoryDomain,
  StrategicMemoryPriority,
  StrategicMemoryStatus,
} from "./strategic-memory-types";
import { rankByImportance } from "./strategic-relevance-engine";

function matchesQuery(entry: StrategicMemoryEntry, query: StrategicMemoryQuery): boolean {
  if (entry.orgSlug !== query.orgSlug) return false;
  if (query.types && !query.types.includes(entry.type)) return false;
  if (query.priorities && !query.priorities.includes(entry.priority)) return false;
  if (query.statuses && !query.statuses.includes(entry.status)) return false;
  if (query.domains && !query.domains.includes(entry.domain)) return false;
  if (query.minConfidenceScore !== undefined && entry.confidenceScore < query.minConfidenceScore) return false;
  if (query.minStrategicScore !== undefined && entry.strategicScore < query.minStrategicScore) return false;
  if (query.agentId && entry.agentId !== query.agentId) return false;
  if (query.since && new Date(entry.createdAt).getTime() < new Date(query.since).getTime()) return false;
  return true;
}

export function findStrategicMemory(
  entries: StrategicMemoryEntry[],
  query: StrategicMemoryQuery
): StrategicMemoryEntry[] {
  const matched = entries.filter((e) => matchesQuery(e, query));
  const ranked = rankByImportance(matched);
  return query.limit ? ranked.slice(0, query.limit) : ranked;
}

export function findGoals(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  status: StrategicMemoryStatus = "ACTIVE"
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    types: ["GOAL", "OBJECTIVE"],
    statuses: [status],
  });
}

export function findRisks(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  priority?: StrategicMemoryPriority
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    types: ["RISK"],
    statuses: ["ACTIVE"],
    priorities: priority ? [priority] : undefined,
  });
}

export function findDecisions(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  limit = 20
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    types: ["DECISION"],
    limit,
  });
}

export function findLessons(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  limit = 20
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    types: ["LESSON"],
    limit,
  });
}

export function findPolicies(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    types: ["POLICY"],
    statuses: ["ACTIVE"],
  });
}

export function findCommitments(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  status: StrategicMemoryStatus = "ACTIVE"
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    types: ["COMMITMENT"],
    statuses: [status],
  });
}

export function findByPriority(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  priority: StrategicMemoryPriority
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    priorities: [priority],
    statuses: ["ACTIVE"],
  });
}

export function findByStatus(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  status: StrategicMemoryStatus
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, { orgSlug, statuses: [status] });
}

export function findByDomain(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  domain: StrategicMemoryDomain
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    domains: [domain],
    statuses: ["ACTIVE"],
  });
}

export function findActiveStrategicItems(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  limit = 50
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    statuses: ["ACTIVE"],
    limit,
  });
}

export function findCriticalItems(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug,
    priorities: ["CRITICAL"],
    statuses: ["ACTIVE"],
  });
}

export function textSearch(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  query: string
): StrategicMemoryEntry[] {
  const lowerQ = query.toLowerCase();
  return entries.filter(
    (e) =>
      e.orgSlug === orgSlug &&
      (e.title.toLowerCase().includes(lowerQ) ||
        e.description.toLowerCase().includes(lowerQ) ||
        e.rationale.toLowerCase().includes(lowerQ))
  );
}
