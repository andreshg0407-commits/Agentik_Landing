// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 13: Governance Recommendation Engine
// All recommendations are suggestedOnly: true — never auto-executes

import type {
  GovernanceRecommendation,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceConfidence,
  GovernanceViolation,
  GovernanceException,
  GovernanceEscalation,
  GovernanceRisk,
} from "./executive-governance-types";
import { generateGovernanceRecommendationId as generateRecommendationId } from "./executive-governance-identity";

export interface RawGovernanceRecommendationInput {
  readonly title:        string;
  readonly rationale:    string;
  readonly domain:       GovernanceDomain;
  readonly priority:     GovernancePriorityLevel;
  readonly confidence:   GovernanceConfidence;
  readonly evidenceIds?: string[];
  readonly limitations?: string[];
}

export function buildGovernanceRecommendation(
  orgSlug: string,
  sessionId: string,
  input: RawGovernanceRecommendationInput
): GovernanceRecommendation {
  try {
    const baseLimitations = [
      "suggestedOnly: true — validación y aprobación humana requerida",
      "No ejecuta ninguna acción automáticamente",
    ];
    return {
      id:           generateRecommendationId(),
      orgSlug,
      sessionId,
      title:        input.title,
      rationale:    input.rationale,
      domain:       input.domain,
      priority:     input.priority,
      confidence:   input.confidence,
      evidenceIds:       input.evidenceIds ?? [],
      limitations:       [...baseLimitations, ...(input.limitations ?? [])],
      suggestedOnly:     true,
      createdAt:         new Date().toISOString(),
    };
  } catch {
    return buildEmptyGovernanceRecommendation(orgSlug, sessionId);
  }
}

export function buildGovernanceRecommendations(
  orgSlug: string,
  sessionId: string,
  inputs: RawGovernanceRecommendationInput[]
): GovernanceRecommendation[] {
  try {
    return inputs.map((i) => buildGovernanceRecommendation(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function rankGovernanceRecommendations(
  recommendations: GovernanceRecommendation[]
): GovernanceRecommendation[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...recommendations].sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
  } catch {
    return recommendations;
  }
}

export function buildRecommendationsFromViolations(
  orgSlug: string,
  sessionId: string,
  violations: GovernanceViolation[]
): GovernanceRecommendation[] {
  try {
    return violations.slice(0, 5).map((v) =>
      buildGovernanceRecommendation(orgSlug, sessionId, {
        title:      `Remediar violación: ${v.title}`,
        rationale:  `Violación tipo ${v.type} en dominio ${v.domain} requiere acción correctiva`,
        domain:     v.domain,
        priority:   v.severity,
        confidence: "MEDIUM",
      })
    );
  } catch {
    return [];
  }
}

export function buildRecommendationsFromExceptions(
  orgSlug: string,
  sessionId: string,
  exceptions: GovernanceException[]
): GovernanceRecommendation[] {
  try {
    return exceptions.slice(0, 5).map((e) =>
      buildGovernanceRecommendation(orgSlug, sessionId, {
        title:      `Resolver excepción: ${e.title}`,
        rationale:  `Excepción tipo ${e.type} en dominio ${e.domain} requiere revisión formal`,
        domain:     e.domain,
        priority:   e.severity,
        confidence: "MEDIUM",
      })
    );
  } catch {
    return [];
  }
}

export function buildRecommendationsFromEscalations(
  orgSlug: string,
  sessionId: string,
  escalations: GovernanceEscalation[]
): GovernanceRecommendation[] {
  try {
    return escalations.slice(0, 5).map((e) =>
      buildGovernanceRecommendation(orgSlug, sessionId, {
        title:      `Resolver escalación: ${e.title}`,
        rationale:  e.justification,
        domain:     e.domain,
        priority:   e.severity,
        confidence: "HIGH",
      })
    );
  } catch {
    return [];
  }
}

export function buildRecommendationsFromRisks(
  orgSlug: string,
  sessionId: string,
  risks: GovernanceRisk[]
): GovernanceRecommendation[] {
  try {
    return risks
      .filter((r) => r.riskScore > 0.50)
      .slice(0, 5)
      .map((r) =>
        buildGovernanceRecommendation(orgSlug, sessionId, {
          title:      `Mitigar riesgo: ${r.title}`,
          rationale:  `Riesgo tipo ${r.type} con puntuación ${r.riskScore.toFixed(2)} requiere plan de mitigación`,
          domain:     r.domain,
          priority:   r.severity,
          confidence: "MEDIUM",
        })
      );
  } catch {
    return [];
  }
}

export function getCriticalGovernanceRecommendations(
  recommendations: GovernanceRecommendation[]
): GovernanceRecommendation[] {
  try {
    return recommendations.filter((r) => r.priority === "CRITICAL");
  } catch {
    return [];
  }
}

function buildEmptyGovernanceRecommendation(
  orgSlug: string,
  sessionId: string
): GovernanceRecommendation {
  return {
    id:           generateRecommendationId(),
    orgSlug,
    sessionId,
    title:        "Recomendación no disponible",
    rationale:    "",
    domain:       "CROSS_DOMAIN",
    priority:     "LOW",
    confidence:   "LOW",
    evidenceIds:  [],
    limitations:       ["suggestedOnly: true — validación y aprobación humana requerida"],
    suggestedOnly:     true,
    createdAt:         new Date().toISOString(),
  };
}
