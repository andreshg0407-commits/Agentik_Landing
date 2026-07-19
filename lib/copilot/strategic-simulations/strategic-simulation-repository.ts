// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 26 — Simulation Repository Interface
// Pure domain interface — no Prisma, no server-only.

import type { SimulationRecord, SimulationQuery } from "./strategic-simulation-types";

// ── Repository interface ──────────────────────────────────────────────────────

export interface StrategicSimulationRepository {
  saveSimulationRecord(record: SimulationRecord): Promise<SimulationRecord>;
  findSimulationRecords(query: SimulationQuery): Promise<SimulationRecord[]>;
  findSimulationRecordById(id: string, orgSlug: string): Promise<SimulationRecord | null>;
  countSimulationRecords(orgSlug: string): Promise<number>;
}

// ── In-memory implementation (for testing / non-persisted use) ────────────────

export class InMemorySimulationRepository implements StrategicSimulationRepository {
  private readonly _store: SimulationRecord[] = [];

  async saveSimulationRecord(record: SimulationRecord): Promise<SimulationRecord> {
    this._store.push(record);
    return record;
  }

  async findSimulationRecords(query: SimulationQuery): Promise<SimulationRecord[]> {
    const { filterSimulationRecords } = await import("./strategic-simulation-query");
    return filterSimulationRecords(this._store, query);
  }

  async findSimulationRecordById(id: string, orgSlug: string): Promise<SimulationRecord | null> {
    return this._store.find((r) => r.id === id && r.orgSlug === orgSlug) ?? null;
  }

  async countSimulationRecords(orgSlug: string): Promise<number> {
    return this._store.filter((r) => r.orgSlug === orgSlug).length;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function buildSimulationRecord(params: {
  id:              string;
  orgSlug:         string;
  category:        SimulationRecord["category"];
  domain:          SimulationRecord["domain"];
  title:           string;
  summary:         string;
  confidence:      SimulationRecord["confidence"];
  confidenceScore: number;
  status:          SimulationRecord["status"];
  metadata?:       Record<string, unknown>;
}): SimulationRecord {
  return {
    id:              params.id,
    orgSlug:         params.orgSlug,
    category:        params.category,
    domain:          params.domain,
    title:           params.title,
    summary:         params.summary,
    confidence:      params.confidence,
    confidenceScore: params.confidenceScore,
    status:          params.status,
    metadata:        params.metadata ?? {},
    simulatedAt:     new Date().toISOString(),
  };
}
