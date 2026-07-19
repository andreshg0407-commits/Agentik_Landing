// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 3: North Star Engine

import type {
  NorthStar,
  DirectionDomain,
  DirectionHorizon,
  DirectionConfidence,
} from "./enterprise-direction-types";
import { generateNorthStarId } from "./enterprise-direction-identity";

export interface NorthStarInput {
  readonly statement:    string;
  readonly rationale:    string;
  readonly domain:       DirectionDomain;
  readonly horizon:      DirectionHorizon;
  readonly score?:       number; // 0–1 confidence score raw
  readonly evidenceIds?: string[];
  readonly assumptions?: string[];
  readonly limitations?: string[];
}

export function scoreNorthStarAlignment(
  evidenceCount: number,
  assumptionCount: number,
  unvalidatedCritical: number
): number {
  try {
    const evScore    = Math.min(0.50, evidenceCount * 0.06);
    const assumBonus = Math.min(0.20, assumptionCount * 0.04);
    const penalty    = Math.min(0.30, unvalidatedCritical * 0.08);
    return Math.max(0, Math.min(1, 0.40 + evScore + assumBonus - penalty));
  } catch {
    return 0;
  }
}

function resolveConfidence(score: number): DirectionConfidence {
  if (score >= 0.80) return "VERY_HIGH";
  if (score >= 0.60) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function buildNorthStar(
  orgSlug: string,
  input: NorthStarInput
): NorthStar {
  try {
    const score = input.score ?? scoreNorthStarAlignment(
      (input.evidenceIds ?? []).length,
      (input.assumptions ?? []).length,
      0
    );
    const confidence = resolveConfidence(score);
    const limitations = [
      "suggestedOnly: true — North Star orientativo, requiere validación humana",
      ...(input.limitations ?? []),
    ];
    return {
      id:           generateNorthStarId(),
      orgSlug,
      statement:    input.statement,
      rationale:    input.rationale,
      domain:       input.domain,
      horizon:      input.horizon,
      confidence,
      score:        Math.max(0, Math.min(1, score)),
      evidenceIds:  input.evidenceIds ?? [],
      assumptions:  input.assumptions ?? [],
      limitations,
      suggestedOnly: true,
      createdAt:    new Date().toISOString(),
    };
  } catch {
    return buildEmptyNorthStar(orgSlug);
  }
}

export function evaluateNorthStar(northStar: NorthStar): {
  isStrong: boolean;
  gaps: string[];
  score: number;
} {
  try {
    const gaps: string[] = [];
    if (northStar.evidenceIds.length < 2) gaps.push("Evidencias insuficientes para el North Star");
    if (northStar.assumptions.length < 1) gaps.push("Sin supuestos declarados");
    if (northStar.score < 0.5) gaps.push("Score de alineación bajo");
    return {
      isStrong: gaps.length === 0 && northStar.score >= 0.65,
      gaps,
      score: northStar.score,
    };
  } catch {
    return { isStrong: false, gaps: ["Error al evaluar North Star"], score: 0 };
  }
}

export function refreshNorthStar(
  existing: NorthStar,
  updates: Partial<Pick<NorthStarInput, "evidenceIds" | "assumptions" | "score" | "limitations">>
): NorthStar {
  try {
    const newScore = updates.score ?? existing.score;
    const confidence = resolveConfidence(newScore);
    return {
      ...existing,
      score:        newScore,
      confidence,
      evidenceIds:  updates.evidenceIds ?? existing.evidenceIds,
      assumptions:  updates.assumptions ?? existing.assumptions,
      limitations:  updates.limitations ?? existing.limitations,
    };
  } catch {
    return existing;
  }
}

export function buildDefaultNorthStar(
  orgSlug: string,
  domain: DirectionDomain = "CROSS_DOMAIN",
  horizon: DirectionHorizon = "MEDIUM_TERM"
): NorthStar {
  return buildNorthStar(orgSlug, {
    statement:   `Crecimiento rentable y sostenible de ${orgSlug} en el horizonte ${horizon}`,
    rationale:   "North Star por defecto — actualizar con datos estratégicos reales",
    domain,
    horizon,
    score:       0.40,
    evidenceIds: [],
    assumptions: ["Datos estratégicos no disponibles"],
    limitations: ["North Star generado por defecto — requiere validación"],
  });
}

function buildEmptyNorthStar(orgSlug: string): NorthStar {
  return {
    id:           generateNorthStarId(),
    orgSlug,
    statement:    "North Star no disponible",
    rationale:    "",
    domain:       "CROSS_DOMAIN",
    horizon:      "MEDIUM_TERM",
    confidence:   "LOW",
    score:        0,
    evidenceIds:  [],
    assumptions:  [],
    limitations:  ["suggestedOnly: true", "North Star vacío"],
    suggestedOnly: true,
    createdAt:    new Date().toISOString(),
  };
}
