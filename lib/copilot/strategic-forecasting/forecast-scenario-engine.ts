// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 8: Scenario Engine
// 5 scenario types: Best Case, Expected Case, Worst Case, Stretch Case, Black Swan Candidate

import type {
  ForecastScenario,
  ForecastScenarioType,
  ForecastRisk,
  ForecastOpportunity,
  ForecastTrajectory,
  ForecastAssumption,
  ForecastConfidence,
  ForecastDomain,
  ForecastHorizon,
  ForecastOutcome,
} from "./strategic-forecasting-types";
import { generateScenarioId } from "./strategic-forecasting-identity";

export interface RawScenarioInput {
  readonly type:           ForecastScenarioType;
  readonly title:          string;
  readonly narrative:      string;
  readonly domain:         ForecastDomain;
  readonly horizon:        ForecastHorizon;
  readonly probability:    number; // 0–1 — raw estimate
  readonly trajectories:   ForecastTrajectory[];
  readonly risks:          ForecastRisk[];
  readonly opportunities:  ForecastOpportunity[];
  readonly assumptions:    ForecastAssumption[];
  readonly confidence:     ForecastConfidence;
  readonly evidenceIds?:   string[];
  readonly limitations?:   string[];
}

export function deriveScenarioOutcome(
  probability: number,
  type: ForecastScenarioType
): ForecastOutcome {
  try {
    if (type === "BLACK_SWAN_CANDIDATE") return "UNLIKELY";
    if (probability >= 0.65) return "LIKELY";
    if (probability >= 0.40) return "POSSIBLE";
    if (probability >= 0.20) return "UNCERTAIN";
    return "UNLIKELY";
  } catch {
    return "UNCERTAIN";
  }
}

export function clampScenarioProbability(
  type: ForecastScenarioType,
  raw: number
): number {
  try {
    const p = Math.max(0, Math.min(1, raw));
    // Enforce realistic bounds per scenario type
    if (type === "BLACK_SWAN_CANDIDATE") return Math.min(p, 0.10);
    if (type === "STRETCH_CASE")         return Math.min(p, 0.25);
    if (type === "WORST_CASE")           return Math.min(p, 0.45);
    if (type === "BEST_CASE")            return Math.min(p, 0.40);
    return p; // EXPECTED_CASE — no upper cap
  } catch {
    return 0;
  }
}

export function buildScenario(
  orgSlug: string,
  sessionId: string,
  input: RawScenarioInput
): ForecastScenario {
  try {
    const probability = clampScenarioProbability(input.type, input.probability);
    const outcome     = deriveScenarioOutcome(probability, input.type);
    const limitations = [
      "suggestedOnly: true — nunca se ejecuta automáticamente",
      "Proyección probabilística — no garantía de resultado",
      ...(input.limitations ?? []),
    ];

    return {
      id:            generateScenarioId(),
      orgSlug,
      sessionId,
      type:          input.type,
      title:         input.title,
      narrative:     input.narrative,
      probability,
      outcome,
      horizon:       input.horizon,
      domain:        input.domain,
      trajectories:  input.trajectories,
      risks:         input.risks,
      opportunities: input.opportunities,
      assumptions:   input.assumptions,
      confidence:    input.confidence,
      evidenceIds:   input.evidenceIds ?? [],
      limitations,
      suggestedOnly: true,
      createdAt:     new Date().toISOString(),
    };
  } catch {
    return buildEmptyScenario(orgSlug, sessionId, input.type ?? "EXPECTED_CASE");
  }
}

