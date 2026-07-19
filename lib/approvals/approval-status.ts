/**
 * lib/approvals/approval-status.ts
 *
 * Agentik — Approval Status Helpers
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Pure helpers for approval status transitions and predicates.
 * No React. No Prisma. No side effects.
 */

import type { ApprovalStatus } from "./approval-types";

// ── Transition map ────────────────────────────────────────────────────────────

export const allowedApprovalTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
  PENDING:   ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED"],
  APPROVED:  [],
  REJECTED:  [],
  CANCELLED: [],
  EXPIRED:   [],
};

export const TERMINAL_APPROVAL_STATUSES: ApprovalStatus[] = [
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

const VALID_STATUSES: ApprovalStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

// ── Normalizer ────────────────────────────────────────────────────────────────

/**
 * Normalize an unknown string to a valid ApprovalStatus.
 * Falls back to "PENDING" if the value is unrecognized.
 */
export function normalizeApprovalStatus(value: string): ApprovalStatus {
  const upper = value.toUpperCase() as ApprovalStatus;
  return VALID_STATUSES.includes(upper) ? upper : "PENDING";
}

// ── Predicates ────────────────────────────────────────────────────────────────

export function isPendingApproval(status: ApprovalStatus): boolean {
  return status === "PENDING";
}

export function isApproved(status: ApprovalStatus): boolean {
  return status === "APPROVED";
}

export function isRejected(status: ApprovalStatus): boolean {
  return status === "REJECTED";
}

export function isTerminalApproval(status: ApprovalStatus): boolean {
  return TERMINAL_APPROVAL_STATUSES.includes(status);
}

// ── Transition guard ──────────────────────────────────────────────────────────

/**
 * Returns true if transitioning from `from` to `to` is allowed.
 */
export function canTransitionApprovalStatus(
  from: ApprovalStatus,
  to:   ApprovalStatus,
): boolean {
  return allowedApprovalTransitions[from].includes(to);
}
