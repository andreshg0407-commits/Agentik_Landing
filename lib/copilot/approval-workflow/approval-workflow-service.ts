/**
 * lib/copilot/approval-workflow/approval-workflow-service.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Core approval workflow service.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * The ApprovalWorkflowService orchestrates the human-in-the-loop approval
 * lifecycle for Agentik executions.
 *
 * It is the ONLY authorised path for transitioning a CopilotApprovalRequest
 * from pending to a terminal state. It never executes actions directly.
 *
 * Dependency direction:
 *   approval-workflow-types ← approval-workflow-errors ← approval-workflow-service
 *   execution-store         ← approval-workflow-service
 *   runtime-types           ← approval-workflow-service (types only, for planSnapshot)
 *
 * Architecture:
 *   Copilot Rail / API route
 *     │
 *     ▼ ApprovalDecisionInput (resolvedBy from auth)
 *   ApprovalWorkflowService
 *     │
 *     ├── getApprovalRequestById()  — validate record + tenant
 *     ├── resolveApprovalRequest()  — atomic update + event
 *     └── buildResumePlan()         — deterministic plan from snapshot
 *
 *   Runtime (separate call, NOT inside this service)
 *     └── executeExecutionPlan(resumePlan, ...)
 */
import "server-only";

import type { ExecutionStore }                  from "@/lib/copilot/execution-store/execution-store-types";
import type { ApprovalRequestRecord }           from "@/lib/copilot/execution-store/execution-store-types";

import type {
  ApprovalDecisionInput,
  BuildResumePlanInput,
  ApprovalResolution,
  ApprovalWorkflowResult,
  ApprovalResumePlan,
  ApprovalResumeStep,
  ApprovalDecisionStatus,
  ResumeExecutionInput,
  ResumeExecutionResult,
} from "./approval-workflow-types";

import {
  ApprovalWorkflowError,
  errorResult,
} from "./approval-workflow-errors";

// ── Internal: plan step shape ──────────────────────────────────────────────────

/** Minimal type for steps extracted from a stored planSnapshot. */
interface StoredPlanStep {
  stepId:             string;
  actionId:           string;
  domain:             string;
  displayName:        string;
  order:              number;
  parameters:         Record<string, unknown>;
  requiresApproval:   boolean;
  automationEligible: boolean;
  dependsOn?:         string[];
}

