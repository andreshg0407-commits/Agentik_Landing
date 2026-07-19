// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 10 — Strategic Simulation Engine
// Main pipeline: Input → Assumptions → Constraints → Variables → Scenario → Impact → Risk → Opportunity → Outcome
// NEVER executes. NEVER modifies data. Fail-closed.

import type {
  SimulationInput, SimulationResult, SimulationScenario, SimulationOutcome,
  SimulationScenarioVariant,
} from "./strategic-simulation-types";
import { generateSimId, generateOutcomeId } from "./strategic-simulation-identity";
import {
  buildDefaultAssumptions, rankAssumptions, aggregateAssumptionConfidence,
  validateAssumption,
} from "./assumption-engine";
import { buildDefaultConstraints, validateConstraints } from "./constraint-engine";
import { buildDefaultVariables, applyVariantToVariable } from "./variable-engine";
import { calculateImpact, calculateBusinessImpact, aggregateImpactScore } from "./impact-engine";
import { projectRisks, rankProjectedRisks, aggregateRiskScore, getOverallRiskLevel } from "./risk-projection-engine";
import { projectOpportunities, rankProjectedOpportunities } from "./opportunity-projection-engine";
import { buildScenario } from "./scenario-builder";
import { generateSimulationRecommendations } from "./simulation-recommendation-engine";
import { buildSimulationNarrative } from "./simulation-narrative-engine";
import {
  simulationConfidenceFromScore, simulationImpactLevelFromScore,
} from "./strategic-simulation-types";

// ── Engine input ──────────────────────────────────────────────────────────────

