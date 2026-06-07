// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Memory Engine

import type { StrategicMemoryEntry } from "../strategic-memory-types";
import type { StrategicMemoryInput } from "../strategic-memory-builder";

// Minimal interface to avoid circular deps — mirrors MemoryEntry shape
export interface MemoryEngineEntry {
  readonly id: string;
  readonly orgSlug: string;
  readonly category?: string;
  readonly title?: string;
  readonly content: string;
  readonly confidence?: number;
  readonly source?: string;
  readonly agentId?: string;
  readonly userId?: string;
  readonly createdAt: string;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function memoryEntryToStrategicInput(
  entry: MemoryEngineEntry,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (entry.orgSlug !== expectedOrgSlug) return null;

  const category = entry.category?.toUpperCase() ?? "";
  const type: StrategicMemoryInput["type"] =
    category === "GOAL" ? "GOAL" :
    category === "RISK" ? "RISK" :
    category === "DECISION" ? "DECISION" :
    category === "LESSON" ? "LESSON" :
    category === "POLICY" ? "POLICY" :
    category === "COMMITMENT" ? "COMMITMENT" :
    category === "OPPORTUNITY" ? "OPPORTUNITY" :
    "INSIGHT";

  return {
    orgSlug: entry.orgSlug,
    type,
    priority: "MEDIUM",
    domain: "CROSS_DOMAIN",
    title: entry.title ?? "Memory Entry",
    description: entry.content.slice(0, 500),
    rationale: `Derived from memory engine entry ${entry.id}`,
    confidenceScore: entry.confidence ?? 0.5,
    source: "AGENT",
    agentId: entry.agentId,
    userId: entry.userId,
    evidenceIds: [entry.id],
  };
}

export function memoryEntriesToStrategicInputs(
  entries: MemoryEngineEntry[],
  orgSlug: string
): StrategicMemoryInput[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug)
    .map((e) => memoryEntryToStrategicInput(e, orgSlug))
    .filter((i): i is StrategicMemoryInput => i !== null);
}

export function strategicEntryToMemoryHint(
  entry: StrategicMemoryEntry
): { title: string; summary: string; score: number } {
  return {
    title: `[${entry.type}] ${entry.title}`,
    summary: entry.description.slice(0, 200),
    score: entry.strategicScore,
  };
}

export function buildMemoryContextFromStrategic(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): string {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  if (scoped.length === 0) return "No strategic context available.";

  const lines = scoped
    .sort((a, b) => b.strategicScore - a.strategicScore)
    .slice(0, 10)
    .map((e) => `- [${e.type}/${e.priority}] ${e.title}: ${e.description.slice(0, 100)}`);

  return `Strategic context (${scoped.length} active items):\n${lines.join("\n")}`;
}
