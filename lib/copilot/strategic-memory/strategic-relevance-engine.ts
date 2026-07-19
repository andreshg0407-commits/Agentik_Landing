// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Relevance Engine — avoid strategic memory becoming historical garbage

import type {
  StrategicMemoryEntry,
  StrategicMemoryPriority,
  StrategicMemoryStatus,
} from "./strategic-memory-types";

const AGING_HALF_LIFE_DAYS: Record<StrategicMemoryPriority, number> = {
  CRITICAL: 180,  // 6 months
  HIGH: 90,       // 3 months
  MEDIUM: 60,     // 2 months
  LOW: 30,        // 1 month
};

const STATUS_RELEVANCE_MULTIPLIER: Record<StrategicMemoryStatus, number> = {
  ACTIVE: 1.0,
  COMPLETED: 0.5,
  SUPERSEDED: 0.2,
  ARCHIVED: 0.1,
  INVALIDATED: 0.0,
};

export function computeAgingScore(
  entry: StrategicMemoryEntry,
  nowMs?: number
): number {
  const now = nowMs ?? Date.now();
  const ageMs = now - new Date(entry.updatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halfLife = AGING_HALF_LIFE_DAYS[entry.priority];
  // Exponential decay: score = e^(-0.693 * ageDays / halfLife)
  const agingScore = Math.exp(-0.693 * ageDays / halfLife);
  return Math.max(0, Math.min(1, agingScore));
}

export function computeCurrentRelevance(
  entry: StrategicMemoryEntry,
  nowMs?: number
): number {
  const agingScore = computeAgingScore(entry, nowMs);
  const statusMultiplier = STATUS_RELEVANCE_MULTIPLIER[entry.status];
  const baseRelevance = entry.strategicScore * entry.confidenceScore;
  return Math.max(0, Math.min(1, baseRelevance * agingScore * statusMultiplier + statusMultiplier * 0.05));
}

export function computeBusinessImpact(entry: StrategicMemoryEntry): number {
  const PRIORITY_IMPACT: Record<StrategicMemoryPriority, number> = {
    CRITICAL: 1.0,
    HIGH: 0.75,
    MEDIUM: 0.5,
    LOW: 0.25,
  };

  const evidenceBonus = Math.min(0.15, entry.evidenceIds.length * 0.03);
  return Math.min(1, PRIORITY_IMPACT[entry.priority] * entry.strategicScore + evidenceBonus);
}

export function rankByImportance(
  entries: StrategicMemoryEntry[],
  nowMs?: number
): StrategicMemoryEntry[] {
  const scored = entries.map((e) => ({
    entry: e,
    score: computeCurrentRelevance(e, nowMs) * computeBusinessImpact(e),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.entry);
}

export function isStillRelevant(
  entry: StrategicMemoryEntry,
  minRelevanceScore = 0.15,
  nowMs?: number
): boolean {
  if (entry.status === "INVALIDATED") return false;
  if (entry.status === "ARCHIVED") return false;
  if (entry.validUntil && new Date(entry.validUntil).getTime() < (nowMs ?? Date.now())) {
    return false;
  }
  return computeCurrentRelevance(entry, nowMs) >= minRelevanceScore;
}

export function filterRelevantItems(
  entries: StrategicMemoryEntry[],
  minRelevance = 0.15,
  nowMs?: number
): StrategicMemoryEntry[] {
  return entries.filter((e) => isStillRelevant(e, minRelevance, nowMs));
}

export function identifyStaleItems(
  entries: StrategicMemoryEntry[],
  staleDays = 180,
  nowMs?: number
): StrategicMemoryEntry[] {
  const now = nowMs ?? Date.now();
  return entries.filter((e) => {
    if (e.status !== "ACTIVE") return false;
    const ageMs = now - new Date(e.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > staleDays;
  });
}
