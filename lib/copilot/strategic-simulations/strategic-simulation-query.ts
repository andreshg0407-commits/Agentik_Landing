// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 25 — Simulation Query Engine

import type { SimulationQuery, SimulationRecord, SimulationConfidence } from "./strategic-simulation-types";

// ── Filter helpers ────────────────────────────────────────────────────────────

export function filterSimulationRecords(
  records: SimulationRecord[],
  query:   SimulationQuery
): SimulationRecord[] {
  return records.filter((r) => {
    if (r.orgSlug !== query.orgSlug) return false;
    if (query.category && r.category !== query.category) return false;
    if (query.domain  && r.domain   !== query.domain)   return false;
    if (query.status  && r.status   !== query.status)   return false;
    if (query.minConfidence && !_meetsMinConfidence(r.confidence, query.minConfidence)) return false;
    return true;
  }).slice(0, query.limit ?? 50);
}

export function sortSimulationRecordsByDate(records: SimulationRecord[]): SimulationRecord[] {
  return [...records].sort((a, b) => b.simulatedAt.localeCompare(a.simulatedAt));
}

export function groupSimulationRecordsByCategory(
  records: SimulationRecord[]
): Record<string, SimulationRecord[]> {
  const groups: Record<string, SimulationRecord[]> = {};
  for (const r of records) {
    groups[r.category] = groups[r.category] ?? [];
    groups[r.category].push(r);
  }
  return groups;
}

export function groupSimulationRecordsByDomain(
  records: SimulationRecord[]
): Record<string, SimulationRecord[]> {
  const groups: Record<string, SimulationRecord[]> = {};
  for (const r of records) {
    groups[r.domain] = groups[r.domain] ?? [];
    groups[r.domain].push(r);
  }
  return groups;
}

// ── Private helpers ───────────────────────────────────────────────────────────

const _confidenceOrder: SimulationConfidence[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];

function _meetsMinConfidence(conf: SimulationConfidence, min: SimulationConfidence): boolean {
  return _confidenceOrder.indexOf(conf) >= _confidenceOrder.indexOf(min);
}
