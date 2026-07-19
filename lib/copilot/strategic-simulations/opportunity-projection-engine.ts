// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 8 — Opportunity Projection Engine
// Projects simulation opportunities from variables, impacts, and assumptions.
// NEVER executes. NEVER modifies data.

import type {
  SimulationOpportunity, SimulationImpact, SimulationVariable,
  SimulationAssumption, SimulationScenarioVariant,
} from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { simulationConfidenceFromScore } from "./strategic-simulation-types";
import { generateSimOppId } from "./strategic-simulation-identity";

// ── Projection ────────────────────────────────────────────────────────────────

export function projectOpportunities(params: {
  domain:      StrategicDomain;
  variables:   SimulationVariable[];
  impacts:     SimulationImpact[];
  assumptions: SimulationAssumption[];
  variant:     SimulationScenarioVariant;
}): SimulationOpportunity[] {
  const opps: SimulationOpportunity[] = [];

  // From controllable, high-sensitivity variables
  const controllable = params.variables.filter((v) => v.isControllable && v.sensitivity === "HIGH");
  for (const v of controllable) {
    const captureScore = params.variant === "OPTIMISTIC" ? 0.80
      : params.variant === "CONSERVATIVE" ? 0.55
      : 0.25;

    const confidence   = simulationConfidenceFromScore(captureScore * 0.9);
    const magnitude    = captureScore >= 0.70 ? "LARGE" : captureScore >= 0.50 ? "MEDIUM" : "SMALL";

    opps.push({
      id:              generateSimOppId(),
      domain:          params.domain,
      title:           `Optimización de ${v.name}`,
      description:     `La variable controlable "${v.name}" ofrece potencial de mejora si se gestiona activamente bajo escenario ${params.variant}.`,
      magnitude,
      captureScore,
      confidence,
      confidenceScore: captureScore * 0.9,
      timeHorizon:     "SHORT_TERM",
      requiredActions: [`Establecer target de ${v.name} en rango optimista (${v.optimisticValue}${v.unit})`],
      evidenceIds:     [],
      metadata:        { variableId: v.id },
    });
  }

  // From positive high-impact areas
  const positiveHighImpacts = params.impacts.filter((i) => i.isPositive && (i.level === "HIGH" || i.level === "CRITICAL"));
  for (const imp of positiveHighImpacts.slice(0, 3)) {
    const captureScore = imp.impactScore * 0.85;
    opps.push({
      id:              generateSimOppId(),
      domain:          imp.domain,
      title:           `Oportunidad: ${imp.label}`,
      description:     `El impacto positivo "${imp.label}" puede ser capitalizado activamente.`,
      magnitude:       imp.level === "CRITICAL" ? "TRANSFORMATIONAL" : "LARGE",
      captureScore,
      confidence:      simulationConfidenceFromScore(captureScore),
      confidenceScore: captureScore,
      timeHorizon:     imp.timeHorizon,
      requiredActions: ["Diseñar plan de captura para maximizar este impacto positivo"],
      evidenceIds:     [imp.id],
      metadata:        {},
    });
  }

  // Structural opportunities from high-confidence assumptions
  const keyAssumps = params.assumptions.filter((a) => a.isKeyAssumption && a.confidenceScore >= 0.7);
  if (keyAssumps.length >= 2 && params.variant !== "PESSIMISTIC") {
    opps.push({
      id:              generateSimOppId(),
      domain:          params.domain,
      title:           "Ventana de certidumbre estructural",
      description:     `Con ${keyAssumps.length} supuestos clave de alta confianza, existen condiciones favorables para tomar decisiones estratégicas.`,
      magnitude:       "MEDIUM",
      captureScore:    0.65,
      confidence:      "HIGH",
      confidenceScore: 0.70,
      timeHorizon:     "MEDIUM_TERM",
      requiredActions: ["Definir decisiones estratégicas clave antes de que las condiciones cambien"],
      evidenceIds:     keyAssumps.map((a) => a.id),
      metadata:        {},
    });
  }

  return opps;
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export function rankProjectedOpportunities(opps: SimulationOpportunity[]): SimulationOpportunity[] {
  const magnitudeRank = { TRANSFORMATIONAL: 4, LARGE: 3, MEDIUM: 2, SMALL: 1 };
  return [...opps].sort((a, b) => {
    const mDiff = magnitudeRank[b.magnitude] - magnitudeRank[a.magnitude];
    if (mDiff !== 0) return mDiff;
    return b.captureScore - a.captureScore;
  });
}

// ── Aggregation ───────────────────────────────────────────────────────────────

export function aggregateOpportunityScore(opps: SimulationOpportunity[]): number {
  if (opps.length === 0) return 0;
  const magnitudeRank = { TRANSFORMATIONAL: 4, LARGE: 3, MEDIUM: 2, SMALL: 1 };
  const weighted = opps.reduce((s, o) => s + o.captureScore * magnitudeRank[o.magnitude], 0);
  const weights  = opps.reduce((s, o) => s + magnitudeRank[o.magnitude], 0);
  return Math.min(1, Math.round((weighted / weights) * 100) / 100);
}
