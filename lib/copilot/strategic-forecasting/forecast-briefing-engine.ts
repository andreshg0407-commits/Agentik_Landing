// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 13: Briefing Engine
// Types: CEO | EXECUTIVE | BOARD | RISK | GROWTH

import type {
  ForecastBriefing,
  ForecastBriefingType,
  ForecastScenario,
  ForecastRisk,
  ForecastOpportunity,
  ForecastRecommendation,
  ForecastConfidence,
  ForecastConfidenceLevel,
} from "./strategic-forecasting-types";
import { generateForecastBriefingId } from "./strategic-forecasting-identity";

interface BriefingConfig {
  readonly maxFindings:       number;
  readonly maxScenarios:      number;
  readonly maxRisks:          number;
  readonly maxOpportunities:  number;
  readonly maxRecommendations: number;
}

const BRIEFING_CONFIGS: Record<ForecastBriefingType, BriefingConfig> = {
  CEO:       { maxFindings: 4, maxScenarios: 3, maxRisks: 3, maxOpportunities: 3, maxRecommendations: 4 },
  EXECUTIVE: { maxFindings: 6, maxScenarios: 4, maxRisks: 5, maxOpportunities: 4, maxRecommendations: 5 },
  BOARD:     { maxFindings: 5, maxScenarios: 4, maxRisks: 4, maxOpportunities: 3, maxRecommendations: 4 },
  RISK:      { maxFindings: 8, maxScenarios: 3, maxRisks: 8, maxOpportunities: 2, maxRecommendations: 6 },
  GROWTH:    { maxFindings: 5, maxScenarios: 4, maxRisks: 3, maxOpportunities: 6, maxRecommendations: 5 },
};

export function buildForecastBriefing(
  orgSlug: string,
  sessionId: string,
  type: ForecastBriefingType,
  forecastScore: number,
  confidence: ForecastConfidence,
  scenarios: ForecastScenario[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  recommendations: ForecastRecommendation[],
  limitations: string[]
): ForecastBriefing {
  try {
    const cfg = BRIEFING_CONFIGS[type];
    const title   = buildBriefingTitle(type, orgSlug, forecastScore);
    const summary = buildBriefingSummary(type, forecastScore, confidence.level, scenarios.length, risks.length);

    const keyFindings       = buildBriefingFindings(type, scenarios, risks, opportunities, cfg.maxFindings);
    const scenarioTitles    = scenarios.slice(0, cfg.maxScenarios).map((s) => s.title);
    const riskTitles        = risks.slice(0, cfg.maxRisks).map((r) => r.title);
    const opportunityTitles = opportunities.slice(0, cfg.maxOpportunities).map((o) => o.title);
    const recTitles         = recommendations.slice(0, cfg.maxRecommendations).map((r) => r.title);

    return {
      id:              generateForecastBriefingId(),
      orgSlug,
      sessionId,
      type,
      title,
      summary,
      keyFindings,
      scenarios:       scenarioTitles,
      risks:           riskTitles,
      opportunities:   opportunityTitles,
      recommendations: recTitles,
      confidence:      confidence.level,
      limitations:     limitations.slice(0, 5),
      createdAt:       new Date().toISOString(),
    };
  } catch {
    return buildEmptyForecastBriefing(orgSlug, sessionId, type);
  }
}

function buildBriefingTitle(
  type: ForecastBriefingType,
  orgSlug: string,
  score: number
): string {
  const labels: Record<ForecastBriefingType, string> = {
    CEO:       "Resumen Ejecutivo CEO — Proyección Estratégica",
    EXECUTIVE: "Briefing Ejecutivo — Proyección Estratégica",
    BOARD:     "Briefing de Junta Directiva — Proyección Estratégica",
    RISK:      "Briefing de Riesgos — Proyección Estratégica",
    GROWTH:    "Briefing de Crecimiento — Proyección Estratégica",
  };
  const qualifier =
    score >= 0.7 ? "Perspectiva Favorable" :
    score >= 0.5 ? "Perspectiva Moderada"  :
    "Perspectiva con Presiones";
  return `${labels[type] ?? "Briefing Estratégico"} — ${qualifier}`;
}

function buildBriefingSummary(
  type: ForecastBriefingType,
  score: number,
  confLevel: ForecastConfidenceLevel,
  scenarioCount: number,
  riskCount: number
): string {
  const confLabel =
    confLevel === "VERY_HIGH" ? "alta confianza" :
    confLevel === "HIGH"      ? "confianza razonable" :
    confLevel === "MEDIUM"    ? "confianza moderada" :
    "confianza limitada";

  return (
    `Este briefing de tipo ${type} presenta una síntesis de la proyección estratégica ` +
    `con score ${(score * 100).toFixed(0)}% y ${confLabel}. ` +
    `Incluye ${scenarioCount} escenario(s) y ${riskCount} riesgo(s) proyectados. ` +
    `De carácter orientativo — no constituye recomendación de ejecución.`
  );
}

function buildBriefingFindings(
  type: ForecastBriefingType,
  scenarios: ForecastScenario[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  max: number
): string[] {
  const findings: string[] = [];

  const expected = scenarios.find((s) => s.type === "EXPECTED_CASE");
  if (expected) findings.push(`Escenario base: ${expected.title}`);

  if (type === "RISK" || type === "BOARD") {
    const critRisks = risks.filter((r) => r.compositeRisk >= 0.7);
    if (critRisks.length > 0) findings.push(`${critRisks.length} riesgo(s) de alta criticidad proyectados`);
    const systemic = risks.filter((r) => r.isSystemic);
    if (systemic.length > 0) findings.push(`${systemic.length} riesgo(s) sistémico(s) identificados`);
  }

  if (type === "GROWTH" || type === "CEO" || type === "EXECUTIVE") {
    const trans = opportunities.filter((o) => o.isTransformational);
    if (trans.length > 0) findings.push(`${trans.length} oportunidad(es) transformacional(es)`);
  }

  const blackSwans = scenarios.filter((s) => s.type === "BLACK_SWAN_CANDIDATE");
  if (blackSwans.length > 0) findings.push(`${blackSwans.length} escenario(s) de cola identificados`);

  return findings.slice(0, max);
}

function buildEmptyForecastBriefing(
  orgSlug: string,
  sessionId: string,
  type: ForecastBriefingType
): ForecastBriefing {
  return {
    id:              generateForecastBriefingId(),
    orgSlug,
    sessionId,
    type,
    title:           "Briefing no disponible",
    summary:         "",
    keyFindings:     [],
    scenarios:       [],
    risks:           [],
    opportunities:   [],
    recommendations: [],
    confidence:      "INSUFFICIENT",
    limitations:     ["Briefing vacío"],
    createdAt:       new Date().toISOString(),
  };
}
