// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning application engine — apply learning context to hypotheses and recommendations

import type {
  LearningPattern,
  LearningOutcome,
  LearningDomain,
  LearningApplicationContext,
} from "./learning-types";
import { filterActivePatterns } from "./learning-pattern-engine";
import { getConfidenceMultiplier } from "./tenant-learning-profile";
import type { TenantLearningProfile } from "./learning-types";

export function getLearningContext(
  orgSlug: string,
  domain: LearningDomain,
  patterns: LearningPattern[],
  recentOutcomes: LearningOutcome[],
  tenantProfile: TenantLearningProfile
): LearningApplicationContext {
  const domainPatterns = filterActivePatterns(
    patterns.filter((p) => p.orgSlug === orgSlug && p.domain === domain)
  );

  const domainOutcomes = recentOutcomes.filter(
    (o) => o.orgSlug === orgSlug && o.domain === domain
  );

  const multiplier = getConfidenceMultiplier(tenantProfile);

  // Compute boost from positive patterns
  const positivePatterns = domainPatterns.filter(
    (p) => p.netScore > 0
  );
  const confidenceBoost =
    positivePatterns.length > 0
      ? Math.min(
          0.2,
          positivePatterns.reduce((sum, p) => sum + p.confidenceScore * 0.1, 0) * multiplier
        )
      : 0;

  // Compute penalty from negative patterns
  const negativePatterns = domainPatterns.filter(
    (p) => p.netScore < 0
  );
  const confidencePenalty =
    negativePatterns.length > 0
      ? Math.min(
          0.15,
          negativePatterns.reduce((sum, p) => sum + (1 - p.confidenceScore) * 0.08, 0)
        )
      : 0;

  return {
    orgSlug,
    domain,
    patterns: domainPatterns,
    recentOutcomes: domainOutcomes,
    confidenceBoost,
    confidencePenalty,
  };
}

export interface HypothesisWithLearning {
  readonly hypothesisId: string;
  readonly originalConfidence: number;
  readonly adjustedConfidence: number;
  readonly boostApplied: number;
  readonly penaltyApplied: number;
  readonly patternsApplied: number;
}

export function applyLearningToHypothesis(
  hypothesisId: string,
  originalConfidence: number,
  context: LearningApplicationContext
): HypothesisWithLearning {
  const boost = context.confidenceBoost;
  const penalty = context.confidencePenalty;
  const adjusted = Math.max(0.05, Math.min(0.98, originalConfidence + boost - penalty));

  return {
    hypothesisId,
    originalConfidence,
    adjustedConfidence: adjusted,
    boostApplied: boost,
    penaltyApplied: penalty,
    patternsApplied: context.patterns.length,
  };
}

export interface RecommendationWithLearning {
  readonly recommendationId: string;
  readonly originalPriority: string;
  readonly suggestedPriority: string | null;
  readonly confidenceBoost: number;
  readonly confidencePenalty: number;
  readonly patternsApplied: number;
}

export function applyLearningToRecommendation(
  recommendationId: string,
  originalPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  context: LearningApplicationContext
): RecommendationWithLearning {
  const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  type Priority = (typeof PRIORITY_ORDER)[number];

  const boost = context.confidenceBoost;
  const penalty = context.confidencePenalty;

  let suggestedPriority: string | null = null;
  const currentIdx = PRIORITY_ORDER.indexOf(originalPriority as Priority);

  // Only suggest escalation/deescalation if the net effect is significant
  const net = boost - penalty;
  if (net >= 0.1 && currentIdx < PRIORITY_ORDER.length - 1) {
    suggestedPriority = PRIORITY_ORDER[currentIdx + 1];
  } else if (net <= -0.1 && currentIdx > 0) {
    suggestedPriority = PRIORITY_ORDER[currentIdx - 1];
  }

  return {
    recommendationId,
    originalPriority,
    suggestedPriority,
    confidenceBoost: boost,
    confidencePenalty: penalty,
    patternsApplied: context.patterns.length,
  };
}
