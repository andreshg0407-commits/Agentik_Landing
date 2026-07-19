// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 9 — Scenario Builder
// Builds, clones, and validates simulation scenarios.
// NEVER executes. NEVER modifies data.

import type {
  SimulationScenario, SimulationScenarioVariant, SimulationCategory,
  SimulationAssumption, SimulationConstraint, SimulationVariable,
  SimulationImpact, SimulationRisk, SimulationOpportunity,
  SimulationRecommendation, SimulationNarrative,
} from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import {
  simulationConfidenceFromScore, simulationRiskLevelFromScore, simulationImpactLevelFromScore,
} from "./strategic-simulation-types";
import { generateScenarioId } from "./strategic-simulation-identity";
import { aggregateAssumptionConfidence } from "./assumption-engine";
import { aggregateRiskScore } from "./risk-projection-engine";
import { aggregateImpactScore } from "./impact-engine";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildScenario(params: {
  name:            string;
  description:     string;
  variant:         SimulationScenarioVariant;
  category:        SimulationCategory;
  domain:          StrategicDomain;
  orgSlug:         string;
  assumptions:     SimulationAssumption[];
  constraints:     SimulationConstraint[];
  variables:       SimulationVariable[];
  impacts:         SimulationImpact[];
  risks:           SimulationRisk[];
  opportunities:   SimulationOpportunity[];
  recommendations: SimulationRecommendation[];
  narrative:       SimulationNarrative;
  metadata?:       Record<string, unknown>;
}): SimulationScenario {
  const assumptConf  = aggregateAssumptionConfidence(params.assumptions);
  const riskScore    = aggregateRiskScore(params.risks);
  const impactScore  = aggregateImpactScore(params.impacts);

  const confidenceScore = Math.round((assumptConf * 0.60 + (1 - riskScore) * 0.40) * 100) / 100;

  return {
    id:              generateScenarioId(),
    orgSlug:         params.orgSlug,
    name:            params.name,
    description:     params.description,
    variant:         params.variant,
    category:        params.category,
    domain:          params.domain,
    assumptions:     params.assumptions,
    constraints:     params.constraints,
    variables:       params.variables,
    impacts:         params.impacts,
    risks:           params.risks,
    opportunities:   params.opportunities,
    recommendations: params.recommendations,
    narrative:       params.narrative,
    confidence:      simulationConfidenceFromScore(confidenceScore),
    confidenceScore,
    overallRisk:     simulationRiskLevelFromScore(riskScore),
    overallImpact:   simulationImpactLevelFromScore(impactScore),
    metadata:        params.metadata ?? {},
    simulatedAt:     new Date().toISOString(),
  };
}

// ── Clone ─────────────────────────────────────────────────────────────────────

export function cloneScenario(
  base: SimulationScenario,
  overrides: {
    name?:    string;
    variant?: SimulationScenarioVariant;
    orgSlug?: string;
  }
): SimulationScenario {
  return {
    ...base,
    id:         generateScenarioId(),
    name:       overrides.name    ?? `${base.name} (copia)`,
    variant:    overrides.variant ?? base.variant,
    orgSlug:    overrides.orgSlug ?? base.orgSlug,
    simulatedAt: new Date().toISOString(),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ScenarioValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateScenario(s: SimulationScenario): ScenarioValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!s.name || s.name.trim().length === 0) errors.push("Scenario name required");
  if (!s.orgSlug || s.orgSlug.trim().length === 0) errors.push("orgSlug required");
  if (s.assumptions.length === 0) warnings.push("No assumptions declared — simulation reliability is limited");
  if (s.variables.length === 0)   warnings.push("No variables — scenario is purely qualitative");
  if (s.constraints.some((c) => c.type === "HARD" && c.isViolated)) {
    errors.push("Hard constraint violated — scenario is infeasible");
  }

  return { valid: errors.length === 0, warnings, errors };
}

// ── Score ─────────────────────────────────────────────────────────────────────

export function scoreScenario(s: SimulationScenario): number {
  const riskPenalty = s.overallRisk === "CRITICAL" ? 0.30
    : s.overallRisk === "HIGH" ? 0.15
    : s.overallRisk === "MODERATE" ? 0.05
    : 0;
  const variantBoost = s.variant === "OPTIMISTIC" ? 0.10
    : s.variant === "PESSIMISTIC" ? -0.10
    : 0;
  return Math.min(1, Math.max(0, Math.round((s.confidenceScore + variantBoost - riskPenalty) * 100) / 100));
}
