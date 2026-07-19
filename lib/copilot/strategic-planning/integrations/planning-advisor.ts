// AGENTIK-STRATEGIC-PLANNING-01 — Phase 16: Strategic Advisor Integration

import type { StrategicConcern, StrategicRecommendation, StrategicOpportunityAssessment } from "../../strategic-advisor/strategic-advisor-types";
import type { StrategicInitiative, StrategicRisk, StrategicDomain } from "../strategic-planning-types";
import { createInitiativeFromRecommendation } from "../initiative-engine";
import { buildPlanningRisk } from "../risk-planning-engine";

export function buildInitiativesFromAdvisorRecommendations(
  orgSlug:     string,
  objectiveId: string,
  recs:        StrategicRecommendation[]
): StrategicInitiative[] {
  return recs
    .filter((r) => r.orgSlug === orgSlug)
    .slice(0, 5)
    .map((r) =>
      createInitiativeFromRecommendation({
        orgSlug,
        objectiveId,
        domain:          r.domain,
        recTitle:        r.title,
        recDesc:         r.description,
        recPriority:     r.priority,
        confidenceScore: r.confidenceScore,
        evidenceIds:     r.evidenceIds,
      })
    );
}

export function buildRisksFromAdvisorConcerns(
  orgSlug:  string,
  planId:   string,
  concerns: StrategicConcern[]
): StrategicRisk[] {
  return concerns
    .filter((c) => c.orgSlug === orgSlug && (c.severity === "CRITICAL" || c.severity === "HIGH"))
    .slice(0, 4)
    .map((c) =>
      buildPlanningRisk({
        orgSlug, planId,
        title:       `[Asesor] ${c.title}`,
        description: c.description,
        domain:      c.domain,
        likelihood:  c.confidenceScore,
        impact:      c.severity === "CRITICAL" ? 0.90 : 0.65,
        evidenceIds: c.evidenceIds,
        metadata:    { concernId: c.id, source: "STRATEGIC_ADVISOR" },
      })
    );
}