export interface StrategicSimulationEngineInput {
  readonly orgSlug:    string;
  readonly input:      SimulationInput;
  // Optional override data sources
  readonly externalAssumptions?: ReturnType<typeof buildDefaultAssumptions>;
  readonly externalConstraints?: ReturnType<typeof buildDefaultConstraints>;
  readonly externalVariables?:   ReturnType<typeof buildDefaultVariables>;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runSimulation(engineInput: StrategicSimulationEngineInput): SimulationResult {
  const runId  = generateSimId();
  const start  = Date.now();
  const { orgSlug, input } = engineInput;

  try {
    // 1. Enforce tenant boundary
    if (!orgSlug || orgSlug.trim().length === 0) {
      return _fail(runId, orgSlug, "orgSlug is required", start);
    }

    const domain    = input.domain ?? "CROSS_DOMAIN";
    const category  = input.category ?? "EXECUTIVE";
    const variants: SimulationScenarioVariant[] = input.variants ?? ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"];

    // 2. Build assumptions
    const baseAssumptions = engineInput.externalAssumptions ?? buildDefaultAssumptions(domain);
    const mergedAssumptions = [
      ...baseAssumptions,
      ...(input.userAssumptions?.map((a) => ({
        id:             `assump_user_${Date.now()}`,
        label:          a.label ?? "Custom assumption",
        description:    a.description ?? "",
        domain,
        confidence:     simulationConfidenceFromScore(a.confidenceScore ?? 0.5),
        confidenceScore: a.confidenceScore ?? 0.5,
        isKeyAssumption: a.isKeyAssumption ?? false,
        validUntil:     a.validUntil ?? "MEDIUM_TERM" as const,
        source:         a.source ?? "USER" as const,
        metadata:       a.metadata ?? {},
      })) ?? []),
    ];
    const rankedAssumptions = rankAssumptions(mergedAssumptions);
    const assumptWarnings   = mergedAssumptions.flatMap((a) => validateAssumption(a).warnings);

    // 3. Build constraints
    const baseConstraints = engineInput.externalConstraints ?? buildDefaultConstraints(domain);
    const allConstraints  = [...baseConstraints, ...(input.userConstraints?.map((c) => ({
      id:          `constr_user_${Date.now()}`,
      label:       c.label ?? "Custom constraint",
      description: c.description ?? "",
      domain,
      type:        c.type ?? "SOFT" as const,
      origin:      c.origin ?? "USER" as const,
      impact:      c.impact ?? "MODERATE" as const,
      isViolated:  c.isViolated ?? false,
      metadata:    c.metadata ?? {},
    })) ?? [])];
    const constraintResult = validateConstraints(allConstraints);

    // 4. Build variables
    const baseVariables = engineInput.externalVariables ?? buildDefaultVariables(domain);
    const allVariables  = [...baseVariables];

    // 5. Build scenarios for each variant
    const scenarios: SimulationScenario[] = [];
    for (const variant of variants) {
      const variantVariables = allVariables.map((v) => applyVariantToVariable(v, variant));

      const impacts       = calculateImpact({ domain, variables: variantVariables, assumptions: rankedAssumptions, variant });
      const risks         = rankProjectedRisks(projectRisks({ domain, variables: variantVariables, constraints: allConstraints, impacts, variant }));
      const opportunities = rankProjectedOpportunities(projectOpportunities({ domain, variables: variantVariables, impacts, assumptions: rankedAssumptions, variant }));

      const recs      = generateSimulationRecommendations({ orgSlug, domain, variant, risks, opportunities, impacts, confidenceScore: aggregateAssumptionConfidence(rankedAssumptions) });
      const narrative = buildSimulationNarrative({ orgSlug, domain, variant, impacts, risks, opportunities, assumptions: rankedAssumptions });

      const scenario = buildScenario({
        name:            `Escenario ${variant} — ${domain}`,
        description:     `Simulación estratégica en escenario ${variant} para el dominio ${domain}.`,
        variant, category, domain, orgSlug,
        assumptions:     rankedAssumptions,
        constraints:     allConstraints,
        variables:       variantVariables,
        impacts, risks, opportunities,
        recommendations: recs,
        narrative,
      });

      scenarios.push(scenario);
    }

    // 6. Build outcomes
    const outcomes: SimulationOutcome[] = scenarios.map((s) => ({
      id:             generateOutcomeId(),
      orgSlug,
      scenarioId:     s.id,
      title:          `Resultado: ${s.name}`,
      description:    s.narrative.executive,
      category,
      domain,
      impacts:        s.impacts,
      risks:          s.risks,
      opportunities:  s.opportunities,
      overallScore:   s.confidenceScore,
      confidence:     s.confidence,
      confidenceScore: s.confidenceScore,
      horizon:        "MEDIUM_TERM",
      metadata:       {},
      computedAt:     new Date().toISOString(),
    }));

    // 7. Aggregate recommendations
    const allRecs = scenarios.flatMap((s) => s.recommendations);
    const seen    = new Set<string>();
    const deduped = allRecs.filter((r) => {
      const key = r.title.substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const warnings    = [...constraintResult.warnings, ...assumptWarnings];
    const limitations = [
      "Esta simulación es hipotética y no constituye un pronóstico",
      "Los resultados dependen de la calidad de los supuestos declarados",
      "No reemplaza el análisis financiero formal ni la asesoría especializada",
    ];

    return {
      status:         "COMPLETED",
      orgSlug,
      scenarios,
      outcomes,
      comparison:     null, // built separately by scenario-comparison-engine
      recommendations: deduped,
      runId,
      durationMs:     Date.now() - start,
      warnings,
      limitations,
    };

  } catch (err) {
    return _fail(runId, orgSlug, err instanceof Error ? err.message : "Unknown error", start);
  }
}

// ── Tenant guard ──────────────────────────────────────────────────────────────

export function enforceSimulationTenantBoundary(orgSlug: string, scenario: SimulationScenario): void {
  if (scenario.orgSlug !== orgSlug) {
    throw new Error(`Tenant boundary violation: scenario belongs to "${scenario.orgSlug}", not "${orgSlug}"`);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _fail(runId: string, orgSlug: string, error: string, start: number): SimulationResult {
  return {
    status:      "FAILED",
    orgSlug,
    scenarios:   [],
    outcomes:    [],
    comparison:  null,
    recommendations: [],
    runId,
    durationMs:  Date.now() - start,
    warnings:    [],
    limitations: [],
    error,
  };
}
