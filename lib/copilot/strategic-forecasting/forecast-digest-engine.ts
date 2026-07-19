// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 12: Digest Engine

import type {
  ForecastDigest,
  ForecastDigestPeriod,
  ForecastScenario,
  ForecastRisk,
  ForecastOpportunity,
  ForecastConfidence,
  ForecastConfidenceLevel,
} from "./strategic-forecasting-types";
import { generateForecastDigestId } from "./strategic-forecasting-identity";

const DIGEST_MAX_ITEMS: Record<ForecastDigestPeriod, number> = {
  DAILY:     3,
  WEEKLY:    5,
  MONTHLY:   6,
  QUARTERLY: 8,
  ANNUAL:    10,
};

export function buildForecastDigest(
  orgSlug: string,
  sessionId: string,
  period: ForecastDigestPeriod,
  forecastScore: number,
  confidence: ForecastConfidence,
  scenarios: ForecastScenario[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  limitations: string[]
): ForecastDigest {
  try {
    const max = DIGEST_MAX_ITEMS[period] ?? 5;

    const headline = buildDigestHeadline(period, forecastScore, confidence.level);
    const highlights = buildDigestHighlights(scenarios, risks, opportunities, max);
    const watchItems = risks.slice(0, 3).map((r) => r.title);
    const scenarioTitles = scenarios.slice(0, max).map((s) => `${s.title} (${(s.probability * 100).toFixed(0)}%)`);
    const topRisk        = risks[0]?.title ?? "Sin riesgos proyectados";
    const topOpportunity = opportunities[0]?.title ?? "Sin oportunidades proyectadas";

    return {
      id:             generateForecastDigestId(),
      orgSlug,
      sessionId,
      period,
      headline,
      highlights,
      watchItems,
      scenarios:      scenarioTitles,
      topRisk,
      topOpportunity,
      confidence:     confidence.level,
      limitations:    limitations.slice(0, 4),
      createdAt:      new Date().toISOString(),
    };
  } catch {
    return buildEmptyForecastDigest(orgSlug, sessionId, period);
  }
}

function buildDigestHeadline(
  period: ForecastDigestPeriod,
  score: number,
  confidenceLevel: ForecastConfidenceLevel
): string {
  const label =
    score >= 0.75 ? "panorama favorable" :
    score >= 0.55 ? "perspectiva moderada" :
    score >= 0.35 ? "presiones identificadas" :
    "entorno adverso proyectado";

  const confLabel =
    confidenceLevel === "VERY_HIGH" ? "alta confianza" :
    confidenceLevel === "HIGH"      ? "confianza razonable" :
    confidenceLevel === "MEDIUM"    ? "confianza moderada" :
    "confianza limitada";

  return `[${period}] Proyección estratégica — ${label} con ${confLabel}`;
}

function buildDigestHighlights(
  scenarios: ForecastScenario[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  max: number
): string[] {
  const items: string[] = [];
  const topScenario = scenarios.find((s) => s.type === "EXPECTED_CASE");
  if (topScenario) {
    items.push(`Escenario base: ${topScenario.title} (prob. ${(topScenario.probability * 100).toFixed(0)}%)`);
  }
  const critRisks = risks.filter((r) => r.compositeRisk >= 0.7);
  if (critRisks.length > 0) {
    items.push(`${critRisks.length} riesgo(s) de alta criticidad proyectados`);
  }
  const transOpp = opportunities.filter((o) => o.isTransformational);
  if (transOpp.length > 0) {
    items.push(`${transOpp.length} oportunidad(es) transformacional(es) identificadas`);
  }
  return items.slice(0, max);
}

export function buildForecastDigestForAllPeriods(
  orgSlug: string,
  sessionId: string,
  forecastScore: number,
  confidence: ForecastConfidence,
  scenarios: ForecastScenario[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  limitations: string[],
  period: ForecastDigestPeriod = "WEEKLY"
): ForecastDigest {
  return buildForecastDigest(
    orgSlug, sessionId, period,
    forecastScore, confidence,
    scenarios, risks, opportunities,
    limitations
  );
}

function buildEmptyForecastDigest(
  orgSlug: string,
  sessionId: string,
  period: ForecastDigestPeriod
): ForecastDigest {
  return {
    id:             generateForecastDigestId(),
    orgSlug,
    sessionId,
    period,
    headline:       "Digest no disponible",
    highlights:     [],
    watchItems:     [],
    scenarios:      [],
    topRisk:        "No disponible",
    topOpportunity: "No disponible",
    confidence:     "INSUFFICIENT",
    limitations:    ["Digest vacío"],
    createdAt:      new Date().toISOString(),
  };
}
