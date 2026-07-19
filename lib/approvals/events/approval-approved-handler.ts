/**
 * lib/approvals/events/approval-approved-handler.ts
 *
 * Agentik — Approval Approved Event Bridge
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY — bridges an approved ApprovalRequest to the Work Execution Dispatcher.
 *
 * Responsibility:
 *   - Convert an approved ApprovalRequest → ApprovalApprovedEvent
 *   - Call dispatchApprovalExecution (fire-and-forget, non-blocking)
 *   - Never throw — all errors are logged, approval result is never blocked
 *
 * Called by: approvalService.approveApproval (after success)
 * Calls:     dispatchApprovalExecution (work-execution-dispatcher)
 */
import "server-only";

import type { ApprovalRequest } from "../approval-types";
import type { ApprovalApprovedEvent } from "../../work/live/work-execution-types";

// ── Converter ─────────────────────────────────────────────────────────────────

function toApprovalApprovedEvent(approval: ApprovalRequest): ApprovalApprovedEvent {
  const contextActionType = approval.context.metadata?.["actionType"] as string | undefined;

  return {
    approvalId:       approval.id,
    approvalTitle:    approval.title,
    approvalStatus:   "APPROVED",
    approvalCategory: approval.category,
    approvedBy:       approval.decision?.decidedBy.id   ?? "system",
    approvedByType:   (approval.decision?.decidedBy.type as "USER" | "AGENT" | "SYSTEM") ?? "SYSTEM",
    approvedAt:       approval.decision?.decidedAt       ?? new Date().toISOString(),
    orgSlug:          approval.context.orgSlug,
    module:           approval.context.module,
    actionType:       contextActionType,
    entityType:       approval.context.entityType,
    entityId:         approval.context.entityId,
    navigationTarget: approval.context.navigationTarget,
    impactSummary:    approval.context.impactSummary,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget handler for an approved ApprovalRequest.
 * Dispatches the corresponding WorkExecutionJob without blocking the caller.
 *
 * Non-blocking pattern:
 *   The approval transaction is already committed before this is called.
 *   If dispatch fails, the approval remains approved — work execution is
 *   an additive side effect, not part of the approval transaction.
 */
export async function handleApprovalApproved(approval: ApprovalRequest): Promise<void> {
  try {
    // Dynamic import keeps the work-execution layer out of the module graph
    // until it's actually needed.
    const { workExecutionService } = await import("../../work/live/work-execution-service");
    const event = toApprovalApprovedEvent(approval);
    const serviceResult = await workExecutionService.executeFromApprovalEvent(event);

    if (!serviceResult.success) {
      // Log only — never block the approval success response
      console.warn(
        `[approval-approved-handler] Execution failed for approval ${approval.id}:`,
        serviceResult.errors,
      );
    }
  } catch (err) {
    // Silently absorb — approval is already committed
    console.error(
      `[approval-approved-handler] Unexpected error dispatching approval ${approval.id}:`,
      err,
    );
  }
}
