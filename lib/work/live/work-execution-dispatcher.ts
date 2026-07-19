/**
 * lib/work/live/work-execution-dispatcher.ts
 *
 * Agentik — Work Execution Dispatcher
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY — imports executor implementations that use Prisma.
 *
 * Responsibility:
 *   1. Receive an ApprovalApprovedEvent
 *   2. Validate the event (guardrail: must be APPROVED)
 *   3. Resolve the correct executor via the router
 *   4. Build a WorkExecutionJob
 *   5. Validate the job (pre-flight)
 *   6. Execute via the resolved executor
 *   7. Return WorkExecutionResult
 *
 * Never throws — all errors are captured in WorkExecutionResult.
 */
import "server-only";

import type { ApprovalApprovedEvent, WorkExecutionResult, WorkExecutionJob, WorkExecutionActor } from "./work-execution-types";
import type { WorkExecutorContract }          from "./work-executor-contract";
import { resolveExecutorForApproval }         from "./work-execution-router";
import { createExecutionJobFromApprovalEvent, createExecutionResult, createExecutionAudit, createExecutionError } from "./work-execution-factory";
import { validateApprovalApprovedEvent }      from "./work-execution-audit";
import { mapApprovalToModuleAction }          from "../executors/module-action-mapper";
import { resolveModuleExecutor }              from "../executors/resolve-module-executor";
import type { ModuleExecutorContext }         from "../executors/module-executor-contract";

// ── Executor registry ─────────────────────────────────────────────────────────

// Dynamic imports keep server-only executors out of the edge bundle.
// Each executor is a singleton — safe to import multiple times.

async function resolveExecutorInstance(
  executorType: ReturnType<typeof resolveExecutorForApproval>,
): Promise<WorkExecutorContract> {
  switch (executorType) {
    case "TASK_ASSIGNMENT": {
      const { taskAssignmentExecutor } = await import("./executors/task-assignment-executor");
      return taskAssignmentExecutor;
    }
    case "REPORT_GENERATION": {
      const { reportGenerationExecutor } = await import("./executors/report-generation-executor");
      return reportGenerationExecutor;
    }
    case "DOCUMENT_GENERATION": {
      const { documentGenerationExecutor } = await import("./executors/document-generation-executor");
      return documentGenerationExecutor;
    }
    // Remaining executors are stubs — fall through to TASK_ASSIGNMENT
    case "CONCILIATION_APPROVAL":
    case "PORTFOLIO_TRANSFER":
    case "CAMPAIGN_LAUNCH":
    case "WORKFLOW_EXECUTION": {
      const { taskAssignmentExecutor } = await import("./executors/task-assignment-executor");
      return taskAssignmentExecutor;
    }
    default: {
      const { taskAssignmentExecutor } = await import("./executors/task-assignment-executor");
      return taskAssignmentExecutor;
    }
  }
}

// ── Dispatch result ───────────────────────────────────────────────────────────

