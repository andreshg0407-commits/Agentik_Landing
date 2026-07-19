// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 14 — Simulation Advisor Bridge
// Converts simulation results into advisory format compatible with Strategic Advisor.
// NEVER executes. NEVER modifies data.

import type { SimulationResult, SimulationScenario, SimulationRecommendation } from "./strategic-simulation-types";
import type {
  StrategicAdvice, StrategicConcern, StrategicOpportunityAssessment,
  StrategicRecommendation,
} from "../strategic-advisor/strategic-advisor-types";
import { generateSaId, confidenceSaFromScore, prioritySaFromScore } from "../strategic-advisor/strategic-advisor-types";

// ── Main converter ────────────────────────────────────────────────────────────

export interface SimulationAdvisoryOutput {
  readonly concerns:        StrategicConcern[];
  readonly opportunities:   StrategicOpportunityAssessment[];
  readonly recommendations: StrategicRecommendation[];
  readonly advice:          StrategicAdvice[];
  readonly advisorScore:    number;
}

export function convertSimulationToAdvisory(
  result: SimulationResult
): SimulationAdvisoryOutput {
  const concerns        = _extractConcerns(result);
  const opportunities   = _extractOpportunities(result);
  const recommendations = _convertRecommendations(result.recommendations);
  const advice          = _buildAdvice(result);
  const advisorScore    = _computeAdvisorScore(result);

  return { concerns, opportunities, recommendations, advice, advisorScore };
}

// ── Extract concerns from risks ───────────────────────────────────────────────

function _extractConcerns(result: SimulationResult): StrategicConcern[] {
  const concerns: StrategicConcern[] = [];
  const now = new Date().toISOString();

  for (const scenario of result.scenarios) {
    for (const risk of scenario.risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH").slice(0, 2)) {
      concerns.push({
        id:             generateSaId("concern"),
        orgSlug:        result.orgSlug,
        title:          `[Simulado] ${risk.title}`,
        description:    risk.description,
        domain:         risk.domain,
        severity:       risk.level === "CRITICAL" ? "CRITICAL" : "HIGH",
        confidence:     confidenceSaFromScore(risk.compositeRisk),
        confidenceScore: risk.compositeRisk,
        isEmergent:     false,
        isLatent:       true,
        rationale:      `Riesgo proyectado en simulación ${scenario.variant}. Probabilidad: ${risk.likelihood.toFixed(2)}, Impacto: ${risk.impact.toFixed(2)}.`,
        evidenceIds:    risk.evidenceIds,
        relatedGoals:   [],
        metadata:       { source: "SIMULATION", scenarioId: scenario.id, riskId: risk.id },
        detectedAt:     now,
      });
    }
  }

  return concerns;
}

// ── Extract opportunities ─────────────────────────────────────────────────────

function _extractOpportunities(result: SimulationResult): StrategicOpportunityAssessment[] {
  const opps: StrategicOpportunityAssessment[] = [];

  for (const scenario of result.scenarios.filter((s) => s.variant === "OPTIMISTIC" || s.variant === "CONSERVATIVE")) {
    for (const opp of scenario.opportunities.slice(0, 2)) {
      opps.push({
        id:             generateSaId("opp"),
        orgSlug:        result.orgSlug,
        title:          `[Simulado] ${opp.title}`,
        description:    opp.description,
        domain:         opp.domain,
        magnitude:      opp.magnitude,
        confidence:     confidenceSaFromScore(opp.confidenceScore),
        confidenceScore: opp.confidenceScore,
        captureScore:   opp.captureScore,
        timeHorizon:    opp.timeHorizon,
        isIgnored:      false,
        rationale:      `Oportunidad proyectada en simulación ${scenario.variant}.`,
        evidenceIds:    opp.evidenceIds,
        metadata:       { source: "SIMULATION", scenarioId: scenario.id, oppId: opp.id },
      });
    }
  }

  return opps;
}

// ── Convert recommendations ───────────────────────────────────────────────────

function _convertRecommendations(simRecs: SimulationRecommendation[]): StrategicRecommendation[] {
  return simRecs.slice(0, 5).map((r) => ({
    id:              generateSaId("rec"),
    orgSlug:         r.orgSlug,
    title:           r.title,
    description:     r.description,
    rationale:       r.rationale,
    domain:          r.domain,
    priority:        r.priority,
    confidence:      confidenceSaFromScore(r.confidenceScore),
    confidenceScore: r.confidenceScore,
    expectedImpact:  r.expectedImpact,
    associatedRisks: r.associatedRisks,
    evidenceIds:     r.evidenceIds,
    playbookIds:     [],
    suggestedOnly:   true as const,
    metadata:        { ...r.metadata, source: "SIMULATION_ADVISORY" },
  }));
}

// ── Build advice ──────────────────────────────────────────────────────────────

function _buildAdvice(result: SimulationResult): StrategicAdvice[] {
  if (result.scenarios.length === 0) return [];

  const best = [...result.scenarios].sort((a, b) => b.confidenceScore - a.confidenceScore)[0];
  const score = _computeAdvisorScore(result);

  return [{
    id:             generateSaId("advice"),
    orgSlug:        result.orgSlug,
    title:          `Asesoría estratégica desde simulación: ${best.name}`,
    body:           `${best.narrative.executive}\n\nPrincipal precaución: ${best.narrative.keyCaution}\nPrincipal fortaleza: ${best.narrative.keyStrength}\n\nLimitaciones: ${result.limitations.join(". ")}`,
    summary:        best.narrative.executive.split(".")[0] + ".",
    domain:         best.domain,
    priority:       prioritySaFromScore(score),
    confidence:     confidenceSaFromScore(score),
    confidenceScore: score,
    traceable:      true,
    evidenceIds:    [],
    metadata:       { source: "SIMULATION_ADVISORY", simulationRunId: result.runId },
    generatedAt:    new Date().toISOString(),
  }];
}

// ── Score ─────────────────────────────────────────────────────────────────────

function _computeAdvisorScore(result: SimulationResult): number {
  if (result.scenarios.length === 0) return 0;
  const avg = result.scenarios.reduce((s, sc) => s + sc.confidenceScore, 0) / result.scenarios.length;
  const warningPenalty = Math.min(0.20, result.warnings.length * 0.05);
  return Math.max(0, Math.round((avg - warningPenalty) * 100) / 100);
}
