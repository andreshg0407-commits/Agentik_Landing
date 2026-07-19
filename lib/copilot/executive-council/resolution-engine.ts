// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 16: Resolution Engine
// Synthesizes council opinions into actionable resolutions with recommendations.

import type {
  ExecutiveOpinion,
  ExecutiveConsensus,
  ExecutiveDisagreement,
  ExecutiveCouncilRecommendation,
  ExecutiveResolution,
} from "./executive-council-types";
import { councilConfidenceFromScore } from "./executive-council-types";
import { newResolutionId, newRecommendationId } from "./executive-council-identity";

const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function buildRecommendationsFromOpinions(
  orgSlug:   string,
  sessionId: string,
  opinions:  ExecutiveOpinion[]
): ExecutiveCouncilRecommendation[] {
  const recs: ExecutiveCouncilRecommendation[] = [];

  for (const opinion of opinions) {
    const supportArgs = opinion.arguments.filter((a) => a.type === "SUPPORT");
    for (const arg of supportArgs.slice(0, 2)) {
      recs.push({
        id:              newRecommendationId(),
        orgSlug,
        sessionId,
        title:           arg.claim,
        description:     arg.rationale,
        rationale:       `Recomendación derivada de la perspectiva ${opinion.perspective}: ${opinion.stance}`,
        perspective:     opinion.perspective,
        priority:        opinion.priority,
        confidence:      opinion.confidence,
        confidenceScore: opinion.confidenceScore,
        impactScore:     arg.strength === "STRONG" ? 0.85 : arg.strength === "MODERATE" ? 0.65 : 0.40,
        suggestedOnly:   true,
        evidenceIds:     arg.evidenceIds,
        metadata:        { argId: arg.id, engine: "RESOLUTION" },
      });
    }
  }

  // Deduplicate by title prefix (first 40 chars)
  const seen = new Set<string>();
  return recs.filter((r) => {
    const key = r.title.slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]).slice(0, 8);
}

export function buildResolution(
  orgSlug:       string,
  sessionId:     string,
  topic:         string,
  opinions:      ExecutiveOpinion[],
  consensus:     ExecutiveConsensus | null,
  disagreements: ExecutiveDisagreement[]
): ExecutiveResolution {
  try {
    const recommendations = buildRecommendationsFromOpinions(orgSlug, sessionId, opinions);
    const blockingCount   = disagreements.filter((d) => d.severity === "CRITICAL" && !d.canBeResolved).length;
    const outcome         = consensus?.outcome ?? "NO_CONSENSUS";

    const avgConfidence = recommendations.length > 0
      ? recommendations.reduce((s, r) => s + r.confidenceScore, 0) / recommendations.length
      : 0.3;

    const limitations: string[] = [
      ...(blockingCount > 0 ? [`${blockingCount} desacuerdo(s) bloqueante(s) no resuelto(s)`] : []),
      ...(recommendations.length === 0 ? ["Sin recomendaciones generadas — perspectivas sin argumentos de soporte"] : []),
      ...(opinions.length < 3 ? ["Consejo incompleto — menos de 3 perspectivas"] : []),
      "Todas las recomendaciones son sugerencias — requieren validación y aprobación ejecutiva",
    ];

    const description = outcome === "CONSENSUS"
      ? `El consejo alcanzó consenso sobre: ${topic}. Se generaron ${recommendations.length} recomendación(es).`
      : outcome === "PARTIAL_CONSENSUS"
      ? `Consenso parcial sobre: ${topic}. ${disagreements.length} desacuerdo(s) subsisten.`
      : outcome === "ESCALATION_REQUIRED"
      ? `Escalación requerida para: ${topic}. Bloqueos en ${blockingCount} perspectiva(s).`
      : `Sin consenso para: ${topic}. Se documentan posiciones divergentes.`;

    const id = newResolutionId();
    return {
      id,
      orgSlug,
      sessionId,
      title:           `Resolución del Consejo — ${topic}`,
      description,
      outcome,
      recommendations,
      consensus,
      disagreements,
      confidenceScore: Math.round(avgConfidence * 100) / 100,
      confidence:      councilConfidenceFromScore(avgConfidence),
      suggestedOnly:   true,
      limitations,
      metadata:        {
        engine:            "RESOLUTION",
        opinionCount:      opinions.length,
        recommendationCount: recommendations.length,
        disagreementCount: disagreements.length,
        blockingCount,
      },
      resolvedAt:      new Date().toISOString(),
    };
  } catch {
    const id = newResolutionId();
    return {
      id,
      orgSlug,
      sessionId,
      title:           `Resolución — ${topic}`,
      description:     "Error al construir la resolución del consejo",
      outcome:         "NO_CONSENSUS",
      recommendations: [],
      consensus,
      disagreements,
      confidenceScore: 0,
      confidence:      "LOW",
      suggestedOnly:   true,
      limitations:     ["Error interno en el motor de resolución"],
      metadata:        { engine: "RESOLUTION", error: true },
      resolvedAt:      new Date().toISOString(),
    };
  }
}
