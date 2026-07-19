// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 2 — Strategic Context Engine
// Consumes Strategic Memory to build executive strategic context

import type {
  StrategicMemoryEntry,
  StrategicMemoryContext,
  StrategicMemoryDomain,
} from "../strategic-memory/strategic-memory-types";
import type {
  ExecutiveObjective,
  ExecutiveConcern,
  ExecutiveDomain,
  ExecutivePriorityLevel,
} from "./executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  riskLevelFromScore,
} from "./executive-brain-types";

// ── Strategic Context Engine ──────────────────────────────────────────────────

export interface StrategicExecutiveContext {
  readonly orgSlug: string;
  readonly objectives: ExecutiveObjective[];
  readonly concerns: ExecutiveConcern[];
  readonly activeGoalCount: number;
  readonly criticalRiskCount: number;
  readonly strategicScore: number;
  readonly domains: ExecutiveDomain[];
  readonly buildAt: string;
}

export function buildStrategicContext(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  context?: StrategicMemoryContext
): StrategicExecutiveContext {
  if (!entries || entries.length === 0) {
    return _emptyStrategicContext(orgSlug);
  }

  const scoped = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  const objectives = getActiveGoals(orgSlug, scoped);
  const concerns = getCriticalRisks(orgSlug, scoped);
  const domains = _extractDomains(scoped);
  const strategicScore = context?.strategicScore ?? _computeStrategicScore(scoped);

  return {
    orgSlug,
    objectives,
    concerns,
    activeGoalCount: objectives.length,
    criticalRiskCount: concerns.filter((c) => c.severity === "CRITICAL").length,
    strategicScore,
    domains,
    buildAt: new Date().toISOString(),
  };
}

export function getActiveGoals(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveObjective[] {
  return entries
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        e.status === "ACTIVE" &&
        (e.type === "GOAL" || e.type === "OBJECTIVE")
    )
    .sort((a, b) => b.strategicScore - a.strategicScore)
    .map((e) => _entryToObjective(e));
}

export function getCriticalRisks(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveConcern[] {
  return entries
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        e.status === "ACTIVE" &&
        e.type === "RISK" &&
        (e.priority === "HIGH" || e.priority === "CRITICAL")
    )
    .sort((a, b) => b.strategicScore - a.strategicScore)
    .map((e) => _entryToConcern(e));
}

export function getStrategicPriorities(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        e.status === "ACTIVE" &&
        (e.type === "PRIORITY" || e.type === "GOAL" || e.type === "OBJECTIVE") &&
        e.strategicScore >= 0.5
    )
    .sort((a, b) => b.strategicScore - a.strategicScore);
}

export function getActiveDecisions(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries.filter(
    (e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "DECISION"
  );
}

export function getActiveCommitments(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries.filter(
    (e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "COMMITMENT"
  );
}

export function getActivePolicies(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return entries.filter(
    (e) => e.orgSlug === orgSlug && e.status === "ACTIVE" && e.type === "POLICY"
  );
}

export function getRecentLessons(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  limit = 5
): StrategicMemoryEntry[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.type === "LESSON" && e.status === "ACTIVE")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _entryToObjective(entry: StrategicMemoryEntry): ExecutiveObjective {
  return {
    id: generateEbv2Id("obj"),
    orgSlug: entry.orgSlug,
    title: entry.title,
    description: entry.description,
    domain: entry.domain as ExecutiveDomain,
    priority: _mapPriority(entry.priority),
    confidence: confidenceFromScore(entry.confidenceScore),
    confidenceScore: entry.confidenceScore,
    progressScore: 0,
    strategicSourceId: entry.id,
    evidenceIds: entry.evidenceIds,
    metadata: { strategicMemoryId: entry.id, strategicScore: entry.strategicScore },
  };
}

function _entryToConcern(entry: StrategicMemoryEntry): ExecutiveConcern {
  return {
    id: generateEbv2Id("concern"),
    orgSlug: entry.orgSlug,
    title: entry.title,
    description: entry.description,
    domain: entry.domain as ExecutiveDomain,
    severity: _mapPriority(entry.priority),
    confidence: confidenceFromScore(entry.confidenceScore),
    confidenceScore: entry.confidenceScore,
    riskLevel: riskLevelFromScore(entry.strategicScore),
    evidenceIds: entry.evidenceIds,
    metadata: { strategicMemoryId: entry.id, strategicScore: entry.strategicScore },
  };
}

function _mapPriority(p: string): ExecutivePriorityLevel {
  if (p === "CRITICAL") return "CRITICAL";
  if (p === "HIGH") return "HIGH";
  if (p === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function _extractDomains(entries: StrategicMemoryEntry[]): ExecutiveDomain[] {
  const seen = new Set<StrategicMemoryDomain>();
  for (const e of entries) seen.add(e.domain);
  return Array.from(seen) as ExecutiveDomain[];
}

function _computeStrategicScore(entries: StrategicMemoryEntry[]): number {
  if (entries.length === 0) return 0;
  const sum = entries.reduce((acc, e) => acc + e.strategicScore, 0);
  return Math.round((sum / entries.length) * 100) / 100;
}

function _emptyStrategicContext(orgSlug: string): StrategicExecutiveContext {
  return {
    orgSlug,
    objectives: [],
    concerns: [],
    activeGoalCount: 0,
    criticalRiskCount: 0,
    strategicScore: 0,
    domains: [],
    buildAt: new Date().toISOString(),
  };
}
