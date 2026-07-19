// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 29 — Executive Brain Readiness

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern } from "../learning/learning-types";

export type ExecutiveBrainReadinessLevel = "READY" | "PARTIAL" | "INSUFFICIENT" | "BLOCKED";

export interface ExecutiveBrainReadiness {
  readonly orgSlug: string;
  readonly level: ExecutiveBrainReadinessLevel;
  readonly readinessScore: number; // 0–1
  readonly hasStrategicContext: boolean;
  readonly hasLearningContext: boolean;
  readonly hasSignals: boolean;
  readonly missingFactors: string[];
  readonly evaluatedAt: string;
}

const READINESS_THRESHOLDS = {
  minStrategicEntries: 1,
  minPatterns: 0,
  fullReadinessEntries: 5,
  fullReadinessPatterns: 3,
};

export function evaluateExecutiveBrainReadiness(
  orgSlug: string,
  strategicEntries: StrategicMemoryEntry[],
  patterns: LearningPattern[],
  hasSignals: boolean
): ExecutiveBrainReadiness {
  const scopedEntries = strategicEntries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  const scopedPatterns = patterns.filter((p) => p.orgSlug === orgSlug);
  const missing: string[] = [];

  const hasStrategicContext = scopedEntries.length >= READINESS_THRESHOLDS.minStrategicEntries;
  const hasLearningContext = scopedPatterns.length >= READINESS_THRESHOLDS.minPatterns;

  if (!hasStrategicContext) missing.push("STRATEGIC_MEMORY_EMPTY");
  if (!hasSignals) missing.push("NO_OPERATIONAL_SIGNALS");

  let readinessScore = 0;
  readinessScore += Math.min(scopedEntries.length / READINESS_THRESHOLDS.fullReadinessEntries, 1) * 0.5;
  readinessScore += Math.min(scopedPatterns.length / Math.max(READINESS_THRESHOLDS.fullReadinessPatterns, 1), 1) * 0.25;
  readinessScore += hasSignals ? 0.25 : 0;
  readinessScore = Math.round(readinessScore * 100) / 100;

  const level: ExecutiveBrainReadinessLevel =
    missing.includes("STRATEGIC_MEMORY_EMPTY") ? "INSUFFICIENT" :
    readinessScore >= 0.8 ? "READY" :
    readinessScore >= 0.4 ? "PARTIAL" :
    "INSUFFICIENT";

  return {
    orgSlug,
    level,
    readinessScore,
    hasStrategicContext,
    hasLearningContext,
    hasSignals,
    missingFactors: missing,
    evaluatedAt: new Date().toISOString(),
  };
}

export function isExecutiveBrainReady(readiness: ExecutiveBrainReadiness): boolean {
  return readiness.level === "READY" || readiness.level === "PARTIAL";
}
