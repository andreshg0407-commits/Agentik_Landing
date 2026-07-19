/**
 * plan-alternative.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Alternative model — a possible course of action within a plan.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanStrategy } from "./planning-types";
import { nextPlanId } from "./planning-types";
import type { PlanStep } from "./plan-step";
import type { PlanConstraint } from "./plan-constraint";
import type { PlanDependency } from "./plan-dependency";
import type { PlanCost } from "./plan-cost";
import type { PlanBenefit } from "./plan-benefit";
import type { PlanRisk } from "./plan-risk";
import type { PlanApprovalRequirement } from "./plan-approval";
import type { PlanEvaluation } from "./plan-evaluation";

// -- Plan Alternative ---------------------------------------------------------

/** A possible course of action within a business plan. */
export interface PlanAlternative {
  /** Unique alternative ID. */
  alternativeId: string;
  /** Plan this alternative belongs to. */
  planId: string;
  /** Alternative title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Named strategy this alternative follows. */
  strategy: PlanStrategy;
  /** Ordered steps to execute this alternative. */
  steps: PlanStep[];
  /** Constraints that apply. */
  constraints: PlanConstraint[];
  /** Dependencies that must be met. */
  dependencies: PlanDependency[];
  /** Expected costs. */
  costs: PlanCost[];
  /** Expected benefits. */
  benefits: PlanBenefit[];
  /** Associated risks. */
  risks: PlanRisk[];
  /** Required approvals. */
  approvalRequirements: PlanApprovalRequirement[];
  /** Evaluation scoring (set after evaluation). */
  evaluation: PlanEvaluation | null;
  /** Estimated total duration (human-readable). */
  estimatedDuration: string;
  /** Expected impact description. */
  expectedImpact: string;
  /** Confidence in this alternative (0–100). */
  confidence: number;
  /** Computed score (0–100, from evaluation). */
  score: number;
  /** Rank among alternatives (1 = best). */
  rank: number;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan alternative. */
export function buildPlanAlternative(opts: {
  planId: string;
  title: string;
  description: string;
  strategy: PlanStrategy;
  steps?: PlanStep[];
  constraints?: PlanConstraint[];
  dependencies?: PlanDependency[];
  costs?: PlanCost[];
  benefits?: PlanBenefit[];
  risks?: PlanRisk[];
  approvalRequirements?: PlanApprovalRequirement[];
  estimatedDuration?: string;
  expectedImpact?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}): PlanAlternative {
  return {
    alternativeId: nextPlanId("palt"),
    planId: opts.planId,
    title: opts.title,
    description: opts.description,
    strategy: opts.strategy,
    steps: opts.steps ?? [],
    constraints: opts.constraints ?? [],
    dependencies: opts.dependencies ?? [],
    costs: opts.costs ?? [],
    benefits: opts.benefits ?? [],
    risks: opts.risks ?? [],
    approvalRequirements: opts.approvalRequirements ?? [],
    evaluation: null,
    estimatedDuration: opts.estimatedDuration ?? "",
    expectedImpact: opts.expectedImpact ?? "",
    confidence: opts.confidence ?? 50,
    score: 0,
    rank: 0,
    metadata: opts.metadata ?? {},
  };
}
