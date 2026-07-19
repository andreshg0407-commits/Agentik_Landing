// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 13 — Strategic Digest Builder

import type { StrategicConcern, StrategicOpportunityAssessment, StrategicRecommendation, StrategicAdvisorDigest, StrategicDigestPeriod } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore } from "./strategic-advisor-types";

interface DigestInput {
  readonly orgSlug:         string;
  readonly period:          StrategicDigestPeriod;
  readonly concerns:        StrategicConcern[];
  readonly opportunities:   StrategicOpportunityAssessment[];
  readonly recommendations: StrategicRecommendation[];
  readonly advisorScore:    number;
}

const DIGEST_LIMITS: Record<StrategicDigestPeriod, { concerns: number; opps: number; recs: number }> = {
  DAILY:     { concerns: 3, opps: 2, recs: 3 },
  WEEKLY:    { concerns: 5, opps: 3, recs: 5 },
  MONTHLY:   { concerns: 7, opps: 5, recs: 7 },
  QUARTERLY: { concerns: 10, opps: 7, recs: 10 },
};

export function buildStrategicDigest(input: DigestInput): StrategicAdvisorDigest {
  const limits = DIGEST_LIMITS[input.period];
  const topConcerns      = input.concerns.slice(0, limits.concerns);
  const topOpportunities = input.opportunities.slice(0, limits.opps);
  const topRecs          = input.recommendations.slice(0, limits.recs);

  const headline = _buildHeadline(input.period, topConcerns, topOpportunities, input.advisorScore);

  return {
    id:                  generateSaId("digest"),
    orgSlug:             input.orgSlug,
    period:              input.period,
    title:               `Digest Estratégico ${_periodLabel(input.period)}`,
    headline,
    topConcerns,
    topOpportunities,
    topRecommendations:  topRecs,
    advisorScore:        input.advisorScore,
    confidence:          confidenceSaFromScore(input.advisorScore),
    metadata:            { period: input.period, limits },
    generatedAt:         new Date().toISOString(),
  };
}

export function buildDailyDigest(input: Omit<DigestInput, "period">): StrategicAdvisorDigest {
  return buildStrategicDigest({ ...input, period: "DAILY" });
}

export function buildWeeklyDigest(input: Omit<DigestInput, "period">): StrategicAdvisorDigest {
  return buildStrategicDigest({ ...input, period: "WEEKLY" });
}

export function buildMonthlyDigest(input: Omit<DigestInput, "period">): StrategicAdvisorDigest {
  return buildStrategicDigest({ ...input, period: "MONTHLY" });
}

export function buildQuarterlyDigest(input: Omit<DigestInput, "period">): StrategicAdvisorDigest {
  return buildStrategicDigest({ ...input, period: "QUARTERLY" });
}

function _buildHeadline(
  period: StrategicDigestPeriod,
  concerns: StrategicConcern[],
  opps: StrategicOpportunityAssessment[],
  score: number
): string {
  const label = _periodLabel(period);
  if (concerns.some((c) => c.severity === "CRITICAL"))
    return `${label}: Situación crítica activa — intervención ejecutiva recomendada.`;
  if (opps.some((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL"))
    return `${label}: Oportunidades de alto potencial identificadas.`;
  if (score >= 0.7) return `${label}: Desempeño estratégico favorable.`;
  return `${label}: Monitoreo activo recomendado.`;
}

function _periodLabel(period: StrategicDigestPeriod): string {
  const labels: Record<StrategicDigestPeriod, string> = {
    DAILY: "Diario", WEEKLY: "Semanal", MONTHLY: "Mensual", QUARTERLY: "Trimestral",
  };
  return labels[period];
}
