// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 14: Main Pipeline Engine

import type {
  StrategicForecastingInput,
  StrategicForecastingResult,
  StrategicForecast,
  ForecastReport,
  ForecastRisk,
  ForecastOpportunity,
  ForecastTrend,
  ForecastSignal,
  ForecastTrajectory,
  ForecastScenario,
  ForecastRecommendation,
  ForecastAssumption,
  ForecastConfidence,
} from "./strategic-forecasting-types";
import {
  generateForecastId,
  generateForecastReportId,
} from "./strategic-forecasting-identity";
import type { RawTrendSignal } from "./trend-engine";
import { identifyTrends, rankTrends } from "./trend-engine";
import type { RawSignalInput } from "./signal-engine";
import { detectSignals, rankSignals } from "./signal-engine";
import type { RawTrajectoryInput } from "./trajectory-engine";
import { buildTrajectories, rankTrajectories } from "./trajectory-engine";
import type { RawForecastRiskSignal } from "./forecast-risk-engine";
import { identifyForecastRisks, rankForecastRisks } from "./forecast-risk-engine";
import type { RawForecastOpportunitySignal } from "./forecast-opportunity-engine";
import { identifyForecastOpportunities, rankForecastOpportunities } from "./forecast-opportunity-engine";
import type { RawScenarioInput } from "./forecast-scenario-engine";
import { buildScenarios, buildDefaultScenarioSet, rankScenariosByProbability } from "./forecast-scenario-engine";
import type { ConfidenceInputs } from "./forecast-confidence-engine";
import { computeForecastConfidence, buildEmptyConfidence } from "./forecast-confidence-engine";
import { extractAssumptions, buildDefaultAssumptions } from "./forecast-assumption-engine";
import type { RawAssumptionInput } from "./forecast-assumption-engine";
import { buildForecastNarrative } from "./forecast-narrative-engine";
import { buildForecastDigest } from "./forecast-digest-engine";
import { buildForecastBriefing } from "./forecast-briefing-engine";

export interface StrategicForecastingContext {
  readonly trendSignals?:       RawTrendSignal[];
  readonly rawSignals?:         RawSignalInput[];
  readonly trajectoryInputs?:   RawTrajectoryInput[];
  readonly riskSignals?:        RawForecastRiskSignal[];
  readonly opportunitySignals?: RawForecastOpportunitySignal[];
  readonly scenarioInputs?:     RawScenarioInput[];
  readonly assumptionInputs?:   RawAssumptionInput[];
  readonly recommendations?:    ForecastRecommendation[];
  readonly moduleCount?:        number;
  readonly includeDigest?:      boolean;
  readonly includeBriefing?:    boolean;
}

export function computeForecastScore(
  trends: ForecastTrend[],
  signals: ForecastSignal[],
  risks: ForecastRisk[],
  opportunities: ForecastOpportunity[],
  confidence: ForecastConfidence
): number {
  try {
    const trendScore = trends.length > 0
      ? trends.reduce((s, t) => s + t.strength, 0) / trends.length
      : 0;

    const signalScore = signals.length > 0
      ? signals.reduce((s, sig) => s + sig.intensity, 0) / signals.length
      : 0;

    const riskPenalty = risks.length > 0
      ? Math.min(0.25, risks.reduce((s, r) => s + r.compositeRisk, 0) / risks.length * 0.25)
      : 0;

    const oppBonus = opportunities.length > 0
      ? Math.min(0.15, opportunities.reduce((s, o) => s + o.magnitude, 0) / opportunities.length * 0.15)
      : 0;

    const base = trendScore * 0.35 + signalScore * 0.35 + confidence.score * 0.30;
    return Math.max(0, Math.min(1, base - riskPenalty + oppBonus));
  } catch {
    return 0;
  }
}

