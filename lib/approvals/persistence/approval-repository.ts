/**
 * lib/approvals/persistence/approval-repository.ts
 *
 * Agentik — Approval Repository Contract
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * Interface defining the persistence contract for ApprovalRequest.
 * No Prisma. No implementation. No server-only required.
 * Implemented by ApprovalPrismaRepository.
 */

import type {
  ApprovalId,
  ApprovalActor,
  ApprovalDecision,
  ApprovalFilter,
  ApprovalRequest,
  ApprovalUpdateInput,
} from "../approval-types";

// ── Repository interface ──────────────────────────────────────────────────────

export interface ApprovalRepository {

  /** Persist a new ApprovalRequest. Returns the saved record. */
  createApproval(request: ApprovalRequest): Promise<ApprovalRequest>;

  /** Apply a partial update to an existing approval. Returns the updated record. */
  updateApproval(
    id:    ApprovalId,
    input: ApprovalUpdateInput,
  ): Promise<ApprovalRequest>;

  /** Fetch a single approval by its ID. Returns null if not found. */
  getApprovalById(id: ApprovalId): Promise<ApprovalRequest | null>;

  /** List approvals for an org with optional filters. */
  listApprovals(
    orgSlug: string,
    filter?: ApprovalFilter,
  ): Promise<ApprovalRequest[]>;

  /** Record an APPROVED decision and transition status to APPROVED. */
  approveApproval(
    id:       ApprovalId,
    decision: ApprovalDecision,
  ): Promise<ApprovalRequest>;

  /** Record a REJECTED decision and transition status to REJECTED. */
  rejectApproval(
    id:       ApprovalId,
    decision: ApprovalDecision,
  ): Promise<ApprovalRequest>;

  /** Cancel an approval, recording the actor and optional reason. */
  cancelApproval(
    id:      ApprovalId,
    actor:   ApprovalActor,
    reason?: string,
  ): Promise<ApprovalRequest>;

  /** Mark an approval as expired. */
  expireApproval(id: ApprovalId): Promise<ApprovalRequest>;

}