export interface WorkDispatchResult {
  success:      boolean;
  result:       WorkExecutionResult | null;
  job:          WorkExecutionJob    | null;
  executorType: string;
  errors:       string[];
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Dispatch a WorkExecutionJob for an approved ApprovalApprovedEvent.
 *
 * Guardrails (Phase 18):
 *   - Event must have approvalStatus === "APPROVED"
 *   - Cancelled, rejected, and expired approvals are blocked
 *   - Pre-flight validation must pass before execution begins
 */
export async function dispatchApprovalExecution(
  event: ApprovalApprovedEvent,
): Promise<WorkDispatchResult> {
  const startedAt = new Date().toISOString();

  // ── Guardrail: only APPROVED events may proceed ───────────────────────────
  const eventValidation = validateApprovalApprovedEvent(event);
  if (!eventValidation.valid) {
    return {
      success:      false,
      result:       null,
      job:          null,
      executorType: "UNKNOWN",
      errors:       eventValidation.errors.map(e => e.message),
    };
  }

  // ── Resolve executor type ─────────────────────────────────────────────────
  const executorType = resolveExecutorForApproval(event);

  // ── Derive module + actionType for specialized routing ────────────────────
  const moduleMapping = mapApprovalToModuleAction({
    module:          event.module,
    actionType:      event.actionType,
    approvalCategory: event.approvalCategory,
  });

  // ── Build execution job (carries module + actionType) ─────────────────────
  const job = createExecutionJobFromApprovalEvent(event, executorType);
  if (moduleMapping) {
    job.module     = moduleMapping.module;
    job.actionType = moduleMapping.actionType;
  }

  // ── Try specialized module executor first ─────────────────────────────────
  const moduleExecutor = moduleMapping
    ? resolveModuleExecutor(moduleMapping.module, moduleMapping.actionType)
    : null;

  if (moduleExecutor) {
    try {
      const ctx: ModuleExecutorContext = {
        jobId:         job.id,
        module:        moduleMapping!.module,
        actionType:    moduleMapping!.actionType,
        approvalId:    event.approvalId,
        approvalTitle: event.approvalTitle,
        orgSlug:       event.orgSlug,
        entityType:    event.entityType,
        entityId:      event.entityId,
        impactSummary: event.impactSummary,
        metadata:      { approvalCategory: event.approvalCategory },
      };

      const moduleValidation = moduleExecutor.validate(ctx);
      if (!moduleValidation.valid) {
        const errorMessages = moduleValidation.errors;
        const result = createExecutionResult({
          jobId:    job.id,
          success:  false,
          status:   "FAILED",
          message:  `Validación de módulo fallida: ${errorMessages.join("; ")}`,
          errors:   errorMessages.map(e => createExecutionError("MODULE_VALIDATION_FAILED", e)),
          auditTrail: [
            createExecutionAudit({
              jobId:     job.id,
              event:     "failed",
              actorId:   "dispatcher",
              actorType: "SYSTEM",
              message:   `Module pre-flight fallida: ${errorMessages.join("; ")}`,
            }),
          ],
          startedAt,
        });
        return { success: false, result, job, executorType, errors: errorMessages };
      }

      const moduleResult = await moduleExecutor.execute(ctx);
      const result = createExecutionResult({
        jobId:    job.id,
        success:  moduleResult.success,
        status:   moduleResult.success ? "COMPLETED" : "FAILED",
        message:  moduleResult.message,
        output:   moduleResult.output,
        errors:   moduleResult.errors.map(e => createExecutionError("MODULE_EXEC_ERROR", e)),
        warnings: moduleResult.warnings,
        auditTrail: [
          createExecutionAudit({
            jobId:     job.id,
            event:     moduleResult.success ? "completed" : "failed",
            actorId:   `module:${moduleMapping!.module}`,
            actorType: "EXECUTOR",
            message:   moduleResult.message,
          }),
        ],
        startedAt,
      });
      return {
        success:      moduleResult.success,
        result,
        job,
        executorType: `MODULE:${moduleMapping!.module}:${moduleMapping!.actionType}`,
        errors:       moduleResult.errors,
      };
    } catch (err) {
      // Module executor threw — fall through to generic executor
      console.warn("[dispatcher] Module executor threw, falling back to generic:", err);
    }
  }

  // ── Load generic executor instance ───────────────────────────────────────
  let executor: WorkExecutorContract;
  try {
    executor = await resolveExecutorInstance(executorType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar el executor.";
    const result  = createExecutionResult({
      jobId:    job.id,
      success:  false,
      status:   "FAILED",
      message:  `Error cargando executor ${executorType}: ${message}`,
      errors:   [createExecutionError("EXECUTOR_LOAD_FAILED", message)],
      auditTrail: [
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId:   "dispatcher",
          actorType: "SYSTEM",
          message:   `No se pudo cargar el executor ${executorType}: ${message}`,
        }),
      ],
      startedAt,
    });
    return { success: false, result, job, executorType, errors: [message] };
  }

  // ── Pre-flight validation ─────────────────────────────────────────────────
  const preflight = executor.validate(job);
  if (!preflight.valid) {
    const errorMessages = preflight.errors.map(e => e.message);
    const result = createExecutionResult({
      jobId:    job.id,
      success:  false,
      status:   "FAILED",
      message:  `Validación previa fallida: ${errorMessages.join("; ")}`,
      errors:   preflight.errors.map(e => createExecutionError(e.field, e.message)),
      auditTrail: [
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId:   "dispatcher",
          actorType: "SYSTEM",
          message:   `Pre-flight validation fallida: ${errorMessages.join("; ")}`,
        }),
      ],
      startedAt,
    });
    return { success: false, result, job, executorType, errors: errorMessages };
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  try {
    const result = await executor.execute(job);
    return {
      success:      result.success,
      result,
      job,
      executorType,
      errors:       result.errors.map(e => e.message),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado en el dispatcher.";
    const result  = createExecutionResult({
      jobId:    job.id,
      success:  false,
      status:   "FAILED",
      message:  "Error inesperado durante la ejecución.",
      errors:   [createExecutionError("DISPATCH_UNEXPECTED_ERROR", message)],
      auditTrail: [
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId:   "dispatcher",
          actorType: "SYSTEM",
          message,
        }),
      ],
      startedAt,
    });
    return { success: false, result, job, executorType, errors: [message] };
  }
}

// ── dispatchJobDirectly ───────────────────────────────────────────────────────

