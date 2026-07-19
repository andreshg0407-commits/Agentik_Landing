/**
 * lib/copilot/approval-workflow/approval-workflow-errors.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Structured error codes for the approval workflow.
 * SERVER ONLY — no React.
 * @server-only
 *
 * All errors are caught at the service boundary and converted to
 * ApprovalWorkflowResult { ok: false, errorCode, error }.
 * The service never throws to callers.
 */
import "server-only";

// ── Error codes ────────────────────────────────────────────────────────────────

/**
 * Canonical error codes for every failure mode in the approval workflow.
 */
export type ApprovalWorkflowErrorCode =
  | "APPROVAL_NOT_FOUND"     // no CopilotApprovalRequest with this id
  | "TENANT_MISMATCH"        // approval belongs to a different tenant
  | "ALREADY_RESOLVED"       // approval is not pending (approved/rejected/expired/cancelled)
  | "NOT_PENDING"            // operation requires pending status
  | "NOT_APPROVED"           // buildResumePlan requires approved status
  | "EXECUTION_NOT_FOUND"    // CopilotExecution record not found
  | "MISSING_PLAN_SNAPSHOT"  // planSnapshot is absent from the execution record
  | "STEP_NOT_FOUND"         // stepId from approval not in planSnapshot
  | "INVALID_INPUT"          // missing required field
  | "INTERNAL_ERROR";        // unexpected exception

// ── Error class ────────────────────────────────────────────────────────────────

/**
 * Internal error thrown within the ApprovalWorkflowService.
 * Always caught at the service boundary — never propagates to callers.
 */
export class ApprovalWorkflowError extends Error {
  public readonly code: ApprovalWorkflowErrorCode;

  constructor(code: ApprovalWorkflowErrorCode, message: string) {
    super(message);
    this.name    = "ApprovalWorkflowError";
    this.code    = code;
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────────

/**
 * Wrap an ApprovalWorkflowError (or any Error) as an ApprovalWorkflowResult.
 * Used at service method boundaries.
 */
export function errorResult(
  approvalId: string,
  err:        unknown,
): { ok: false; approvalId: string; error: string; errorCode: string } {
  if (err instanceof ApprovalWorkflowError) {
    return { ok: false, approvalId, error: err.message, errorCode: err.code };
  }
  return {
    ok:        false,
    approvalId,
    error:     err instanceof Error ? err.message : String(err),
    errorCode: "INTERNAL_ERROR",
  };
}
