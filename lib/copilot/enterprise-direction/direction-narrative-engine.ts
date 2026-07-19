// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 14: Direction Narrative Engine
// Probabilistic language only. Spanish board narrative. suggestedOnly implied.

import type {
  DirectionNarrative,
  NorthStar,
  DirectionAlignment,
  DirectionPriority,
  DirectionDeviation,
  DirectionConflict,
  DirectionSignal,
  DirectionRecommendation,
  DirectionConfidence,
} from "./enterprise-direction-types";

export interface NarrativeInput {
  readonly orgSlug:         string;
  readonly northStar:       NorthStar | null;
  readonly alignment:       DirectionAlignment | null;
  readonly priorities:      DirectionPriority[];
  readonly deviations:      DirectionDeviation[];
  readonly conflicts:       DirectionConflict[];
  readonly signals:         DirectionSignal[];
  readonly recommendations: DirectionRecommendation[];
  readonly overallScore:    number;
  readonly confidence:      DirectionConfidence;
}

function confidenceLabel(confidence: DirectionConfidence): string {
  switch (confidence) {
    case "VERY_HIGH": return "muy alta";
    case "HIGH":      return "alta";
    case "MEDIUM":    return "moderada";
    default:          return "limitada";
  }
}

function buildNorthStarSection(northStar: NorthStar | null): string {
  if (!northStar) {
    return "No se ha definido una estrella norte estratégica. Se sugiere establecer una dirección organizacional clara para orientar las decisiones.";
  }
  const confLabel = confidenceLabel(northStar.confidence);
  return `La organización orienta su dirección hacia: "${northStar.statement}". Esta orientación estratégica presenta una confianza ${confLabel} (score: ${(northStar.score * 100).toFixed(0)}%). Horizon: ${northStar.horizon}. Esta dirección es sugerida y requiere validación ejecutiva.`;
}

function buildAlignmentSection(alignment: DirectionAlignment | null): string {
  if (!alignment) {
    return "No se dispone de evaluación de alineamiento estratégico en este período.";
  }
  const pct = (alignment.alignmentScore * 100).toFixed(0);
  const gapSummary = alignment.gaps.length > 0
    ? ` Se identifican posibles brechas: ${alignment.gaps.slice(0, 3).join("; ")}.`
    : " No se identifican brechas significativas en este análisis.";
  return `El alineamiento estratégico global podría estimarse en ${pct}% (estado: ${alignment.status}).${gapSummary} Fortalezas observadas: ${alignment.strengths.slice(0, 2).join("; ") || "no identificadas"}. Esta estimación es indicativa y no vinculante.`;
}

function buildPrioritiesSection(priorities: DirectionPriority[]): string {
  if (priorities.length === 0) {
    return "No se han identificado prioridades estratégicas formales en el período de análisis.";
  }
  const top = priorities.slice(0, 3).map((p) => `"${p.title}" (${p.level})`).join(", ");
  return `Las prioridades estratégicas observadas incluyen: ${top}. Estas prioridades son sugeridas con base en el análisis disponible y podrían cambiar con información adicional.`;
}

function buildDeviationsSection(deviations: DirectionDeviation[]): string {
  if (deviations.length === 0) {
    return "No se detectaron desviaciones estratégicas significativas en este período.";
  }
  const critical = deviations.filter((d) => d.severity === "CRITICAL");
  const systemic = deviations.filter((d) => d.isSystemic);
  let text = `Se identificaron ${deviations.length} posible(s) desviación(es) estratégica(s).`;
  if (critical.length > 0) text += ` ${critical.length} de estas son de severidad crítica.`;
  if (systemic.length > 0) text += ` ${systemic.length} podrían ser de carácter sistémico.`;
  text += " Se sugiere revisión ejecutiva antes de tomar acciones correctivas.";
  return text;
}

function buildConflictsSection(conflicts: DirectionConflict[]): string {
  if (conflicts.length === 0) {
    return "No se identificaron conflictos estratégicos activos en el período de análisis.";
  }
  const blocking = conflicts.filter((c) => c.isBlocking);
  let text = `Se detectaron ${conflicts.length} posible(s) conflicto(s) estratégico(s).`;
  if (blocking.length > 0) text += ` ${blocking.length} podrían estar bloqueando la ejecución.`;
  text += " Estas observaciones requieren validación antes de tomar decisiones.";
  return text;
}

function buildOpportunitiesSection(signals: DirectionSignal[]): string {
  const opportunities = signals.filter((s) => s.type === "OPPORTUNITY" && s.intensity >= 0.50);
  if (opportunities.length === 0) {
    return "No se identificaron señales de oportunidad significativas en el período.";
  }
  const top = opportunities.slice(0, 3).map((s) => `"${s.title}"`).join(", ");
  return `Se observan ${opportunities.length} posible(s) oportunidad(es) estratégica(s). Principales señales: ${top}. Estas observaciones son indicativas y requieren análisis adicional.`;
}

function buildExecutiveSection(
  overallScore: number,
  confidence: DirectionConfidence,
  recommendations: DirectionRecommendation[]
): string {
  const pct    = (overallScore * 100).toFixed(0);
  const conf   = confidenceLabel(confidence);
  const topRec = recommendations.slice(0, 2).map((r) => `"${r.title}"`).join(", ");
  let text = `La dirección estratégica global podría estimarse en ${pct}% de alineamiento con confianza ${conf}. `;
  if (topRec) {
    text += `Las principales acciones sugeridas son: ${topRec}. `;
  }
  text += "Todas las recomendaciones son sugeridas y no constituyen mandatos ejecutivos. La validación y decisión final corresponde al equipo directivo.";
  return text;
}

function buildLimitationsSection(): string {
  return [
    "Este análisis es exploratorio y no vinculante.",
    "Las proyecciones y evaluaciones son indicativas y podrían diferir de la realidad.",
    "La información se basa en datos disponibles y puede estar incompleta.",
    "Todas las recomendaciones requieren validación ejecutiva antes de implementarse.",
    "suggestedOnly: true — nunca reemplaza el juicio directivo.",
  ].join(" ");
}

export function buildDirectionNarrative(input: NarrativeInput): DirectionNarrative {
  try {
    return {
      northStar:     buildNorthStarSection(input.northStar),
      alignment:     buildAlignmentSection(input.alignment),
      priorities:    buildPrioritiesSection(input.priorities),
      deviations:    buildDeviationsSection(input.deviations),
      conflicts:     buildConflictsSection(input.conflicts),
      opportunities: buildOpportunitiesSection(input.signals),
      executive:     buildExecutiveSection(input.overallScore, input.confidence, input.recommendations),
      limitations:   buildLimitationsSection(),
    };
  } catch {
    return buildEmptyNarrative();
  }
}

export function buildEmptyNarrative(): DirectionNarrative {
  return {
    northStar:     "No disponible.",
    alignment:     "No disponible.",
    priorities:    "No disponible.",
    deviations:    "No disponible.",
    conflicts:     "No disponible.",
    opportunities: "No disponible.",
    executive:     "No disponible.",
    limitations:   "suggestedOnly: true — análisis no disponible.",
  };
}