interface StoredPlan {
  steps: StoredPlanStep[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function eventTypeForDecision(nextStatus: ApprovalDecisionStatus): string {
  switch (nextStatus) {
    case "approved":  return "approval_approved";
    case "rejected":  return "approval_rejected";
    case "cancelled": return "approval_cancelled";
    case "expired":   return "approval_expired";
    default:          return `approval_${nextStatus}`;
  }
}

function noResumePlan(
  input:   BuildResumePlanInput,
  reason:  string,
): ApprovalResumePlan {
  return {
    canResume:           false,
    reason,
    executionId:         "",
    correlationId:       "",
    tenantId:            input.tenantId,
    approvedApprovalId:  input.approvalId,
    resumeFromStepId:    "",
    stepsToRun:          [],
    completedStepIds:    [],
    blockedStepIds:      [],
    skippedStepIds:      [],
    warnings:            [reason],
  };
}

// ── ApprovalWorkflowService ────────────────────────────────────────────────────

/**
 * Primary service for the Agentik approval workflow.
 *
 * All public methods return ApprovalWorkflowResult — they never throw.
 * Errors from the store or validation are captured and surfaced as
 * `{ ok: false, errorCode, error }`.
 *
 * Usage:
 *   const svc = new ApprovalWorkflowService(createPrismaExecutionStore());
 *   const result = await svc.approveApprovalRequest({ approvalId, tenantId, resolvedBy });
 */
export class ApprovalWorkflowService {

  constructor(private readonly store: ExecutionStore) {}

  // ── Read operations ────────────────────────────────────────────────────────

  /**
   * List all PENDING approval requests for a tenant.
   * Passthrough to ExecutionStore.getPendingApprovals.
   */
  async getPendingApprovals(
    tenantId: string,
    opts?: { limit?: number },
  ): Promise<ApprovalRequestRecord[]> {
    const all = await this.store.getPendingApprovals(tenantId);
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  /**
   * Load a single approval request (tenant-scoped).
   * Returns null if not found or if it belongs to a different tenant.
   */
  async getApprovalDetail(
    tenantId:   string,
    approvalId: string,
  ): Promise<ApprovalRequestRecord | null> {
    const record = await this.store.getApprovalRequestById(tenantId, approvalId);
    // Double-check tenant isolation even if the store filters
    if (!record || record.tenantId !== tenantId) return null;
    return record;
  }

  // ── Decision operations ────────────────────────────────────────────────────

  /**
   * Approve a pending approval request.
   *
   * - Validates: exists, same tenant, currently pending.
   * - Transitions status to APPROVED.
   * - Records approval_approved event.
   * - Does NOT execute the underlying action.
   */
  async approveApprovalRequest(
    input: ApprovalDecisionInput,
  ): Promise<ApprovalWorkflowResult> {
    return this._resolve(input, "approved");
  }

  /**
   * Reject a pending approval request.
   *
   * - Validates: exists, same tenant, currently pending.
   * - Transitions status to REJECTED.
   * - Records approval_rejected event.
   * - The execution associated with this approval should be marked cancelled or failed
   *   by the caller / background job — this service does not do it automatically.
   */
  async rejectApprovalRequest(
    input: ApprovalDecisionInput,
  ): Promise<ApprovalWorkflowResult> {
    return this._resolve(input, "rejected");
  }

  /**
   * Cancel a pending approval request (initiated by the requestor or an admin).
   *
   * - Validates: exists, same tenant, currently pending.
   * - Transitions status to CANCELLED.
   * - Records approval_cancelled event.
   */
  async cancelApprovalRequest(
    input: ApprovalDecisionInput,
  ): Promise<ApprovalWorkflowResult> {
    return this._resolve(input, "cancelled");
  }

  /**
   * Expire a pending approval request (time-based or policy-based expiry).
   *
   * - Validates: exists, same tenant, currently pending.
   * - Transitions status to EXPIRED.
   * - Records approval_expired event.
   */
  async expireApprovalRequest(
    input: ApprovalDecisionInput,
  ): Promise<ApprovalWorkflowResult> {
    return this._resolve(input, "expired");
  }

  // ── Resume plan ────────────────────────────────────────────────────────────

  /**
   * Build a deterministic resume plan from an APPROVED approval request.
   *
   * This method does NOT execute anything. It reconstructs which steps need
   * to run from the original planSnapshot and the steps already persisted.
   *
   * Returns canResume=false with a reason if:
   *   - The approval doesn't exist or belongs to another tenant
   *   - The approval is not APPROVED (pending/rejected/expired/cancelled)
   *   - The execution record is missing
   *   - The planSnapshot is absent
   *   - The stepId from the approval isn't in the planSnapshot
   */
  async buildResumePlan(input: BuildResumePlanInput): Promise<ApprovalResumePlan> {
    try {
      // 1. Load and validate the approval
      const approval = await this.store.getApprovalRequestById(
        input.tenantId,
        input.approvalId,
      );

      if (!approval) {
        return noResumePlan(input, `Approval "${input.approvalId}" not found.`);
      }

      if (approval.tenantId !== input.tenantId) {
        return noResumePlan(input, "Tenant mismatch — approval belongs to a different tenant.");
      }

      if (approval.approvalStatus !== "approved") {
        return noResumePlan(
          input,
          `Cannot build resume plan: approval status is "${approval.approvalStatus}" (must be "approved").`,
        );
      }

      // 2. Load the execution record
      const execution = await this.store.getExecutionSnapshot(
        input.tenantId,
        approval.executionId,
      );

      if (!execution) {
        return noResumePlan(
          input,
          `Execution "${approval.executionId}" not found for tenant "${input.tenantId}".`,
        );
      }

      if (!execution.planSnapshot) {
        return noResumePlan(
          input,
          `Execution "${approval.executionId}" has no planSnapshot — cannot reconstruct resume plan.`,
        );
      }

      // 3. Parse planSnapshot
      const plan = execution.planSnapshot as Partial<StoredPlan>;
      const allOriginalSteps: StoredPlanStep[] = Array.isArray(plan?.steps) ? plan.steps : [];

      // 4. Load persisted steps (what actually ran before)
      const persistedSteps = await this.store.getExecutionSteps(
        input.tenantId,
        approval.executionId,
      );

      const completedStepIds = persistedSteps
        .filter(s => s.status === "completed")
        .map(s => s.stepId);

      const skippedStepIds = persistedSteps
        .filter(s => s.status === "skipped")
        .map(s => s.stepId);

      const awaitingStepIds = persistedSteps
        .filter(s => s.status === "awaiting_approval")
        .map(s => s.stepId);

      const blockedByPolicyIds = persistedSteps
        .filter(s => s.status === "blocked" || s.status === "failed")
        .map(s => s.stepId);

      // The approved step is no longer "blocked" — exclude it from blockedStepIds
      const blockedStepIds = [
        ...new Set([...awaitingStepIds, ...blockedByPolicyIds]),
      ].filter(id => id !== approval.stepId);

      // 5. Find the resume step in the original plan
      const resumeStep = allOriginalSteps.find(s => s.stepId === approval.stepId);

      if (!resumeStep) {
        return noResumePlan(
          input,
          `Step "${approval.stepId}" from the approval is not present in the planSnapshot.`,
        );
      }

      // 6. Build stepsToRun: the approved step + all subsequent steps not yet completed
      const resumeOrder = resumeStep.order;

      const stepsToRun: ApprovalResumeStep[] = allOriginalSteps
        .filter(s => s.order >= resumeOrder && !completedStepIds.includes(s.stepId))
        .sort((a, b) => a.order - b.order)
        .map(s => ({
          stepId:             s.stepId,
          actionId:           s.actionId,
          domain:             s.domain,
          displayName:        s.displayName,
          order:              s.order,
          parameters:         s.parameters ?? {},
          requiresApproval:   s.requiresApproval ?? false,
          automationEligible: s.automationEligible ?? false,
        }));

      const warnings: string[] = [];
      if (stepsToRun.length === 0) {
        warnings.push("No steps to run — all steps are already completed.");
      }

      return {
        canResume:           true,
        executionId:         execution.executionId,
        correlationId:       execution.correlationId,
        tenantId:            input.tenantId,
        approvedApprovalId:  input.approvalId,
        resumeFromStepId:    approval.stepId,
        stepsToRun,
        completedStepIds,
        blockedStepIds,
        skippedStepIds,
        warnings,
        planSnapshot:        execution.planSnapshot,
      };

    } catch (err) {
      return noResumePlan(
        input,
        `Failed to build resume plan: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Resume execution (Phase 2 stub) ───────────────────────────────────────

  /**
   * Phase 2 stub — reserved for the sprint that wires resume → Runtime.
   *
   * Currently returns { status: "not_implemented_yet" }.
   * Callers should use buildResumePlan() + executeExecutionPlan() directly.
   */
  async resumeExecutionFromApproval(
    _input: ResumeExecutionInput,
  ): Promise<ResumeExecutionResult> {
    return {
      status: "not_implemented_yet",
      reason: "Runtime resumption from approval is reserved for AGENTIK-RESUME-EXECUTION-01. " +
              "Use buildResumePlan() to get the plan, then call executeExecutionPlan() directly.",
    };
  }

  // ── Private: shared resolution logic ──────────────────────────────────────

  private async _resolve(
    input:      ApprovalDecisionInput,
    nextStatus: ApprovalDecisionStatus,
  ): Promise<ApprovalWorkflowResult> {
    const { approvalId } = input;

    try {
      // Guard: input validation
      if (!approvalId)     throw new ApprovalWorkflowError("INVALID_INPUT",      "approvalId is required.");
      if (!input.tenantId) throw new ApprovalWorkflowError("INVALID_INPUT",      "tenantId is required.");
      if (!input.resolvedBy) throw new ApprovalWorkflowError("INVALID_INPUT",    "resolvedBy is required.");

      // Load the record
      const record = await this.store.getApprovalRequestById(input.tenantId, approvalId);

      if (!record) {
        throw new ApprovalWorkflowError("APPROVAL_NOT_FOUND", `Approval "${approvalId}" not found.`);
      }

      // Tenant isolation check
      if (record.tenantId !== input.tenantId) {
        throw new ApprovalWorkflowError(
          "TENANT_MISMATCH",
          `Approval "${approvalId}" belongs to a different tenant.`,
        );
      }

      // Status guard: only pending can be resolved
      if (record.approvalStatus !== "pending") {
        throw new ApprovalWorkflowError(
          "ALREADY_RESOLVED",
          `Approval "${approvalId}" is already "${record.approvalStatus}" — it cannot be ${nextStatus}.`,
        );
      }

      const resolvedAt      = new Date();
      const previousStatus  = record.approvalStatus as ApprovalDecisionStatus;

      // Atomically update record + record audit event
      await this.store.resolveApprovalRequest({
        approvalId:     approvalId,
        tenantId:       input.tenantId,
        executionId:    record.executionId,
        stepId:         record.stepId,
        actionId:       record.actionId,
        domain:         record.domain,
        previousStatus: previousStatus,
        nextStatus:     nextStatus,
        resolvedBy:     input.resolvedBy,
        resolvedAt,
        resolutionNote: input.resolutionNote,
        eventType:      eventTypeForDecision(nextStatus),
      });

      const resolution: ApprovalResolution = {
        approvalId,
        executionId:    record.executionId,
        tenantId:       input.tenantId,
        stepId:         record.stepId,
        actionId:       record.actionId,
        domain:         record.domain,
        requestedBy:    record.requestedBy,
        previousStatus,
        nextStatus,
        resolvedBy:     input.resolvedBy,
        resolvedAt,
        resolutionNote: input.resolutionNote,
      };

      return { ok: true, approvalId, resolution };

    } catch (err) {
      return errorResult(approvalId, err);
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create an ApprovalWorkflowService backed by the given ExecutionStore.
 *
 * For production:
 *   createApprovalWorkflowService(createPrismaExecutionStore())
 *
 * For tests:
 *   createApprovalWorkflowService(noopExecutionStore)
 */
export function createApprovalWorkflowService(
  store: ExecutionStore,
): ApprovalWorkflowService {
  return new ApprovalWorkflowService(store);
}
