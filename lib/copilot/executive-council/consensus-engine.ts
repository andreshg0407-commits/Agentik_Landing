// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 14: Consensus Engine
// Computes agreement scores, votes, and consensus outcome from council opinions.

import type {
  ExecutiveOpinion,
  ExecutiveVote,
  ExecutiveConsensus,
  CouncilPerspective,
  CouncilOutcome,
} from "./executive-council-types";
import {
  councilConfidenceFromScore,
  councilOutcomeFromAgreement,
} from "./executive-council-types";
import { newConsensusId } from "./executive-council-identity";
import { getPerspectiveWeight } from "./perspective-registry";
import { hasBlockingOpposition } from "./argument-engine";

export function buildVotes(opinions: ExecutiveOpinion[]): ExecutiveVote[] {
  return opinions.map((o) => {
    const hasStrongOppose = o.arguments.some((a) => a.type === "OPPOSE" && a.strength === "STRONG");
    const hasSupport      = o.arguments.some((a) => a.type === "SUPPORT");
    const hasQualify      = o.arguments.some((a) => a.type === "QUALIFY");

    let position: ExecutiveVote["position"];
    if (o.priority === "CRITICAL" && hasStrongOppose) {
      position = "DISAGREE";
    } else if (hasStrongOppose && !hasSupport) {
      position = "DISAGREE";
    } else if (hasQualify && !hasStrongOppose) {
      position = "CONDITIONAL";
    } else if (o.arguments.length === 0) {
      position = "ABSTAIN";
    } else {
      position = "AGREE";
    }

    return {
      perspective: o.perspective,
      position,
      weight:      getPerspectiveWeight(o.perspective),
      rationale:   o.stance,
    };
  });
}

export function computeAgreementScore(votes: ExecutiveVote[]): number {
  if (votes.length === 0) return 0;

  const totalWeight   = votes.reduce((s, v) => s + v.weight, 0);
  const agreeWeight   = votes
    .filter((v) => v.position === "AGREE" || v.position === "CONDITIONAL")
    .reduce((s, v) => s + v.weight * (v.position === "CONDITIONAL" ? 0.6 : 1.0), 0);

  return totalWeight === 0 ? 0 : Math.min(1, agreeWeight / totalWeight);
}

export function buildConsensus(
  orgSlug:   string,
  sessionId: string,
  opinions:  ExecutiveOpinion[],
  topic:     string
): ExecutiveConsensus {
  try {
    if (opinions.length === 0) {
      const id = newConsensusId();
      return {
        id, orgSlug, sessionId,
        outcome:                "NO_CONSENSUS",
        title:                  "Sin opiniones",
        summary:                "No hay perspectivas suficientes para construir consenso",
        votes:                  [],
        agreementScore:         0,
        confidence:             "LOW",
        dominantPerspective:    "EXECUTIVE",
        supportingPerspectives: [],
        opposingPerspectives:   [],
        limitations:            ["Sin opiniones disponibles"],
        metadata:               { engine: "CONSENSUS", empty: true },
        reachedAt:              new Date().toISOString(),
      };
    }

    const votes          = buildVotes(opinions);
    const agreementScore = computeAgreementScore(votes);
    const isBlocked      = hasBlockingOpposition(opinions);

    const outcome: CouncilOutcome = isBlocked && agreementScore < 0.5
      ? "ESCALATION_REQUIRED"
      : councilOutcomeFromAgreement(agreementScore);

    const supportingPerspectives: CouncilPerspective[] = votes
      .filter((v) => v.position === "AGREE" || v.position === "CONDITIONAL")
      .map((v) => v.perspective);
    const opposingPerspectives: CouncilPerspective[] = votes
      .filter((v) => v.position === "DISAGREE")
      .map((v) => v.perspective);

    // Dominant perspective: highest-weight supporter, or highest-priority opinion
    const dominantVote = [...votes]
      .filter((v) => v.position === "AGREE")
      .sort((a, b) => b.weight - a.weight)[0];
    const dominantPerspective: CouncilPerspective = dominantVote?.perspective
      ?? opinions.sort((a, b) => {
        const rank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
        return rank[b.priority] - rank[a.priority];
      })[0]?.perspective
      ?? "EXECUTIVE";

    const avgConfidence = opinions.reduce((s, o) => s + o.confidenceScore, 0) / opinions.length;

    const limitations: string[] = [
      ...(isBlocked ? ["Una o más perspectivas con oposición fuerte bloquean el consenso completo"] : []),
      ...(agreementScore < 0.5 ? ["Acuerdo bajo — se requiere revisión adicional"] : []),
      ...(opinions.length < 3 ? ["Pocas perspectivas disponibles — consenso puede ser incompleto"] : []),
    ];

    const summary = outcome === "CONSENSUS"
      ? `Consenso alcanzado (${Math.round(agreementScore * 100)}%) en ${opinions.length} perspectivas sobre: ${topic}`
      : outcome === "PARTIAL_CONSENSUS"
      ? `Consenso parcial (${Math.round(agreementScore * 100)}%): ${supportingPerspectives.length} perspectivas a favor, ${opposingPerspectives.length} en contra`
      : outcome === "ESCALATION_REQUIRED"
      ? `Escalación requerida: bloqueos críticos en perspectivas ${opposingPerspectives.join(", ")}`
      : `Sin consenso (${Math.round(agreementScore * 100)}%): posiciones divergentes no resueltas`;

    const id = newConsensusId();
    return {
      id, orgSlug, sessionId,
      outcome,
      title:                  `Consenso — ${topic}`,
      summary,
      votes,
      agreementScore:         Math.round(agreementScore * 100) / 100,
      confidence:             councilConfidenceFromScore(avgConfidence),
      dominantPerspective,
      supportingPerspectives,
      opposingPerspectives,
      limitations,
      metadata:               { engine: "CONSENSUS", perspectiveCount: opinions.length, isBlocked },
      reachedAt:              new Date().toISOString(),
    };
  } catch {
    const id = newConsensusId();
    return {
      id, orgSlug, sessionId,
      outcome:                "NO_CONSENSUS",
      title:                  "Error en consenso",
      summary:                "No se pudo construir el consenso",
      votes:                  [],
      agreementScore:         0,
      confidence:             "LOW",
      dominantPerspective:    "EXECUTIVE",
      supportingPerspectives: [],
      opposingPerspectives:   [],
      limitations:            ["Error interno al construir consenso"],
      metadata:               { engine: "CONSENSUS", error: true },
      reachedAt:              new Date().toISOString(),
    };
  }
}
