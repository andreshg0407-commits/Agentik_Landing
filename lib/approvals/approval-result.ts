/**
 * lib/approvals/approval-result.ts
 *
 * Agentik — Approval Structured Result Types
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * Flat, serializable result envelopes for all ApprovalService operations.
 * Never throws. No Prisma. No React.
 */

import type { ApprovalRequest, ApprovalDecision } from "./approval-types";

// ── Base ──────────────────────────────────────────────────────────────────────

interface ApprovalBaseResult {
  success:   boolean;
  message:   string;
  errors?:   string[];
  warnings?: string[];
}

// ── Per-operation results ─────────────────────────────────────────────────────

export interface ApprovalCreationResult extends ApprovalBaseResult {
  approval?: ApprovalRequest;
}

export interface ApprovalUpdateResult extends ApprovalBaseResult {
  approval?: ApprovalRequest;
}

export interface ApprovalDecisionResult extends ApprovalBaseResult {
  approval?: ApprovalRequest;
  decision?: ApprovalDecision;
}

export interface ApprovalCancellationResult extends ApprovalBaseResult {
  approval?: ApprovalRequest;
}

export interface ApprovalExpirationResult extends ApprovalBaseResult {
  approval?: ApprovalRequest;
}

export interface ApprovalQueryResult extends ApprovalBaseResult {
  approval: ApprovalRequest | null;
}

export interface ApprovalListResult extends ApprovalBaseResult {
  approvals:  ApprovalRequest[];
  totalCount: number;
}
