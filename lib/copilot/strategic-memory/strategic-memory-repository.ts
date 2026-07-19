// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory Repository — interface + in-memory implementation

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicMemorySnapshot,
  StrategicMemoryQuery,
  StrategicMemoryResult,
} from "./strategic-memory-types";
import { findStrategicMemory } from "./strategic-memory-query";

// ── Repository Interface ──────────────────────────────────────────────────────

export interface StrategicMemoryRepository {
  // Memory entries
  saveMemory(entry: StrategicMemoryEntry): Promise<void>;
  updateMemory(entry: StrategicMemoryEntry): Promise<void>;
  getMemoryById(id: string): Promise<StrategicMemoryEntry | null>;
  queryMemory(query: StrategicMemoryQuery): Promise<StrategicMemoryEntry[]>;

  // Relations
  saveRelation(relation: StrategicMemoryRelation): Promise<void>;
  deleteRelation(id: string, orgSlug: string): Promise<void>;
  queryRelations(orgSlug: string, entryId?: string): Promise<StrategicMemoryRelation[]>;

  // Snapshots
  saveSnapshot(snapshot: StrategicMemorySnapshot): Promise<void>;
  getLatestSnapshot(orgSlug: string): Promise<StrategicMemorySnapshot | null>;
  querySnapshots(orgSlug: string): Promise<StrategicMemorySnapshot[]>;

  // Results
  saveResult(result: StrategicMemoryResult): Promise<void>;
  getLatestResult(orgSlug: string): Promise<StrategicMemoryResult | null>;
}

// ── In-Memory Implementation ──────────────────────────────────────────────────

export class InMemoryStrategicMemoryRepository implements StrategicMemoryRepository {
  private entries: Map<string, StrategicMemoryEntry> = new Map();
  private relations: Map<string, StrategicMemoryRelation> = new Map();
  private snapshots: Map<string, StrategicMemorySnapshot[]> = new Map();
  private results: Map<string, StrategicMemoryResult[]> = new Map();

  async saveMemory(entry: StrategicMemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async updateMemory(entry: StrategicMemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async getMemoryById(id: string): Promise<StrategicMemoryEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async queryMemory(query: StrategicMemoryQuery): Promise<StrategicMemoryEntry[]> {
    const all = Array.from(this.entries.values());
    return findStrategicMemory(all, query);
  }

  async saveRelation(relation: StrategicMemoryRelation): Promise<void> {
    this.relations.set(relation.id, relation);
  }

  async deleteRelation(id: string, orgSlug: string): Promise<void> {
    const rel = this.relations.get(id);
    if (rel && rel.orgSlug === orgSlug) {
      this.relations.delete(id);
    }
  }

  async queryRelations(orgSlug: string, entryId?: string): Promise<StrategicMemoryRelation[]> {
    return Array.from(this.relations.values()).filter(
      (r) =>
        r.orgSlug === orgSlug &&
        (!entryId || r.sourceId === entryId || r.targetId === entryId)
    );
  }

  async saveSnapshot(snapshot: StrategicMemorySnapshot): Promise<void> {
    const list = this.snapshots.get(snapshot.orgSlug) ?? [];
    list.push(snapshot);
    this.snapshots.set(snapshot.orgSlug, list);
  }

  async getLatestSnapshot(orgSlug: string): Promise<StrategicMemorySnapshot | null> {
    const list = this.snapshots.get(orgSlug) ?? [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  async querySnapshots(orgSlug: string): Promise<StrategicMemorySnapshot[]> {
    return this.snapshots.get(orgSlug) ?? [];
  }

  async saveResult(result: StrategicMemoryResult): Promise<void> {
    const list = this.results.get(result.orgSlug) ?? [];
    list.push(result);
    this.results.set(result.orgSlug, list);
  }

  async getLatestResult(orgSlug: string): Promise<StrategicMemoryResult | null> {
    const list = this.results.get(orgSlug) ?? [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  // Test utility
  clear(): void {
    this.entries.clear();
    this.relations.clear();
    this.snapshots.clear();
    this.results.clear();
  }

  count(orgSlug: string): number {
    return Array.from(this.entries.values()).filter((e) => e.orgSlug === orgSlug).length;
  }
}
