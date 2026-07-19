// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 16: Direction Briefing Engine

import type {
  DirectionBriefing,
  DirectionBriefingType,
  DirectionConfidence,
  NorthStar,
  DirectionObjective,
  DirectionPriority,
  DirectionDeviation,
  DirectionConflict,
  DirectionRecommendation,
} from "./enterprise-direction-types";
import { generateDirectionBriefingId } from "./enterprise-direction-identity";

export interface BriefingInput {
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly type:            DirectionBriefingType;
  readonly northStar:       NorthStar | null;
  readonly objectives:      DirectionObjective[];
  readonly priorities:      DirectionPriority[];
  readonly deviations:      DirectionDeviation[];
  readonly conflicts:       DirectionConflict[];
  readonly recommendations: DirectionRecommendation[];
  readonly overallScore:    number;
  readonly confidence:      DirectionConfidence;
}

interface BriefingConfig {
  readonly title:           string;
  readonly maxObjectives:   number;
  readonly maxPriorities:   number;
  readonly maxDeviations:   number;
  readonly maxConflicts:    number;
  readonly maxRecs:         number;
  readonly focusDeviation:  boolean;
  readonly focusGrowth:     boolean;
}

const BRIEFING_CONFIGS: Record<DirectionBriefingType, BriefingConfig> = {
  CEO: {
    title:          "Briefing ejecutivo — CEO",
    maxObjectives:  5,
    maxPriorities:  5,
    maxDeviations:  3,
    maxConflicts:   3,
    maxRecs:        5,
    focusDeviation: false,
    focusGrowth:    false,
  },
  EXECUTIVE: {
    title:          "Briefing ejecutivo — Comité de Dirección",
    maxObjectives:  8,
    maxPriorities:  7,
    maxDeviations:  5,
    maxConflicts:   5,
    maxRecs:        7,
    focusDeviation: false,
    focusGrowth:    false,
  },
  BOARD: {
    title:          "Briefing estratégico — Junta Directiva",
    maxObjectives:  5,
    maxPriorities:  5,
    maxDeviations:  3,
    maxConflicts:   3,
    maxRecs:        5,
    focusDeviation: false,
    focusGrowth:    false,
  },
  GROWTH: {
    title:          "Briefing de crecimiento — Dirección Comercial",
    maxObjectives:  6,
    maxPriorities:  6,
    maxDeviations:  3,
    maxConflicts:   2,
    maxRecs:        6,
    focusDeviation: false,
    focusGrowth:    true,
  },
  RISK: {
    title:          "Briefing de riesgos — Comité de Riesgos",
    maxObjectives:  4,
    maxPriorities:  4,
    maxDeviations:  6,
    maxConflicts:   6,
    maxRecs:        6,
    focusDeviation: true,
    focusGrowth:    false,
  },
};

function buildSummary(
  type: DirectionBriefingType,
  score: number,
  confidence: DirectionConfidence,
  northStar: NorthStar | null
): string {
  const pct  = (score * 100).toFixed(0);
  const ns   = northStar ? `"${northStar.statement}"` : "no definida";
  return `Briefing de dirección estratégica tipo ${type}. Alineamiento estimado: ${pct}% (confianza: ${confidence}). Estrella norte: ${ns}. Este briefing es sugerido y requiere validación ejecutiva.`;
}

export function buildDirectionBriefing(input: BriefingInput): DirectionBriefing {
  try {
    const config = BRIEFING_CONFIGS[input.type];

    const filteredObjectives = input.objectives
      .filter((o) => !config.focusGrowth || o.domain === "GROWTH")
      .slice(0, config.maxObjectives)
      .map((o) => `${o.title} (${o.priority})`);

    const filteredPriorities = input.priorities
      .slice(0, config.maxPriorities)
      .map((p) => `${p.title} (${p.level})`);

    const filteredDeviations = (
      config.focusDeviation
        ? [...input.deviations].sort((a, b) => b.deviationScore - a.deviationScore)
        : input.deviations.filter((d) => d.severity === "CRITICAL" || d.isSystemic)
    )
      .slice(0, config.maxDeviations)
      .map((d) => `${d.title} — score: ${(d.deviationScore * 100).toFixed(0)}%`);

    const filteredConflicts = (
      config.focusDeviation
        ? input.conflicts.filter((c) => c.isBlocking)
        : input.conflicts
    )
      .slice(0, config.maxConflicts)
      .map((c) => `${c.title} (${c.type})`);

    const filteredRecs = input.recommendations
      .slice(0, config.maxRecs)
      .map((r) => `${r.title} — ${r.priority}`);

    return {
      id:                  generateDirectionBriefingId(),
      orgSlug:             input.orgSlug,
      sessionId:           input.sessionId,
      type:                input.type,
      title:               config.title,
      summary:             buildSummary(input.type, input.overallScore, input.confidence, input.northStar),
      northStar:           input.northStar?.statement ?? "No definida",
      keyObjectives:       filteredObjectives,
      topPriorities:       filteredPriorities,
      criticalDeviations:  filteredDeviations,
      blockingConflicts:   filteredConflicts,
      recommendations:     filteredRecs,
      confidence:          input.confidence,
      limitations:         [
        "suggestedOnly: true — este briefing es informativo y no vinculante",
        "Todas las recomendaciones requieren validación antes de implementarse",
        "Los datos son indicativos y pueden estar incompletos",
      ],
      createdAt:           new Date().toISOString(),
    };
  } catch {
    return buildEmptyBriefing(input.orgSlug, input.sessionId, input.type);
  }
}

function buildEmptyBriefing(
  orgSlug: string,
  sessionId: string,
  type: DirectionBriefingType
): DirectionBriefing {
  return {
    id:                  generateDirectionBriefingId(),
    orgSlug,
    sessionId,
    type,
    title:               BRIEFING_CONFIGS[type]?.title ?? "Briefing no disponible",
    summary:             "No disponible",
    northStar:           "No definida",
    keyObjectives:       [],
    topPriorities:       [],
    criticalDeviations:  [],
    blockingConflicts:   [],
    recommendations:     [],
    confidence:          "LOW",
    limitations:         ["suggestedOnly: true"],
    createdAt:           new Date().toISOString(),
  };
}
