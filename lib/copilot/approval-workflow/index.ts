/**
 * lib/copilot/approval-workflow/index.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Public barrel for the approval workflow layer.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS THE APPROVAL WORKFLOW?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The ApprovalWorkflowService is the ONLY authorised path for transitioning
 * a CopilotApprovalRequest from pending to a terminal state.
 *
 * It never executes actions directly.
 * Callers (API routes, cron jobs) drive execution separately after approval.
 *
 * Architecture:
 *
 *   API Route / Copilot Rail
 *     │
 *     ▼ ApprovalDecisionInput
 *   ApprovalWorkflowService
 *     │
 *     ├── getPendingApprovals()       — list pending for tenant
 *     ├── getApprovalDetail()         — load single (tenant-scoped)
 *     ├── approveApprovalRequest()    — pending → approved
 *     ├── rejectApprovalRequest()     — pending → rejected
 *     ├── cancelApprovalRequest()     — pending → cancelled
 *     ├── expireApprovalRequest()     — pending → expired
 *     ├── buildResumePlan()           — deterministic plan from snapshot
 *     └── resumeExecutionFromApproval() — Phase 2 stub (not_implemented_yet)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  ApprovalDecisionStatus,
  ApprovalDecisionInput,
  BuildResumePlanInput,
  ApprovalResolution,
  ApprovalWorkflowResult,
  ApprovalResumePlan,
  ApprovalResumeStep,
  ResumeExecutionInput,
  ResumeExecutionResult,
} from "./approval-workflow-types";

// ── Errors ────────────────────────────────────────────────────────────────────

export type { ApprovalWorkflowErrorCode } from "./approval-workflow-errors";
export { ApprovalWorkflowError, errorResult } from "./approval-workflow-errors";

// ── Service ───────────────────────────────────────────────────────────────────

export {
  ApprovalWorkflowService,
  createApprovalWorkflowService,
} from "./approval-workflow-service";

// ── Validation ────────────────────────────────────────────────────────────────

export type { ApprovalWorkflowSmokeCheck, ApprovalWorkflowValidateResult } from "./approval-workflow-validate";
export { runApprovalWorkflowSmokeCheck } from "./approval-workflow-validate";
