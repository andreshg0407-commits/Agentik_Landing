/**
 * action.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Core BusinessAction interface — a controlled, auditable action.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ActionStatus, ActionType, ActionSource } from "./action-types";
import { nextActionId } from "./action-types";
import type { ActionStep, ActionTarget } from "./action-step";
import type { ActionApproval } from "./action-approval";
import type { ActionPolicy } from "./action-policy";
import type { ActionTrace } from "./action-trace";

// -- Business Action ----------------------------------------------------------

/** A controlled, auditable business action. */
export interface BusinessAction {
  /** Unique action ID. */
  actionId: string;
  /** Organization. */
  organizationId: string;
  /** Action title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Action type. */
  actionType: ActionType;
  /** Current status. */
  status: ActionStatus;
  /** Where this action originated. */
  source: ActionSource;
  /** Target of this action. */
  target: ActionTarget | null;
  /** Decision that led to this action. */
  decisionId: string | null;
  /** Plan that led to this action. */
  planId: string | null;
  /** Plan step this action implements. */
  stepId: string | null;
  /** Approval record. */
  approval: ActionApproval;
  /** Governing policy. */
  policy: ActionPolicy | null;
  /** Provenance trace. */
  trace: ActionTrace;
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
  /** Expiration timestamp. */
  expiresAt: string | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a business action. */
export function buildBusinessAction(opts: {
  organizationId: string;
  title: string;
  description: string;
  actionType: ActionType;
  source: ActionSource;
  trace: ActionTrace;
  target?: ActionTarget | null;
  decisionId?: string | null;
  planId?: string | null;
  stepId?: string | null;
  approval?: ActionApproval;
  policy?: ActionPolicy | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): BusinessAction {
  const now = new Date().toISOString();
  return {
    actionId: nextActionId("act"),
    organizationId: opts.organizationId,
    title: opts.title,
    description: opts.description,
    actionType: opts.actionType,
    status: "draft",
    source: opts.source,
    target: opts.target ?? null,
    decisionId: opts.decisionId ?? null,
    planId: opts.planId ?? null,
    stepId: opts.stepId ?? null,
    approval: opts.approval ?? { required: false, status: "not_required", approvalType: "none", requiredRole: "", requestedBy: "system", approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, reason: "", metadata: {} },
    policy: opts.policy ?? null,
    trace: opts.trace,
    createdAt: now,
    updatedAt: now,
    expiresAt: opts.expiresAt ?? null,
    metadata: opts.metadata ?? {},
  };
}
