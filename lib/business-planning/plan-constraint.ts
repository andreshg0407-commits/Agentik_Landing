/**
 * plan-constraint.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Constraint model — restrictions that limit or block a plan alternative.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanConstraintType, PlanSeverity, PlanEntityRef } from "./planning-types";
import { nextPlanId } from "./planning-types";

// -- Plan Constraint ----------------------------------------------------------

/** A constraint on a plan alternative. */
export interface PlanConstraint {
  /** Unique constraint ID. */
  constraintId: string;
  /** Constraint type. */
  type: PlanConstraintType;
  /** Human-readable description. */
  description: string;
  /** How severe this constraint is. */
  severity: PlanSeverity;
  /** Whether this constraint blocks the alternative entirely. */
  blocking: boolean;
  /** Entity this constraint relates to. */
  relatedEntity: PlanEntityRef | null;
  /** Evidence supporting the constraint. */
  evidence: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan constraint. */
export function buildPlanConstraint(opts: {
  type: PlanConstraintType;
  description: string;
  severity?: PlanSeverity;
  blocking?: boolean;
  relatedEntity?: PlanEntityRef | null;
  evidence?: string;
  metadata?: Record<string, unknown>;
}): PlanConstraint {
  return {
    constraintId: nextPlanId("pcon"),
    type: opts.type,
    description: opts.description,
    severity: opts.severity ?? "medium",
    blocking: opts.blocking ?? false,
    relatedEntity: opts.relatedEntity ?? null,
    evidence: opts.evidence ?? "",
    metadata: opts.metadata ?? {},
  };
}
