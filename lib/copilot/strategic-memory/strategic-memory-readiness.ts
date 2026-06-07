// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory Readiness — readiness evaluation

import type { StrategicMemoryEntry } from "./strategic-memory-types";

export type StrategicReadinessLevel = "READY" | "PARTIAL" | "INSUFFICIENT" | "BLOCKED";

export interface StrategicMemoryReadinessResult {
  readonly orgSlug: string;
  readonly level: StrategicReadinessLevel;
  readonly canActivate: boolean;
  readonly activeEntries: number;
  readonly domainsRepresented: string[];
  readonly hasGoals: boolean;
  readonly hasRisks: boolean;
  readonly avgConfidence: number;
  readonly blockers: string[];
  readonly recommendations: string[];
  readonly evaluatedAt: string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const STRATEGIC_READINESS_THRESHOLDS = {
  minEntries: 1,
  minDomains: 1,
  minAvgConfidence: 0.3,
  fullReadinessEntries: 10,
  fullReadinessDomains: 3,
} as const;

// ── Readiness ─────────────────────────────────────────────────────────────────

export function evaluateStrategicMemoryReadiness(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryReadinessResult {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");

  const domains = Array.from(new Set(scoped.map((e) => e.domain)));
  const hasGoals = scoped.some((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const hasRisks = scoped.some((e) => e.type === "RISK");

  const avgConfidence =
    scoped.length > 0
      ? scoped.reduce((s, e) => s + e.confidenceScore, 0) / scoped.length
      : 0;

  const blockers: string[] = [];
  const recommendations: string[] = [];

  // Cross-tenant check
  const crossTenant = entries.filter((e) => e.orgSlug !== orgSlug).length;
  if (crossTenant > 0) {
    blockers.push(`Cross-tenant entries detected (${crossTenant}) — memory may be contaminated`);
  }

  if (scoped.length < STRATEGIC_READINESS_THRESHOLDS.minEntries) {
    blockers.push("No active strategic entries — cannot activate strategic memory");
  }
  if (avgConfidence < STRATEGIC_READINESS_THRESHOLDS.minAvgConfidence) {
    blockers.push(`Confidence too low: ${(avgConfidence * 100).toFixed(0)}% — below 30% threshold`);
  }

  if (!hasGoals) {
    recommendations.push("Add at least one strategic goal or objective");
  }
  if (!hasRisks) {
    recommendations.push("Add at least one strategic risk for balanced view");
  }
  if (domains.length < STRATEGIC_READINESS_THRESHOLDS.fullReadinessDomains) {
    recommendations.push(`Expand to ${STRATEGIC_READINESS_THRESHOLDS.fullReadinessDomains} domains for full coverage (currently ${domains.length})`);
  }
  if (scoped.length < STRATEGIC_READINESS_THRESHOLDS.fullReadinessEntries) {
    recommendations.push(`Add ${STRATEGIC_READINESS_THRESHOLDS.fullReadinessEntries - scoped.length} more entries to reach full readiness`);
  }

  const level: StrategicReadinessLevel =
    blockers.length > 0 ? "BLOCKED" :
    scoped.length >= STRATEGIC_READINESS_THRESHOLDS.fullReadinessEntries &&
    domains.length >= STRATEGIC_READINESS_THRESHOLDS.fullReadinessDomains
      ? "READY" :
    scoped.length >= STRATEGIC_READINESS_THRESHOLDS.minEntries
      ? "PARTIAL" :
    "INSUFFICIENT";

  return {
    orgSlug,
    level,
    canActivate: blockers.length === 0 && scoped.length >= STRATEGIC_READINESS_THRESHOLDS.minEntries,
    activeEntries: scoped.length,
    domainsRepresented: domains,
    hasGoals,
    hasRisks,
    avgConfidence,
    blockers,
    recommendations,
    evaluatedAt: new Date().toISOString(),
  };
}

export function isStrategicMemoryReady(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): boolean {
  const result = evaluateStrategicMemoryReadiness(entries, orgSlug);
  return result.canActivate;
}
