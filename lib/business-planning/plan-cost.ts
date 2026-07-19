/**
 * plan-cost.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Cost model for plan alternatives. Not necessarily monetary.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanCostType } from "./planning-types";

// -- Plan Cost ----------------------------------------------------------------

/** A cost associated with a plan alternative. */
export interface PlanCost {
  /** Cost type. */
  type: PlanCostType;
  /** Estimated amount (units depend on type). */
  amount: number;
  /** Unit of measurement. */
  unit: string;
  /** Human-readable description. */
  description: string;
  /** Confidence in this estimate (0–100). */
  confidence: number;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan cost. */
export function buildPlanCost(opts: {
  type: PlanCostType;
  amount: number;
  unit: string;
  description: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}): PlanCost {
  return {
    type: opts.type,
    amount: opts.amount,
    unit: opts.unit,
    description: opts.description,
    confidence: opts.confidence ?? 50,
    metadata: opts.metadata ?? {},
  };
}
