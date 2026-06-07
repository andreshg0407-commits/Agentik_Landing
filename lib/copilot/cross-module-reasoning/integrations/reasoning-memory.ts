/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-memory.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Memory Adapter — converts MemoryEntry objects into ReasoningEvidence.
 * No DB. No server-only.
 */

import type { MemoryEntry, MemoryImportance, MemoryType } from "@/lib/copilot/memory/memory-types";
import type { ReasoningEvidence, ReasoningSignal, ReasoningSourceDomain } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Importance → strength ─────────────────────────────────────────────────────

const IMPORTANCE_STRENGTH: Record<MemoryImportance, number> = {
  CRITICAL: 0.95,
  HIGH:     0.80,
  MEDIUM:   0.60,
  LOW:      0.35,
};

// ── Type → domain ─────────────────────────────────────────────────────────────

const TYPE_TO_DOMAIN: Record<MemoryType, ReasoningSourceDomain> = {
  STRATEGIC:   "EXECUTIVE",
  OPERATIONAL: "EXECUTIVE",
  PREFERENCE:  "MEMORY",
  LEARNING:    "MEMORY",
};

// ── MemoryEntry → ReasoningEvidence ───────────────────────────────────────────

export function memoryEntryToEvidence(
  orgSlug: string,
  entry: MemoryEntry,
): ReasoningEvidence {
  if (entry.orgSlug !== orgSlug) {
    throw new Error(
      `[reasoning-memory] Tenant isolation violation: entry.orgSlug=${entry.orgSlug} orgSlug=${orgSlug}`,
    );
  }

  return {
    id:          generateCmrId("ev"),
    orgSlug,
    type:        "MEMORY_ENTRY",
    domain:      TYPE_TO_DOMAIN[entry.type] ?? "MEMORY",
    label:       entry.title,
    description: entry.content.slice(0, 500),
    strength:    IMPORTANCE_STRENGTH[entry.importance] ?? 0.5,
    reliability: 0.80,
    sourceRef:   entry.id,
    sourceType:  "memory_entry",
    metadata:    {
      memoryId:   entry.id,
      memoryType: entry.type,
      scope:      entry.scope,
      importance: entry.importance,
      tags:       entry.tags,
      moduleId:   entry.moduleId,
      agentId:    entry.agentId,
    },
    collectedAt: entry.updatedAt,
  };
}

// ── MemoryEntry → ReasoningSignal (for STRATEGIC/OPERATIONAL) ─────────────────

export function memoryEntryToSignal(
  orgSlug: string,
  entry: MemoryEntry,
): ReasoningSignal | null {
  if (entry.type !== "STRATEGIC" && entry.type !== "OPERATIONAL") return null;
  if (entry.orgSlug !== orgSlug) return null;

  const severityFromImportance: Record<MemoryImportance, ReasoningSignal["severity"]> = {
    CRITICAL: "CRITICAL",
    HIGH:     "HIGH",
    MEDIUM:   "MEDIUM",
    LOW:      "LOW",
  };

  return {
    id:          generateCmrId("sig"),
    orgSlug,
    type:        "EVENT",
    domain:      "MEMORY",
    label:       entry.title,
    description: entry.content.slice(0, 300),
    severity:    severityFromImportance[entry.importance],
    confidence:  IMPORTANCE_STRENGTH[entry.importance] * 0.7,
    source:      `memory:${entry.id}`,
    metadata:    {
      memoryId:   entry.id,
      memoryType: entry.type,
      scope:      entry.scope,
      tags:       entry.tags,
    },
    detectedAt:  entry.updatedAt,
  };
}

// ── Batch conversions ─────────────────────────────────────────────────────────

export function memoryEntriesToEvidence(
  orgSlug: string,
  entries: MemoryEntry[],
): ReasoningEvidence[] {
  return entries
    .filter(e => e.orgSlug === orgSlug)
    .map(e => memoryEntryToEvidence(orgSlug, e));
}

export function memoryEntriesToSignals(
  orgSlug: string,
  entries: MemoryEntry[],
): ReasoningSignal[] {
  return entries
    .filter(e => e.orgSlug === orgSlug)
    .map(e => memoryEntryToSignal(orgSlug, e))
    .filter((s): s is ReasoningSignal => s !== null);
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export function filterCriticalMemories(entries: MemoryEntry[]): MemoryEntry[] {
  return entries.filter(
    e => e.importance === "CRITICAL" || e.importance === "HIGH",
  );
}

export function filterStrategicMemories(entries: MemoryEntry[]): MemoryEntry[] {
  return entries.filter(e => e.type === "STRATEGIC");
}

export function filterMemoriesByTag(entries: MemoryEntry[], tag: string): MemoryEntry[] {
  return entries.filter(e => e.tags.includes(tag));
}
