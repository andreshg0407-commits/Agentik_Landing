/**
 * plan-dependency.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Dependency model — what must be true or completed before a plan can proceed.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanDependencyType, PlanDependencyStatus, PlanEntityRef } from "./planning-types";
import { nextPlanId } from "./planning-types";

// -- Plan Dependency ----------------------------------------------------------

/** A dependency required by a plan alternative. */
export interface PlanDependency {
  /** Unique dependency ID. */
  dependencyId: string;
  /** Dependency type. */
  type: PlanDependencyType;
  /** Human-readable description. */
  description: string;
  /** Whether this dependency is mandatory. */
  required: boolean;
  /** Current status. */
  status: PlanDependencyStatus;
  /** Entity this dependency relates to. */
  relatedEntity: PlanEntityRef | null;
  /** Related plan ID (for cross-plan dependencies). */
  relatedPlanId: string | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan dependency. */
export function buildPlanDependency(opts: {
  type: PlanDependencyType;
  description: string;
  required?: boolean;
  status?: PlanDependencyStatus;
  relatedEntity?: PlanEntityRef | null;
  relatedPlanId?: string | null;
  metadata?: Record<string, unknown>;
}): PlanDependency {
  return {
    dependencyId: nextPlanId("pdep"),
    type: opts.type,
    description: opts.description,
    required: opts.required ?? true,
    status: opts.status ?? "unknown",
    relatedEntity: opts.relatedEntity ?? null,
    relatedPlanId: opts.relatedPlanId ?? null,
    metadata: opts.metadata ?? {},
  };
}
