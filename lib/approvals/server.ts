/**
 * lib/approvals/server.ts
 *
 * Agentik — Approvals Server-Only Barrel
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * SERVER-ONLY. Safe to import from Server Actions and API routes only.
 * NEVER import from client components, action-executor, or Copilot drawer.
 */
import "server-only";

export { approvalService }              from "./approval-service";
export { approvalPrismaRepository }     from "./persistence/approval-prisma-repository";

export type {
  ApprovalCreationResult,
  ApprovalUpdateResult,
  ApprovalDecisionResult,
  ApprovalCancellationResult,
  ApprovalExpirationResult,
  ApprovalQueryResult,
  ApprovalListResult,
} from "./approval-result";
