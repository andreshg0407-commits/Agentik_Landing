// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 13: Recommendation Engine
// ALL recommendations are suggestedOnly: true. Never executes. Never modifies systems.

import type {
  DirectionRecommendation,
  DirectionDomain,
  DirectionHorizon,
  DirectionPriorityLevel,
  DirectionConfidence,
  DirectionDeviation,
  DirectionConflict,
  DirectionSignal,
} from "./enterprise-direction-types";
import { generateDirectionRecommendationId } from "./enterprise-direction-identity";

export interface RawRecommendationInput {
  readonly title:        string;
  readonly rationale:    string;
  readonly domain:       DirectionDomain;
  readonly horizon:      DirectionHorizon;
  readonly priority:     DirectionPriorityLevel;
  readonly confidence:   DirectionConfidence;
  readonly evidenceIds?: string[];
  readonly limitations?: string[];
}

export function buildRecommendation(
  orgSlug: string,
  input: RawRecommendationInput
): DirectionRecommendation {
  try {
    return {
      id:           generateDirectionRecommendationId(),
      orgSlug,
      title:        input.title,
      rationale:    input.rationale,
      domain:       input.domain,
      horizon:      input.horizon,
      priority:     input.priority,
      confidence:   input.confidence,
      evidenceIds:  input.evidenceIds ?? [],
      limitations:  input.limitations ?? ["suggestedOnly: true — validación humana requerida"],
      suggestedOnly: true,
      createdAt:    new Date().toISOString(),
    };
  } catch {
    return buildEmptyRecommendation(orgSlug);
  }
}

export function buildRecommendations(
  orgSlug: string,
  inputs: RawRecommendationInput[]
): DirectionRecommendation[] {
  try {
    return inputs.map((i) => buildRecommendation(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankRecommendations(
  recommendations: DirectionRecommendation[]
): DirectionRecommendation[] {
  try {
    const order: Record<DirectionPriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...recommendations].sort(
      (a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
    );
  } catch {
    return recommendations;
  }
}

export function getCriticalRecommendations(
  recommendations: DirectionRecommendation[]
): DirectionRecommendation[] {
  try {
    return recommendations.filter((r) => r.priority === "CRITICAL");
  } catch {
    return [];
  }
}

export function buildRecommendationsFromDeviations(
  orgSlug: string,
  deviations: DirectionDeviation[]
): DirectionRecommendation[] {
  try {
    return deviations
      .filter((d) => d.deviationScore >= 0.40)
      .map((d) =>
        buildRecommendation(orgSlug, {
          title:      `Corregir desviación: ${d.title}`,
          rationale:  d.description,
          domain:     d.domain,
          horizon:    "SHORT_TERM",
          priority:   d.severity,
          confidence: "MEDIUM",
          evidenceIds: d.evidenceIds,
          limitations: ["suggestedOnly: true — derivada de desviación estratégica", "validación humana requerida"],
        })
      );
  } catch {
    return [];
  }
}

export function buildRecommendationsFromConflicts(
  orgSlug: string,
  conflicts: DirectionConflict[]
): DirectionRecommendation[] {
  try {
    return conflicts
      .filter((c) => c.isBlocking || c.conflictScore >= 0.50)
      .map((c) =>
        buildRecommendation(orgSlug, {
          title:      `Resolver conflicto: ${c.title}`,
          rationale:  c.description,
          domain:     c.domain,
          horizon:    "IMMEDIATE",
          priority:   c.severity,
          confidence: "MEDIUM",
          limitations: ["suggestedOnly: true — derivada de conflicto estratégico", "validación humana requerida"],
        })
      );
  } catch {
    return [];
  }
}

export function buildRecommendationsFromSignals(
  orgSlug: string,
  signals: DirectionSignal[]
): DirectionRecommendation[] {
  try {
    return signals
      .filter((s) => s.intensity >= 0.60 && (s.type === "OPPORTUNITY" || s.type === "THREAT"))
      .map((s) =>
        buildRecommendation(orgSlug, {
          title:      `${s.type === "OPPORTUNITY" ? "Capitalizar" : "Mitigar"}: ${s.title}`,
          rationale:  s.description,
          domain:     s.domain,
          horizon:    s.horizon,
          priority:   s.intensity >= 0.80 ? "HIGH" : "MEDIUM",
          confidence: "LOW",
          evidenceIds: s.evidenceIds,
          limitations: ["suggestedOnly: true — derivada de señal estratégica", "validación humana requerida"],
        })
      );
  } catch {
    return [];
  }
}

function buildEmptyRecommendation(orgSlug: string): DirectionRecommendation {
  return {
    id:           generateDirectionRecommendationId(),
    orgSlug,
    title:        "Recomendación no disponible",
    rationale:    "",
    domain:       "CROSS_DOMAIN",
    horizon:      "MEDIUM_TERM",
    priority:     "LOW",
    confidence:   "LOW",
    evidenceIds:  [],
    limitations:  ["suggestedOnly: true"],
    suggestedOnly: true,
    createdAt:    new Date().toISOString(),
  };
}
