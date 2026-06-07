// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Confidence adjustment engine — suggests adjustments only, never auto-applies

import type {
  LearningPattern,
  LearningAdjustment,
  LearningAdjustmentDirection,
  LearningDomain,
} from "./learning-types";
import { generateLearningAdjustmentId } from "./learning-identity";

const MAX_ADJUSTMENT_MAGNITUDE = 0.3;
const MIN_EVENTS_FOR_ADJUSTMENT = 2;

function computeDirection(pattern: LearningPattern): LearningAdjustmentDirection {
  if (pattern.netScore > 0) return "INCREASE";
  if (pattern.netScore < 0) return "DECREASE";
  return "HOLD";
}

function computeMagnitude(pattern: LearningPattern): number {
  const total = pattern.reinforcementCount + pattern.weakeningCount;
  if (total < MIN_EVENTS_FOR_ADJUSTMENT) return 0;
  const ratio = Math.abs(pattern.netScore) / total;
  return Math.min(MAX_ADJUSTMENT_MAGNITUDE, ratio * MAX_ADJUSTMENT_MAGNITUDE);
}

export function suggestConfidenceAdjustment(
  pattern: LearningPattern
): LearningAdjustment | null {
  const total = pattern.reinforcementCount + pattern.weakeningCount;
  if (total < MIN_EVENTS_FOR_ADJUSTMENT) return null;
  if (pattern.status === "DEPRECATED") return null;

  const direction = computeDirection(pattern);
  if (direction === "HOLD") return null;

  const magnitude = computeMagnitude(pattern);
  if (magnitude === 0) return null;

  const directionLabel = direction === "INCREASE" ? "increase" : "decrease";
  return {
    id: generateLearningAdjustmentId(),
    orgSlug: pattern.orgSlug,
    patternId: pattern.id,
    domain: pattern.domain,
    direction,
    magnitude,
    rationale: `Pattern "${pattern.name}" has ${pattern.reinforcementCount} reinforcements and ${pattern.weakeningCount}` +
      ` weakenings (net: ${pattern.netScore}). Suggest ${directionLabel} confidence by ${(magnitude * 100).toFixed(1)}%.`,
    applied: false,
    metadata: {
      patternNetScore: pattern.netScore,
      patternConfidenceScore: pattern.confidenceScore,
      totalEvents: total,
    },
    suggestedAt: new Date().toISOString(),
  };
}

export function suggestBulkAdjustments(
  patterns: LearningPattern[]
): LearningAdjustment[] {
  const adjustments: LearningAdjustment[] = [];
  for (const pattern of patterns) {
    const adj = suggestConfidenceAdjustment(pattern);
    if (adj) adjustments.push(adj);
  }
  return adjustments;
}

export function applyAdjustment(
  adjustment: LearningAdjustment
): LearningAdjustment {
  // Mark as applied — actual confidence change is applied externally
  return {
    ...adjustment,
    applied: true,
    appliedAt: new Date().toISOString(),
  };
}

export function rankAdjustments(
  adjustments: LearningAdjustment[]
): LearningAdjustment[] {
  return [...adjustments].sort((a, b) => b.magnitude - a.magnitude);
}

export function filterAdjustmentsByDomain(
  adjustments: LearningAdjustment[],
  domain: LearningDomain
): LearningAdjustment[] {
  return adjustments.filter((a) => a.domain === domain);
}

export function computeNetConfidenceShift(
  adjustments: LearningAdjustment[]
): number {
  let shift = 0;
  for (const adj of adjustments) {
    shift += adj.direction === "INCREASE"
      ? adj.magnitude
      : adj.direction === "DECREASE"
        ? -adj.magnitude
        : 0;
  }
  return Math.max(-MAX_ADJUSTMENT_MAGNITUDE * 3, Math.min(MAX_ADJUSTMENT_MAGNITUDE * 3, shift));
}
