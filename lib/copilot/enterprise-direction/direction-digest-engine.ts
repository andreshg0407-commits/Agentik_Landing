// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 15: Direction Digest Engine

import type {
  DirectionDigest,
  DirectionDigestPeriod,
  DirectionConfidence,
  NorthStar,
  DirectionPriority,
  DirectionDeviation,
  DirectionConflict,
} from "./enterprise-direction-types";
import { generateDirectionDigestId } from "./enterprise-direction-identity";

export interface DigestInput {
  readonly orgSlug:      string;
  readonly sessionId:    string;
  readonly period:       DirectionDigestPeriod;
  readonly northStar:    NorthStar | null;
  readonly priorities:   DirectionPriority[];
  readonly deviations:   DirectionDeviation[];
  readonly conflicts:    DirectionConflict[];
  readonly overallScore: number;
  readonly confidence:   DirectionConfidence;
  readonly highlights?:  string[];
}

const PERIOD_LABELS: Record<DirectionDigestPeriod, string> = {
  DAILY:     "diario",
  WEEKLY:    "semanal",
  MONTHLY:   "mensual",
  QUARTERLY: "trimestral",
  ANNUAL:    "anual",
};

function buildHeadline(period: DirectionDigestPeriod, score: number, confidence: DirectionConfidence): string {
  const pct   = (score * 100).toFixed(0);
  const label = PERIOD_LABELS[period];
  return `Resumen ${label} de dirección estratégica — alineamiento estimado: ${pct}% (confianza: ${confidence})`;
}

function buildNorthStarSummary(northStar: NorthStar | null): string {
  if (!northStar) return "Sin estrella norte definida.";
  return `"${northStar.statement}" (score: ${(northStar.score * 100).toFixed(0)}%, horizonte: ${northStar.horizon})`;
}

export function buildDirectionDigest(input: DigestInput): DirectionDigest {
  try {
    const headline        = buildHeadline(input.period, input.overallScore, input.confidence);
    const northStarSummary = buildNorthStarSummary(input.northStar);

    const topPriorities = input.priorities
      .slice(0, 5)
      .map((p) => `${p.title} (${p.level})`);

    const watchDeviations = input.deviations
      .filter((d) => d.deviationScore >= 0.40)
      .slice(0, 3)
      .map((d) => `${d.title} — ${d.severity}`);

    const keyConflicts = input.conflicts
      .filter((c) => c.isBlocking || c.conflictScore >= 0.50)
      .slice(0, 3)
      .map((c) => `${c.title} (${c.type})`);

    const highlights = input.highlights ?? [
      `Dirección estratégica evaluada con confianza ${input.confidence}`,
      `${input.priorities.length} prioridades identificadas`,
      `${input.deviations.length} desviaciones detectadas`,
      `${input.conflicts.length} conflictos registrados`,
    ];

    return {
      id:               generateDirectionDigestId(),
      orgSlug:          input.orgSlug,
      sessionId:        input.sessionId,
      period:           input.period,
      headline,
      highlights:       highlights.slice(0, 6),
      northStarSummary,
      topPriorities,
      watchDeviations,
      keyConflicts,
      confidence:       input.confidence,
      limitations:      [
        "suggestedOnly: true — este resumen es informativo y no vinculante",
        "Los datos pueden estar incompletos o desactualizados",
      ],
      createdAt:        new Date().toISOString(),
    };
  } catch {
    return buildEmptyDigest(input.orgSlug, input.sessionId, input.period);
  }
}

function buildEmptyDigest(
  orgSlug: string,
  sessionId: string,
  period: DirectionDigestPeriod
): DirectionDigest {
  return {
    id:               generateDirectionDigestId(),
    orgSlug,
    sessionId,
    period,
    headline:         "Resumen no disponible",
    highlights:       [],
    northStarSummary: "No disponible",
    topPriorities:    [],
    watchDeviations:  [],
    keyConflicts:     [],
    confidence:       "LOW",
    limitations:      ["suggestedOnly: true"],
    createdAt:        new Date().toISOString(),
  };
}
