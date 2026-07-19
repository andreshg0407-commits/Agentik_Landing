/**
 * action-plan.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * ActionPlan — ordered set of actions derived from a decision.
 *
 * Default execution mode: dry_run.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ActionStatus, ExecutionMode } from "./action-types";
import { nextActionId } from "./action-types";
import type { BusinessAction } from "./action";
import type { ActionApproval } from "./action-approval";
import type { ActionPolicy } from "./action-policy";

// -- Action Plan --------------------------------------------------------------

/** An ordered set of actions derived from a decision. */
export interface ActionPlan {
  /** Unique action plan ID. */
  actionPlanId: string;
  /** Organization. */
  organizationId: string;
  /** Decision that originated this plan. */
  decisionId: string | null;
  /** Title. */
  title: string;
  /** Description. */
  description: string;
  /** Ordered actions. */
  actions: BusinessAction[];
  /** Current status. */
  status: ActionStatus;
  /** Approval for the plan as a whole. */
  approval: ActionApproval;
  /** Governing policy. */
  policy: ActionPolicy | null;
  /** Execution mode. Default: dry_run. */
  executionMode: ExecutionMode;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action plan. */
export function buildActionPlan(opts: {
  organizationId: string;
  title: string;
  description: string;
  actions?: BusinessAction[];
  decisionId?: string | null;
  approval?: ActionApproval;
  policy?: ActionPolicy | null;
  executionMode?: ExecutionMode;
  metadata?: Record<string, unknown>;
}): ActionPlan {
  const now = new Date().toISOString();
  return {
    actionPlanId: nextActionId("apl"),
    organizationId: opts.organizationId,
    decisionId: opts.decisionId ?? null,
    title: opts.title,
    description: opts.description,
    actions: opts.actions ?? [],
    status: "draft",
    approval: opts.approval ?? { required: false, status: "not_required", approvalType: "none", requiredRole: "", requestedBy: "system", approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, reason: "", metadata: {} },
    policy: opts.policy ?? null,
    executionMode: opts.executionMode ?? "dry_run",
    createdAt: now,
    updatedAt: now,
    metadata: opts.metadata ?? {},
  };
}
