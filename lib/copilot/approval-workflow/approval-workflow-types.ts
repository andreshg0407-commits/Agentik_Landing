/**
 * lib/copilot/approval-workflow/approval-workflow-types.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Type contracts for the Approval Workflow.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * The Approval Workflow converts persisted CopilotApprovalRequest records
 * into resolved decisions (approved / rejected / cancelled / expired) and
 * builds deterministic resume plans for blocked executions.
 *
 * Design:
 *   - Approving does NOT execute anything. The Runtime resumes separately.
 *   - All decisions are multi-tenant scoped (tenantId on every input).
 *   - resolvedBy always comes from the authenticated session, never from the request body.
 *   - Resume plans are deterministic: same inputs always produce the same plan.
 */
import "server-only";

// ── Decision status ────────────────────────────────────────────────────────────

/**
 * Lifecycle status for an approval decision.
 * Mirrors CopilotApprovalStatus but in lowercase for the domain layer.
 */
export type ApprovalDecisionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

// ── Inputs ─────────────────────────────────────────────────────────────────────

/**
 * Input for any approval decision operation (approve / reject / cancel / expire).
 * resolvedBy must come from auth — never from untrusted client input.
 */
export interface ApprovalDecisionInput {
  /** CopilotApprovalRequest.id */
  approvalId:      string;
  tenantId:        string;
  /** Authenticated userId who is making the decision */
  resolvedBy:      string;
  /** Optional human note explaining the decision */
  resolutionNote?: string;
}

/**
 * Input for buildResumePlan().
 */
export interface BuildResumePlanInput {
  tenantId:    string;
  approvalId:  string;
  /** Authenticated userId requesting the plan */
  requestedBy: string;
}

// ── Resolution record ─────────────────────────────────────────────────────────

/**
 * Immutable record of a completed approval decision.
 * Returned inside ApprovalWorkflowResult.
 */
export interface ApprovalResolution {
  approvalId:      string;
  executionId:     string;
  tenantId:        string;
  stepId:          string;
  actionId:        string;
  domain:          string;
  requestedBy:     string;
  previousStatus:  ApprovalDecisionStatus;
  nextStatus:      ApprovalDecisionStatus;
  resolvedBy:      string;
  resolvedAt:      Date;
  resolutionNote?: string;
}

// ── Result ─────────────────────────────────────────────────────────────────────

/**
 * Result of any approval workflow operation.
 * Never throws — errors are captured in `ok: false` results.
 */
export interface ApprovalWorkflowResult {
  ok:          boolean;
  approvalId:  string;
  resolution?: ApprovalResolution;
  error?:      string;
  errorCode?:  string;
}

// ── Resume plan ────────────────────────────────────────────────────────────────

/**
 * A single step ready to run in a resume execution.
 * Reconstructed from the planSnapshot stored at execution creation.
 */
export interface ApprovalResumeStep {
  stepId:             string;
  actionId:           string;
  domain:             string;
  displayName:        string;
  order:              number;
  parameters:         Record<string, unknown>;
  requiresApproval:   boolean;
  automationEligible: boolean;
}

/**
 * Deterministic resume plan produced by buildResumePlan().
 *
 * When canResume=true, this plan can be passed directly to a new
 * `executeExecutionPlan()` call with the original ExecutionContext
 * (using the same correlationId) to resume from the approved step.
 *
 * When canResume=false, reason explains why.
 */
export interface ApprovalResumePlan {
  canResume:           boolean;
  reason?:             string;

  // ── Execution identity ──────────────────────────────────────────────────────
  executionId:         string;
  correlationId:       string;
  tenantId:            string;
  approvedApprovalId:  string;
  resumeFromStepId:    string;

  // ── Step categorisation ─────────────────────────────────────────────────────
  /** Steps that must run (the approved step + any pending successors) */
  stepsToRun:          ApprovalResumeStep[];
  /** Steps already completed in the original execution */
  completedStepIds:    string[];
  /** Steps blocked by denied policy or unresolved gate (excludes the approved step) */
  blockedStepIds:      string[];
  /** Steps skipped due to execution policy */
  skippedStepIds:      string[];

  /** Non-fatal issues found while building the plan */
  warnings:            string[];

  /** The original planSnapshot for reference — not to be mutated */
  planSnapshot?:       unknown;
}

// ── Resume execution stub ──────────────────────────────────────────────────────

/**
 * Input for resumeExecutionFromApproval() (Phase 2 stub).
 * Reserved for a future sprint that implements actual execution resumption.
 */
export interface ResumeExecutionInput {
  tenantId:     string;
  approvalId:   string;
  resumePlan:   ApprovalResumePlan;
  resumedBy:    string;
}

/**
 * Result of resumeExecutionFromApproval().
 * Phase 1: always returns not_implemented_yet.
 */
export interface ResumeExecutionResult {
  status:      "resumed" | "not_implemented_yet" | "error";
  reason?:     string;
  executionId?: string;
}
