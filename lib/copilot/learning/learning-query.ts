// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning query helpers — pure domain queries on learning entities

import type {
  LearningEvent,
  LearningPattern,
  LearningOutcome,
  LearningAdjustment,
  LearningDomain,
  LearningEventType,
  LearningPatternStatus,
} from "./learning-types";

// ── Event queries ─────────────────────────────────────────────────────────────

export function getEventsByType(
  events: LearningEvent[],
  type: LearningEventType
): LearningEvent[] {
  return events.filter((e) => e.type === type);
}

export function getEventsByDomain(
  events: LearningEvent[],
  domain: LearningDomain
): LearningEvent[] {
  return events.filter((e) => e.domain === domain);
}

export function getEventsByAgent(
  events: LearningEvent[],
  agentId: string
): LearningEvent[] {
  return events.filter((e) => e.agentId === agentId);
}

export function getRecentEvents(
  events: LearningEvent[],
  limitMs: number
): LearningEvent[] {
  const cutoff = Date.now() - limitMs;
  return events.filter((e) => new Date(e.occurredAt).getTime() >= cutoff);
}

export function countPositiveEvents(events: LearningEvent[]): number {
  return events.filter(
    (e) =>
      e.type === "HYPOTHESIS_CONFIRMED" ||
      e.type === "RECOMMENDATION_ACCEPTED" ||
      e.type === "ACTION_SUCCEEDED" ||
      e.type === "USER_FEEDBACK_POSITIVE" ||
      e.type === "PATTERN_REINFORCED"
  ).length;
}

export function countNegativeEvents(events: LearningEvent[]): number {
  return events.filter(
    (e) =>
      e.type === "HYPOTHESIS_REJECTED" ||
      e.type === "RECOMMENDATION_REJECTED" ||
      e.type === "ACTION_FAILED" ||
      e.type === "USER_FEEDBACK_NEGATIVE" ||
      e.type === "PATTERN_WEAKENED"
  ).length;
}

// ── Pattern queries ───────────────────────────────────────────────────────────

export function getPatternsByDomain(
  patterns: LearningPattern[],
  domain: LearningDomain
): LearningPattern[] {
  return patterns.filter((p) => p.domain === domain);
}

export function getPatternsByStatus(
  patterns: LearningPattern[],
  status: LearningPatternStatus
): LearningPattern[] {
  return patterns.filter((p) => p.status === status);
}

export function getTopPatterns(
  patterns: LearningPattern[],
  limit = 5
): LearningPattern[] {
  return [...patterns]
    .filter((p) => p.status !== "DEPRECATED")
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, limit);
}

export function getPatternByAgent(
  patterns: LearningPattern[],
  agentId: string
): LearningPattern[] {
  return patterns.filter((p) => p.agentId === agentId);
}

// ── Outcome queries ───────────────────────────────────────────────────────────

export function getPositiveOutcomes(outcomes: LearningOutcome[]): LearningOutcome[] {
  return outcomes.filter((o) => o.result === "POSITIVE");
}

export function getNegativeOutcomes(outcomes: LearningOutcome[]): LearningOutcome[] {
  return outcomes.filter((o) => o.result === "NEGATIVE");
}

export function getOutcomesByDomain(
  outcomes: LearningOutcome[],
  domain: LearningDomain
): LearningOutcome[] {
  return outcomes.filter((o) => o.domain === domain);
}

export function computeOutcomeSuccessRate(outcomes: LearningOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const positive = getPositiveOutcomes(outcomes).length;
  return positive / outcomes.length;
}

// ── Adjustment queries ────────────────────────────────────────────────────────

export function getPendingAdjustments(
  adjustments: LearningAdjustment[]
): LearningAdjustment[] {
  return adjustments.filter((a) => !a.applied);
}

export function getAppliedAdjustments(
  adjustments: LearningAdjustment[]
): LearningAdjustment[] {
  return adjustments.filter((a) => a.applied);
}

export function getAdjustmentsByDomain(
  adjustments: LearningAdjustment[],
  domain: LearningDomain
): LearningAdjustment[] {
  return adjustments.filter((a) => a.domain === domain);
}
