// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning reversal — revert patterns, feedback, and events

import type {
  LearningEvent,
  LearningPattern,
  LearningAdjustment,
} from "./learning-types";
import { weakenPattern } from "./learning-pattern-engine";

export interface ReversalRecord {
  readonly id: string;
  readonly orgSlug: string;
  readonly reversedEntityId: string;
  readonly reversedEntityType: "EVENT" | "PATTERN" | "ADJUSTMENT";
  readonly reason: string;
  readonly reversedAt: string; // ISO8601
  readonly metadata: Record<string, unknown>;
}

function generateReversalId(): string {
  return `learn_rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function revertEvent(
  event: LearningEvent,
  reason: string
): { reversal: ReversalRecord; counterEvent: LearningEvent } {
  const counterType = event.type === "HYPOTHESIS_CONFIRMED"
    ? "HYPOTHESIS_REJECTED"
    : event.type === "HYPOTHESIS_REJECTED"
      ? "HYPOTHESIS_CONFIRMED"
      : event.type === "RECOMMENDATION_ACCEPTED"
        ? "RECOMMENDATION_REJECTED"
        : event.type === "RECOMMENDATION_REJECTED"
          ? "RECOMMENDATION_ACCEPTED"
          : event.type === "ACTION_SUCCEEDED"
            ? "ACTION_FAILED"
            : event.type === "ACTION_FAILED"
              ? "ACTION_SUCCEEDED"
              : event.type === "USER_FEEDBACK_POSITIVE"
                ? "USER_FEEDBACK_NEGATIVE"
                : event.type === "USER_FEEDBACK_NEGATIVE"
                  ? "USER_FEEDBACK_POSITIVE"
                  : event.type === "PATTERN_REINFORCED"
                    ? "PATTERN_WEAKENED"
                    : "PATTERN_REINFORCED";

  const counterEvent: LearningEvent = {
    ...event,
    id: `learn_evt_${Date.now()}_rev_${Math.random().toString(36).slice(2, 6)}`,
    type: counterType,
    metadata: {
      ...event.metadata,
      reversalOf: event.id,
      reversalReason: reason,
    },
    occurredAt: new Date().toISOString(),
  };

  const reversal: ReversalRecord = {
    id: generateReversalId(),
    orgSlug: event.orgSlug,
    reversedEntityId: event.id,
    reversedEntityType: "EVENT",
    reason,
    reversedAt: new Date().toISOString(),
    metadata: { counterEventId: counterEvent.id },
  };

  return { reversal, counterEvent };
}

export function revertPattern(
  pattern: LearningPattern,
  counterEvent: LearningEvent,
  reason: string
): { reversal: ReversalRecord; weakenedPattern: LearningPattern } {
  const weakened = weakenPattern(pattern, counterEvent);

  const reversal: ReversalRecord = {
    id: generateReversalId(),
    orgSlug: pattern.orgSlug,
    reversedEntityId: pattern.id,
    reversedEntityType: "PATTERN",
    reason,
    reversedAt: new Date().toISOString(),
    metadata: { counterEventId: counterEvent.id, newNetScore: weakened.netScore },
  };

  return { reversal, weakenedPattern: weakened };
}

export function revertAdjustment(
  adjustment: LearningAdjustment,
  reason: string
): { reversal: ReversalRecord; counterAdjustment: LearningAdjustment } {
  const counterDirection =
    adjustment.direction === "INCREASE"
      ? "DECREASE"
      : adjustment.direction === "DECREASE"
        ? "INCREASE"
        : "HOLD";

  const counterAdjustment: LearningAdjustment = {
    ...adjustment,
    id: `learn_adj_${Date.now()}_rev_${Math.random().toString(36).slice(2, 6)}`,
    direction: counterDirection,
    rationale: `Reversal of adjustment ${adjustment.id}: ${reason}`,
    applied: false,
    appliedAt: undefined,
    metadata: {
      ...adjustment.metadata,
      reversalOf: adjustment.id,
      reversalReason: reason,
    },
    suggestedAt: new Date().toISOString(),
  };

  const reversal: ReversalRecord = {
    id: generateReversalId(),
    orgSlug: adjustment.orgSlug,
    reversedEntityId: adjustment.id,
    reversedEntityType: "ADJUSTMENT",
    reason,
    reversedAt: new Date().toISOString(),
    metadata: { counterAdjustmentId: counterAdjustment.id },
  };

  return { reversal, counterAdjustment };
}
