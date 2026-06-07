// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Cross-Module Reasoning integration adapter

import type { LearningEvent, LearningDomain } from "../learning-types";
import { buildHypothesisEvent, buildRecommendationEvent } from "../learning-event-builder";

// Lightweight shapes to avoid circular deps with cross-module-reasoning module
interface ReasoningHypothesisRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly category: string;
  readonly confidence: number;
  readonly supported: boolean;
  readonly contradicted: boolean;
}

interface ReasoningRecommendationRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly type: string;
  readonly priority: string;
  readonly accepted?: boolean;
}

interface ReasoningResultRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly status: string;
  readonly confidenceScore?: number;
}

function categoryToLearningDomain(category: string): LearningDomain {
  switch (category.toUpperCase()) {
    case "FINANCIAL":
    case "FINANCE":
      return "FINANCE";
    case "COMMERCIAL":
    case "SALES":
      return "COMMERCIAL";
    case "MARKETING":
      return "MARKETING";
    case "OPERATIONS":
    case "OPERATIONAL":
      return "OPERATIONS";
    case "EXECUTIVE":
      return "EXECUTIVE";
    case "COMPLIANCE":
      return "COMPLIANCE";
    default:
      return "CROSS_MODULE";
  }
}

export function hypothesisOutcomeToLearningEvent(
  orgSlug: string,
  hypothesis: ReasoningHypothesisRef,
  agentId?: string
): LearningEvent {
  if (hypothesis.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: hypothesis belongs to "${hypothesis.orgSlug}", not "${orgSlug}"`
    );
  }

  const confirmed = hypothesis.supported && !hypothesis.contradicted;
  const domain = categoryToLearningDomain(hypothesis.category);

  return buildHypothesisEvent(
    orgSlug,
    hypothesis.id,
    confirmed,
    domain,
    hypothesis.confidence,
    agentId,
    { hypothesisCategory: hypothesis.category }
  );
}

export function recommendationOutcomeToLearningEvent(
  orgSlug: string,
  recommendation: ReasoningRecommendationRef,
  agentId?: string,
  userId?: string
): LearningEvent {
  if (recommendation.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: recommendation belongs to "${recommendation.orgSlug}", not "${orgSlug}"`
    );
  }

  const accepted = recommendation.accepted === true;
  const domain = categoryToLearningDomain(recommendation.type);

  return buildRecommendationEvent(
    orgSlug,
    recommendation.id,
    accepted,
    domain,
    agentId,
    userId,
    { recommendationType: recommendation.type, priority: recommendation.priority }
  );
}

export function reasoningResultToLearningEvents(
  orgSlug: string,
  result: ReasoningResultRef,
  hypotheses: ReasoningHypothesisRef[],
  agentId?: string
): LearningEvent[] {
  if (result.orgSlug !== orgSlug) return [];
  if (result.status === "FAILED") return [];

  return hypotheses
    .filter((h) => h.orgSlug === orgSlug)
    .map((h) => hypothesisOutcomeToLearningEvent(orgSlug, h, agentId));
}
