/**
 * lib/copilot/memory/memory-types.ts
 *
 * Agentik — Copilot Memory Engine — Domain Types
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * Pure TypeScript domain types for the Copilot Memory Engine.
 * No Prisma. No React. No Next. No server-only.
 * All types are fully JSON-serializable.
 */

// ── Memory classification ──────────────────────────────────────────────────────

/**
 * Type of memory entry.
 *
 * STRATEGIC   — Durable business facts: integrations, priorities, technology choices.
 * OPERATIONAL — Day-to-day facts: status of processes, pending items, module states.
 * PREFERENCE  — User or agent preferences: workflow habits, display choices, tone.
 * LEARNING    — Patterns observed over time: behavioral tendencies, recurring signals.
 */
export type MemoryType =
  | "STRATEGIC"
  | "OPERATIONAL"
  | "PREFERENCE"
  | "LEARNING";

/**
 * Importance of a memory entry — governs retrieval priority and eviction order.
 *
 * CRITICAL — Must always be present in context (e.g. core tenant integrations).
 * HIGH     — Important, retrieved first in context budget.
 * MEDIUM   — Standard memory entry.
 * LOW      — Supplementary, retrieved only when budget allows.
 */
export type MemoryImportance =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

/**
 * Scope of a memory entry.
 *
 * TENANT — Applies to the whole org (most strategic facts).
 * MODULE — Scoped to a specific module (e.g. finance, marketing).
 * AGENT  — Scoped to a specific agent (e.g. Diego's operational preferences).
 */
export type MemoryScope =
  | "TENANT"
  | "MODULE"
  | "AGENT";

// ── Memory Entry ──────────────────────────────────────────────────────────────

/**
 * A MemoryEntry is a single fact stored in Copilot's strategic memory.
 *
 * Design rules:
 *   - id:        Unique, stable identifier. Format: "mem-{timestamp}-{seq}".
 *   - orgSlug:   Tenant isolation — never mix memories across orgs.
 *   - type:      Classification of what kind of fact this is.
 *   - scope:     Whether this applies to the whole tenant, a module, or an agent.
 *   - importance:Priority weight for retrieval.
 *   - title:     Short (≤ 80 chars) human-readable summary of the fact.
 *   - content:   Full content of the memory (≤ 2000 chars).
 *   - tags:      Keyword tags for search and retrieval (lowercase).
 *   - source:    Who created this memory: "copilot", "user", "agent", "system".
 *   - moduleId:  Optional — which module this memory is scoped to (MODULE scope).
 *   - agentId:   Optional — which agent this memory is scoped to (AGENT scope).
 *   - createdAt: ISO 8601 timestamp of creation.
 *   - updatedAt: ISO 8601 timestamp of last update.
 */
export interface MemoryEntry {
  id:         string;
  orgSlug:    string;
  type:       MemoryType;
  scope:      MemoryScope;
  importance: MemoryImportance;
  title:      string;
  content:    string;
  tags:       string[];
  source:     string;
  moduleId?:  string;
  agentId?:   string;
  createdAt:  string;
  updatedAt:  string;
}

// ── Search options ────────────────────────────────────────────────────────────

/**
 * Options for searching memory entries.
 * All filters are ANDed together when specified.
 */
export interface MemorySearchOptions {
  /** Filter by memory type. */
  type?:       MemoryType;
  /** Filter by scope. */
  scope?:      MemoryScope;
  /** Filter by minimum importance level. */
  importance?: MemoryImportance;
  /** Filter by tags — entry must have ALL specified tags. */
  tags?:       string[];
  /** Text search across title and content (case-insensitive). */
  query?:      string;
  /** Limit number of results (default: 20). */
  limit?:      number;
  /** Filter by module ID (for MODULE scope). */
  moduleId?:   string;
  /** Filter by agent ID (for AGENT scope). */
  agentId?:    string;
}

// ── Memory context bundle ─────────────────────────────────────────────────────

/**
 * A bundle of memory entries retrieved for a specific request context.
 * Attached to CopilotResponse as read-only context — not used to generate AI output yet.
 */
export interface MemoryContext {
  orgSlug:     string;
  entries:     MemoryEntry[];
  retrievedAt: string;
  /** Number of entries that were available but not included due to limit. */
  overflow:    number;
}

// ── Memory classification result ──────────────────────────────────────────────

/**
 * Result of classifying content for memory storage.
 */
export interface MemoryClassification {
  shouldStore:     boolean;
  type:            MemoryType;
  importance:      MemoryImportance;
  scope:           MemoryScope;
  suggestedTags:   string[];
  /** Reason for rejection when shouldStore=false. */
  rejectReason?:   string;
}

// ── Create/Update input shapes ────────────────────────────────────────────────

export interface CreateMemoryInput {
  orgSlug:    string;
  type:       MemoryType;
  scope:      MemoryScope;
  importance: MemoryImportance;
  title:      string;
  content:    string;
  tags?:      string[];
  source:     string;
  moduleId?:  string;
  agentId?:   string;
}

export interface UpdateMemoryInput {
  type?:       MemoryType;
  scope?:      MemoryScope;
  importance?: MemoryImportance;
  title?:      string;
  content?:    string;
  tags?:       string[];
  moduleId?:   string;
  agentId?:    string;
}

// ── Importance ordering ───────────────────────────────────────────────────────

const IMPORTANCE_ORDER: Record<MemoryImportance, number> = {
  LOW:      0,
  MEDIUM:   1,
  HIGH:     2,
  CRITICAL: 3,
};

/**
 * Compare two importance levels.
 * Returns true if `a` is at least as important as `b`.
 */
export function importanceAtLeast(a: MemoryImportance, b: MemoryImportance): boolean {
  return IMPORTANCE_ORDER[a] >= IMPORTANCE_ORDER[b];
}
