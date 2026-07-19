/**
 * plan-evaluation.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Evaluation and scoring model for plan alternatives.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import { nextPlanId } from "./planning-types";

// -- Evaluation Criterion -----------------------------------------------------

/** A single scoring criterion. */
export type PlanEvaluationCriterion =
  | "benefit"
  | "cost"
  | "risk"
  | "speed"
  | "feasibility"
  | "confidence"
  | "approval_complexity"
  | "customer_impact"
  | "operational_effort";

/** All evaluation criteria. */
export const PLAN_EVALUATION_CRITERIA: readonly PlanEvaluationCriterion[] = [
  "benefit", "cost", "risk", "speed", "feasibility",
  "confidence", "approval_complexity", "customer_impact", "operational_effort",
] as const;

// -- Criterion Score ----------------------------------------------------------

/** Score for a single criterion. */
export interface CriterionScore {
  criterion: PlanEvaluationCriterion;
  /** Score from 0–100. Higher = better. */
  score: number;
  /** Weight of this criterion (0–1). */
  weight: number;
  /** Human-readable reason. */
  reason: string;
}

// -- Plan Evaluation ----------------------------------------------------------

/** Complete evaluation of a plan alternative. */
export interface PlanEvaluation {
  /** Unique evaluation ID. */
  evaluationId: string;
  /** Alternative being evaluated. */
  alternativeId: string;
  /** Overall score (0–100). */
  score: number;
  /** Rank among alternatives (1 = best). */
  rank: number;
  /** Overall confidence in this evaluation (0–100). */
  confidence: number;
  /** Summary explanation. */
  reason: string;
  /** Per-criterion scores. */
  criteria: CriterionScore[];
  /** Information that was missing during evaluation. */
  missingInformation: string[];
  /** Assumptions made during scoring. */
  assumptions: string[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan evaluation from criterion scores. */
export function buildPlanEvaluation(opts: {
  alternativeId: string;
  criteria: CriterionScore[];
  rank?: number;
  missingInformation?: string[];
  assumptions?: string[];
  metadata?: Record<string, unknown>;
}): PlanEvaluation {
  const totalWeight = opts.criteria.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = totalWeight > 0
    ? opts.criteria.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
    : 0;

  const confidence = opts.missingInformation?.length
    ? Math.max(0, 100 - opts.missingInformation.length * 15)
    : 100;

  return {
    evaluationId: nextPlanId("peval"),
    alternativeId: opts.alternativeId,
    score: Math.round(weightedScore),
    rank: opts.rank ?? 0,
    confidence,
    reason: opts.criteria
      .map(c => `${c.criterion}: ${c.score}/100 (${c.reason})`)
      .join("; "),
    criteria: opts.criteria,
    missingInformation: opts.missingInformation ?? [],
    assumptions: opts.assumptions ?? [],
    metadata: opts.metadata ?? {},
  };
}
