// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning signal engine — event → signal conversion

import type {
  LearningEvent,
  LearningSignal,
  LearningSignalStrength,
  LearningEventType,
} from "./learning-types";
import { generateLearningSignalId } from "./learning-identity";

function eventToDirection(
  type: LearningEventType
): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
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

function confidenceToStrength(confidenceScore: number): LearningSignalStrength {
  if (confidenceScore >= 0.9) return "DEFINITIVE";
  if (confidenceScore >= 0.75) return "STRONG";
  if (confidenceScore >= 0.5) return "MODERATE";
  return "WEAK";
}

function buildDescription(event: LearningEvent): string {
  const domainLabel = event.domain.toLowerCase().replace("_", " ");
  switch (event.type) {
    case "HYPOTHESIS_CONFIRMED":
      return `Hypothesis confirmed in ${domainLabel} domain (ref: ${event.referenceId})`;
    case "HYPOTHESIS_REJECTED":
      return `Hypothesis rejected in ${domainLabel} domain (ref: ${event.referenceId})`;
    case "RECOMMENDATION_ACCEPTED":
      return `Recommendation accepted by ${event.userId ?? event.agentId ?? "user"} in ${domainLabel}`;
    case "RECOMMENDATION_REJECTED":
      return `Recommendation rejected in ${domainLabel} domain`;
    case "ACTION_SUCCEEDED":
      return `Action succeeded in ${domainLabel} via ${event.source.toLowerCase()}`;
    case "ACTION_FAILED":
      return `Action failed in ${domainLabel} via ${event.source.toLowerCase()}`;
    case "USER_FEEDBACK_POSITIVE":
      return `Positive user feedback received for ${domainLabel} activity`;
    case "USER_FEEDBACK_NEGATIVE":
      return `Negative user feedback received for ${domainLabel} activity`;
    case "PATTERN_REINFORCED":
      return `Pattern reinforced in ${domainLabel} domain`;
    case "PATTERN_WEAKENED":
      return `Pattern weakened in ${domainLabel} domain`;
    default:
      return `Learning signal from ${domainLabel} domain`;
  }
}

export function eventToLearningSignal(event: LearningEvent): LearningSignal {
  return {
    id: generateLearningSignalId(),
    orgSlug: event.orgSlug,
    eventId: event.id,
    domain: event.domain,
    strength: confidenceToStrength(event.confidenceScore),
    direction: eventToDirection(event.type),
    description: buildDescription(event),
    metadata: {
      eventType: event.type,
      source: event.source,
      agentId: event.agentId,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function eventsToSignals(events: LearningEvent[]): LearningSignal[] {
  return events.map(eventToLearningSignal);
}

export function filterPositiveSignals(signals: LearningSignal[]): LearningSignal[] {
  return signals.filter((s) => s.direction === "POSITIVE");
}

export function filterNegativeSignals(signals: LearningSignal[]): LearningSignal[] {
  return signals.filter((s) => s.direction === "NEGATIVE");
}

export function scoreSignalSet(signals: LearningSignal[]): number {
  if (signals.length === 0) return 0;
  const strengthWeights: Record<LearningSignalStrength, number> = {
    WEAK: 0.25,
    MODERATE: 0.5,
    STRONG: 0.75,
    DEFINITIVE: 1.0,
  };
  let score = 0;
  for (const signal of signals) {
    const weight = strengthWeights[signal.strength];
    score += signal.direction === "POSITIVE" ? weight : signal.direction === "NEGATIVE" ? -weight : 0;
  }
  return Math.max(-1, Math.min(1, score / signals.length));
}
