/**
 * lib/copilot/memory/in-memory-memory-repository.ts
 *
 * Agentik — Copilot Memory Engine — In-Memory Repository Implementation
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * In-process implementation of MemoryRepository.
 * Allows full CRUD and search without a DB.
 * Used in development, tests, and validation scripts.
 *
 * NOTE: Data does not survive process restarts.
 * Persistence will be added in AGENTIK-COPILOT-MEMORY-PERSIST-01.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { MemoryRepository }  from "./memory-repository";
import type {
  MemoryEntry,
  MemoryImportance,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
} from "./memory-types";
import { importanceAtLeast } from "./memory-types";

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function generateMemoryId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `mem-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Sorting ───────────────────────────────────────────────────────────────────

const IMPORTANCE_RANK: Record<MemoryImportance, number> = {
  CRITICAL: 3,
  HIGH:     2,
  MEDIUM:   1,
  LOW:      0,
};

function sortByImportanceThenDate(a: MemoryEntry, b: MemoryEntry): number {
  const importanceDiff = IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
  if (importanceDiff !== 0) return importanceDiff;
  return b.createdAt.localeCompare(a.createdAt);
}

// ── Search filter ─────────────────────────────────────────────────────────────

function matchesOptions(entry: MemoryEntry, options: MemorySearchOptions): boolean {
  if (options.type && entry.type !== options.type) return false;
  if (options.scope && entry.scope !== options.scope) return false;
  if (options.importance && !importanceAtLeast(entry.importance, options.importance)) return false;
  if (options.moduleId && entry.moduleId !== options.moduleId) return false;
  if (options.agentId && entry.agentId !== options.agentId) return false;

  if (options.tags && options.tags.length > 0) {
    const entryTagSet = new Set(entry.tags.map(t => t.toLowerCase()));
    if (!options.tags.every(t => entryTagSet.has(t.toLowerCase()))) return false;
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    if (!entry.title.toLowerCase().includes(q) && !entry.content.toLowerCase().includes(q)) return false;
  }

  return true;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class InMemoryMemoryRepository implements MemoryRepository {
  /** Key: id → MemoryEntry */
  private readonly _store = new Map<string, MemoryEntry>();

  async saveMemory(input: CreateMemoryInput): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id:         generateMemoryId(),
      orgSlug:    input.orgSlug,
      type:       input.type,
      scope:      input.scope,
      importance: input.importance,
      title:      input.title.slice(0, 80),
      content:    input.content.slice(0, 2000),
      tags:       (input.tags ?? []).map(t => t.toLowerCase().trim()).filter(Boolean),
      source:     input.source,
      moduleId:   input.moduleId,
      agentId:    input.agentId,
      createdAt:  now,
      updatedAt:  now,
    };
    this._store.set(entry.id, entry);
    return { ...entry };
  }

  async updateMemory(id: string, updates: UpdateMemoryInput): Promise<MemoryEntry | null> {
    const existing = this._store.get(id);
    if (!existing) return null;

    const updated: MemoryEntry = {
      ...existing,
      ...(updates.type       !== undefined ? { type:       updates.type }       : {}),
      ...(updates.scope      !== undefined ? { scope:      updates.scope }      : {}),
      ...(updates.importance !== undefined ? { importance: updates.importance } : {}),
      ...(updates.title      !== undefined ? { title:      updates.title.slice(0, 80) }   : {}),
      ...(updates.content    !== undefined ? { content:    updates.content.slice(0, 2000) } : {}),
      ...(updates.tags       !== undefined ? { tags:       updates.tags.map(t => t.toLowerCase().trim()).filter(Boolean) } : {}),
      ...(updates.moduleId   !== undefined ? { moduleId:   updates.moduleId }   : {}),
      ...(updates.agentId    !== undefined ? { agentId:    updates.agentId }    : {}),
      updatedAt: new Date().toISOString(),
    };
    this._store.set(id, updated);
    return { ...updated };
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this._store.delete(id);
  }

  async getMemory(id: string): Promise<MemoryEntry | null> {
    const entry = this._store.get(id);
    return entry ? { ...entry } : null;
  }

  async searchMemory(orgSlug: string, options: MemorySearchOptions): Promise<MemoryEntry[]> {
    const limit = options.limit ?? 20;
    const results: MemoryEntry[] = [];

    for (const entry of this._store.values()) {
      if (entry.orgSlug !== orgSlug) continue;
      if (!matchesOptions(entry, options)) continue;
      results.push({ ...entry });
    }

    results.sort(sortByImportanceThenDate);
    return results.slice(0, limit);
  }

  async listMemories(
    orgSlug: string,
    options?: Pick<MemorySearchOptions, "limit">,
  ): Promise<MemoryEntry[]> {
    const limit = options?.limit ?? 20;
    const results: MemoryEntry[] = [];

    for (const entry of this._store.values()) {
      if (entry.orgSlug === orgSlug) results.push({ ...entry });
    }

    results.sort(sortByImportanceThenDate);
    return results.slice(0, limit);
  }

  async countMemories(orgSlug: string): Promise<number> {
    let count = 0;
    for (const entry of this._store.values()) {
      if (entry.orgSlug === orgSlug) count++;
    }
    return count;
  }

  async clearMemories(orgSlug: string): Promise<void> {
    for (const [id, entry] of this._store.entries()) {
      if (entry.orgSlug === orgSlug) this._store.delete(id);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Default in-memory repository instance.
 * Shared across strategic-memory-manager, memory-retrieval, and memory-summary.
 * Survives for the lifetime of the process — resets on restart.
 */
export const defaultMemoryRepository: MemoryRepository = new InMemoryMemoryRepository();
