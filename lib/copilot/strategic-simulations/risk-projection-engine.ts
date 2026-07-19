// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 7 — Risk Projection Engine
// Projects simulation risks from variables, constraints, and assumptions.
// NEVER executes. NEVER modifies data.

import type {
  SimulationRisk, SimulationRiskLevel, SimulationImpact,
  SimulationConstraint, SimulationVariable, SimulationScenarioVariant,
} from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { simulationRiskLevelFromScore } from "./strategic-simulation-types";
import { generateSimRiskId } from "./strategic-simulation-identity";

// ── Projection ────────────────────────────────────────────────────────────────

export function projectRisks(params: {
  domain:      StrategicDomain;
  variables:   SimulationVariable[];
  constraints: SimulationConstraint[];
  impacts:     SimulationImpact[];
  variant:     SimulationScenarioVariant;
}): SimulationRisk[] {
  const risks: SimulationRisk[] = [];

  // Risk from pessimistic variable deviations
  const highSensVars = params.variables.filter((v) => v.sensitivity === "HIGH" || v.sensitivity === "MEDIUM");
  for (const v of highSensVars) {
    const likelihood  = params.variant === "PESSIMISTIC" ? 0.80
      : params.variant === "CONSERVATIVE" ? 0.45
      : 0.20;
    const impactScore = params.variant === "PESSIMISTIC" ? 0.75
      : params.variant === "CONSERVATIVE" ? 0.40
      : 0.15;
    const composite   = Math.round(likelihood * impactScore * 100) / 100;

    risks.push({
      id:           generateSimRiskId(),
      domain:       params.domain,
      title:        `Riesgo por desviación en ${v.name}`,
      description:  `La variable "${v.name}" puede desviarse del baseline bajo condiciones ${params.variant}.`,
      level:        simulationRiskLevelFromScore(composite),
      likelihood,
      impact:       impactScore,
      compositeRisk: composite,
      timeHorizon:  "SHORT_TERM",
      mitigations:  v.isControllable ? [`Ajustar ${v.name} dentro del rango controlable`] : ["Monitorear de cerca"],
      evidenceIds:  [],
      metadata:     { variableId: v.id },
    });
  }

  // Risk from violated constraints
  for (const c of params.constraints.filter((c) => c.isViolated)) {
    const likelihood  = c.type === "HARD" ? 0.95 : 0.60;
    const impactScore = c.impact === "CRITICAL" ? 0.90 : c.impact === "HIGH" ? 0.70 : 0.40;
    const composite   = Math.round(likelihood * impactScore * 100) / 100;

    risks.push({
      id:           generateSimRiskId(),
      domain:       c.domain,
      title:        `Violación de restricción: ${c.label}`,
      description:  `La restricción "${c.label}" está violada, lo que representa un riesgo operativo.`,
      level:        simulationRiskLevelFromScore(composite),
      likelihood,
      impact:       impactScore,
      compositeRisk: composite,
      timeHorizon:  "IMMEDIATE",
      mitigations:  ["Resolver la violación de restricción antes de proceder"],
      evidenceIds:  [],
      metadata:     { constraintId: c.id, constraintType: c.type },
    });
  }

  // Risk from negative impacts
  const negativeImpacts = params.impacts.filter((i) => !i.isPositive && (i.level === "HIGH" || i.level === "CRITICAL"));
  if (negativeImpacts.length > 0) {
    const composite = Math.min(0.95, negativeImpacts.length * 0.20);
    risks.push({
      id:           generateSimRiskId(),
      domain:       params.domain,
      title:        `Acumulación de impactos negativos`,
      description:  `Se proyectan ${negativeImpacts.length} impacto(s) negativo(s) de nivel alto o crítico.`,
      level:        simulationRiskLevelFromScore(composite),
      likelihood:   0.70,
      impact:       composite,
      compositeRisk: composite,
      timeHorizon:  "MEDIUM_TERM",
      mitigations:  ["Revisar variables controlables para mitigar impactos negativos"],
      evidenceIds:  negativeImpacts.map((i) => i.id),
      metadata:     {},
    });
  }

  return risks;
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export function rankProjectedRisks(risks: SimulationRisk[]): SimulationRisk[] {
  return [...risks].sort((a, b) => b.compositeRisk - a.compositeRisk);
}

// ── Aggregation ───────────────────────────────────────────────────────────────

export function aggregateRiskScore(risks: SimulationRisk[]): number {
  if (risks.length === 0) return 0;
  const critical = risks.filter((r) => r.level === "CRITICAL");
  const high     = risks.filter((r) => r.level === "HIGH");
  const penalty  = Math.min(0.40, critical.length * 0.15) + Math.min(0.20, high.length * 0.05);
  const avg      = risks.reduce((s, r) => s + r.compositeRisk, 0) / risks.length;
  return Math.min(1, Math.round((avg + penalty) * 100) / 100);
}

export function getOverallRiskLevel(risks: SimulationRisk[]): SimulationRiskLevel {
  return simulationRiskLevelFromScore(aggregateRiskScore(risks));
}
