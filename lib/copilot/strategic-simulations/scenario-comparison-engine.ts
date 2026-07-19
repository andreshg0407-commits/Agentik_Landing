// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 11 — Scenario Comparison Engine
// Compares multiple simulation scenarios and ranks them.
// NEVER executes. NEVER modifies data.

import type {
  SimulationScenario, SimulationComparison, SimulationOutcome,
  SimulationRecommendation,
} from "./strategic-simulation-types";
import { generateComparisonId } from "./strategic-simulation-identity";
import { scoreScenario } from "./scenario-builder";
import { generateSimulationRecommendations } from "./simulation-recommendation-engine";

// ── Comparison ────────────────────────────────────────────────────────────────

export function compareScenarios(
  orgSlug:     string,
  scenarios:   SimulationScenario[],
  outcomes:    SimulationOutcome[]
): SimulationComparison {
  const ranked  = rankScenarios(scenarios);
  const winner  = ranked[0] ?? null;
  const tradeoffs = _buildTradeoffs(ranked);
  const recs    = _buildComparisonRecommendations(orgSlug, ranked);

  return buildComparison({
    orgSlug,
    title:           `Comparación de ${scenarios.length} escenario(s)`,
    description:     `Análisis comparativo de escenarios hipotéticos — no constituye pronóstico ni instrucción.`,
    scenarios:       ranked,
    outcomes,
    winner,
    winnerRationale: winner ? _winnerRationale(winner, ranked) : "No hay escenarios disponibles para comparar.",
    tradeoffs,
    recommendations: recs,
  });
}

export function rankScenarios(scenarios: SimulationScenario[]): SimulationScenario[] {
  return [...scenarios].sort((a, b) => scoreScenario(b) - scoreScenario(a));
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildComparison(params: {
  orgSlug:         string;
  title:           string;
  description:     string;
  scenarios:       SimulationScenario[];
  outcomes:        SimulationOutcome[];
  winner:          SimulationScenario | null;
  winnerRationale: string;
  tradeoffs:       string[];
  recommendations: SimulationRecommendation[];
  metadata?:       Record<string, unknown>;
}): SimulationComparison {
  const worstCase = [...params.scenarios].sort((a, b) => scoreScenario(a) - scoreScenario(b))[0];
  const avgConf   = params.scenarios.length > 0
    ? params.scenarios.reduce((s, sc) => s + sc.confidenceScore, 0) / params.scenarios.length
    : 0;

  const confidence = avgConf >= 0.85 ? "VERY_HIGH" as const
    : avgConf >= 0.65 ? "HIGH" as const
    : avgConf >= 0.40 ? "MEDIUM" as const
    : "LOW" as const;

  return {
    id:              generateComparisonId(),
    orgSlug:         params.orgSlug,
    title:           params.title,
    description:     params.description,
    scenarios:       params.scenarios,
    outcomes:        params.outcomes,
    winner:          params.winner,
    winnerRationale: params.winnerRationale,
    tradeoffs:       params.tradeoffs,
    recommendations: params.recommendations,
    confidence,
    comparedAt:      new Date().toISOString(),
    metadata:        params.metadata ?? {},
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _winnerRationale(winner: SimulationScenario, all: SimulationScenario[]): string {
  const score = scoreScenario(winner);
  const others = all.filter((s) => s.id !== winner.id);
  if (others.length === 0) return `Único escenario evaluado con score ${score.toFixed(2)}.`;

  const avgOthers = others.reduce((s, sc) => s + scoreScenario(sc), 0) / others.length;
  const diff = Math.round((score - avgOthers) * 100);

  return `El escenario "${winner.name}" (variante ${winner.variant}) obtuvo un score de ${score.toFixed(2)}, ` +
    `${diff > 0 ? `${diff}pp por encima del promedio de los demás escenarios (${avgOthers.toFixed(2)}).` : "similar a los demás escenarios."}`;
}

function _buildTradeoffs(ranked: SimulationScenario[]): string[] {
  const tradeoffs: string[] = [];

  const optimistic  = ranked.find((s) => s.variant === "OPTIMISTIC");
  const pessimistic = ranked.find((s) => s.variant === "PESSIMISTIC");

  if (optimistic && pessimistic) {
    const diff = Math.round((scoreScenario(optimistic) - scoreScenario(pessimistic)) * 100);
    tradeoffs.push(`Rango de resultados: diferencia de ${diff}pp entre escenario optimista y pesimista.`);
  }

  const hardConstraintViolations = ranked.some((s) => s.constraints.some((c) => c.type === "HARD" && c.isViolated));
  if (hardConstraintViolations) {
    tradeoffs.push("Al menos un escenario viola restricciones duras — viabilidad comprometida.");
  }

  const highRiskCount = ranked.filter((s) => s.overallRisk === "CRITICAL" || s.overallRisk === "HIGH").length;
  if (highRiskCount > 0) {
    tradeoffs.push(`${highRiskCount} escenario(s) presentan riesgo alto o crítico — considerar mitigaciones.`);
  }

  return tradeoffs;
}

function _buildComparisonRecommendations(
  orgSlug:  string,
  ranked:   SimulationScenario[]
): SimulationRecommendation[] {
  const winner = ranked[0];
  if (!winner) return [];

  return generateSimulationRecommendations({
    orgSlug,
    domain:         winner.domain,
    variant:        winner.variant,
    risks:          winner.risks,
    opportunities:  winner.opportunities,
    impacts:        winner.impacts,
    confidenceScore: winner.confidenceScore,
  }).slice(0, 3);
}
