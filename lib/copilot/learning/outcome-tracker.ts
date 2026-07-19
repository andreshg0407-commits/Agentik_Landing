// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Outcome tracker — track, evaluate, and compare learning outcomes

import type {
  LearningEvent,
  LearningOutcome,
  LearningOutcomeResult,
  LearningDomain,
  LearningEventType,
} from "./learning-types";
import { generateLearningOutcomeId } from "./learning-identity";

function eventTypeToOutcomeResult(type: LearningEventType): LearningOutcomeResult {
  switch (type) {
    case "HYPOTHESIS_CONFIRMED":
    case "RECOMMENDATION_ACCEPTED":
    case "ACTION_SUCCEEDED":
    case "USER_FEEDBACK_POSITIVE":
    case "PATTERN_REINFORCED":
      return "POSITIVE";
    case "HYPOTHESIS_REJECTED":
    case "RECOMMENDATION_REJECTED":
    case "ACTION_FAILED":
    case "USER_FEEDBACK_NEGATIVE":
    case "PATTERN_WEAKENED":
      return "NEGATIVE";
    default:
      return "NEUTRAL";
  }
}

function computeImpactScore(
  event: LearningEvent,
  result: LearningOutcomeResult
): number {
  const base = event.confidenceScore;
  // Amplify strong signals, dampen neutral
  if (result === "POSITIVE") return Math.min(1, base * 1.1);
  if (result === "NEGATIVE") return Math.min(1, base * 0.9);
  return base * 0.5;
}

export function trackOutcome(
  event: LearningEvent,
  patternId?: string
): LearningOutcome {
  const result = eventTypeToOutcomeResult(event.type);
  return {
    id: generateLearningOutcomeId(),
    orgSlug: event.orgSlug,
    eventId: event.id,
    patternId,
    result,
    domain: event.domain,
    description: `Outcome tracked for ${event.type.toLowerCase().replace(/_/g, " ")} in ${event.domain.toLowerCase()} domain`,
    impactScore: computeImpactScore(event, result),
    metadata: {
      source: event.source,
      agentId: event.agentId,
      referenceId: event.referenceId,
      referenceType: event.referenceType,
    },
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluateOutcome(outcome: LearningOutcome): {
  isPositive: boolean;
  isNegative: boolean;
  isMeaningful: boolean;
} {
  return {
    isPositive: outcome.result === "POSITIVE",
    isNegative: outcome.result === "NEGATIVE",
    isMeaningful: outcome.impactScore >= 0.5,
  };
}

export function compareOutcomes(
  a: LearningOutcome,
  b: LearningOutcome
): "A_BETTER" | "B_BETTER" | "EQUAL" {
  if (a.result === b.result) {
    if (Math.abs(a.impactScore - b.impactScore) < 0.05) return "EQUAL";
    return a.impactScore > b.impactScore ? "A_BETTER" : "B_BETTER";
  }
  if (a.result === "POSITIVE" && b.result !== "POSITIVE") return "A_BETTER";
  if (b.result === "POSITIVE" && a.result !== "POSITIVE") return "B_BETTER";
  if (a.result === "NEUTRAL") return "B_BETTER";
  return "A_BETTER";
}

export function aggregateOutcomes(
  outcomes: LearningOutcome[],
  domain?: LearningDomain
): {
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  averageImpact: number;
  netScore: number;
} {
  const filtered = domain ? outcomes.filter((o) => o.domain === domain) : outcomes;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let impactSum = 0;

  for (const o of filtered) {
    if (o.result === "POSITIVE") positiveCount++;
    else if (o.result === "NEGATIVE") negativeCount++;
    else neutralCount++;
    impactSum += o.impactScore;
  }

  const total = filtered.length;
  return {
    positiveCount,
    negativeCount,
    neutralCount,
    averageImpact: total > 0 ? impactSum / total : 0,
    netScore: positiveCount - negativeCount,
  };
}