/**
 * Dispatch a pre-built WorkExecutionJob directly, bypassing event validation
 * and job creation. Used for retry flows where the job is built by the service.
 *
 * Performs: executor load → pre-flight validation → execute.
 */
export async function dispatchJobDirectly(
  job:    WorkExecutionJob,
  actor?: WorkExecutionActor,
): Promise<WorkDispatchResult> {
  const startedAt    = new Date().toISOString();
  const executorType = job.executorType;
  const isRetry      = !!job.retryOfExecutionId;
  const actorId      = actor?.id ?? "dispatcher";

  // ── Try specialized module executor first ─────────────────────────────────
  if (job.module && job.actionType) {
    const moduleExecutor = resolveModuleExecutor(job.module, job.actionType);
    if (moduleExecutor) {
      try {
        const ctx: ModuleExecutorContext = {
          jobId:         job.id,
          module:        job.module,
          actionType:    job.actionType,
          approvalId:    job.approvalId,
          approvalTitle: (job.payload.trigger as { approvalTitle?: string })?.approvalTitle ?? job.approvalId,
          orgSlug:       job.orgSlug,
          entityType:    job.payload.trigger.entityType,
          entityId:      job.payload.trigger.entityId,
          impactSummary: (job.payload.metadata as { impactSummary?: string })?.impactSummary,
          metadata:      { ...(job.metadata ?? {}), isRetry },
        };

        const moduleValidation = moduleExecutor.validate(ctx);
        if (moduleValidation.valid) {
          const moduleResult = await moduleExecutor.execute(ctx);
          const result = createExecutionResult({
            jobId:    job.id,
            success:  moduleResult.success,
            status:   moduleResult.success ? "COMPLETED" : "FAILED",
            message:  moduleResult.message,
            output:   moduleResult.output,
            errors:   moduleResult.errors.map(e => createExecutionError("MODULE_EXEC_ERROR", e)),
            warnings: moduleResult.warnings,
            auditTrail: [
              createExecutionAudit({
                jobId:     job.id,
                event:     moduleResult.success ? "completed" : "failed",
                actorId:   `module:${job.module}`,
                actorType: "EXECUTOR",
                message:   `${isRetry ? "[RETRY] " : ""}${moduleResult.message}`,
              }),
            ],
            startedAt,
          });
          return {
            success:      moduleResult.success,
            result,
            job,
            executorType: `MODULE:${job.module}:${job.actionType}`,
            errors:       moduleResult.errors,
          };
        }
      } catch {
        // Fall through to generic executor
      }
    }
  }

  // ── Load generic executor ─────────────────────────────────────────────────
  let executor: import("./work-executor-contract").WorkExecutorContract;
  try {
    executor = await resolveExecutorInstance(executorType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar el executor.";
    const result  = createExecutionResult({
      jobId:    job.id,
      success:  false,
      status:   "FAILED",
      message:  `Error cargando executor ${executorType}: ${message}`,
      errors:   [createExecutionError("EXECUTOR_LOAD_FAILED", message)],
      auditTrail: [
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId,
          actorType: "SYSTEM",
          message:   isRetry ? `[RETRY] ${message}` : message,
        }),
      ],
      startedAt,
    });
    return { success: false, result, job, executorType, errors: [message] };
  }

  // ── Pre-flight validation ─────────────────────────────────────────────────
  const preflight = executor.validate(job);
  if (!preflight.valid) {
    const errorMessages = preflight.errors.map(e => e.message);
    const result = createExecutionResult({
      jobId:    job.id,
      success:  false,
      status:   "FAILED",
      message:  `Validación previa fallida: ${errorMessages.join("; ")}`,
      errors:   preflight.errors.map(e => createExecutionError(e.field, e.message)),
      auditTrail: [
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId,
          actorType: "SYSTEM",
          message:   `${isRetry ? "[RETRY] " : ""}Pre-flight fallida: ${errorMessages.join("; ")}`,
        }),
      ],
      startedAt,
    });
    return { success: false, result, job, executorType, errors: errorMessages };
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  try {
    const result = await executor.execute(job);
    return {
      success:      result.success,
      result,
      job,
      executorType,
      errors:       result.errors.map(e => e.message),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado en el dispatcher.";
    const result  = createExecutionResult({
      jobId:    job.id,
      success:  false,
      status:   "FAILED",
      message:  `${isRetry ? "[RETRY] " : ""}Error inesperado durante la ejecución.`,
      errors:   [createExecutionError("DISPATCH_UNEXPECTED_ERROR", message)],
      auditTrail: [
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId,
          actorType: "SYSTEM",
          message,
        }),
      ],
      startedAt,
    });
    return { success: false, result, job, executorType, errors: [message] };
  }
}
