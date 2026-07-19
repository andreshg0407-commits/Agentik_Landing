// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 25: Cross-Module Reasoning Integration

import type { ReasoningRecommendation, ReasoningRisk, ReasoningOpportunity } from "../../cross-module-reasoning/cross-module-types";

export interface CrossModuleCouncilContext {
  readonly recommendations: ReasoningRecommendation[];
  readonly risks:           ReasoningRisk[];
  readonly opportunities:   ReasoningOpportunity[];
  readonly crossModuleBoost: number;
  readonly urgentRecCount:  number;
}

export function buildCrossModuleCouncilContext(
  orgSlug: string,
  recs:    ReasoningRecommendation[],
  risks:   ReasoningRisk[],
  opps:    ReasoningOpportunity[]
): CrossModuleCouncilContext {
  try {
    const scopedRecs  = recs.filter((r) => r.orgSlug === orgSlug);
    const scopedRisks = risks.filter((r) => r.orgSlug === orgSlug);
    const scopedOpps  = opps.filter((o) => o.orgSlug === orgSlug);

    const urgentRecs  = scopedRecs.filter((r) => r.priority === "URGENT" || r.priority === "HIGH");

    const crossModuleBoost = Math.min(
      0.12,
      (urgentRecs.length > 0 ? 0.06 : 0) +
      (scopedRisks.filter((r) => r.severity === "CRITICAL").length > 0 ? 0.06 : 0)
    );

    return {
      recommendations:  scopedRecs,
      risks:            scopedRisks,
      opportunities:    scopedOpps,
      crossModuleBoost,
      urgentRecCount:   urgentRecs.length,
    };
  } catch {
    return { recommendations: [], risks: [], opportunities: [], crossModuleBoost: 0, urgentRecCount: 0 };
  }
}

export function getCrossModuleTopRecommendations(
  orgSlug: string,
  recs:    ReasoningRecommendation[],
  limit = 3
): ReasoningRecommendation[] {
  return recs
    .filter((r) => r.orgSlug === orgSlug && (r.priority === "URGENT" || r.priority === "HIGH"))
    .slice(0, limit);
}
