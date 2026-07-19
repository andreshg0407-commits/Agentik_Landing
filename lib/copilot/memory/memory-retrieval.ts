/**
 * lib/copilot/memory/memory-retrieval.ts
 *
 * Agentik — Copilot Memory Engine — Memory Retrieval Engine
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * Retrieves relevant memory context for a given orgSlug and intent.
 * Returns MemoryContext bundles ready to be attached to CopilotResponse.
 *
 * Retrieval strategy (no vectors, no embeddings, no AI):
 *   1. CRITICAL memories always included first.
 *   2. STRATEGIC memories relevant to the intent domain.
 *   3. PREFERENCE memories for the tenant.
 *   4. OPERATIONAL memories (recent, by module if known).
 *   5. LEARNING memories for the intent domain.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { MemoryRepository }    from "./memory-repository";
import type { MemoryContext, MemoryEntry, MemoryScope } from "./memory-types";
import { canRetrieveMemory, globalMemoryAuditLog, auditMemoryRetrieved } from "./memory-audit";
import { defaultMemoryRepository }   from "./in-memory-memory-repository";
import type { CopilotIntent }        from "../copilot-types";

// ── Intent → tag hints ────────────────────────────────────────────────────────

const INTENT_TAGS: Record<CopilotIntent, string[]> = {
  FINANCE:      ["treasury", "banking", "reconciliation", "budget", "payments"],
  MARKETING:    ["marketing", "shopify", "meta", "tiktok", "integration"],
  COMMERCIAL:   ["commercial", "strategy"],
  COLLECTIONS:  ["collections", "payments"],
  MULTI_DOMAIN: [],   // no tag filter — retrieve all CRITICAL + STRATEGIC
  GENERAL:      [],   // same
};

// ── Default limits ────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 10;

// ── Retrieval functions ───────────────────────────────────────────────────────

/**
 * Retrieve CRITICAL and STRATEGIC memories relevant to the intent.
 * Used as the primary context for the Copilot pipeline.
 */
export async function getStrategicContext(
  orgSlug: string,
  intent:  CopilotIntent,
  repo:    MemoryRepository = defaultMemoryRepository,
): Promise<MemoryContext> {
  if (!canRetrieveMemory(orgSlug)) {
    return { orgSlug, entries: [], retrievedAt: new Date().toISOString(), overflow: 0 };
  }

  const tags = INTENT_TAGS[intent];
  const limit = DEFAULT_LIMIT;

  // Always include CRITICAL memories regardless of intent
  const criticalEntries = await repo.searchMemory(orgSlug, {
    importance: "CRITICAL",
    limit:      5,
  });

  // STRATEGIC/HIGH memories — all tenant facts, not filtered by tag.
  // Tag-based ranking is deferred to AGENTIK-COPILOT-MEMORY-RANKING-01
  // when we have scoring/ranking infrastructure. For now, return all strategic context.
  const strategicEntries = await repo.searchMemory(orgSlug, {
    type:       "STRATEGIC",
    importance: "HIGH",
    limit:      5,
  });

  // Suppress the unused variable lint warning — tags will be used in the ranking sprint
  void tags;

  // Merge and deduplicate by ID
  const seen = new Set<string>();
  const merged: MemoryEntry[] = [];

  for (const entry of [...criticalEntries, ...strategicEntries]) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      merged.push(entry);
    }
  }

  const total    = merged.length;
  const entries  = merged.slice(0, limit);
  const overflow = Math.max(0, total - entries.length);

  globalMemoryAuditLog.push(auditMemoryRetrieved(
    orgSlug,
    entries.length,
    "TENANT" as MemoryScope,
    `intent:${intent}`,
  ));

  return {
    orgSlug,
    entries,
    retrievedAt: new Date().toISOString(),
    overflow,
  };
}

/**
 * Retrieve module-scoped memories (OPERATIONAL + STRATEGIC for a specific module).
 */
export async function getModuleContext(
  orgSlug:  string,
  moduleId: string,
  repo:     MemoryRepository = defaultMemoryRepository,
): Promise<MemoryContext> {
  if (!canRetrieveMemory(orgSlug)) {
    return { orgSlug, entries: [], retrievedAt: new Date().toISOString(), overflow: 0 };
  }

  const entries = await repo.searchMemory(orgSlug, {
    scope:    "MODULE",
    moduleId,
    limit:    DEFAULT_LIMIT,
  });

  globalMemoryAuditLog.push(auditMemoryRetrieved(orgSlug, entries.length, "MODULE", moduleId));

  return {
    orgSlug,
    entries,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}

/**
 * Retrieve agent-scoped memories (preferences and learnings for a specific agent).
 */
export async function getAgentContext(
  orgSlug: string,
  agentId: string,
  repo:    MemoryRepository = defaultMemoryRepository,
): Promise<MemoryContext> {
  if (!canRetrieveMemory(orgSlug)) {
    return { orgSlug, entries: [], retrievedAt: new Date().toISOString(), overflow: 0 };
  }

  const entries = await repo.searchMemory(orgSlug, {
    scope:   "AGENT",
    agentId,
    limit:   DEFAULT_LIMIT,
  });

  globalMemoryAuditLog.push(auditMemoryRetrieved(orgSlug, entries.length, "AGENT", agentId));

  return {
    orgSlug,
    entries,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}

/**
 * Search memory entries with arbitrary text and/or tags.
 */
export async function searchRelevantMemories(
  orgSlug:  string,
  query?:   string,
  tags?:    string[],
  limit?:   number,
  repo:     MemoryRepository = defaultMemoryRepository,
): Promise<MemoryContext> {
  if (!canRetrieveMemory(orgSlug)) {
    return { orgSlug, entries: [], retrievedAt: new Date().toISOString(), overflow: 0 };
  }

  const entries = await repo.searchMemory(orgSlug, {
    query,
    tags,
    limit: limit ?? DEFAULT_LIMIT,
  });

  globalMemoryAuditLog.push(auditMemoryRetrieved(orgSlug, entries.length, "TENANT", query));

  return {
    orgSlug,
    entries,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}

/**
 * Retrieve all PREFERENCE memories for a tenant.
 */
export async function getPreferenceContext(
  orgSlug: string,
  repo:    MemoryRepository = defaultMemoryRepository,
): Promise<MemoryContext> {
  if (!canRetrieveMemory(orgSlug)) {
    return { orgSlug, entries: [], retrievedAt: new Date().toISOString(), overflow: 0 };
  }

  const entries = await repo.searchMemory(orgSlug, {
    type:  "PREFERENCE",
    limit: DEFAULT_LIMIT,
  });

  globalMemoryAuditLog.push(auditMemoryRetrieved(orgSlug, entries.length, "TENANT", "preferences"));

  return {
    orgSlug,
    entries,
    retrievedAt: new Date().toISOString(),
    overflow:    0,
  };
}
