/**
 * lib/copilot/runtime/execution-resume.ts
 *
 * AGENTIK-EXECUTION-RESUME-01 — Resume a paused execution after human approval.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * This module is the ONLY authorised entry point for resuming a Copilot
 * execution that was paused at a require_approval gate.
 *
 * Design principles:
 *   - Never creates a new execution — always reuses the original executionId
 *     and correlationId to maintain audit continuity
 *   - Approval override only applies to the exact approved step — never bleeds
 *   - deny always wins — no override can bypass a deny decision
 *   - Idempotent by approvalId — safe to call twice (returns already_resumed)
 *   - If no dispatcher is provided, returns domain_provider_not_available
 *     (allows API route to be deployed before providers are wired)
 *
 * Dependency direction:
 *   approval-workflow-service ← execution-resume (uses buildResumePlan)
 *   action-runtime            ← execution-resume (calls executeExecutionPlan)
 *   execution-store           ← execution-resume (reads/writes events)
 *
 * Usage:
 *   const result = await resumeExecutionFromApproval({
 *     tenantId:       "castillitos",
 *     approvalId:     "approval-xxx",
 *     resumedBy:      "admin@acme.com",
 *     executionStore: createPrismaExecutionStore(),
 *     dispatcher:     myDispatcher,
 *   });
 */
import "server-only";

import type { ActionDispatcher }    from "./action-dispatcher";
import type { ApprovalGateConfig }  from "./approval-gate";
import type { ApprovedStepOverride } from "./action-runtime";
import { executeExecutionPlan }     from "./action-runtime";

import type { PolicyEngine }        from "@/lib/copilot/policy/policy-engine";

import type { ExecutionStore }      from "@/lib/copilot/execution-store/execution-store-types";
import { sanitizeSnapshot }         from "@/lib/copilot/execution-store/execution-store-sanitizer";

import type {
  RuntimeExecutionPlan,
  RuntimeStepSpec,
  ExtendedExecutionReport,
  ExecutionContext,
} from "./execution-runtime";

import { createApprovalWorkflowService } from "@/lib/copilot/approval-workflow";

// ── Public types ───────────────────────────────────────────────────────────────

/** Input to resumeExecutionFromApproval(). */
export interface ExecutionResumeInput {
  tenantId:         string;
  approvalId:       string;
  resumedBy:        string;
  executionStore:   ExecutionStore;
  /**
   * The action dispatcher used to run steps.
   * If undefined, the function returns { status: "domain_provider_not_available" }
   * without attempting execution. Allows the API route to deploy before
   * domain providers are wired for a given org.
   */
  dispatcher?:      ActionDispatcher;
  policyEngine?:    PolicyEngine;
  approvalConfig?:  ApprovalGateConfig;
  silent?:          boolean;
}

/** Possible outcomes of resumeExecutionFromApproval(). */
export type ExecutionResumeStatus =
  | "resumed"                      // resume completed successfully
  | "already_resumed"              // approval was already used to resume
  | "resume_already_running"       // a resume attempt is currently in flight
  | "approval_not_found"           // no record found for approvalId/tenantId
  | "approval_not_approved"        // approval is pending/rejected/expired/cancelled
  | "no_steps_to_run"              // all steps already completed
  | "cannot_resume"                // buildResumePlan returned canResume=false
  | "domain_provider_not_available" // dispatcher not provided
  | "error";                       // unexpected exception

