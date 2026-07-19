// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 10 — Strategic Focus Engine

import type { StrategicConcern, StrategicOpportunityAssessment, StrategicRecommendation, StrategicFocusArea, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore, STRATEGIC_PRIORITY_RANK } from "./strategic-advisor-types";

export function computeFocusAreas(
  orgSlug: string,
  concerns: StrategicConcern[],
  opportunities: StrategicOpportunityAssessment[],
  recommendations: StrategicRecommendation[]
): StrategicFocusArea[] {
  const domainScores: Record<string, { urgency: number; impact: number; count: number; evidenceIds: string[] }> = {};

  // Accumulate from concerns
  for (const c of concerns) {
    if (!domainScores[c.domain]) domainScores[c.domain] = { urgency: 0, impact: 0, count: 0, evidenceIds: [] };
    const urgency = STRATEGIC_PRIORITY_RANK[c.severity] / 4;
    const impact  = c.confidenceScore;
    domainScores[c.domain].urgency += urgency;
    domainScores[c.domain].impact  += impact;
    domainScores[c.domain].count   += 1;
    domainScores[c.domain].evidenceIds.push(...c.evidenceIds);
  }

  // Accumulate from opportunities
  for (const o of opportunities.filter((o) => o.captureScore > 0.5)) {
    if (!domainScores[o.domain]) domainScores[o.domain] = { urgency: 0, impact: 0, count: 0, evidenceIds: [] };
    domainScores[o.domain].impact  += o.captureScore * 0.7;
    domainScores[o.domain].urgency += 0.3;
    domainScores[o.domain].count   += 0.5;
    domainScores[o.domain].evidenceIds.push(...o.evidenceIds);
  }

  // Accumulate from recommendations
  for (const r of recommendations) {
    if (!domainScores[r.domain]) domainScores[r.domain] = { urgency: 0, impact: 0, count: 0, evidenceIds: [] };
    domainScores[r.domain].urgency += STRATEGIC_PRIORITY_RANK[r.priority] / 4 * 0.5;
    domainScores[r.domain].count   += 0.5;
    domainScores[r.domain].evidenceIds.push(...r.evidenceIds);
  }

  const areas: StrategicFocusArea[] = Object.entries(domainScores).map(([domain, scores], idx) => {
    const n        = Math.max(scores.count, 1);
    const urgency  = Math.min(scores.urgency / n, 1);
    const impact   = Math.min(scores.impact / n, 1);
    const composite = Math.round((urgency * 0.5 + impact * 0.5) * 100) / 100;
    const deduped   = [...new Set(scores.evidenceIds)].slice(0, 10);
    return {
      id:             generateSaId("focus"),
      orgSlug,
      rank:           idx + 1,
      title:          `Foco estratégico: ${domain}`,
      rationale:      `Dominio ${domain} concentra ${Math.floor(scores.count)} señales de preocupación y oportunidad`,
      domain:         domain as StrategicDomain,
      urgencyScore:   urgency,
      impactScore:    impact,
      compositeScore: composite,
      confidence:     confidenceSaFromScore(composite),
      evidenceIds:    deduped,
      metadata:       { signalCount: scores.count },
    };
  });

  return areas
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 10)
    .map((a, idx) => ({ ...a, rank: idx + 1 }));
}

export function getTop3FocusAreas(orgSlug: string, concerns: StrategicConcern[], opportunities: StrategicOpportunityAssessment[], recommendations: StrategicRecommendation[]): StrategicFocusArea[] {
  return computeFocusAreas(orgSlug, concerns, opportunities, recommendations).slice(0, 3);
}

export function getTop5FocusAreas(orgSlug: string, concerns: StrategicConcern[], opportunities: StrategicOpportunityAssessment[], recommendations: StrategicRecommendation[]): StrategicFocusArea[] {
  return computeFocusAreas(orgSlug, concerns, opportunities, recommendations).slice(0, 5);
}

export function getTop10FocusAreas(orgSlug: string, concerns: StrategicConcern[], opportunities: StrategicOpportunityAssessment[], recommendations: StrategicRecommendation[]): StrategicFocusArea[] {
  return computeFocusAreas(orgSlug, concerns, opportunities, recommendations).slice(0, 10);
}
