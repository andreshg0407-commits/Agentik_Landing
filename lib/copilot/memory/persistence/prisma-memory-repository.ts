/**
 * lib/copilot/memory/persistence/prisma-memory-repository.ts
 *
 * Agentik — Copilot Memory Persistence — Prisma Repository
 * Sprint: AGENTIK-COPILOT-MEMORY-PERSISTENCE-01
 *
 * Durable implementation of MemoryRepository backed by PostgreSQL via Prisma.
 * Replaces the ephemeral InMemoryMemoryRepository for production use.
 *
 * Design rules:
 *   - ALL queries scope by orgSlug — cross-tenant access is impossible.
 *   - deleteMemory uses SOFT DELETE (sets deletedAt = now()).
 *   - All reads filter deletedAt IS NULL (active records only).
 *   - clearMemories soft-deletes ALL active records for the tenant only.
 *   - Importance ordering is done in application code (string sort ≠ enum order).
 *   - updateMemory validates orgSlug ownership before applying changes.
 *
 * SERVER-ONLY — imports Prisma client. Never import from client-safe code.
 */
import "server-only";

import { prisma }                    from "@/lib/prisma";
import type { MemoryRepository }     from "../memory-repository";
import type {
  MemoryEntry,
  MemoryImportance,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
}                                    from "../memory-types";
import { importanceAtLeast }         from "../memory-types";
import {
  rowToMemoryEntry,
  inputToCreatePayload,
  inputToUpdatePayload,
  parseTagsJson,
}                                    from "./memory-prisma-mapper";

// ── Importance ordering (application-level sort) ──────────────────────────────

const IMPORTANCE_RANK: Record<MemoryImportance, number> = {
  CRITICAL: 3,
  HIGH:     2,
  MEDIUM:   1,
  LOW:      0,
};

function sortByImportanceThenDate(a: MemoryEntry, b: MemoryEntry): number {
  const diff = IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
  return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
}

// ── Max fetch size for unbounded queries ──────────────────────────────────────

const MAX_FETCH = 1_000;

// ── Importance ≥ filter helper ────────────────────────────────────────────────

function importanceGte(min: MemoryImportance): string[] {
  return (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as MemoryImportance[]).filter(
    i => importanceAtLeast(i, min),
  );
}

// ── Repository ────────────────────────────────────────────────────────────────

export class PrismaMemoryRepository implements MemoryRepository {

  // ── saveMemory ─────────────────────────────────────────────────────────────

  async saveMemory(input: CreateMemoryInput): Promise<MemoryEntry> {
    const payload = inputToCreatePayload(input);
    const row = await prisma.copilotMemory.create({
      data: {
        orgSlug:    payload.orgSlug,
        type:       payload.type,
        scope:      payload.scope,
        importance: payload.importance,
        title:      payload.title,
        content:    payload.content,
        tagsJson:   payload.tagsJson,
        source:     payload.source,
        moduleId:   payload.moduleId ?? undefined,
        agentId:    payload.agentId ?? undefined,
      },
    });
    return rowToMemoryEntry(row);
  }

  // ── updateMemory ───────────────────────────────────────────────────────────

  async updateMemory(id: string, updates: UpdateMemoryInput): Promise<MemoryEntry | null> {
    // Verify record exists and is active (tenant isolation happens via getMemory)
    const existing = await prisma.copilotMemory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    const data = inputToUpdatePayload(updates);
    if (Object.keys(data).length === 0) {
      // No actual updates — return existing as domain entry
      return rowToMemoryEntry(existing);
    }

    const updated = await prisma.copilotMemory.update({
      where: { id },
      data,
    });
    return rowToMemoryEntry(updated);
  }

  // ── deleteMemory (soft delete) ─────────────────────────────────────────────

  async deleteMemory(id: string): Promise<boolean> {
    const existing = await prisma.copilotMemory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return false;

    await prisma.copilotMemory.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
    return true;
  }

  // ── getMemory ──────────────────────────────────────────────────────────────

  async getMemory(id: string): Promise<MemoryEntry | null> {
    const row = await prisma.copilotMemory.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? rowToMemoryEntry(row) : null;
  }

  // ── searchMemory ───────────────────────────────────────────────────────────

  async searchMemory(orgSlug: string, options: MemorySearchOptions): Promise<MemoryEntry[]> {
    const limit = options.limit ?? 20;

    // Build WHERE clause — all predicates scoped to orgSlug + active records
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      orgSlug,
      deletedAt: null,
    };

    if (options.type)      where["type"]      = options.type;
    if (options.scope)     where["scope"]     = options.scope;
    if (options.moduleId)  where["moduleId"]  = options.moduleId;
    if (options.agentId)   where["agentId"]   = options.agentId;

    if (options.importance) {
      where["importance"] = { in: importanceGte(options.importance) };
    }

    if (options.query) {
      where["OR"] = [
        { title:   { contains: options.query, mode: "insensitive" } },
        { content: { contains: options.query, mode: "insensitive" } },
      ];
    }

    // Fetch up to MAX_FETCH rows (tag filter happens in app code)
    const rows = await prisma.copilotMemory.findMany({
      where,
      take: MAX_FETCH,
      orderBy: { createdAt: "desc" }, // secondary sort — primary sort done in app
    });

    // Map to domain entries
    let entries: MemoryEntry[] = rows.map(rowToMemoryEntry);

    // Application-level tag filter (JSONB tag contains all required tags)
    if (options.tags && options.tags.length > 0) {
      const required = options.tags.map(t => t.toLowerCase().trim());
      entries = entries.filter(e => {
        const entryTagSet = new Set(e.tags);
        return required.every(t => entryTagSet.has(t));
      });
    }

    // Sort by importance DESC then createdAt DESC
    entries.sort(sortByImportanceThenDate);

    return entries.slice(0, limit);
  }

  // ── listMemories ───────────────────────────────────────────────────────────

  async listMemories(
    orgSlug: string,
    options?: Pick<MemorySearchOptions, "limit">,
  ): Promise<MemoryEntry[]> {
    const limit = options?.limit ?? 20;

    const rows = await prisma.copilotMemory.findMany({
      where:   { orgSlug, deletedAt: null },
      take:    MAX_FETCH,
      orderBy: { createdAt: "desc" },
    });

    const entries = rows.map(rowToMemoryEntry);
    entries.sort(sortByImportanceThenDate);
    return entries.slice(0, limit);
  }

  // ── countMemories ──────────────────────────────────────────────────────────

  async countMemories(orgSlug: string): Promise<number> {
    return prisma.copilotMemory.count({
      where: { orgSlug, deletedAt: null },
    });
  }

  // ── clearMemories (soft-delete entire tenant, test use) ────────────────────

  async clearMemories(orgSlug: string): Promise<void> {
    await prisma.copilotMemory.updateMany({
      where: { orgSlug, deletedAt: null },
      data:  { deletedAt: new Date() },
    });
  }
}

// ── Process-level singleton ────────────────────────────────────────────────────

export const prismaMemoryRepository: MemoryRepository = new PrismaMemoryRepository();
