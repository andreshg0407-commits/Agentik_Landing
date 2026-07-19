/**
 * lib/copilot/memory-index.ts
 *
 * Agentik Copilot — Strategic Memory Index V1
 *
 * Phase A3 of Sprint AGENTIK-STRATEGIC-MEMORY-AND-CAPABILITIES-01
 *
 * Provides fast contextual lookups over the strategic memory corpus.
 * Enables the Copilot to retrieve the most relevant memories for the
 * current module, agent, and operational state.
 *
 * V1: in-memory index from static + session-derived entries.
 * V2: vector-based retrieval with embeddings (Prisma + pgvector).
 */

import type { StrategicMemoryEntry, MemoryImportance } from "./strategic-memory";

// ── Index types ────────────────────────────────────────────────────────────────

export interface StrategicMemoryIndex {
  byModule:       Record<string, StrategicMemoryEntry[]>;
  byAgent:        Record<string, StrategicMemoryEntry[]>;
  byImportance:   Record<MemoryImportance, StrategicMemoryEntry[]>;
  byType:         Record<string, StrategicMemoryEntry[]>;
  activePatterns: StrategicMemoryEntry[];  // High-continuity entries only
}

// ── Index builder ──────────────────────────────────────────────────────────────

/**
 * Builds a fast-lookup index over a set of memory entries.
 */
export function buildMemoryIndex(entries: StrategicMemoryEntry[]): StrategicMemoryIndex {
  const byModule:     Record<string, StrategicMemoryEntry[]> = {};
  const byAgent:      Record<string, StrategicMemoryEntry[]> = {};
  const byImportance: Record<string, StrategicMemoryEntry[]> = {};
  const byType:       Record<string, StrategicMemoryEntry[]> = {};

  for (const entry of entries) {
    // Index by module
    for (const mod of entry.relatedModules) {
      (byModule[mod] ??= []).push(entry);
    }
    // Also index by module prefix (e.g. "finanzas" catches "finanzas/cierre")
    for (const mod of entry.relatedModules) {
      const prefix = mod.split("/")[0];
      if (prefix && prefix !== mod) {
        (byModule[prefix] ??= []).push(entry);
      }
    }

    // Index by agent
    for (const agentId of entry.relatedAgents) {
      (byAgent[agentId] ??= []).push(entry);
    }

    // Index by importance
    (byImportance[entry.importance] ??= []).push(entry);

    // Index by type
    (byType[entry.type] ??= []).push(entry);
  }

  // Active patterns: continuityScore ≥ 60 and importance ≥ medium
  const IMPORTANCE_MIN = new Set<MemoryImportance>(["medium", "high", "critical"]);
  const activePatterns = entries.filter(
    e => e.continuityScore >= 60 && IMPORTANCE_MIN.has(e.importance)
  );

  return { byModule, byAgent, byImportance, byType, activePatterns };
}

// ── Query interface ────────────────────────────────────────────────────────────

/**
 * Returns the most relevant memory entries for the current context.
 * Considers active module, active agent, and operational priority.
 */
export function queryRelevantMemory(
  index:           StrategicMemoryIndex,
  activeModule:    string,
  activeAgentId:   string,
  maxResults:      number = 3,
): StrategicMemoryEntry[] {
  const candidates = new Map<string, StrategicMemoryEntry>();

  // Priority 1: entries relevant to current module
  const moduleKey = activeModule.split("/")[0] ?? activeModule;
  const byCurrentModule = [
    ...(index.byModule[activeModule] ?? []),
    ...(index.byModule[moduleKey] ?? []),
  ];
  for (const e of byCurrentModule) candidates.set(e.id, e);

  // Priority 2: entries relevant to current agent
  for (const e of (index.byAgent[activeAgentId] ?? [])) {
    candidates.set(e.id, e);
  }

  // Priority 3: active high-continuity patterns
  for (const e of index.activePatterns) {
    candidates.set(e.id, e);
  }

  const IMPORTANCE_SCORE: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };

  return Array.from(candidates.values())
    .sort((a, b) => {
      const aScore = (IMPORTANCE_SCORE[a.importance] ?? 1) * 10 + a.continuityScore * 0.1;
      const bScore = (IMPORTANCE_SCORE[b.importance] ?? 1) * 10 + b.continuityScore * 0.1;
      return bScore - aScore;
    })
    .slice(0, maxResults);
}

/**
 * Resolves the overall memory priority level.
 * Used to decide how prominently to surface the memory section.
 */
export function resolveMemoryPriority(
  index: StrategicMemoryIndex,
): "low" | "medium" | "high" | "critical" {
  const critical = (index.byImportance["critical"] ?? []).length;
  const high     = (index.byImportance["high"]     ?? []).length;

  if (critical > 0)         return "critical";
  if (high >= 2)            return "high";
  if (high === 1)           return "medium";
  if (index.activePatterns.length > 0) return "medium";
  return "low";
}
