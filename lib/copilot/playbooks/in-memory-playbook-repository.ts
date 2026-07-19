/**
 * lib/copilot/playbooks/in-memory-playbook-repository.ts
 *
 * Agentik — Copilot Playbooks — In-Memory Repository Implementation
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * In-process implementation of PlaybookRepository.
 * Full CRUD + filters + tags + categories + logical archive.
 * Used in development, tests, and validation scripts.
 *
 * NOTE: Data does not survive process restarts.
 * Persistence will be added in AGENTIK-COPILOT-PLAYBOOKS-PERSIST-01.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { PlaybookRepository }    from "./playbook-repository";
import type {
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  PlaybookSearchOptions,
  PlaybookCategory,
} from "./playbook-types";
import { sortByPriorityThenDate, priorityAtLeast } from "./playbook-types";

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function generatePlaybookId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `pb-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return Array.from(new Set(tags.map(t => t.toLowerCase().trim()).filter(Boolean)));
}

function matchesSearch(playbook: Playbook, options: PlaybookSearchOptions): boolean {
  const status = options.status ?? "ACTIVE";
  if (playbook.status !== status) return false;
  if (options.category && playbook.category !== options.category) return false;
  if (options.priority && !priorityAtLeast(playbook.priority, options.priority)) return false;

  if (options.tags && options.tags.length > 0) {
    const pbTagSet = new Set(playbook.tags);
    if (!options.tags.every(t => pbTagSet.has(t.toLowerCase().trim()))) return false;
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    const searchable = `${playbook.title} ${playbook.description}`.toLowerCase();
    if (!searchable.includes(q)) return false;
  }

  return true;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class InMemoryPlaybookRepository implements PlaybookRepository {
  private readonly _store = new Map<string, Playbook>();

  async createPlaybook(input: CreatePlaybookInput): Promise<Playbook> {
    const now = new Date().toISOString();
    const playbook: Playbook = {
      id:          generatePlaybookId(),
      orgSlug:     input.orgSlug,
      title:       input.title.slice(0, 120),
      description: input.description.slice(0, 300),
      category:    input.category,
      priority:    input.priority,
      status:      "ACTIVE",
      tags:        normalizeTags(input.tags),
      steps:       input.steps ?? [],
      author:      input.author,
      createdAt:   now,
      updatedAt:   now,
    };
    this._store.set(playbook.id, playbook);
    return { ...playbook, steps: [...playbook.steps], tags: [...playbook.tags] };
  }

  async updatePlaybook(id: string, updates: UpdatePlaybookInput): Promise<Playbook | null> {
    const existing = this._store.get(id);
    if (!existing || existing.status === "ARCHIVED") return null;

    const updated: Playbook = {
      ...existing,
      ...(updates.title       !== undefined ? { title:       updates.title.slice(0, 120) }       : {}),
      ...(updates.description !== undefined ? { description: updates.description.slice(0, 300) } : {}),
      ...(updates.category    !== undefined ? { category:    updates.category }    : {}),
      ...(updates.priority    !== undefined ? { priority:    updates.priority }    : {}),
      ...(updates.status      !== undefined ? { status:      updates.status }      : {}),
      ...(updates.tags        !== undefined ? { tags:        normalizeTags(updates.tags) } : {}),
      ...(updates.steps       !== undefined ? { steps:       updates.steps }       : {}),
      ...(updates.author      !== undefined ? { author:      updates.author }      : {}),
      updatedAt: new Date().toISOString(),
    };
    this._store.set(id, updated);
    return { ...updated, steps: [...updated.steps], tags: [...updated.tags] };
  }

  async archivePlaybook(id: string): Promise<boolean> {
    const existing = this._store.get(id);
    if (!existing || existing.status === "ARCHIVED") return false;

    this._store.set(id, {
      ...existing,
      status:    "ARCHIVED",
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async getPlaybook(id: string): Promise<Playbook | null> {
    const p = this._store.get(id);
    if (!p || p.status === "ARCHIVED") return null;
    return { ...p, steps: [...p.steps], tags: [...p.tags] };
  }

  async listPlaybooks(
    orgSlug: string,
    options?: Pick<PlaybookSearchOptions, "limit">,
  ): Promise<Playbook[]> {
    const limit = options?.limit ?? 20;
    const results: Playbook[] = [];

    for (const p of this._store.values()) {
      if (p.orgSlug === orgSlug && p.status === "ACTIVE") {
        results.push({ ...p, steps: [...p.steps], tags: [...p.tags] });
      }
    }

    results.sort(sortByPriorityThenDate);
    return results.slice(0, limit);
  }

  async searchPlaybooks(orgSlug: string, options: PlaybookSearchOptions): Promise<Playbook[]> {
    const limit = options.limit ?? 10;
    const results: Playbook[] = [];

    for (const p of this._store.values()) {
      if (p.orgSlug !== orgSlug) continue;
      if (!matchesSearch(p, options)) continue;
      results.push({ ...p, steps: [...p.steps], tags: [...p.tags] });
    }

    results.sort(sortByPriorityThenDate);
    return results.slice(0, limit);
  }

  async findByCategory(
    orgSlug:  string,
    category: PlaybookCategory,
    limit:    number = 10,
  ): Promise<Playbook[]> {
    return this.searchPlaybooks(orgSlug, { category, status: "ACTIVE", limit });
  }

  async findByTags(
    orgSlug: string,
    tags:    string[],
    limit:   number = 10,
  ): Promise<Playbook[]> {
    return this.searchPlaybooks(orgSlug, { tags, status: "ACTIVE", limit });
  }

  async countPlaybooks(orgSlug: string): Promise<number> {
    let count = 0;
    for (const p of this._store.values()) {
      if (p.orgSlug === orgSlug && p.status === "ACTIVE") count++;
    }
    return count;
  }

  async clearPlaybooks(orgSlug: string): Promise<void> {
    for (const [id, p] of this._store.entries()) {
      if (p.orgSlug === orgSlug) this._store.delete(id);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Default in-memory playbook repository instance.
 * Shared across the manager and retrieval layer.
 * Survives for the lifetime of the process — resets on restart.
 */
export const defaultPlaybookRepository: PlaybookRepository = new InMemoryPlaybookRepository();
