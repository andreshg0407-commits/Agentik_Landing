// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory Query Layer — pure domain queries

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicMemorySnapshot,
  StrategicMemoryQuery,
  StrategicMemoryType,
  StrategicMemoryPriority,
  StrategicMemoryStatus,
  StrategicMemoryDomain,
  StrategicRelationType,
} from "./strategic-memory-types";

export function findStrategicMemory(
  entries: StrategicMemoryEntry[],
  query: StrategicMemoryQuery
): StrategicMemoryEntry[] {
  let result = entries.filter((e) => e.orgSlug === query.orgSlug);

  if (query.types) result = result.filter((e) => query.types!.includes(e.type));
  if (query.priorities) result = result.filter((e) => query.priorities!.includes(e.priority));
  if (query.statuses) result = result.filter((e) => query.statuses!.includes(e.status));
  if (query.domains) result = result.filter((e) => query.domains!.includes(e.domain));
  if (query.minConfidenceScore !== undefined) {
    result = result.filter((e) => e.confidenceScore >= query.minConfidenceScore!);
  }
  if (query.minStrategicScore !== undefined) {
    result = result.filter((e) => e.strategicScore >= query.minStrategicScore!);
  }
  if (query.agentId) result = result.filter((e) => e.agentId === query.agentId);
  if (query.since) {
    const cutoff = new Date(query.since).getTime();
    result = result.filter((e) => new Date(e.createdAt).getTime() >= cutoff);
  }

  result.sort((a, b) => b.strategicScore - a.strategicScore);
  return query.limit ? result.slice(0, query.limit) : result;
}

export function findByGoal(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug, types: ["GOAL", "OBJECTIVE"], statuses: ["ACTIVE"],
  });
}

export function findByRisk(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug, types: ["RISK"], statuses: ["ACTIVE"],
  });
}

export function findByDecision(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  limit = 20
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, { orgSlug, types: ["DECISION"], limit });
}

export function findByPriority(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  priority: StrategicMemoryPriority
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug, priorities: [priority], statuses: ["ACTIVE"],
  });
}

export function findActiveStrategicItems(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, { orgSlug, statuses: ["ACTIVE"] });
}

export function findStrategicRelations(
  relations: StrategicMemoryRelation[],
  orgSlug: string,
  entryId?: string,
  type?: StrategicRelationType
): StrategicMemoryRelation[] {
  return relations.filter(
    (r) =>
      r.orgSlug === orgSlug &&
      (!entryId || r.sourceId === entryId || r.targetId === entryId) &&
      (!type || r.type === type)
  );
}

export function findStrategicSnapshots(
  snapshots: StrategicMemorySnapshot[],
  orgSlug: string,
  period?: StrategicMemorySnapshot["period"]
): StrategicMemorySnapshot[] {
  return snapshots
    .filter((s) => s.orgSlug === orgSlug && (!period || s.period === period))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function countByType(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): Record<StrategicMemoryType, number> {
  const result: Partial<Record<StrategicMemoryType, number>> = {};
  for (const e of entries.filter((e) => e.orgSlug === orgSlug)) {
    result[e.type] = (result[e.type] ?? 0) + 1;
  }
  return result as Record<StrategicMemoryType, number>;
}

export function countByStatus(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): Record<StrategicMemoryStatus, number> {
  const result: Partial<Record<StrategicMemoryStatus, number>> = {};
  for (const e of entries.filter((e) => e.orgSlug === orgSlug)) {
    result[e.status] = (result[e.status] ?? 0) + 1;
  }
  return result as Record<StrategicMemoryStatus, number>;
}

export function getTopStrategicItems(
  entries: StrategicMemoryEntry[],
  orgSlug: string,
  limit = 10
): StrategicMemoryEntry[] {
  return findStrategicMemory(entries, {
    orgSlug, statuses: ["ACTIVE"], limit,
  });
}
