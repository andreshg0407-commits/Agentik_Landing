// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 42: Enterprise Trajectory Engine

import type {
  ForecastTrajectory,
  ForecastDomain,
  ForecastHorizon,
  ForecastTrend,
  ForecastSignal,
  ForecastRisk,
  ForecastOpportunity,
  ForecastConfidence,
} from "./strategic-forecasting-types";
import { buildTrajectory } from "./trajectory-engine";
import { buildEmptyConfidence } from "./forecast-confidence-engine";

export interface EnterpriseTrajectoryInput {
  readonly orgSlug:      string;
  readonly horizon:      ForecastHorizon;
  readonly trends:       ForecastTrend[];
  readonly signals:      ForecastSignal[];
  readonly risks:        ForecastRisk[];
  readonly opportunities: ForecastOpportunity[];
  readonly confidence:   ForecastConfidence;
}

export function buildEnterpriseTrajectory(
  input: EnterpriseTrajectoryInput
): ForecastTrajectory {
  try {
    const { orgSlug, horizon, trends, signals, risks, opportunities, confidence } = input;

    const avgTrendStrength = trends.length > 0
      ? trends.reduce((s, t) => s + t.strength, 0) / trends.length
      : 0.5;

    const avgSignalIntensity = signals.length > 0
      ? signals.reduce((s, sig) => s + sig.intensity, 0) / signals.length
      : 0.5;

    const riskPenalty = risks.length > 0
      ? Math.min(0.20, risks.reduce((s, r) => s + r.compositeRisk, 0) / risks.length * 0.20)
      : 0;

    const oppBonus = opportunities.length > 0
      ? Math.min(0.10, opportunities.reduce((s, o) => s + o.magnitude, 0) / opportunities.length * 0.10)
      : 0;

    const startingScore = (avgTrendStrength + avgSignalIntensity) / 2;
    const projectedScore = Math.max(0, Math.min(1, startingScore - riskPenalty + oppBonus));

    const direction =
      projectedScore > startingScore + 0.1 ? "GROWING"     :
      projectedScore < startingScore - 0.1 ? "DECLINING"   :
      "STABLE";

    return buildTrajectory(orgSlug, {
      title:           "Trayectoria Empresarial General",
      description:     "Proyección de trayectoria global de la organización para el horizonte analizado",
      domain:          "CROSS_DOMAIN",
      horizon,
      direction,
      startingScore,
      projectedScore,
      confidenceScore: confidence.score,
      keyDrivers:      trends.slice(0, 3).map((t) => t.title),
      barriers:        risks.slice(0, 3).map((r) => r.title),
      assumptions:     [],
      evidenceIds:     [],
    });
  } catch {
    return buildEmptyEnterpriseTrajectory(input.orgSlug, input.horizon);
  }
}

export function buildGrowthTrajectory(
  orgSlug: string,
  horizon: ForecastHorizon,
  opportunities: ForecastOpportunity[],
  confidence: ForecastConfidence
): ForecastTrajectory {
  try {
    const avgMagnitude = opportunities.length > 0
      ? opportunities.reduce((s, o) => s + o.magnitude, 0) / opportunities.length
      : 0;

    const starting = 0.5;
    const projected = Math.min(1, starting + avgMagnitude * 0.3);

    return buildTrajectory(orgSlug, {
      title:           "Trayectoria de Crecimiento",
      description:     "Proyección de capacidad de captura de oportunidades de crecimiento",
      domain:          "FINANCIAL",
      horizon,
      direction:       projected > starting ? "GROWING" : "STABLE",
      startingScore:   starting,
      projectedScore:  projected,
      confidenceScore: confidence.score,
      keyDrivers:      opportunities.slice(0, 3).map((o) => o.title),
      barriers:        [],
      assumptions:     [],
      evidenceIds:     [],
    });
  } catch {
    return buildEmptyEnterpriseTrajectory(orgSlug, horizon);
  }
}

export function buildRiskTrajectory(
  orgSlug: string,
  horizon: ForecastHorizon,
  risks: ForecastRisk[],
  confidence: ForecastConfidence
): ForecastTrajectory {
  try {
    const avgRisk = risks.length > 0
      ? risks.reduce((s, r) => s + r.compositeRisk, 0) / risks.length
      : 0;

    const starting   = 0.5;
    const projected  = Math.max(0, starting - avgRisk * 0.4);
    const direction  = projected < starting - 0.05 ? "DECLINING" : "STABLE";

    return buildTrajectory(orgSlug, {
      title:           "Trayectoria de Exposición al Riesgo",
      description:     "Proyección de exposición neta al riesgo en el horizonte analizado",
      domain:          "RISK",
      horizon,
      direction,
      startingScore:   starting,
      projectedScore:  projected,
      confidenceScore: confidence.score,
      keyDrivers:      [],
      barriers:        risks.slice(0, 3).map((r) => r.title),
      assumptions:     [],
      evidenceIds:     [],
    });
  } catch {
    return buildEmptyEnterpriseTrajectory(orgSlug, horizon);
  }
}

export function buildStrategicTrajectory(
  orgSlug: string,
  horizon: ForecastHorizon,
  trends: ForecastTrend[],
  confidence: ForecastConfidence,
  domain: ForecastDomain = "STRATEGIC"
): ForecastTrajectory {
  try {
    const emergent    = trends.filter((t) => t.isEmergent);
    const accelerating = trends.filter((t) => t.direction === "ACCELERATING");
    const avgStrength = trends.length > 0
      ? trends.reduce((s, t) => s + t.strength, 0) / trends.length
      : 0.5;

    const bonus       = Math.min(0.15, emergent.length * 0.03 + accelerating.length * 0.04);
    const starting    = avgStrength;
    const projected   = Math.min(1, starting + bonus);
    const direction   = projected > starting + 0.05 ? "GROWING" :
                        projected < starting - 0.05 ? "DECLINING" : "STABLE";

    return buildTrajectory(orgSlug, {
      title:           "Trayectoria Estratégica",
      description:     "Proyección de posicionamiento estratégico para el horizonte analizado",
      domain,
      horizon,
      direction,
      startingScore:   starting,
      projectedScore:  projected,
      confidenceScore: confidence.score,
      keyDrivers:      trends.filter((t) => t.isEmergent).slice(0, 3).map((t) => t.title),
      barriers:        [],
      assumptions:     [],
      evidenceIds:     [],
    });
  } catch {
    return buildEmptyEnterpriseTrajectory(orgSlug, horizon);
  }
}

function buildEmptyEnterpriseTrajectory(
  orgSlug: string,
  horizon: ForecastHorizon
): ForecastTrajectory {
  return buildTrajectory(orgSlug, {
    title:           "Trayectoria empresarial no disponible",
    description:     "",
    domain:          "CROSS_DOMAIN",
    horizon,
    direction:       "STABLE",
    startingScore:   0,
    projectedScore:  0,
    confidenceScore: 0,
    keyDrivers:      [],
    barriers:        [],
    assumptions:     [],
    evidenceIds:     [],
  });
}
