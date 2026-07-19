/**
 * lib/copilot/memory/persistence/memory-prisma-mapper.ts
 *
 * Agentik — Copilot Memory Persistence — Prisma ↔ Domain Mapper
 * Sprint: AGENTIK-COPILOT-MEMORY-PERSISTENCE-01
 *
 * Converts between Prisma database rows and the domain MemoryEntry type.
 * Also converts CreateMemoryInput → Prisma create payload.
 *
 * Responsibilities:
 *   - tagsJson (JSONB) ↔ string[]  roundtrip
 *   - DateTime ↔ ISO 8601 string
 *   - Truncate title to 80 chars, content to 2000 chars (same as in-memory repo)
 *   - Validate type / scope / importance against known values
 *   - deletedAt is NEVER exposed in the returned MemoryEntry
 *
 * Pure domain. No Prisma client import. No server-only. No React.
 */

import type {
  MemoryEntry,
  MemoryType,
  MemoryScope,
  MemoryImportance,
  CreateMemoryInput,
  UpdateMemoryInput,
} from "../memory-types";

// ── Known valid values ────────────────────────────────────────────────────────

const VALID_TYPES      = new Set<string>(["STRATEGIC", "OPERATIONAL", "PREFERENCE", "LEARNING"]);
const VALID_SCOPES     = new Set<string>(["TENANT", "MODULE", "AGENT"]);
const VALID_IMPORTANCE = new Set<string>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function ensureType(v: string): MemoryType {
  if (VALID_TYPES.has(v)) return v as MemoryType;
  return "OPERATIONAL"; // safe fallback
}

function ensureScope(v: string): MemoryScope {
  if (VALID_SCOPES.has(v)) return v as MemoryScope;
  return "TENANT";
}

function ensureImportance(v: string): MemoryImportance {
  if (VALID_IMPORTANCE.has(v)) return v as MemoryImportance;
  return "MEDIUM";
}

// ── Tags roundtrip ────────────────────────────────────────────────────────────

/**
 * Parse JSONB tags value (can be string[], null, or a JSON string) → string[].
 * Never throws — returns [] on any parse failure.
 */
export function parseTagsJson(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string");
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // ignore
    }
  }
  return [];
}

/**
 * Normalize tags for storage: lowercase, trimmed, deduplicated, non-empty.
 */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return Array.from(
    new Set(tags.map(t => t.toLowerCase().trim()).filter(Boolean)),
  );
}

// ── Shape of a Prisma CopilotMemory row (no Prisma import needed) ─────────────

export interface PrismaCopilotMemoryRow {
  id:         string;
  orgSlug:    string;
  type:       string;
  scope:      string;
  importance: string;
  title:      string;
  content:    string;
  tagsJson:   unknown;   // JSONB — Prisma returns as JSON value
  source:     string;
  moduleId:   string | null;
  agentId:    string | null;
  createdAt:  Date;
  updatedAt:  Date;
  deletedAt:  Date | null;
}

// ── Row → MemoryEntry ─────────────────────────────────────────────────────────

/**
 * Map a Prisma CopilotMemory row to the domain MemoryEntry.
 * deletedAt is intentionally excluded from the result.
 */
export function rowToMemoryEntry(row: PrismaCopilotMemoryRow): MemoryEntry {
  return {
    id:         row.id,
    orgSlug:    row.orgSlug,
    type:       ensureType(row.type),
    scope:      ensureScope(row.scope),
    importance: ensureImportance(row.importance),
    title:      row.title,
    content:    row.content,
    tags:       parseTagsJson(row.tagsJson),
    source:     row.source,
    moduleId:   row.moduleId ?? undefined,
    agentId:    row.agentId ?? undefined,
    createdAt:  row.createdAt.toISOString(),
    updatedAt:  row.updatedAt.toISOString(),
  };
}

// ── CreateMemoryInput → Prisma create payload ─────────────────────────────────

export interface PrismaCreatePayload {
  id?:        string;
  orgSlug:    string;
  type:       string;
  scope:      string;
  importance: string;
  title:      string;
  content:    string;
  tagsJson:   string[];  // Prisma accepts JSON arrays directly
  source:     string;
  moduleId?:  string | null;
  agentId?:   string | null;
}

/**
 * Map CreateMemoryInput to a Prisma create payload.
 * Applies truncation and tag normalization.
 */
export function inputToCreatePayload(input: CreateMemoryInput): PrismaCreatePayload {
  return {
    orgSlug:   input.orgSlug,
    type:      input.type,
    scope:     input.scope,
    importance:input.importance,
    title:     input.title.slice(0, 80),
    content:   input.content.slice(0, 2000),
    tagsJson:  normalizeTags(input.tags),
    source:    input.source,
    moduleId:  input.moduleId ?? null,
    agentId:   input.agentId ?? null,
  };
}

// ── UpdateMemoryInput → Prisma update payload ─────────────────────────────────

export interface PrismaUpdatePayload {
  type?:       string;
  scope?:      string;
  importance?: string;
  title?:      string;
  content?:    string;
  tagsJson?:   string[];
  moduleId?:   string | null;
  agentId?:    string | null;
}

/**
 * Map UpdateMemoryInput to a partial Prisma update payload.
 * Only includes fields that are explicitly set.
 */
export function inputToUpdatePayload(updates: UpdateMemoryInput): PrismaUpdatePayload {
  const payload: PrismaUpdatePayload = {};
  if (updates.type       !== undefined) payload.type       = updates.type;
  if (updates.scope      !== undefined) payload.scope      = updates.scope;
  if (updates.importance !== undefined) payload.importance = updates.importance;
  if (updates.title      !== undefined) payload.title      = updates.title.slice(0, 80);
  if (updates.content    !== undefined) payload.content    = updates.content.slice(0, 2000);
  if (updates.tags       !== undefined) payload.tagsJson   = normalizeTags(updates.tags);
  if (updates.moduleId   !== undefined) payload.moduleId   = updates.moduleId ?? null;
  if (updates.agentId    !== undefined) payload.agentId    = updates.agentId ?? null;
  return payload;
}
