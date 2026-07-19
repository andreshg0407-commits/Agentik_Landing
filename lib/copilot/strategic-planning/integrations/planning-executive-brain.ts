// AGENTIK-STRATEGIC-PLANNING-01 — Phase 15: Executive Brain V2 Integration

import type { ExecutivePriority, ExecutiveRisk, ExecutiveFocusArea } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicObjective, StrategicDomain } from "../strategic-planning-types";
import { buildObjective } from "../objective-engine";

export function buildObjectivesFromExecutiveBrain(
  orgSlug:    string,
  priorities: ExecutivePriority[]
): StrategicObjective[] {
  return priorities
    .filter((p) => p.orgSlug === orgSlug && p.level === "CRITICAL")
    .slice(0, 4)
    .map((p) =>
      buildObjective({
        orgSlug,
        title:           p.title,
        description:     p.description,
        domain:          p.domain as StrategicDomain,
        priority:        "CRITICAL",
        confidenceScore: p.confidenceScore,
        impactScore:     0.85,
        alignmentScore:  0.80,
        evidenceIds:     p.evidenceIds,
        metadata:        { priorityId: p.id, source: "EXECUTIVE_BRAIN" },
      })
    );
}

export function getExecutiveFocusBoost(
  orgSlug:    string,
  focusAreas: ExecutiveFocusArea[]
): number {
  const scoped = focusAreas.filter((f) => f.orgSlug === orgSlug);
  return Math.min(0.10, scoped.length * 0.02);
}

export function getExecutiveRiskLabels(orgSlug: string, risks: ExecutiveRisk[], limit = 3): string[] {
  return risks
    .filter((r) => r.orgSlug === orgSlug && (r.level === "CRITICAL" || r.level === "HIGH"))
    .slice(0, limit)
    .map((r) => r.title);
}
