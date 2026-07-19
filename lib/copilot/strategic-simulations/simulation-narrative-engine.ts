// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 13 — Simulation Narrative Engine
// Produces executive explanations for simulation scenarios.
// All output is clearly hypothetical. Never states predictions as facts.
// NEVER executes. NEVER modifies data.

import type {
  SimulationNarrative, SimulationImpact, SimulationRisk,
  SimulationOpportunity, SimulationAssumption, SimulationScenarioVariant,
} from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { generateNarrativeId } from "./strategic-simulation-identity";
import { simulationConfidenceFromScore } from "./strategic-simulation-types";

// ── Input shape ───────────────────────────────────────────────────────────────

export interface NarrativeInput {
  readonly orgSlug:       string;
  readonly domain:        StrategicDomain;
  readonly variant:       SimulationScenarioVariant;
  readonly impacts:       SimulationImpact[];
  readonly risks:         SimulationRisk[];
  readonly opportunities: SimulationOpportunity[];
  readonly assumptions:   SimulationAssumption[];
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildSimulationNarrative(input: NarrativeInput): SimulationNarrative {
  const title         = `Análisis hipotético — Escenario ${input.variant} (${input.domain})`;
  const executive     = _buildExecutive(input);
  const keyCaution    = _buildKeyCaution(input.risks);
  const keyStrength   = _buildKeyStrength(input.opportunities, input.impacts);
  const limitations   = _buildLimitations(input.assumptions);
  const assumptLabels = input.assumptions.map((a) => a.label);

  const avgConf = input.assumptions.length > 0
    ? input.assumptions.reduce((s, a) => s + a.confidenceScore, 0) / input.assumptions.length
    : 0.5;

  return {
    id:          generateNarrativeId(),
    title,
    executive,
    keyCaution,
    keyStrength,
    limitations,
    assumptions: assumptLabels,
    confidence:  simulationConfidenceFromScore(avgConf),
    domain:      input.domain,
  };
}

// ── Private builders ──────────────────────────────────────────────────────────

function _buildExecutive(input: NarrativeInput): string {
  const variantDesc = input.variant === "OPTIMISTIC" ? "condiciones favorables"
    : input.variant === "PESSIMISTIC" ? "condiciones adversas"
    : input.variant === "CONSERVATIVE" ? "condiciones moderadas"
    : "condiciones personalizadas";

  const riskCount = input.risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH").length;
  const oppCount  = input.opportunities.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").length;

  const parts: string[] = [
    `Bajo ${variantDesc} en el dominio ${input.domain}, la simulación hipotética proyecta ${riskCount > 0 ? `${riskCount} riesgo(s) de nivel alto o crítico` : "un perfil de riesgo manejable"}.`,
  ];

  if (oppCount > 0) {
    parts.push(`Se identifican ${oppCount} oportunidad(es) de magnitud relevante que podrían capitalizarse si se actúa coordinadamente.`);
  }

  parts.push("Esta simulación es un ejercicio hipotético: no constituye pronóstico, garantía ni instrucción de acción.");

  return parts.join(" ");
}

function _buildKeyCaution(risks: SimulationRisk[]): string {
  const top = [...risks].sort((a, b) => b.compositeRisk - a.compositeRisk)[0];
  if (!top) return "No se identificaron riesgos críticos en esta simulación.";
  return `Principal precaución: "${top.title}" (riesgo compuesto ${top.compositeRisk.toFixed(2)}) — ${top.mitigations[0] ?? "Monitorear de cerca"}.`;
}

function _buildKeyStrength(opps: SimulationOpportunity[], impacts: SimulationImpact[]): string {
  const topOpp    = [...opps].sort((a, b) => b.captureScore - a.captureScore)[0];
  const topImpact = impacts.filter((i) => i.isPositive).sort((a, b) => b.impactScore - a.impactScore)[0];

  if (topOpp) {
    return `Principal fortaleza: "${topOpp.title}" con captureScore de ${topOpp.captureScore.toFixed(2)}.`;
  }
  if (topImpact) {
    return `Principal fortaleza: impacto positivo "${topImpact.label}" con score ${topImpact.impactScore.toFixed(2)}.`;
  }
  return "No se identificaron fortalezas destacadas en esta simulación.";
}

function _buildLimitations(assumptions: SimulationAssumption[]): string[] {
  const base = [
    "Simulación hipotética — no constituye pronóstico ni recomendación de inversión",
    "Resultados dependen de la validez de los supuestos declarados",
    "Datos históricos pueden no predecir comportamiento futuro",
  ];

  const lowConf = assumptions.filter((a) => a.isKeyAssumption && a.confidenceScore < 0.5);
  if (lowConf.length > 0) {
    base.push(`${lowConf.length} supuesto(s) clave con confianza baja (<50%) — conclusiones frágiles`);
  }

  return base;
}