export function buildScenarios(
  orgSlug: string,
  sessionId: string,
  inputs: RawScenarioInput[]
): ForecastScenario[] {
  try {
    return inputs.map((i) => buildScenario(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function rankScenariosByProbability(
  scenarios: ForecastScenario[]
): ForecastScenario[] {
  try {
    return [...scenarios].sort((a, b) => b.probability - a.probability);
  } catch {
    return scenarios;
  }
}

export function getMostLikelyScenario(
  scenarios: ForecastScenario[]
): ForecastScenario | null {
  try {
    if (scenarios.length === 0) return null;
    return [...scenarios].sort((a, b) => b.probability - a.probability)[0] ?? null;
  } catch {
    return null;
  }
}

export function getExpectedCaseScenario(
  scenarios: ForecastScenario[]
): ForecastScenario | null {
  try {
    return scenarios.find((s) => s.type === "EXPECTED_CASE") ?? null;
  } catch {
    return null;
  }
}

export function getBlackSwanScenarios(
  scenarios: ForecastScenario[]
): ForecastScenario[] {
  try {
    return scenarios.filter((s) => s.type === "BLACK_SWAN_CANDIDATE");
  } catch {
    return [];
  }
}

export function deduplicateScenarios(
  scenarios: ForecastScenario[]
): ForecastScenario[] {
  try {
    const seen = new Set<string>();
    return scenarios.filter((s) => {
      const key = `${s.type}:${s.title.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return scenarios;
  }
}

export function buildDefaultScenarioSet(
  orgSlug: string,
  sessionId: string,
  domain: ForecastDomain,
  horizon: ForecastHorizon,
  confidence: ForecastConfidence
): ForecastScenario[] {
  try {
    const base: RawScenarioInput[] = [
      {
        type:          "EXPECTED_CASE",
        title:         "Escenario Base — Continuidad Operativa",
        narrative:     "La organización mantiene su trayectoria actual con ajustes menores. Los indicadores clave evolucionan en línea con tendencias históricas.",
        domain,
        horizon,
        probability:   0.55,
        trajectories:  [],
        risks:         [],
        opportunities: [],
        assumptions:   [],
        confidence,
        limitations:   ["Basado en datos históricos disponibles"],
      },
      {
        type:          "BEST_CASE",
        title:         "Escenario Optimista — Captura de Oportunidades",
        narrative:     "Las condiciones del entorno son favorables y la organización ejecuta con efectividad. Los riesgos identificados se mitigan a tiempo.",
        domain,
        horizon,
        probability:   0.25,
        trajectories:  [],
        risks:         [],
        opportunities: [],
        assumptions:   [],
        confidence,
        limitations:   ["Requiere ejecución sin fricciones significativas"],
      },
      {
        type:          "WORST_CASE",
        title:         "Escenario Adverso — Materialización de Riesgos",
        narrative:     "Los principales riesgos identificados se materializan simultáneamente. La capacidad de respuesta organizacional se ve comprometida.",
        domain,
        horizon,
        probability:   0.15,
        trajectories:  [],
        risks:         [],
        opportunities: [],
        assumptions:   [],
        confidence,
        limitations:   ["Escenario de baja probabilidad pero alto impacto"],
      },
      {
        type:          "STRETCH_CASE",
        title:         "Escenario de Transformación",
        narrative:     "La organización acelera su evolución estratégica capturando oportunidades de alto impacto no contempladas en el plan base.",
        domain,
        horizon,
        probability:   0.10,
        trajectories:  [],
        risks:         [],
        opportunities: [],
        assumptions:   [],
        confidence,
        limitations:   ["Requiere condiciones excepcionales y ejecución perfecta"],
      },
    ];
    return base.map((i) => buildScenario(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

function buildEmptyScenario(
  orgSlug: string,
  sessionId: string,
  type: ForecastScenarioType
): ForecastScenario {
  return {
    id:            generateScenarioId(),
    orgSlug,
    sessionId,
    type,
    title:         "Escenario sin datos",
    narrative:     "",
    probability:   0,
    outcome:       "UNCERTAIN",
    horizon:       "MEDIUM_TERM",
    domain:        "CROSS_DOMAIN",
    trajectories:  [],
    risks:         [],
    opportunities: [],
    assumptions:   [],
    confidence: {
      level:         "INSUFFICIENT",
      score:         0,
      evidenceCount: 0,
      limitations:   ["Escenario vacío"],
      rationale:     "Sin datos",
    },
    evidenceIds:   [],
    limitations:   ["suggestedOnly: true"],
    suggestedOnly: true,
    createdAt:     new Date().toISOString(),
  };
}
