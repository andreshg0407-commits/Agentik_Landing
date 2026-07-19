// AGENTIK-STRATEGIC-PLANNING-01 — Phase 13: Strategic Memory Integration

import type { StrategicMemoryEntry } from "../../strategic-memory/strategic-memory-types";
import type { StrategicObjective, StrategicDomain } from "../strategic-planning-types";
import { buildObjective } from "../objective-engine";

export function buildObjectivesFromMemory(
  orgSlug:  string,
  entries:  StrategicMemoryEntry[]
): StrategicObjective[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.type === "GOAL" && e.status === "ACTIVE")
    .slice(0, 5)
    .map((e) =>
      buildObjective({
        orgSlug,
        title:           e.title,
        description:     e.description,
        domain:          e.domain as StrategicDomain,
        priority:        (e.priority as any) ?? "MEDIUM",
        confidenceScore: e.confidenceScore ?? 0.65,
        impactScore:     e.relevanceScore ?? 0.60,
        alignmentScore:  e.strategicScore ?? 0.60,
        evidenceIds:     e.evidenceIds,
        metadata:        { memoryEntryId: e.id },
      })
    );
}

export function getMemoryPlanningContext(orgSlug: string, entries: StrategicMemoryEntry[]): {
  activeGoalCount:     number;
  activeRiskCount:     number;
  activeOpportunityCount: number;
  criticalPriorityCount:  number;
} {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug);
  return {
    activeGoalCount:        scoped.filter((e) => e.type === "GOAL" && e.status === "ACTIVE").length,
    activeRiskCount:        scoped.filter((e) => e.type === "RISK" && e.status === "ACTIVE").length,
    activeOpportunityCount: scoped.filter((e) => e.type === "OPPORTUNITY" && e.status === "ACTIVE").length,
    criticalPriorityCount:  scoped.filter((e) => e.priority === "CRITICAL").length,
  };
}
