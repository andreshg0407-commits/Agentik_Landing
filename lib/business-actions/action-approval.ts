/**
 * action-approval.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Approval lifecycle for actions.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ActionApprovalStatus, ActionApprovalType } from "./action-types";

// -- Action Approval ----------------------------------------------------------

/** Approval record for an action. */
export interface ActionApproval {
  /** Whether approval is required. */
  required: boolean;
  /** Current approval status. */
  status: ActionApprovalStatus;
  /** Type of approval. */
  approvalType: ActionApprovalType;
  /** Role that must approve. */
  requiredRole: string;
  /** Who requested the action. */
  requestedBy: string;
  /** Who approved (null if not yet approved). */
  approvedBy: string | null;
  /** When approved. */
  approvedAt: string | null;
  /** Who rejected (null if not rejected). */
  rejectedBy: string | null;
  /** When rejected. */
  rejectedAt: string | null;
  /** Approval/rejection reason. */
  reason: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action approval. */
export function buildActionApproval(opts: {
  required?: boolean;
  approvalType?: ActionApprovalType;
  requiredRole?: string;
  requestedBy?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): ActionApproval {
  const required = opts.required ?? false;
  return {
    required,
    status: required ? "pending" : "not_required",
    approvalType: opts.approvalType ?? "none",
    requiredRole: opts.requiredRole ?? "",
    requestedBy: opts.requestedBy ?? "system",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    reason: opts.reason ?? "",
    metadata: opts.metadata ?? {},
  };
}

/** Build a "no approval needed" record. */
export function noActionApprovalNeeded(): ActionApproval {
  return buildActionApproval({ required: false, approvalType: "none" });
}

/** Approve an action approval. */
export function approveAction(approval: ActionApproval, approvedBy: string, reason?: string): ActionApproval {
  return {
    ...approval,
    status: "approved",
    approvedBy,
    approvedAt: new Date().toISOString(),
    reason: reason ?? approval.reason,
  };
}

/** Reject an action approval. */
export function rejectAction(approval: ActionApproval, rejectedBy: string, reason: string): ActionApproval {
  return {
    ...approval,
    status: "rejected",
    rejectedBy,
    rejectedAt: new Date().toISOString(),
    reason,
  };
}
