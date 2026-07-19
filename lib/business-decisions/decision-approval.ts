/**
 * decision-approval.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Approval requirements for a decision.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { DecisionApprovalType } from "./decision-types";

// -- Decision Approval --------------------------------------------------------

/** Approval requirements for a decision. */
export interface DecisionApproval {
  /** Whether approval is required. */
  required: boolean;
  /** Type of approval needed. */
  approvalType: DecisionApprovalType;
  /** Role that must approve. */
  requiredRole: string;
  /** Why approval is needed. */
  reason: string;
  /** Whether approval blocks execution entirely. */
  blocking: boolean;
  /** When the approval window expires. */
  expiresAt: string | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a decision approval. */
export function buildDecisionApproval(opts: {
  required?: boolean;
  approvalType?: DecisionApprovalType;
  requiredRole?: string;
  reason?: string;
  blocking?: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): DecisionApproval {
  return {
    required: opts.required ?? false,
    approvalType: opts.approvalType ?? "none",
    requiredRole: opts.requiredRole ?? "",
    reason: opts.reason ?? "",
    blocking: opts.blocking ?? false,
    expiresAt: opts.expiresAt ?? null,
    metadata: opts.metadata ?? {},
  };
}

/** Build a "no approval needed" result. */
export function noApprovalNeeded(): DecisionApproval {
  return buildDecisionApproval({ required: false, approvalType: "none" });
}
