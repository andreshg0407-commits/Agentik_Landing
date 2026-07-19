// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 6 — Impact Engine
// Calculates simulation impacts at business and strategic level.
// NEVER executes. NEVER modifies data.

import type {
  SimulationImpact, SimulationImpactLevel, SimulationVariable,
  SimulationAssumption, SimulationScenarioVariant,
} from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { simulationImpactLevelFromScore } from "./strategic-simulation-types";
import { generateImpactId } from "./strategic-simulation-identity";

// ── Core calculation ──────────────────────────────────────────────────────────

export interface ImpactCalculationInput {
  readonly domain:        StrategicDomain;
  readonly variables:     SimulationVariable[];
  readonly assumptions:   SimulationAssumption[];
  readonly variant:       SimulationScenarioVariant;
}

export function calculateImpact(input: ImpactCalculationInput): SimulationImpact[] {
  const impacts: SimulationImpact[] = [];

  const highSens = input.variables.filter((v) => v.sensitivity === "HIGH");
  const medSens  = input.variables.filter((v) => v.sensitivity === "MEDIUM");

  // Compute raw impact from variable deviations
  for (const v of highSens) {
    const score = _computeVariableImpactScore(v, input.variant);
    impacts.push({
      id:           generateImpactId(),
      domain:       input.domain,
      label:        `Impacto por ${v.name}`,
      description:  `Variable "${v.name}" con desviación del baseline en escenario ${input.variant}.`,
      level:        simulationImpactLevelFromScore(score),
      impactScore:  score,
      timeHorizon:  "SHORT_TERM",
      isPositive:   input.variant === "OPTIMISTIC",
      isReversible: v.isControllable,
      dependencies: [v.id],
      metadata:     {},
    });
  }

  for (const v of medSens) {
    const score = _computeVariableImpactScore(v, input.variant) * 0.6;
    impacts.push({
      id:           generateImpactId(),
      domain:       input.domain,
      label:        `Impacto secundario por ${v.name}`,
      description:  `Variable de sensibilidad media "${v.name}" con impacto moderado en escenario ${input.variant}.`,
      level:        simulationImpactLevelFromScore(score),
      impactScore:  score,
      timeHorizon:  "MEDIUM_TERM",
      isPositive:   input.variant === "OPTIMISTIC",
      isReversible: v.isControllable,
      dependencies: [v.id],
      metadata:     {},
    });
  }

  return impacts;
}

// ── Business-level impact ─────────────────────────────────────────────────────

export function calculateBusinessImpact(
  variables: SimulationVariable[],
  variant:   SimulationScenarioVariant
): { financialScore: number; operationalScore: number; overallScore: number } {
  const relevant = variables.filter((v) => v.sensitivity !== "LOW");
  if (relevant.length === 0) return { financialScore: 0, operationalScore: 0, overallScore: 0 };

  const scores = relevant.map((v) => _computeVariableImpactScore(v, variant));
  const avg    = scores.reduce((s, x) => s + x, 0) / scores.length;
  const max    = Math.max(...scores);

  const financialScore   = Math.round((avg * 0.6 + max * 0.4) * 100) / 100;
  const operationalScore = Math.round(avg * 100) / 100;
  const overallScore     = Math.round((financialScore * 0.5 + operationalScore * 0.5) * 100) / 100;

  return { financialScore, operationalScore, overallScore };
}

// ── Strategic-level impact ────────────────────────────────────────────────────

export function calculateStrategicImpact(
  domain:      StrategicDomain,
  impacts:     SimulationImpact[],
  assumptions: SimulationAssumption[]
): { strategicScore: number; level: SimulationImpactLevel; narrative: string } {
  const highImpacts = impacts.filter((i) => i.level === "HIGH" || i.level === "CRITICAL");
  const keyAssumps  = assumptions.filter((a) => a.isKeyAssumption);
  const assumptConf = keyAssumps.length > 0
    ? keyAssumps.reduce((s, a) => s + a.confidenceScore, 0) / keyAssumps.length
    : 0.6;

  const rawScore = impacts.length > 0
    ? impacts.reduce((s, i) => s + i.impactScore, 0) / impacts.length
    : 0;

  const strategicScore = Math.round(Math.min(1, rawScore * assumptConf) * 100) / 100;
  const level          = simulationImpactLevelFromScore(strategicScore);

  const narrative = highImpacts.length > 0
    ? `El dominio ${domain} presenta ${highImpacts.length} impacto(s) de nivel alto/crítico con confianza de supuestos clave en ${Math.round(assumptConf * 100)}%.`
    : `Impactos moderados en el dominio ${domain} con un score estratégico de ${strategicScore.toFixed(2)}.`;

  return { strategicScore, level, narrative };
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

export function aggregateImpactScore(impacts: SimulationImpact[]): number {
  if (impacts.length === 0) return 0;
  const weighted = impacts.reduce((s, i) => s + i.impactScore * (i.level === "CRITICAL" ? 1.5 : i.level === "HIGH" ? 1.2 : 1), 0);
  const weights  = impacts.reduce((s, i) => s + (i.level === "CRITICAL" ? 1.5 : i.level === "HIGH" ? 1.2 : 1), 0);
  return Math.min(1, Math.round((weighted / weights) * 100) / 100);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeVariableImpactScore(v: SimulationVariable, variant: SimulationScenarioVariant): number {
  const variantValue = variant === "OPTIMISTIC" ? v.optimisticValue
    : variant === "PESSIMISTIC" ? v.pessimisticValue
    : variant === "CONSERVATIVE" ? v.conservativeValue
    : v.currentValue;

  const range = Math.abs(v.optimisticValue - v.pessimisticValue);
  if (range === 0) return 0;

  const deviation = Math.abs(variantValue - v.baselineValue) / range;
  const sensitivityMultiplier = v.sensitivity === "HIGH" ? 1.0 : v.sensitivity === "MEDIUM" ? 0.65 : 0.30;

  return Math.min(1, Math.round(deviation * sensitivityMultiplier * 100) / 100);
}
