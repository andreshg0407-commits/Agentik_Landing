// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 30: Readiness

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern } from "../learning/learning-types";
import type { ReasoningSignal } from "../cross-module-reasoning/cross-module-types";

export type StrategicAdvisorReadinessLevel = "NOT_READY" | "PARTIAL" | "READY" | "FULL";

export interface StrategicAdvisorReadiness {
  readonly level:          StrategicAdvisorReadinessLevel;
  readonly readinessScore: number;
  readonly orgSlug:        string;
  readonly hasEntries:     boolean;
  readonly hasPatterns:    boolean;
  readonly hasSignals:     boolean;
  readonly missingInputs:  string[];
  readonly evaluatedAt:    string;
}

const THRESHOLDS = { minEntries: 1, fullEntries: 5, fullPatterns: 3 };

export function evaluateStrategicAdvisorReadiness(
  orgSlug: string,
  entries:  StrategicMemoryEntry[],
  patterns: LearningPattern[],
  signals:  ReasoningSignal[]
): StrategicAdvisorReadiness {
  const scoped   = entries.filter((e) => e.orgSlug === orgSlug);
  const pScoped  = patterns.filter((p) => p.orgSlug === orgSlug);
  const sScoped  = signals.filter((s) => s.orgSlug === orgSlug);
  const missing: string[] = [];

  if (scoped.length === 0) missing.push("No strategic memory entries");
  if (pScoped.length === 0) missing.push("No learning patterns");
  if (sScoped.length === 0) missing.push("No reasoning signals");

  let score = 0;
  score += Math.min(scoped.length / THRESHOLDS.fullEntries, 1) * 0.50;
  score += Math.min(pScoped.length / Math.max(THRESHOLDS.fullPatterns, 1), 1) * 0.25;
  score += sScoped.length > 0 ? 0.25 : 0;
  score = Math.round(score * 100) / 100;

  const level: StrategicAdvisorReadinessLevel =
    score >= 0.85 ? "FULL" :
    score >= 0.60 ? "READY" :
    score >= 0.20 ? "PARTIAL" :
    "NOT_READY";

  return {
    level, readinessScore: score, orgSlug,
    hasEntries:  scoped.length > 0,
    hasPatterns: pScoped.length > 0,
    hasSignals:  sScoped.length > 0,
    missingInputs: missing,
    evaluatedAt: new Date().toISOString(),
  };
}

export function isStrategicAdvisorReady(readiness: StrategicAdvisorReadiness): boolean {
  return readiness.level === "READY" || readiness.level === "FULL" || readiness.level === "PARTIAL";
}
