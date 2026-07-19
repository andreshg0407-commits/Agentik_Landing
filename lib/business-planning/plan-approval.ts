/**
 * plan-approval.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Approval requirement model — what approvals a plan alternative needs.
 *
 * Any plan that may derive in a real future action MUST declare
 * whether it requires approval.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanApprovalType } from "./planning-types";
import { nextPlanId } from "./planning-types";

// -- Plan Approval Requirement ------------------------------------------------

/** An approval required for a plan alternative. */
export interface PlanApprovalRequirement {
  /** Unique approval ID. */
  approvalId: string;
  /** Whether approval is required. */
  required: boolean;
  /** Type of approval. */
  approvalType: PlanApprovalType;
  /** Role that must approve. */
  requiredRole: string;
  /** Why this approval is needed. */
  reason: string;
  /** Whether this approval blocks execution entirely. */
  blocking: boolean;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan approval requirement. */
export function buildPlanApproval(opts: {
  approvalType: PlanApprovalType;
  requiredRole: string;
  reason: string;
  required?: boolean;
  blocking?: boolean;
  metadata?: Record<string, unknown>;
}): PlanApprovalRequirement {
  return {
    approvalId: nextPlanId("pappr"),
    required: opts.required ?? true,
    approvalType: opts.approvalType,
    requiredRole: opts.requiredRole,
    reason: opts.reason,
    blocking: opts.blocking ?? true,
    metadata: opts.metadata ?? {},
  };
}
