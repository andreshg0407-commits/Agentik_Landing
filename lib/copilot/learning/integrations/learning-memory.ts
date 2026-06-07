// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Memory integration adapter

import type { LearningEvent, LearningPattern, LearningDomain } from "../learning-types";
import { buildLearningEvent } from "../learning-event-builder";
import { createPattern } from "../learning-pattern-engine";

// Lightweight MemoryEntry shape — avoid importing full memory module
interface MemoryEntryRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly content: string;
  readonly category?: string;
  readonly confidence?: number;
  readonly tags?: string[];
}

function memoryDomainFromCategory(category?: string): LearningDomain {
  switch ((category ?? "").toUpperCase()) {
    case "FINANCE":
    case "FINANCIAL":
      return "FINANCE";
    case "COMMERCIAL":
    case "SALES":
      return "COMMERCIAL";
    case "MARKETING":
      return "MARKETING";
    case "OPERATIONS":
      return "OPERATIONS";
    case "EXECUTIVE":
      return "EXECUTIVE";
    case "COMPLIANCE":
      return "COMPLIANCE";
    default:
      return "MEMORY";
  }
}

export function memoryEntryToLearningEvent(
  orgSlug: string,
  entry: MemoryEntryRef
): LearningEvent {
  if (entry.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation violation: memory entry belongs to "${entry.orgSlug}", not "${orgSlug}"`
    );
  }

  const domain = memoryDomainFromCategory(entry.category);
  const confidence = entry.confidence ?? 0.6;

  return buildLearningEvent({
    orgSlug,
    type: "PATTERN_REINFORCED",
    source: "MEMORY_GRAPH",
    domain,
    referenceId: entry.id,
    referenceType: "PATTERN",
    confidence: confidence >= 0.8 ? "HIGH" : confidence >= 0.5 ? "MEDIUM" : "LOW",
    confidenceScore: confidence,
    metadata: {
      memoryContent: entry.content.slice(0, 200),
      memoryTags: entry.tags ?? [],
    },
  });
}

export function memoryEntriesToLearningEvents(
  orgSlug: string,
  entries: MemoryEntryRef[]
): LearningEvent[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug)
    .map((e) => memoryEntryToLearningEvent(orgSlug, e));
}

export function createPatternFromMemory(
  orgSlug: string,
  entry: MemoryEntryRef,
  seedEventId: string
): LearningPattern {
  const domain = memoryDomainFromCategory(entry.category);
  return createPattern(
    orgSlug,
    domain,
    `Memory pattern: ${entry.content.slice(0, 50)}`,
    `Pattern derived from memory entry ${entry.id}`,
    seedEventId,
    undefined,
    { memoryEntryId: entry.id, memoryTags: entry.tags ?? [] }
  );
}
