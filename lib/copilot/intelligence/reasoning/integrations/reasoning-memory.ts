/**
 * lib/copilot/intelligence/reasoning/integrations/reasoning-memory.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Integration — Memory Engine
 *
 * Converts Memory Engine context into reasoning signals and evidence summaries.
 * Enables the reasoning engine to use persistent memory facts as evidence.
 *
 * Contract:
 *   - Receives MemoryContext (from lib/copilot/memory/memory-types.ts)
 *   - Returns ReasoningSignal[] — one signal per high-importance memory entry
 *   - Returns MemoryContextSummary for CrossDomainContext
 *
 * No Prisma. No DB calls. Pure adapter logic. Never throws.
 */

import type { ReasoningSignal, ReasoningCategory, ReasoningConfidence } from "../reasoning-types";
import type { MemoryContextSummary } from "../cross-domain-context";

// ── Input contract ─────────────────────────────────────────────────────────────

export interface MemoryIntegrationInput {
  orgSlug:     string;
  queryId:     string;
  entries:     Array<{
    id:         string;
    type:       string;
    importance: string;
    title:      string;
    content:    string;
    tags:       string[];
    source:     string;
  }>;
}

// ── memoryToReasoningSignals ───────────────────────────────────────────────────

/**
 * memoryToReasoningSignals — convert memory entries into reasoning signals.
 *
 * Only entries with CRITICAL or HIGH importance generate signals.
 * Memory signals are always category EXECUTIVE (they represent contextual knowledge).
 *
 * Never throws.
 */
export function memoryToReasoningSignals(
  input: MemoryIntegrationInput,
): ReasoningSignal[] {
  try {
    const signals: ReasoningSignal[] = [];

    for (const entry of input.entries) {
      if (entry.importance !== "CRITICAL" && entry.importance !== "HIGH") continue;

      const confidence = _importanceToConfidence(entry.importance);
      const category   = _inferCategoryFromTags(entry.tags);

      signals.push({
        id:         `msig_${entry.id}`,
        orgSlug:    input.orgSlug,
        source:     `memory:${entry.source}`,
        category,
        metric:     `memory_entry:${entry.type}`,
        value:      entry.title,
        direction:  "STABLE",   // memory is contextual — no direction
        confidence,
        timestamp:  new Date().toISOString(),
        tags:       [...entry.tags, "memory"],
      });
    }

    return signals;
  } catch {
    return [];
  }
}

// ── memoryToContextSummary ────────────────────────────────────────────────────

/**
 * memoryToContextSummary — build a MemoryContextSummary for CrossDomainContext.
 */
export function memoryToContextSummary(
  input: MemoryIntegrationInput,
): MemoryContextSummary {
  return {
    available:  input.entries.length > 0,
    entryCount: input.entries.length,
    topEntries: input.entries.slice(0, 5).map(e => ({
      id:         e.id,
      title:      e.title,
      type:       e.type,
      importance: e.importance,
    })),
  };
}

// ── getMemoryRelevance ─────────────────────────────────────────────────────────

/**
 * getMemoryRelevance — score 0–100 of how relevant memory is to a reasoning run.
 * Based on count and importance of entries.
 */
export function getMemoryRelevance(input: MemoryIntegrationInput): number {
  if (input.entries.length === 0) return 0;

  const importanceScore: Record<string, number> = {
    CRITICAL: 100,
    HIGH:      75,
    MEDIUM:    50,
    LOW:       25,
  };

  const total = input.entries.reduce(
    (sum, e) => sum + (importanceScore[e.importance] ?? 40),
    0,
  );

  return Math.min(100, Math.round(total / input.entries.length));
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _importanceToConfidence(importance: string): ReasoningConfidence {
  if (importance === "CRITICAL" || importance === "HIGH") return "HIGH";
  if (importance === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function _inferCategoryFromTags(tags: string[]): ReasoningCategory {
  const lowerTags = tags.map(t => t.toLowerCase());

  if (lowerTags.some(t => ["finance", "financial", "treasury", "cash", "finanzas", "tesorería"].includes(t))) return "FINANCIAL";
  if (lowerTags.some(t => ["sales", "commercial", "ventas", "comercial"].includes(t))) return "COMMERCIAL";
  if (lowerTags.some(t => ["marketing", "campaign", "campaña"].includes(t))) return "MARKETING";
  if (lowerTags.some(t => ["collections", "cobranza", "cartera", "portfolio"].includes(t))) return "COLLECTIONS";
  if (lowerTags.some(t => ["operations", "operaciones", "process", "proceso"].includes(t))) return "OPERATIONS";

  return "EXECUTIVE";
}
