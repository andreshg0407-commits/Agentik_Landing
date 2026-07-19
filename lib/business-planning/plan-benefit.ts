/**
 * plan-benefit.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Benefit model for plan alternatives.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanBenefitType } from "./planning-types";

// -- Plan Benefit -------------------------------------------------------------

/** A benefit expected from a plan alternative. */
export interface PlanBenefit {
  /** Benefit type. */
  type: PlanBenefitType;
  /** Estimated value (units depend on type). */
  estimatedValue: number;
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

/** Build a plan benefit. */
export function buildPlanBenefit(opts: {
  type: PlanBenefitType;
  estimatedValue: number;
  unit: string;
  description: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}): PlanBenefit {
  return {
    type: opts.type,
    estimatedValue: opts.estimatedValue,
    unit: opts.unit,
    description: opts.description,
    confidence: opts.confidence ?? 50,
    metadata: opts.metadata ?? {},
  };
}
