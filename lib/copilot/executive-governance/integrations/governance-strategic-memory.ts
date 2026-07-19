// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 18: Strategic Memory Integration

import type { GovernanceDomain } from "../executive-governance-types";

export interface GovernanceMemoryContext {
  readonly orgSlug:       string;
  readonly patternHints:  string[];
  readonly memoryBoost:   number; // 0–1
  readonly hasMemory:     boolean;
}

export interface MemoryPattern {
  readonly name:       string;
  readonly confidence: number;
  readonly domain?:    string;
}

export function getMemoryGovernanceHints(
  orgSlug: string,
  patterns: MemoryPattern[],
  limit: number = 5
): string[] {
  try {
    return patterns
      .filter((p) => p.name && p.name.length > 0)
      .slice(0, limit)
      .map((p) => p.name);
  } catch {
    return [];
  }
}

export function buildGovernanceMemoryContext(
  orgSlug: string,
  patterns?: MemoryPattern[]
): GovernanceMemoryContext {
  try {
    const hints    = getMemoryGovernanceHints(orgSlug, patterns ?? [], 5);
    const boost    = Math.min(0.12, hints.length * 0.02);
    return {
      orgSlug,
      patternHints: hints,
      memoryBoost:  boost,
      hasMemory:    hints.length > 0,
    };
  } catch {
    return { orgSlug, patternHints: [], memoryBoost: 0, hasMemory: false };
  }
}

export function applyMemoryBoostToGovernanceScore(
  baseScore: number,
  memoryContext: GovernanceMemoryContext
): number {
  try {
    return Math.min(1, baseScore + memoryContext.memoryBoost);
  } catch {
    return baseScore;
  }
}
