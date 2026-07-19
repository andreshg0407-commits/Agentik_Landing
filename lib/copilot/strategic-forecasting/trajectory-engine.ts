// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 5: Trajectory Engine

import type {
  ForecastTrajectory,
  ForecastConfidence,
  ForecastAssumption,
  ForecastDomain,
  ForecastHorizon,
  ForecastTrendDirection,
  ForecastConfidenceLevel,
} from "./strategic-forecasting-types";
import { generateForecastTrajectoryId } from "./strategic-forecasting-identity";

export interface RawTrajectoryInput {
  readonly title:          string;
  readonly description:    string;
  readonly domain:         ForecastDomain;
  readonly horizon:        ForecastHorizon;
  readonly direction:      ForecastTrendDirection;
  readonly startingScore:  number; // 0–1
  readonly projectedScore: number; // 0–1
  readonly confidenceScore: number; // 0–1
  readonly keyDrivers?:    string[];
  readonly barriers?:      string[];
  readonly assumptions?:   ForecastAssumption[];
  readonly evidenceIds?:   string[];
  readonly metadata?:      Record<string, unknown>;
}

export function buildTrajectoryConfidence(
  score: number,
  driverCount: number,
  evidenceCount: number
): ForecastConfidence {
  try {
    const normalised = Math.max(0, Math.min(1, score));
    const driverBonus   = Math.min(0.05, driverCount * 0.01);
    const evidenceBonus = Math.min(0.05, evidenceCount * 0.01);
    const finalScore    = Math.min(1, normalised + driverBonus + evidenceBonus);

    const level: ForecastConfidenceLevel =
      finalScore >= 0.85 ? "VERY_HIGH" :
      finalScore >= 0.70 ? "HIGH"      :
      finalScore >= 0.50 ? "MEDIUM"    :
      finalScore >= 0.30 ? "LOW"       :
      "INSUFFICIENT";

    return {
      level,
      score:         finalScore,
      evidenceCount,
      limitations:   level === "INSUFFICIENT" ? ["Datos insuficientes para proyección confiable"] : [],
      rationale:     `Score ${(finalScore * 100).toFixed(0)}% basado en ${driverCount} impulsores y ${evidenceCount} evidencias`,
    };
  } catch {
    return {
      level:         "INSUFFICIENT",
      score:         0,
      evidenceCount: 0,
      limitations:   ["Error al calcular confianza de trayectoria"],
      rationale:     "Cálculo fallido",
    };
  }
}

export function buildTrajectory(
  orgSlug: string,
  input: RawTrajectoryInput
): ForecastTrajectory {
  try {
    const confidence = buildTrajectoryConfidence(
      input.confidenceScore,
      (input.keyDrivers ?? []).length,
      (input.evidenceIds ?? []).length
    );
    return {
      id:             generateForecastTrajectoryId(),
      orgSlug,
      title:          input.title,
      description:    input.description,
      domain:         input.domain,
      direction:      input.direction,
      startingScore:  Math.max(0, Math.min(1, input.startingScore)),
      projectedScore: Math.max(0, Math.min(1, input.projectedScore)),
      horizon:        input.horizon,
      confidence,
      keyDrivers:     input.keyDrivers ?? [],
      barriers:       input.barriers ?? [],
      assumptions:    input.assumptions ?? [],
      evidenceIds:    input.evidenceIds ?? [],
      createdAt:      new Date().toISOString(),
    };
  } catch {
    return buildEmptyTrajectory(orgSlug, input.title ?? "Unknown Trajectory");
  }
}

export function compareTrajectories(
  a: ForecastTrajectory,
  b: ForecastTrajectory
): number {
  try {
    const deltaA = a.projectedScore - a.startingScore;
    const deltaB = b.projectedScore - b.startingScore;
    const scoreA = deltaA * a.confidence.score;
    const scoreB = deltaB * b.confidence.score;
    return scoreB - scoreA; // descending
  } catch {
    return 0;
  }
}

export function rankTrajectories(
  trajectories: ForecastTrajectory[]
): ForecastTrajectory[] {
  try {
    return [...trajectories].sort(compareTrajectories);
  } catch {
    return trajectories;
  }
}

export function getPositiveTrajectories(
  trajectories: ForecastTrajectory[]
): ForecastTrajectory[] {
  try {
    return trajectories.filter((t) => t.projectedScore > t.startingScore);
  } catch {
    return [];
  }
}

export function getNegativeTrajectories(
  trajectories: ForecastTrajectory[]
): ForecastTrajectory[] {
  try {
    return trajectories.filter((t) => t.projectedScore < t.startingScore);
  } catch {
    return [];
  }
}

export function getTrajectoryDelta(t: ForecastTrajectory): number {
  return t.projectedScore - t.startingScore;
}

export function buildTrajectories(
  orgSlug: string,
  inputs: RawTrajectoryInput[]
): ForecastTrajectory[] {
  try {
    return inputs.map((i) => buildTrajectory(orgSlug, i));
  } catch {
    return [];
  }
}

function buildEmptyTrajectory(orgSlug: string, title: string): ForecastTrajectory {
  return {
    id:             generateForecastTrajectoryId(),
    orgSlug,
    title,
    description:    "",
    domain:         "CROSS_DOMAIN",
    direction:      "STABLE",
    startingScore:  0,
    projectedScore: 0,
    horizon:        "MEDIUM_TERM",
    confidence: {
      level:         "INSUFFICIENT",
      score:         0,
      evidenceCount: 0,
      limitations:   ["Trayectoria vacía"],
      rationale:     "Sin datos",
    },
    keyDrivers:  [],
    barriers:    [],
    assumptions: [],
    evidenceIds: [],
    createdAt:   new Date().toISOString(),
  };
}
