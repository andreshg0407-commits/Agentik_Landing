/**
 * lib/decisions/decision-scoring.ts
 *
 * Agentik — Decision Engine Scoring
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Calculates a 0–100 score for a (signal, rule, context) triple.
 * Higher score → higher priority recommendation.
 *
 * Score components:
 *   severityWeight      — based on rule.severity       (max 40)
 *   confidenceWeight    — based on rule.confidence      (max 25)
 *   urgencyWeight       — based on signal.metrics       (max 20)
 *   businessImpactWeight— based on monetary amount      (max 15)
 *   duplicationPenalty  — existing tasks/approvals      (max −25)
 *
 * Maximum raw score without penalty = 40+25+20+15 = 100.
 *
 * Pure. No Prisma. No React. No Next.
 */

import type { DecisionContext } from "./decision-context";
import type { DecisionSignal }  from "./decision-signals";
import type { DecisionRule }    from "./decision-rules";
import type { DecisionSeverity, DecisionConfidence } from "./decision-types";

// ── Weight tables ─────────────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<DecisionSeverity, number> = {
  CRITICAL: 40,
  HIGH:     30,
  MEDIUM:   20,
  LOW:      10,
  INFO:      5,
};

const CONFIDENCE_WEIGHTS: Record<DecisionConfidence, number> = {
  VERY_HIGH: 25,
  HIGH:      20,
  MEDIUM:    15,
  LOW:       10,
};

// ── Weight calculators ────────────────────────────────────────────────────────

function calcUrgencyWeight(signal: DecisionSignal): number {
  const m = signal.metrics;
  if (!m) return 5;
  const days = m.daysOverdue ?? 0;
  if (days >= 90) return 20;
  if (days >= 60) return 15;
  if (days >= 30) return 10;
  return 5;
}

function calcBusinessImpactWeight(signal: DecisionSignal): number {
  const m = signal.metrics;
  if (!m) return 5;
  const amount = m.monetaryAmount ?? 0;
  if (amount >= 1_000_000) return 15;
  if (amount >= 100_000)   return 10;
  if (amount >= 10_000)    return 7;
  return 5;
}

function calcDuplicationPenalty(
  context: DecisionContext,
  signal:  DecisionSignal,
): number {
  let penalty = 0;

  const hasActiveTask = context.activeTasks.some(t =>
    t.entityId   === signal.entityId   &&
    t.entityType === signal.entityType &&
    !!signal.entityId,
  );
  if (hasActiveTask) penalty += 15;

  const hasPendingApproval = context.pendingApprovals.some(a =>
    a.entityId   === signal.entityId   &&
    a.entityType === signal.entityType &&
    !!signal.entityId,
  );
  if (hasPendingApproval) penalty += 10;

  return penalty;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DecisionScoreBreakdown {
  severityWeight:       number;
  confidenceWeight:     number;
  urgencyWeight:        number;
  businessImpactWeight: number;
  duplicationPenalty:   number;
  finalScore:           number;
}

export function scoreDecision(
  context: DecisionContext,
  signal:  DecisionSignal,
  rule:    DecisionRule,
): DecisionScoreBreakdown {
  const severityWeight       = SEVERITY_WEIGHTS[rule.severity]    ?? 10;
  const confidenceWeight     = CONFIDENCE_WEIGHTS[rule.confidence] ?? 10;
  const urgencyWeight        = calcUrgencyWeight(signal);
  const businessImpactWeight = calcBusinessImpactWeight(signal);
  const duplicationPenalty   = calcDuplicationPenalty(context, signal);

  const raw        = severityWeight + confidenceWeight + urgencyWeight + businessImpactWeight;
  const finalScore = Math.max(0, Math.min(100, raw - duplicationPenalty));

  return {
    severityWeight,
    confidenceWeight,
    urgencyWeight,
    businessImpactWeight,
    duplicationPenalty,
    finalScore,
  };
}
