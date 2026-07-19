/**
 * plan-step.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Step model — individual actions within a plan alternative.
 *
 * Steps describe WHAT would be done, not execute it.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanStepType, PlanEntityRef } from "./planning-types";
import { nextPlanId } from "./planning-types";

// -- Plan Step ----------------------------------------------------------------

/** A single step within a plan alternative. */
export interface PlanStep {
  /** Unique step ID. */
  stepId: string;
  /** Alternative this step belongs to. */
  alternativeId: string;
  /** Step title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Type of step. */
  stepType: PlanStepType;
  /** Execution order (1-based). */
  order: number;
  /** Whether this step is required. */
  required: boolean;
  /** Estimated duration (human-readable, e.g. "2h", "1d"). */
  estimatedDuration: string;
  /** Role responsible for this step. */
  ownerRole: string;
  /** Target entity this step acts on. */
  targetEntity: PlanEntityRef | null;
  /** Inputs this step needs. */
  inputs: Record<string, unknown>;
  /** Outputs this step produces. */
  outputs: Record<string, unknown>;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan step. */
export function buildPlanStep(opts: {
  alternativeId: string;
  title: string;
  description: string;
  stepType: PlanStepType;
  order: number;
  required?: boolean;
  estimatedDuration?: string;
  ownerRole?: string;
  targetEntity?: PlanEntityRef | null;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): PlanStep {
  return {
    stepId: nextPlanId("pstep"),
    alternativeId: opts.alternativeId,
    title: opts.title,
    description: opts.description,
    stepType: opts.stepType,
    order: opts.order,
    required: opts.required ?? true,
    estimatedDuration: opts.estimatedDuration ?? "",
    ownerRole: opts.ownerRole ?? "",
    targetEntity: opts.targetEntity ?? null,
    inputs: opts.inputs ?? {},
    outputs: opts.outputs ?? {},
    metadata: opts.metadata ?? {},
  };
}
