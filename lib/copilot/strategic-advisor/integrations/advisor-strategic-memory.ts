// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 16: Strategic Memory Integration

import type { StrategicMemoryEntry } from "../../strategic-memory/strategic-memory-types";
import type { StrategicDomain } from "../strategic-advisor-types";

export interface StrategicMemoryAdvisorContext {
  readonly objectives:   StrategicMemoryEntry[];
  readonly risks:        StrategicMemoryEntry[];
  readonly decisions:    StrategicMemoryEntry[];
  readonly commitments:  StrategicMemoryEntry[];
  readonly lessons:      StrategicMemoryEntry[];
  readonly strategicScore: number;
}

export function extractAdvisorMemoryContext(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): StrategicMemoryAdvisorContext {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug);
  const objectives  = scoped.filter((e) => e.type === "GOAL"       && e.status === "ACTIVE");
  const risks       = scoped.filter((e) => e.type === "RISK"       && e.status === "ACTIVE");
  const decisions   = scoped.filter((e) => e.type === "DECISION"   && e.status === "ACTIVE");
  const commitments = scoped.filter((e) => e.type === "COMMITMENT" && e.status === "ACTIVE");
  const lessons     = scoped.filter((e) => e.type === "LESSON");

  const criticalRisks = risks.filter((r) => r.priority === "CRITICAL").length;
  const strategicScore = Math.max(0, Math.min(1,
    Math.min(objectives.length / 5, 1) * 0.5 - criticalRisks * 0.15 + Math.min(lessons.length / 10, 1) * 0.1
  ));

  return { objectives, risks, decisions, commitments, lessons, strategicScore };
}

export function getStrategicAdvisorAlignmentScore(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  domains: StrategicDomain[]
): number {
  const scoped  = entries.filter((e) => e.orgSlug === orgSlug && e.type === "GOAL" && e.status === "ACTIVE");
  const goalDomains = new Set(scoped.map((e) => e.domain));
  const matched = domains.filter((d) => goalDomains.has(d)).length;
  return domains.length === 0 ? 0 : Math.round((matched / domains.length) * 100) / 100;
}

export function extractStrategicLessons(orgSlug: string, entries: StrategicMemoryEntry[]): string[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.type === "LESSON")
    .map((e) => e.description)
    .slice(0, 10);
}