export function runStrategicForecasting(
  input: StrategicForecastingInput,
  ctx: StrategicForecastingContext
): StrategicForecastingResult {
  const errors: string[] = [];

  try {
    const { orgSlug, sessionId, horizon } = input;
    const domain = input.domain ?? "CROSS_DOMAIN";

    // Step 1 — Trends
    let trends: ForecastTrend[] = [];
    try {
      trends = rankTrends(identifyTrends(orgSlug, ctx.trendSignals ?? []));
    } catch (e) {
      errors.push(`trend-engine: ${String(e)}`);
    }

    // Step 2 — Signals
    let signals: ForecastSignal[] = [];
    try {
      signals = rankSignals(detectSignals(orgSlug, ctx.rawSignals ?? []));
    } catch (e) {
      errors.push(`signal-engine: ${String(e)}`);
    }

    // Step 3 — Trajectories
    let trajectories: ForecastTrajectory[] = [];
    try {
      trajectories = rankTrajectories(buildTrajectories(orgSlug, ctx.trajectoryInputs ?? []));
    } catch (e) {
      errors.push(`trajectory-engine: ${String(e)}`);
    }

    // Step 4 — Risks
    let risks: ForecastRisk[] = [];
    try {
      risks = rankForecastRisks(identifyForecastRisks(orgSlug, ctx.riskSignals ?? []));
    } catch (e) {
      errors.push(`forecast-risk-engine: ${String(e)}`);
    }

    // Step 5 — Opportunities
    let opportunities: ForecastOpportunity[] = [];
    try {
      opportunities = rankForecastOpportunities(identifyForecastOpportunities(orgSlug, ctx.opportunitySignals ?? []));
    } catch (e) {
      errors.push(`forecast-opportunity-engine: ${String(e)}`);
    }

    // Step 6 — Assumptions
    let assumptions: ForecastAssumption[] = [];
    try {
      const raw = ctx.assumptionInputs ?? [];
      assumptions = raw.length > 0
        ? extractAssumptions(raw)
        : buildDefaultAssumptions(domain);
    } catch (e) {
      errors.push(`forecast-assumption-engine: ${String(e)}`);
    }

    // Step 7 — Confidence
    let confidence: ForecastConfidence = buildEmptyConfidence();
    try {
      const criticalUnvalidated = assumptions.filter(
        (a) => a.criticality === "CRITICAL" && !a.validated
      ).length;
      const confInputs: ConfidenceInputs = {
        signalCount:          signals.length,
        trendCount:           trends.length,
        trajectoryCount:      trajectories.length,
        scenarioCount:        ctx.scenarioInputs?.length ?? 0,
        evidenceCount:        signals.reduce((c, s) => c + s.evidenceIds.length, 0),
        assumptionCount:      assumptions.length,
        criticalAssumptions:  criticalUnvalidated,
        moduleCount:          ctx.moduleCount ?? 1,
        orgSlug,
      };
      confidence = computeForecastConfidence(confInputs);
    } catch (e) {
      errors.push(`forecast-confidence-engine: ${String(e)}`);
    }

    // Step 8 — Scenarios
    let scenarios: ForecastScenario[] = [];
    try {
      if ((ctx.scenarioInputs ?? []).length > 0) {
        scenarios = rankScenariosByProbability(
          buildScenarios(orgSlug, sessionId, ctx.scenarioInputs ?? [])
        );
      } else {
        scenarios = buildDefaultScenarioSet(orgSlug, sessionId, domain, horizon, confidence);
      }
    } catch (e) {
      errors.push(`forecast-scenario-engine: ${String(e)}`);
    }

    // Step 9 — Forecast score
    const forecastScore = computeForecastScore(trends, signals, risks, opportunities, confidence);

    // Step 10 — Recommendations (pass-through or empty)
    const recommendations: ForecastRecommendation[] = ctx.recommendations ?? [];

    // Step 11 — Narrative
    const limitations = [
      "suggestedOnly: true — proyección orientativa",
      "No constituye garantía de resultados",
    ];
    const narrative = buildForecastNarrative(
      orgSlug, forecastScore, confidence, horizon,
      scenarios, risks, opportunities, trends, assumptions, limitations
    );

    // Step 12 — Digest (optional)
    const digest = ctx.includeDigest
      ? buildForecastDigest(orgSlug, sessionId, "WEEKLY", forecastScore, confidence, scenarios, risks, opportunities, limitations)
      : null;

    // Step 13 — Briefing (optional)
    const briefing = ctx.includeBriefing
      ? buildForecastBriefing(orgSlug, sessionId, "EXECUTIVE", forecastScore, confidence, scenarios, risks, opportunities, recommendations, limitations)
      : null;

    // Step 14 — Report
    const report: ForecastReport = {
      id:              generateForecastReportId(),
      orgSlug,
      sessionId,
      title:           `Proyección Estratégica — ${orgSlug} — ${horizon}`,
      forecastScore,
      confidence,
      scenarios,
      risks,
      opportunities,
      trends,
      signals,
      trajectories,
      recommendations,
      narrative,
      digest,
      briefing,
      limitations,
      createdAt:       new Date().toISOString(),
    };

    // Step 15 — Forecast
    const forecast: StrategicForecast = {
      id:           generateForecastId(),
      orgSlug,
      status:       "ACTIVE",
      horizon,
      domain,
      report,
      forecastScore,
      confidence,
      limitations,
      metadata:     input.metadata ?? {},
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    const status: "SUCCESS" | "PARTIAL" | "FAILED" =
      errors.length === 0 ? "SUCCESS" :
      forecastScore > 0   ? "PARTIAL" :
      "FAILED";

    return {
      orgSlug,
      sessionId,
      forecast,
      report,
      forecastScore,
      confidence,
      status,
      limitations,
      errors,
      createdAt: new Date().toISOString(),
    };
  } catch (e) {
    errors.push(`pipeline: ${String(e)}`);
    return buildFailedForecastingResult(input, errors);
  }
}

function buildFailedForecastingResult(
  input: StrategicForecastingInput,
  errors: string[]
): StrategicForecastingResult {
  const confidence = buildEmptyConfidence();
  const limitations = ["Error crítico en pipeline de forecasting"];

  const report: ForecastReport = {
    id:              generateForecastReportId(),
    orgSlug:         input.orgSlug,
    sessionId:       input.sessionId,
    title:           "Proyección no disponible",
    forecastScore:   0,
    confidence,
    scenarios:       [],
    risks:           [],
    opportunities:   [],
    trends:          [],
    signals:         [],
    trajectories:    [],
    recommendations: [],
    narrative: {
      executive:     "Proyección no disponible.",
      scenarios:     "",
      risks:         "",
      opportunities: "",
      assumptions:   "",
      horizon:       "",
      limitations:   limitations.join("; "),
    },
    digest:          null,
    briefing:        null,
    limitations,
    createdAt:       new Date().toISOString(),
  };

  const forecast: StrategicForecast = {
    id:           generateForecastId(),
    orgSlug:      input.orgSlug,
    status:       "DRAFT",
    horizon:      input.horizon,
    domain:       input.domain ?? "CROSS_DOMAIN",
    report,
    forecastScore: 0,
    confidence,
    limitations,
    metadata:     {},
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };

  return {
    orgSlug:      input.orgSlug,
    sessionId:    input.sessionId,
    forecast,
    report,
    forecastScore: 0,
    confidence,
    status:       "FAILED",
    limitations,
    errors,
    createdAt:    new Date().toISOString(),
  };
}
