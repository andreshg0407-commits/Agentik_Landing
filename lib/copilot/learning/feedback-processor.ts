// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Feedback processor — classify, normalize, and process user/system feedback

import type {
  LearningEvent,
  LearningDomain,
  LearningSource,
  LearningConfidence,
} from "./learning-types";
import { buildLearningEvent } from "./learning-event-builder";

export type FeedbackClassification =
  | "STRONG_POSITIVE"
  | "MILD_POSITIVE"
  | "NEUTRAL"
  | "MILD_NEGATIVE"
  | "STRONG_NEGATIVE";

export interface RawFeedback {
  readonly orgSlug: string;
  readonly referenceId: string;
  readonly referenceType: LearningEvent["referenceType"];
  readonly domain: LearningDomain;
  readonly source: LearningSource;
  /** -1 to +1 */
  readonly rawScore: number;
  readonly agentId?: string;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface NormalizedFeedback {
  readonly orgSlug: string;
  readonly referenceId: string;
  readonly referenceType: LearningEvent["referenceType"];
  readonly domain: LearningDomain;
  readonly source: LearningSource;
  readonly classification: FeedbackClassification;
  readonly normalizedScore: number; // 0–1
  readonly agentId?: string;
  readonly userId?: string;
  readonly metadata: Record<string, unknown>;
}

export function classifyFeedback(rawScore: number): FeedbackClassification {
  if (rawScore >= 0.7) return "STRONG_POSITIVE";
  if (rawScore >= 0.2) return "MILD_POSITIVE";
  if (rawScore > -0.2) return "NEUTRAL";
  if (rawScore >= -0.7) return "MILD_NEGATIVE";
  return "STRONG_NEGATIVE";
}

export function normalizeFeedback(raw: RawFeedback): NormalizedFeedback {
  const clamped = Math.max(-1, Math.min(1, raw.rawScore));
  const normalizedScore = (clamped + 1) / 2; // Map -1..1 → 0..1
  return {
    orgSlug: raw.orgSlug,
    referenceId: raw.referenceId,
    referenceType: raw.referenceType,
    domain: raw.domain,
    source: raw.source,
    classification: classifyFeedback(clamped),
    normalizedScore,
    agentId: raw.agentId,
    userId: raw.userId,
    metadata: raw.metadata ?? {},
  };
}

function classificationToConfidence(cls: FeedbackClassification): {
  confidence: LearningConfidence;
  score: number;
} {
  switch (cls) {
    case "STRONG_POSITIVE":
      return { confidence: "VERY_HIGH", score: 0.95 };
    case "MILD_POSITIVE":
      return { confidence: "HIGH", score: 0.75 };
    case "NEUTRAL":
      return { confidence: "MEDIUM", score: 0.5 };
    case "MILD_NEGATIVE":
      return { confidence: "HIGH", score: 0.7 };
    case "STRONG_NEGATIVE":
      return { confidence: "VERY_HIGH", score: 0.9 };
  }
}

export function processFeedback(raw: RawFeedback): LearningEvent {
  const normalized = normalizeFeedback(raw);
  const { confidence, score } = classificationToConfidence(normalized.classification);
  const isPositive =
    normalized.classification === "STRONG_POSITIVE" ||
    normalized.classification === "MILD_POSITIVE";

  return buildLearningEvent({
    orgSlug: normalized.orgSlug,
    type: isPositive ? "USER_FEEDBACK_POSITIVE" : "USER_FEEDBACK_NEGATIVE",
    source: normalized.source,
    domain: normalized.domain,
    referenceId: normalized.referenceId,
    referenceType: normalized.referenceType,
    confidence,
    confidenceScore: score,
    agentId: normalized.agentId,
    userId: normalized.userId,
    metadata: {
      ...normalized.metadata,
      classification: normalized.classification,
      normalizedScore: normalized.normalizedScore,
    },
  });
}
