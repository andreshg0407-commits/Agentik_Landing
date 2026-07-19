/**
 * lib/work/live/work-execution-service.ts
 *
 * Agentik — Work Execution Service
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY — coordinates between the Dispatcher and the Repository.
 *
 * Responsibility:
 *   - Persist a job before dispatching
 *   - Call the dispatcher
 *   - Persist the result after execution
 *   - Expose query methods for history
 *
 * This is the public API for the work execution layer.
 * Callers: Server Actions, API routes, event bridges.
 */
import "server-only";

import type { ApprovalApprovedEvent, WorkExecutionActor } from "./work-execution-types";
import { workExecutionRepository }    from "./persistence/work-execution-repository";

// ── Service result ────────────────────────────────────────────────────────────

export interface WorkExecutionServiceResult {
  success:       boolean;
  message:       string;
  jobId?:        string;
  executorType?: string;
  errors?:       string[];
}

// ── Retry result ──────────────────────────────────────────────────────────────

export interface WorkExecutionRetryResult {
  success:             boolean;
  message:             string;
  originalExecutionId: string;
  retryExecutionId?:   string;
  retryAttempt?:       number;
  errors?:             string[];
  warnings?:           string[];
}

// ── Service ───────────────────────────────────────────────────────────────────

export const workExecutionService = {

  /**
   * Full pipeline: persist job → dispatch → persist result.
   * Called by the event bridge (or directly from a Server Action).
   *
   * Never throws — all errors captured in the result envelope.
   */
  async executeFromApprovalEvent(
    event: ApprovalApprovedEvent,
  ): Promise<WorkExecutionServiceResult> {
    try {
      // 1. Resolve executor type and build job (via dispatcher internals)
      const { resolveExecutorForApproval } = await import("./work-execution-router");
      const { createExecutionJobFromApprovalEvent } = await import("./work-execution-factory");
      const executorType = resolveExecutorForApproval(event);
      const job = createExecutionJobFromApprovalEvent(event, executorType);

      // 2. Persist job (PENDING)
      try {
        await workExecutionRepository.createExecution(job);
      } catch (persistErr) {
        // Non-fatal: continue execution even if persistence fails
        console.warn("[work-execution-service] Could not persist job:", persistErr);
      }

      // 3. Dispatch (runs the executor)
      const { dispatchApprovalExecution } = await import("./work-execution-dispatcher");
      const dispatchResult = await dispatchApprovalExecution(event);

      // 4. Persist result
      if (dispatchResult.result) {
        try {
          await workExecutionRepository.saveResult(job.id, dispatchResult.result);
        } catch (persistErr) {
          console.warn("[work-execution-service] Could not persist result:", persistErr);
        }
      }

      // 5. Fire-and-forget: attempt chain continuation for COMPLETED executions.
      //    Never blocks the caller — chain failures are logged, not propagated.
      if (dispatchResult.success) {
        void (async () => {
          try {
            const { workflowChainService } = await import("@/lib/work/chaining/workflow-chain-service");
            const saved = await workExecutionRepository.findById(job.id);
            if (saved) {
              await workflowChainService.continueChainAfterExecution(saved, event.orgSlug);
            }
          } catch (chainErr) {
            console.warn("[work-execution-service] Chain continuation failed (non-blocking):", chainErr);
          }
        })();
      }

      return {
        success:      dispatchResult.success,
        message:      dispatchResult.result?.message ?? (dispatchResult.success ? "Ejecución completada." : "Ejecución fallida."),
        jobId:        job.id,
        executorType: dispatchResult.executorType,
        errors:       dispatchResult.errors.length > 0 ? dispatchResult.errors : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado en el servicio de ejecución.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Query execution history for an approval.
   */
  async getExecutionsForApproval(approvalId: string) {
    return workExecutionRepository.findByApprovalId(approvalId);
  },

  /**
   * Query recent executions for an org.
   */
  async listExecutions(orgSlug: string, limit?: number) {
    return workExecutionRepository.listByOrg(orgSlug, limit);
  },

  /**
   * Get a single execution by job ID.
   */
  async getExecution(jobId: string) {
    return workExecutionRepository.findById(jobId);
  },

  /**
   * Manually retry a FAILED execution.
   *
   * Guardrails:
   *   - original status must be FAILED
   *   - retryAttempt < maxRetryAttempts
   *   - associated approval must still be APPROVED
   *
   * Creates a new WorkExecution (original remains FAILED).
   * Full audit trail on the new execution.
   */
  async retryExecution(
    executionId: string,
    actor:       WorkExecutionActor,
    reason?:     string,
  ): Promise<WorkExecutionRetryResult> {
    try {
      // 1. Fetch original
      const original = await workExecutionRepository.findById(executionId);
      if (!original) {
        return {
          success:             false,
          message:             `Ejecución ${executionId} no encontrada.`,
          originalExecutionId: executionId,
          errors:              ["EXECUTION_NOT_FOUND"],
        };
      }

      // 2. Fetch associated approval to verify still APPROVED
      const { approvalService } = await import("@/lib/approvals/approval-service");
      const approvalResult = await approvalService.getApproval(original.approvalId);
      const approvalStatus  = approvalResult.approval?.status ?? "UNKNOWN";

      // 3. Validate retry eligibility
      const { validateRetryExecution } = await import("./work-execution-audit");
      const validation = validateRetryExecution(original, approvalStatus);
      if (!validation.valid) {
        return {
          success:             false,
          message:             validation.errors.map(e => e.message).join(" "),
          originalExecutionId: executionId,
          errors:              validation.errors.map(e => e.message),
          warnings:            validation.warnings.map(w => w.message),
        };
      }

      // 4. Build retry job using stored payload
      const { createRetryExecutionJob } = await import("./work-execution-factory");

      // Resolve orgSlug from original organization
      const org = await import("@/lib/prisma").then(m =>
        (m.prisma as any).organization.findUnique({
          where:  { id: original.organizationId },
          select: { slug: true },
        })
      );
      const orgSlug = (org?.slug as string) ?? original.organizationId;

      const retryJob = createRetryExecutionJob({
        originalJobId:    original.id,
        executorType:     original.executorType as Parameters<typeof createRetryExecutionJob>[0]["executorType"],
        trigger:          original.trigger as Parameters<typeof createRetryExecutionJob>[0]["trigger"],
        orgSlug,
        approvalId:       original.approvalId,
        originalPayload:  original.payloadJson,
        originalAttempt:  original.retryAttempt,
        maxRetryAttempts: original.maxRetryAttempts,
        actor,
        reason,
        // Copy module routing so retry uses the same specialized executor
        module:           original.module ?? undefined,
        actionType:       original.actionType ?? undefined,
      });

      // 5. Persist retry job (PENDING)
      try {
        await workExecutionRepository.createExecution(retryJob);
      } catch (persistErr) {
        console.warn("[work-execution-service] Could not persist retry job:", persistErr);
      }

      // 6. Dispatch via direct job dispatch (no event reconstruction needed)
      const { dispatchJobDirectly } = await import("./work-execution-dispatcher");
      const dispatchResult = await dispatchJobDirectly(retryJob, actor);

      // 7. Persist result
      if (dispatchResult.result) {
        try {
          await workExecutionRepository.saveResult(retryJob.id, dispatchResult.result);
        } catch (persistErr) {
          console.warn("[work-execution-service] Could not persist retry result:", persistErr);
        }
      }

      // 8. Fire-and-forget: chain continuation for successful retries.
      //    Mirrors the same pattern as executeFromApprovalEvent.
      //    The retry job carries the original payload (workflowRunId, chainId, stepId),
      //    so continueChainAfterExecution can pick up the chain from where it left off.
      if (dispatchResult.success) {
        void (async () => {
          try {
            const { workflowChainService } = await import("@/lib/work/chaining/workflow-chain-service");
            const saved = await workExecutionRepository.findById(retryJob.id);
            if (saved) {
              await workflowChainService.continueChainAfterExecution(saved, orgSlug);
            }
          } catch (chainErr) {
            console.warn("[work-execution-service] Chain continuation after retry failed (non-blocking):", chainErr);
          }
        })();
      }

      return {
        success:             dispatchResult.success,
        message:             dispatchResult.result?.message
                               ?? (dispatchResult.success ? "Reintento completado." : "Reintento fallido."),
        originalExecutionId: executionId,
        retryExecutionId:    retryJob.id,
        retryAttempt:        retryJob.retryAttempt,
        errors:              dispatchResult.errors.length > 0 ? dispatchResult.errors : undefined,
        warnings:            validation.warnings.map(w => w.message),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado al reintentar ejecución.";
      return {
        success:             false,
        message,
        originalExecutionId: executionId,
        errors:              [message],
      };
    }
  },

};
