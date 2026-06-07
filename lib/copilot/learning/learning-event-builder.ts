// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning event builder — factory functions for each event type

import type {
  LearningEvent,
  LearningEventType,
  LearningSource,
  LearningDomain,
  LearningConfidence,
} from "./learning-types";
import { generateLearningEventId } from "./learning-identity";

export interface LearningEventInput {
  readonly orgSlug: string;
  readonly type: LearningEventType;
  readonly source: LearningSource;
  readonly domain: LearningDomain;
  readonly referenceId: string;
  readonly referenceType: LearningEvent["referenceType"];
  readonly confidence: LearningConfidence;
  readonly confidenceScore: number;
  readonly agentId?: string;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}

export function buildLearningEvent(input: LearningEventInput): LearningEvent {
  return {
    id: generateLearningEventId(),
    orgSlug: input.orgSlug,
    type: input.type,
    source: input.source,
    domain: input.domain,
    referenceId: input.referenceId,
    referenceType: input.referenceType,
    confidence: input.confidence,
    confidenceScore: Math.max(0, Math.min(1, input.confidenceScore)),
    agentId: input.agentId,
    userId: input.userId,
    metadata: input.metadata ?? {},
    occurredAt: new Date().toISOString(),
  };
}

export function buildFeedbackEvent(
  orgSlug: string,
  referenceId: string,
  positive: boolean,
  domain: LearningDomain,
  userId?: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): LearningEvent {
  return buildLearningEvent({
    orgSlug,
    type: positive ? "USER_FEEDBACK_POSITIVE" : "USER_FEEDBACK_NEGATIVE",
    source: "USER",
    domain,
    referenceId,
    referenceType: "FEEDBACK",
    confidence: "HIGH",
    confidenceScore: positive ? 0.9 : 0.85,
    agentId,
    userId,
    metadata: metadata ?? {},
  });
}

export function buildOutcomeEvent(
  orgSlug: string,
  referenceId: string,
  succeeded: boolean,
  domain: LearningDomain,
  source: LearningSource,
  agentId?: string,
  metadata?: Record<string, unknown>
): LearningEvent {
  return buildLearningEvent({
    orgSlug,
    type: succeeded ? "ACTION_SUCCEEDED" : "ACTION_FAILED",
    source,
    domain,
    referenceId,
    referenceType: "ACTION",
    confidence: "HIGH",
    confidenceScore: succeeded ? 0.85 : 0.8,
    agentId,
    metadata: metadata ?? {},
  });
}

export function buildHypothesisEvent(
  orgSlug: string,
  hypothesisId: string,
  confirmed: boolean,
  domain: LearningDomain,
  confidenceScore: number,
  agentId?: string,
  metadata?: Record<string, unknown>
): LearningEvent {
  return buildLearningEvent({
    orgSlug,
    type: confirmed ? "HYPOTHESIS_CONFIRMED" : "HYPOTHESIS_REJECTED",
    source: "CROSS_MODULE_REASONING",
    domain,
    referenceId: hypothesisId,
    referenceType: "HYPOTHESIS",
    confidence: confidenceScore >= 0.8 ? "HIGH" : confidenceScore >= 0.6 ? "MEDIUM" : "LOW",
    confidenceScore,
    agentId,
    metadata: metadata ?? {},
  });
}

export function buildRecommendationEvent(
  orgSlug: string,
  recommendationId: string,
  accepted: boolean,
  domain: LearningDomain,
  agentId?: string,
  userId?: string,
  metadata?: Record<string, unknown>
): LearningEvent {
  return buildLearningEvent({
    orgSlug,
    type: accepted ? "RECOMMENDATION_ACCEPTED" : "RECOMMENDATION_REJECTED",
    source: "COPILOT",
    domain,
    referenceId: recommendationId,
    referenceType: "RECOMMENDATION",
    confidence: "HIGH",
    confidenceScore: accepted ? 0.9 : 0.8,
    agentId,
    userId,
    metadata: metadata ?? {},
  });
}