/** Result returned by resumeExecutionFromApproval(). */
export interface ExecutionResumeResult {
  status:         ExecutionResumeStatus;
  executionId?:   string;
  correlationId?: string;
  approvalId:     string;
  tenantId:       string;
  report?:        ExtendedExecutionReport;
  reason?:        string;
  warnings?:      string[];
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function idFor(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Check if a previous resume attempt for this approvalId has already completed. */
function detectPreviousResume(
  events: Array<{ eventType: string; payload?: unknown }>,
  approvalId: string,
): "already_resumed" | "resume_already_running" | null {
  let startedCount = 0;
  let completedCount = 0;

  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | undefined;
    if (!p || p["approvalId"] !== approvalId) continue;
    if (ev.eventType === "approval_resume_completed") completedCount++;
    if (ev.eventType === "approval_resume_started")   startedCount++;
  }

  if (completedCount > 0)                          return "already_resumed";
  if (startedCount > 0 && completedCount === 0)    return "resume_already_running";
  return null;
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Resume a Copilot execution that was paused at a require_approval gate.
 *
 * This function never throws — all errors are captured in the result.
 */
export async function resumeExecutionFromApproval(
  input: ExecutionResumeInput,
): Promise<ExecutionResumeResult> {
  const { tenantId, approvalId, resumedBy, executionStore: store } = input;
  const resumeAttemptId = idFor("resume");

  // ── Guard: dispatcher required ─────────────────────────────────────────────
  if (!input.dispatcher) {
    return {
      status:     "domain_provider_not_available",
      approvalId,
      tenantId,
      reason:     "No ActionDispatcher provided. Register domain providers before resuming.",
    };
  }

  const dispatcher = input.dispatcher;

  try {
    // ── 1. Load and validate approval ───────────────────────────────────────
    const approval = await store.getApprovalRequestById(tenantId, approvalId);

    if (!approval) {
      return {
        status:     "approval_not_found",
        approvalId,
        tenantId,
        reason:     `Approval "${approvalId}" not found for tenant "${tenantId}".`,
      };
    }

    if (approval.tenantId !== tenantId) {
      return {
        status:     "approval_not_found",
        approvalId,
        tenantId,
        reason:     "Tenant mismatch — approval belongs to a different tenant.",
      };
    }

    if (approval.approvalStatus !== "approved") {
      return {
        status:     "approval_not_approved",
        approvalId,
        tenantId,
        reason:     `Approval is "${approval.approvalStatus}" — must be "approved" to resume.`,
      };
    }

    // ── 2. Load execution snapshot ──────────────────────────────────────────
    const execution = await store.getExecutionSnapshot(tenantId, approval.executionId);

    if (!execution) {
      return {
        status:     "cannot_resume",
        approvalId,
        tenantId,
        reason:     `Execution "${approval.executionId}" not found.`,
      };
    }

    const executionId   = execution.executionId;
    const correlationId = execution.correlationId;

    // ── 3. Idempotency — check for previous resume attempts ─────────────────
    const existingEvents = await store.getExecutionEvents(tenantId, executionId);
    const prevResume = detectPreviousResume(existingEvents, approvalId);
    if (prevResume !== null) {
      return {
        status:         prevResume,
        executionId,
        correlationId,
        approvalId,
        tenantId,
        reason:         prevResume === "already_resumed"
          ? `Approval "${approvalId}" was already used to resume execution "${executionId}".`
          : `A resume attempt for approval "${approvalId}" is already in flight.`,
      };
    }

    // ── 4. Build resume plan ────────────────────────────────────────────────
    const svc        = createApprovalWorkflowService(store);
    const resumePlan = await svc.buildResumePlan({ tenantId, approvalId, requestedBy: resumedBy });

    if (!resumePlan.canResume) {
      return {
        status:     "cannot_resume",
        executionId,
        correlationId,
        approvalId,
        tenantId,
        reason:     resumePlan.reason ?? "buildResumePlan returned canResume=false.",
        warnings:   resumePlan.warnings,
      };
    }

    if (resumePlan.stepsToRun.length === 0) {
      return {
        status:     "no_steps_to_run",
        executionId,
        correlationId,
        approvalId,
        tenantId,
        reason:     "All steps are already completed — nothing to resume.",
        warnings:   resumePlan.warnings,
      };
    }

    // ── 5. Build the partial RuntimeExecutionPlan from stepsToRun ───────────
    const resumeSteps: RuntimeStepSpec[] = resumePlan.stepsToRun.map(s => ({
      stepId:             s.stepId,
      actionId:           s.actionId,
      domain:             s.domain,
      displayName:        s.displayName,
      parameters:         s.parameters,
      requiresApproval:   s.requiresApproval,
      automationEligible: s.automationEligible,
      order:              s.order,
    }));

    const partialPlan: RuntimeExecutionPlan = {
      planId:  execution.planId ?? idFor("plan"),
      title:   execution.planTitle ?? "Resumed execution",
      summary: `Resume from approval ${approvalId}`,
      steps:   resumeSteps,
    };

    // ── 6. Build approved step override for the unlocked step ───────────────
    const approvedAt = approval.resolvedAt ?? new Date();
    const approvedBy = approval.resolvedBy ?? resumedBy;

    const approvedStepOverrides: Record<string, ApprovedStepOverride> = {
      [approval.stepId]: {
        stepId:     approval.stepId,
        approvalId,
        approvedBy,
        approvedAt,
      },
    };

    // ── 7. Build execution context — preserve original identifiers ───────────
    const ctx: ExecutionContext = {
      executionId,
      correlationId,
      tenantId,
      userId:      resumedBy,
      requestedAt: new Date(),
      metadata: {
        ...(execution.metadata as Record<string, unknown> | undefined ?? {}),
        resumeAttemptId,
        resumedFromApprovalId: approvalId,
        resumedBy,
        resumedAt: new Date().toISOString(),
      },
    };

    // ── 8. Record approval_resume_started ────────────────────────────────────
    const resumeStartedAt = new Date();

    try {
      await store.recordEvent({
        executionId,
        tenantId,
        eventType: "approval_resume_started",
        message:   `Resume started for approval "${approvalId}" by "${resumedBy}".`,
        payload: {
          approvalId,
          resumedBy,
          resumeAttemptId,
          stepId:        approval.stepId,
          stepsToRun:    resumePlan.stepsToRun.length,
          resumedFromApprovalId: approvalId,
        },
      });
    } catch (_e) {
      // Persistence error — continue execution
    }

    // Update execution status to "resuming"
    try {
      await store.updateExecution(executionId, tenantId, {
        status: "resuming" as never,
      });
    } catch (_e) {
      // Status update failed — non-fatal, continue
    }

    // ── 9. Execute the resume plan ───────────────────────────────────────────
    const report = await executeExecutionPlan(partialPlan, ctx, dispatcher, {
      policyEngine:          input.policyEngine,
      approvalConfig:        input.approvalConfig,
      executionStore:        store,
      executionSource:       "api",
      executionMode:         "copilot",
      silent:                input.silent,
      resumeMode:            true,
      resumedFromApprovalId: approvalId,
      resumedBy,
      approvedStepOverrides,
    });

    // ── 10. Compute combined execution totals ────────────────────────────────
    const allSteps      = await store.getExecutionSteps(tenantId, executionId);
    const totalOriginal = allSteps.length;
    const completed     = allSteps.filter(s => s.status === "completed").length;
    const failed        = allSteps.filter(s => s.status === "failed").length;
    const skipped       = allSteps.filter(s => s.status === "skipped").length;
    const blocked       = allSteps.filter(s => s.status === "blocked").length;

    const finalStatus   = report.overallStatus;
    const finishedAt    = new Date();
    const durationMs    = finishedAt.getTime() - resumeStartedAt.getTime();

    const succeeded = finalStatus === "completed" || finalStatus === "awaiting_approval";

    // ── 11. Record completion event ──────────────────────────────────────────
    const completionEventType = succeeded
      ? "approval_resume_completed"
      : "approval_resume_failed";

    try {
      await store.recordEvent({
        executionId,
        tenantId,
        eventType: completionEventType,
        status:    finalStatus,
        message:   succeeded
          ? `Resume completed for approval "${approvalId}" — status: ${finalStatus}.`
          : `Resume failed for approval "${approvalId}" — status: ${finalStatus}.`,
        payload: {
          approvalId,
          resumedBy,
          resumeAttemptId,
          finalStatus,
          durationMs,
          completedSteps:  report.completedSteps,
          failedSteps:     report.failedSteps,
        },
      });

      // Record execution_resumed event for human-readable audit timeline
      await store.recordEvent({
        executionId,
        tenantId,
        eventType: "execution_resumed",
        status:    finalStatus,
        message:   `Execution "${executionId}" resumed from approval "${approvalId}" by "${resumedBy}".`,
        payload: {
          approvalId,
          resumedBy,
          resumeAttemptId,
        },
      });
    } catch (_e) {
      // Non-fatal — audit events best-effort
    }

    // ── 12. Final updateExecution with combined totals ───────────────────────
    try {
      await store.updateExecution(executionId, tenantId, {
        status:           finalStatus,
        finishedAt,
        durationMs,
        completedSteps:   completed,
        failedSteps:      failed,
        skippedSteps:     skipped,
        blockedSteps:     blocked,
        approvalRequired: report.audit.approvalRequired,
        deniedByPolicy:   report.deniedByPolicy,
        reportSnapshot:   sanitizeSnapshot(report),
      });
    } catch (_e) {
      // Non-fatal
    }

    return {
      status:       succeeded ? "resumed" : "error",
      executionId,
      correlationId,
      approvalId,
      tenantId,
      report,
      reason:       succeeded ? undefined : `Resume execution ended with status "${finalStatus}".`,
      warnings:     [
        ...resumePlan.warnings,
        ...report.warnings,
      ],
    };

  } catch (err) {
    return {
      status:     "error",
      approvalId,
      tenantId,
      reason:     `Unexpected error during resume: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
