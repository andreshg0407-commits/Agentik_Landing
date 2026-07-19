// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 12 — Simulation Recommendation Engine
// Generates simulation-scoped recommendations. ALL have suggestedOnly: true.
// NEVER executes. NEVER modifies data.

import type {
  SimulationRecommendation, SimulationRisk, SimulationOpportunity,
  SimulationImpact, SimulationScenarioVariant,
} from "./strategic-simulation-types";
import type { StrategicDomain, StrategicAdvicePriority } from "../strategic-advisor/strategic-advisor-types";
import { simulationConfidenceFromScore, SIMULATION_PRIORITY_RANK } from "./strategic-simulation-types";
import { generateSimRecId } from "./strategic-simulation-identity";

// ── Input shape ───────────────────────────────────────────────────────────────

export interface SimulationRecommendationInput {
  readonly orgSlug:         string;
  readonly domain:          StrategicDomain;
  readonly variant:         SimulationScenarioVariant;
  readonly risks:           SimulationRisk[];
  readonly opportunities:   SimulationOpportunity[];
  readonly impacts:         SimulationImpact[];
  readonly confidenceScore: number;
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateSimulationRecommendations(
  input: SimulationRecommendationInput
): SimulationRecommendation[] {
  const recs: SimulationRecommendation[] = [];

  // 1. From critical/high risks
  for (const risk of input.risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH").slice(0, 3)) {
    recs.push(_riskRec(input.orgSlug, input.domain, risk, input.confidenceScore));
  }

  // 2. From large/transformational opportunities
  for (const opp of input.opportunities.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL").slice(0, 2)) {
    recs.push(_oppRec(input.orgSlug, input.domain, opp));
  }

  // 3. Variant-specific strategic recommendation
  recs.push(_variantRec(input.orgSlug, input.domain, input.variant, input.confidenceScore));

  // 4. Negative high-impact areas
  const negHigh = input.impacts.filter((i) => !i.isPositive && (i.level === "HIGH" || i.level === "CRITICAL")).slice(0, 2);
  for (const imp of negHigh) {
    recs.push(_impactRec(input.orgSlug, input.domain, imp, input.confidenceScore));
  }

  // De-duplicate
  const seen = new Set<string>();
  return recs.filter((r) => {
    const key = r.title.substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => SIMULATION_PRIORITY_RANK[b.priority] - SIMULATION_PRIORITY_RANK[a.priority]);
}

// ── Private builders ──────────────────────────────────────────────────────────

function _riskRec(
  orgSlug: string, domain: StrategicDomain, risk: SimulationRisk, confidenceScore: number
): SimulationRecommendation {
  const priority: StrategicAdvicePriority = risk.level === "CRITICAL" ? "CRITICAL" : "HIGH";
  return {
    id:              generateSimRecId(),
    orgSlug,
    title:           `Mitigar riesgo simulado: ${risk.title}`,
    description:     `En el escenario simulado, se proyecta el riesgo "${risk.title}" con nivel ${risk.level}.`,
    rationale:       risk.description,
    domain:          risk.domain,
    priority,
    confidence:      simulationConfidenceFromScore(confidenceScore),
    confidenceScore,
    expectedImpact:  `Reducción del riesgo compuesto de ${risk.compositeRisk.toFixed(2)} en dominio ${domain}.`,
    associatedRisks: risk.mitigations.length === 0 ? ["Sin mitigaciones declaradas — riesgo residual alto"] : [],
    evidenceIds:     risk.evidenceIds,
    scenarioId:      "",
    suggestedOnly:   true,
    metadata:        { source: "RISK_PROJECTION", riskId: risk.id },
  };
}

function _oppRec(
  orgSlug: string, domain: StrategicDomain, opp: SimulationOpportunity
): SimulationRecommendation {
  return {
    id:              generateSimRecId(),
    orgSlug,
    title:           `Capturar oportunidad simulada: ${opp.title}`,
    description:     `Oportunidad de magnitud ${opp.magnitude} proyectada en la simulación para el dominio ${opp.domain}.`,
    rationale:       opp.description,
    domain:          opp.domain,
    priority:        opp.magnitude === "TRANSFORMATIONAL" ? "CRITICAL" : "HIGH",
    confidence:      opp.confidence,
    confidenceScore: opp.confidenceScore,
    expectedImpact:  `Captura de oportunidad con score de ${opp.captureScore.toFixed(2)}.`,
    associatedRisks: ["La ventana de oportunidad puede cerrarse sin acción coordinada"],
    evidenceIds:     opp.evidenceIds,
    scenarioId:      "",
    suggestedOnly:   true,
    metadata:        { source: "OPPORTUNITY_PROJECTION", opportunityId: opp.id },
  };
}

function _variantRec(
  orgSlug: string, domain: StrategicDomain, variant: SimulationScenarioVariant, confidenceScore: number
): SimulationRecommendation {
  const variantMap: Record<SimulationScenarioVariant, { title: string; desc: string; priority: StrategicAdvicePriority }> = {
    OPTIMISTIC:   { title: "Preparar plan de captura para escenario optimista", desc: "Las condiciones optimistas simuladas requieren un plan de captura activo.", priority: "MEDIUM" },
    CONSERVATIVE: { title: "Establecer plan de contingencia para escenario conservador", desc: "El escenario conservador sugiere mantener reservas y priorizar eficiencia.", priority: "MEDIUM" },
    PESSIMISTIC:  { title: "Activar plan de mitigación para escenario pesimista", desc: "El escenario pesimista requiere planes de contingencia y protocolos de respuesta.", priority: "HIGH" },
    CUSTOM:       { title: "Revisar supuestos del escenario personalizado", desc: "Valide que los supuestos del escenario personalizado reflejan condiciones reales.", priority: "MEDIUM" },
  };
  const v = variantMap[variant];
  return {
    id:              generateSimRecId(),
    orgSlug,
    title:           v.title,
    description:     v.desc,
    rationale:       `Recomendación estratégica derivada del análisis de escenario ${variant}.`,
    domain,
    priority:        v.priority,
    confidence:      simulationConfidenceFromScore(confidenceScore),
    confidenceScore,
    expectedImpact:  "Preparación estratégica adecuada al escenario proyectado.",
    associatedRisks: [],
    evidenceIds:     [],
    scenarioId:      "",
    suggestedOnly:   true,
    metadata:        { source: "VARIANT_STRATEGY", variant },
  };
}

function _impactRec(
  orgSlug: string, domain: StrategicDomain, impact: SimulationImpact, confidenceScore: number
): SimulationRecommendation {
  return {
    id:              generateSimRecId(),
    orgSlug,
    title:           `Atender impacto negativo: ${impact.label}`,
    description:     `Se proyecta un impacto negativo de nivel ${impact.level}: ${impact.description}`,
    rationale:       `Impacto no reversible: ${!impact.isReversible}. Score: ${impact.impactScore.toFixed(2)}.`,
    domain:          impact.domain,
    priority:        impact.level === "CRITICAL" ? "CRITICAL" : "HIGH",
    confidence:      simulationConfidenceFromScore(confidenceScore),
    confidenceScore,
    expectedImpact:  "Reducción del impacto negativo proyectado en la simulación.",
    associatedRisks: impact.isReversible ? [] : ["Impacto declarado como irreversible — actuar con urgencia"],
    evidenceIds:     [impact.id],
    scenarioId:      "",
    suggestedOnly:   true,
    metadata:        { source: "IMPACT_ENGINE", impactId: impact.id },
  };
}
