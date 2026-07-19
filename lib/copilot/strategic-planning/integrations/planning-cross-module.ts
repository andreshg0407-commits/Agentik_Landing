// AGENTIK-STRATEGIC-PLANNING-01 — Phase 18: Cross Module Reasoning Integration

import type { ReasoningHypothesis, ReasoningRisk, ReasoningOpportunity, ReasoningRecommendation } from "../../cross-module-reasoning/cross-module-types";
import type { StrategicInitiative, StrategicRisk, StrategicDomain } from "../strategic-planning-types";
import { createInitiativeFromRecommendation } from "../initiative-engine";
import { buildPlanningRisk } from "../risk-planning-engine";
import { buildPlanningOpportunity } from "../opportunity-planning-engine";

export function buildInitiativesFromCrossModuleRecommendations(
  orgSlug:     string,
  objectiveId: string,
  recs:        ReasoningRecommendation[]
): StrategicInitiative[] {
  return recs
    .filter((r) => r.orgSlug === orgSlug)
    .filter((r) => r.priority === "URGENT" || r.priority === "HIGH")
    .slice(0, 5)
    .map((r) =>
      createInitiativeFromRecommendation({
        orgSlug,
        objectiveId,
        domain:          "OPERATIONS",
        recTitle:        r.title,
        recDesc:         r.description,
        recPriority:     r.priority === "URGENT" ? "CRITICAL" : "HIGH",
        confidenceScore: 0.65,
        evidenceIds:     r.evidenceIds,
      })
    );
}

export function buildRisksFromCrossModuleRisks(
  orgSlug: string,
  planId:  string,
  risks:   ReasoningRisk[]
): StrategicRisk[] {
  return risks
    .filter((r) => r.orgSlug === orgSlug)
    .filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH")
    .slice(0, 4)
    .map((r) =>
      buildPlanningRisk({
        orgSlug, planId,
        title:       `[Razonamiento] ${r.title}`,
        description: r.description,
        domain:      r.domain as unknown as StrategicDomain,
        likelihood:  r.likelihood,
        impact:      r.impact,
        mitigations: [],
        metadata:    { riskId: r.id, source: "CROSS_MODULE_REASONING" },
      })
    );
}

export function buildOpportunitiesFromCrossModule(
  orgSlug:       string,
  planId:        string,
  opportunities: ReasoningOpportunity[]
): ReturnType<typeof buildPlanningOpportunity>[] {
  return opportunities
    .filter((o) => o.orgSlug === orgSlug)
    .filter((o) => o.urgency === "HIGH" || (o.potential ?? 0) >= 0.60)
    .slice(0, 4)
    .map((o) =>
      buildPlanningOpportunity({
        orgSlug, planId,
        title:        o.title,
        description:  o.description,
        domain:       "OPERATIONS" as StrategicDomain,
        captureScore: o.potential,
        magnitude:    o.potential >= 0.80 ? "LARGE" : o.potential >= 0.60 ? "MEDIUM" : "SMALL",
        evidenceIds:  o.evidenceIds,
        metadata:     { opportunityId: o.id, source: "CROSS_MODULE_REASONING" },
      })
    );
}

export function getHypothesisContext(
  orgSlug:    string,
  hypotheses: ReasoningHypothesis[]
): { supportedCount: number; strategicHypothesisCount: number; avgConfidence: number } {
  const scoped    = hypotheses.filter((h) => h.orgSlug === orgSlug && h.supported);
  const strategic = scoped.filter((h) => h.category === "STRATEGIC" || h.category === "OPPORTUNITY");
  const avgConf   = scoped.length === 0
    ? 0
    : Math.round(scoped.reduce((s, h) => s + h.confidence.score, 0) / scoped.length * 100) / 100;
  return { supportedCount: scoped.length, strategicHypothesisCount: strategic.length, avgConfidence: avgConf };
}
