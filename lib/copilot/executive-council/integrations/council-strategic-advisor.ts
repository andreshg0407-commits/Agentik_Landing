// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 19: Strategic Advisor Integration

import type { StrategicRecommendation, StrategicConcern, StrategicRiskAssessment } from "../../strategic-advisor/strategic-advisor-types";

export interface AdvisorCouncilContext {
  readonly recommendations:  StrategicRecommendation[];
  readonly concerns:         StrategicConcern[];
  readonly risks:            StrategicRiskAssessment[];
  readonly advisorBoost:     number;
  readonly criticalRecCount: number;
  readonly emergentCount:    number;
}

export function buildAdvisorCouncilContext(
  orgSlug:  string,
  recs:     StrategicRecommendation[],
  concerns: StrategicConcern[],
  risks:    StrategicRiskAssessment[]
): AdvisorCouncilContext {
  try {
    const scopedRecs     = recs.filter((r) => r.orgSlug === orgSlug);
    const scopedConcerns = concerns.filter((c) => c.orgSlug === orgSlug);
    const scopedRisks    = risks.filter((r) => r.orgSlug === orgSlug);

    const criticalRecs   = scopedRecs.filter((r) => r.priority === "CRITICAL");
    const emergentCount  = scopedConcerns.filter((c) => c.isEmergent).length;

    const advisorBoost = Math.min(
      0.12,
      (scopedRecs.length > 0 ? 0.05 : 0) +
      (scopedConcerns.length > 0 ? 0.04 : 0) +
      (scopedRisks.length > 0 ? 0.03 : 0)
    );

    return {
      recommendations:  scopedRecs,
      concerns:         scopedConcerns,
      risks:            scopedRisks,
      advisorBoost,
      criticalRecCount: criticalRecs.length,
      emergentCount,
    };
  } catch {
    return { recommendations: [], concerns: [], risks: [], advisorBoost: 0, criticalRecCount: 0, emergentCount: 0 };
  }
}

export function getTopAdvisorRecommendations(
  orgSlug: string,
  recs:    StrategicRecommendation[],
  limit = 5
): StrategicRecommendation[] {
  return recs
    .filter((r) => r.orgSlug === orgSlug)
    .sort((a, b) => {
      const rank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
      return rank[b.priority] - rank[a.priority] || b.confidenceScore - a.confidenceScore;
    })
    .slice(0, limit);
}

export function getEmergentConcernsForCouncil(
  orgSlug:  string,
  concerns: StrategicConcern[]
): StrategicConcern[] {
  return concerns.filter((c) => c.orgSlug === orgSlug && (c.isEmergent || c.severity === "CRITICAL"));
}
