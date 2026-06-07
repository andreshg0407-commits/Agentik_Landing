// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Agent Learning Framework

import type { StrategicMemoryEntry } from "../strategic-memory-types";
import type { StrategicMemoryInput } from "../strategic-memory-builder";

// Minimal learning interfaces to avoid circular deps
export interface LearningPatternHint {
  readonly id: string;
  readonly orgSlug: string;
  readonly domain: string;
  readonly name: string;
  readonly description: string;
  readonly confidenceScore: number;
  readonly netScore: number;
  readonly status: string;
}

export interface LearningSignalHint {
  readonly id: string;
  readonly orgSlug: string;
  readonly direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  readonly domain: string;
  readonly description: string;
  readonly strength: number;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function learningPatternToStrategicInput(
  pattern: LearningPatternHint,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (pattern.orgSlug !== expectedOrgSlug) return null;
  if (pattern.status === "DEPRECATED") return null;
  if (pattern.confidenceScore < 0.4) return null;

  return {
    orgSlug: pattern.orgSlug,
    type: "LESSON",
    priority: pattern.confidenceScore >= 0.8 ? "HIGH" : "MEDIUM",
    domain: mapLearningDomainToStrategic(pattern.domain),
    title: `Learning Pattern: ${pattern.name}`,
    description: pattern.description.slice(0, 500),
    rationale: `Derived from learning pattern ${pattern.id} with confidence ${(pattern.confidenceScore * 100).toFixed(0)}%`,
    confidenceScore: pattern.confidenceScore,
    source: "AGENT",
    evidenceIds: [pattern.id],
  };
}

export function learningPatternsToStrategicInputs(
  patterns: LearningPatternHint[],
  orgSlug: string
): StrategicMemoryInput[] {
  return patterns
    .filter((p) => p.orgSlug === orgSlug)
    .map((p) => learningPatternToStrategicInput(p, orgSlug))
    .filter((i): i is StrategicMemoryInput => i !== null);
}

export function strategicEntryToLearningSignal(
  entry: StrategicMemoryEntry,
  orgSlug: string
): LearningSignalHint | null {
  if (entry.orgSlug !== orgSlug) return null;
  if (entry.status !== "ACTIVE") return null;

  const direction: LearningSignalHint["direction"] =
    entry.priority === "CRITICAL" || entry.type === "RISK" ? "NEGATIVE" :
    entry.type === "OPPORTUNITY" || entry.type === "LESSON" ? "POSITIVE" :
    "NEUTRAL";

  return {
    id: `ssig_${entry.id}`,
    orgSlug,
    direction,
    domain: mapStrategicDomainToLearning(entry.domain),
    description: `Strategic ${entry.type}: ${entry.title}`,
    strength: entry.strategicScore,
  };
}

export function buildLearningSignalsFromStrategic(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): LearningSignalHint[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE")
    .map((e) => strategicEntryToLearningSignal(e, orgSlug))
    .filter((s): s is LearningSignalHint => s !== null);
}

// ── Domain Mapping Helpers ────────────────────────────────────────────────────

function mapLearningDomainToStrategic(
  domain: string
): StrategicMemoryInput["domain"] {
  switch (domain.toUpperCase()) {
    case "FINANCE": return "FINANCE";
    case "COMMERCIAL": return "COMMERCIAL";
    case "MARKETING": return "MARKETING";
    case "OPERATIONS": return "OPERATIONS";
    case "EXECUTIVE": return "EXECUTIVE";
    case "COMPLIANCE": return "COMPLIANCE";
    case "TECHNOLOGY": return "TECHNOLOGY";
    case "PEOPLE": return "PEOPLE";
    default: return "CROSS_DOMAIN";
  }
}

function mapStrategicDomainToLearning(domain: string): string {
  switch (domain) {
    case "FINANCE": return "FINANCE";
    case "COMMERCIAL": return "COMMERCIAL";
    case "MARKETING": return "MARKETING";
    case "OPERATIONS": return "OPERATIONS";
    case "EXECUTIVE": return "EXECUTIVE";
    case "COMPLIANCE": return "COMPLIANCE";
    default: return "GENERAL";
  }
}
