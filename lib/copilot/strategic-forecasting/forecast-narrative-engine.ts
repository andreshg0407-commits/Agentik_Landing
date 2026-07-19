// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 11: Narrative Engine
// Probabilistic language only — never absolute predictions. Spanish board narrative.

import type {
  ForecastNarrative,
  ForecastScenario,
  ForecastRisk,
  ForecastOpportunity,
  ForecastTrend,
  ForecastAssumption,
  ForecastConfidence,
  ForecastHorizon,
} from "./strategic-forecasting-types";

const HORIZON_LABELS: Record<ForecastHorizon, string> = {
  SHORT_TERM:  "corto plazo (≤30 días)",
  MEDIUM_TERM: "mediano plazo (1–6 meses)",
  LONG_TERM:   "largo plazo (6+ meses)",
};

export function buildForecastExecutiveNarrative(
  orgSlug: string,
  forecastScore: number,
  confidence: ForecastConfidence,
  horizon: ForecastHorizon,
  scenarioCount: number,
  riskCount: number,
  opportunityCount: number
): string {
  try {
    const level     = confidence.level;
    const horizonLbl = HORIZON_LABELS[horizon] ?? horizon;
    const scoreLabel =
      forecastScore >= 0.75 ? "favorable"      :
      forecastScore >= 0.55 ? "moderado"        :
      forecastScore >= 0.35 ? "con presiones"   :
      "bajo presión significativa";

    const confLabel =
      level === "VERY_HIGH" ? "alta confianza" :
      level === "HIGH"      ? "confianza razonable" :
      level === "MEDIUM"    ? "confianza moderada" :
      level === "LOW"       ? "confianza limitada" :
      "datos insuficientes";

    return (
      `El análisis proyectivo de ${orgSlug} para el ${horizonLbl} sugiere un panorama ${scoreLabel} ` +
      `con ${confLabel} (score ${(forecastScore * 100).toFixed(0)}%). ` +
      `Se han identificado ${scenarioCount} escenario(s) proyectivos, ${riskCount} riesgo(s) potencial(es) ` +
      `y ${opportunityCount} oportunidad(es) probable(s). ` +
      `Esta proyección es de carácter orientativo y no constituye garantía de resultados.`
    );
  } catch {
    return "Proyección estratégica no disponible.";
  }
}

export function buildScenariosNarrative(
  scenarios: ForecastScenario[]
): string {
  try {
    if (scenarios.length === 0) return "No se han identificado escenarios proyectivos con datos suficientes.";
    const parts = scenarios
      .slice(0, 4)
      .map((s) => `${s.title} (probabilidad estimada: ${(s.probability * 100).toFixed(0)}%)`);
    return (
      `Los escenarios proyectivos analizados incluyen: ${parts.join("; ")}. ` +
      `Cada escenario incorpora supuestos explícitos y está sujeto a revisión conforme evolucionen los indicadores.`
    );
  } catch {
    return "Escenarios no disponibles.";
  }
}

export function buildRisksNarrative(risks: ForecastRisk[]): string {
  try {
    if (risks.length === 0) return "No se han proyectado riesgos materiales en el horizonte analizado.";
    const top = risks.slice(0, 3).map((r) => r.title);
    const systemic = risks.filter((r) => r.isSystemic).length;
    return (
      `Los riesgos proyectados de mayor relevancia son: ${top.join(", ")}. ` +
      (systemic > 0 ? `${systemic} de ellos presentan características sistémicas. ` : "") +
      `Su materialización depende de condiciones aún inciertas y podría mitigarse con las acciones preventivas señaladas.`
    );
  } catch {
    return "Análisis de riesgos no disponible.";
  }
}

export function buildOpportunitiesNarrative(opportunities: ForecastOpportunity[]): string {
  try {
    if (opportunities.length === 0) return "No se han identificado oportunidades proyectivas con datos suficientes.";
    const top = opportunities.slice(0, 3).map((o) => o.title);
    return (
      `Las oportunidades proyectadas más relevantes son: ${top.join(", ")}. ` +
      `Su captura está condicionada a la disponibilidad de recursos, alineación estratégica y condiciones del entorno.`
    );
  } catch {
    return "Oportunidades no disponibles.";
  }
}

export function buildAssumptionsNarrative(
  assumptions: ForecastAssumption[]
): string {
  try {
    if (assumptions.length === 0) return "No se han declarado supuestos explícitos para esta proyección.";
    const critical = assumptions.filter((a) => a.criticality === "CRITICAL");
    const unvalidated = assumptions.filter((a) => !a.validated).length;
    const criticalTexts = critical.slice(0, 2).map((a) => `"${a.description}"`);
    return (
      `Esta proyección descansa sobre ${assumptions.length} supuesto(s), ` +
      (critical.length > 0 ? `incluyendo ${critical.length} crítico(s): ${criticalTexts.join(", ")}. ` : ". ") +
      (unvalidated > 0 ? `${unvalidated} supuesto(s) aún no validado(s). ` : "") +
      `La invalidación de supuestos críticos podría alterar materialmente los escenarios proyectados.`
    );
  } catch {
    return "Supuestos no disponibles.";
  }
}

export function buildHorizonNarrative(
  horizon: ForecastHorizon,
  trends: ForecastTrend[]
): string {
  try {
    const horizonLbl = HORIZON_LABELS[horizon] ?? horizon;
    const emergent = trends.filter((t) => t.isEmergent).length;
    return (
      `El análisis cubre el ${horizonLbl}. ` +
      `Se han identificado ${trends.length} tendencia(s) relevante(s)` +
      (emergent > 0 ? `, ${emergent} de las cuales son emergentes y requieren monitoreo activo.` : ".") +
      ` Las tendencias proyectadas están sujetas a cambios ante alteraciones en el entorno.`
    );
  } catch {
    return "Horizonte temporal no disponible.";
  }
}

export function buildLimitationsNarrative(limitations: string[]): string {
  try {
    if (limitations.length === 0) {
      return "Esta proyección es de carácter orientativo. No constituye asesoramiento financiero ni garantía de resultados.";
    }
    return (
      `Limitaciones de esta proyección: ${limitations.slice(0, 4).join("; ")}. ` +
      `Toda proyección estratégica tiene incertidumbre inherente.`
    );
  } catch {
    return "Proyección con limitaciones no determinadas.";
  }
}

export function buildForecastNarrative(
  orgSlug: string,
  forecastScore: number,
  confidence: ForecastConfidence,
  horizon: ForecastHorizon,
  scenarios: ForecastScenario[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  trends: ForecastTrend[],
  assumptions: ForecastAssumption[],
  limitations: string[]
): ForecastNarrative {
  try {
    return {
      executive:    buildForecastExecutiveNarrative(orgSlug, forecastScore, confidence, horizon, scenarios.length, risks.length, opportunities.length),
      scenarios:    buildScenariosNarrative(scenarios),
      risks:        buildRisksNarrative(risks),
      opportunities: buildOpportunitiesNarrative(opportunities),
      assumptions:  buildAssumptionsNarrative(assumptions),
      horizon:      buildHorizonNarrative(horizon, trends),
      limitations:  buildLimitationsNarrative(limitations),
    };
  } catch {
    return {
      executive:    "Narrativa ejecutiva no disponible.",
      scenarios:    "Escenarios no disponibles.",
      risks:        "Riesgos no disponibles.",
      opportunities: "Oportunidades no disponibles.",
      assumptions:  "Supuestos no disponibles.",
      horizon:      "Horizonte no disponible.",
      limitations:  "Limitaciones no disponibles.",
    };
  }
}
