/**
 * lib/work/live/executors/task-assignment-executor.ts
 *
 * Agentik — Task Assignment Executor
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY — imports taskService which uses Prisma.
 *
 * Behavior:
 *   Receives an approved WorkExecutionJob
 *   → Builds a TaskDraft from the approval context
 *   → Creates a real, persisted Task via taskService
 *   → Returns WorkExecutionResult with audit trail
 *
 * This is the first LIVE executor in Agentik.
 */
import "server-only";

import { taskService }                   from "@/lib/tasks/task-service";
import type { WorkExecutionJob, WorkExecutionResult } from "../work-execution-types";
import type { WorkExecutorContract, ExecutorHealthStatus, ExecutorRollbackResult } from "../work-executor-contract";
import type { WorkExecutionAuditReport } from "../work-execution-audit";
import { validateExecutionJob }          from "../work-execution-audit";
import {
  createExecutionResult,
  createExecutionAudit,
  createExecutionError,
}                                        from "../work-execution-factory";

// ── Task draft builder from job ───────────────────────────────────────────────

function buildTaskDraftFromJob(job: WorkExecutionJob) {
  const ctx     = job.payload.trigger;
  const orgSlug = job.orgSlug;

  const title       = `Ejecutar: ${ctx.approvalTitle}`;
  const description = `Tarea generada automáticamente tras aprobación de "${ctx.approvalTitle}". Aprobada por ${ctx.approvedBy} el ${new Date(ctx.approvedAt).toLocaleDateString("es-MX")}.`;
  const module      = ctx.module ?? "operaciones";
  const category    = (job.payload.metadata?.approvalCategory as string) ?? "OPERATIONAL";

  return {
    orgSlug,
    title,
    description,
    priority:       "high" as const,
    category,
    module,
    source:         "system" as const,
    owner: {
      id:   ctx.approvedBy,
      type: ctx.approvedByType as "USER" | "AGENT" | "SYSTEM",
      name: ctx.approvedBy,
    },
    businessContext: {
      orgSlug,
      module,
      entityType:      ctx.entityType,
      entityId:        ctx.entityId,
      navigationTarget: ctx.navigationTarget,
      sourceAgentId:   "system",
      sourceAgentName: "Sistema",
      impactSummary:   job.payload.metadata?.impactSummary as string | undefined,
      recommendation:  `Derivado de aprobación: ${ctx.approvalTitle}`,
    },
    metadata: {
      triggeredByApproval: ctx.approvalId,
      workExecutionJobId:  job.id,
    },
  };
}

// ── Executor ──────────────────────────────────────────────────────────────────

export class TaskAssignmentExecutor implements WorkExecutorContract {
  readonly type = "TASK_ASSIGNMENT" as const;

  validate(job: WorkExecutionJob): WorkExecutionAuditReport {
    return validateExecutionJob(job);
  }

  async execute(job: WorkExecutionJob): Promise<WorkExecutionResult> {
    const startedAt  = new Date().toISOString();
    const auditTrail = [
      createExecutionAudit({
        jobId:     job.id,
        event:     "started",
        actorId:   "task-assignment-executor",
        actorType: "EXECUTOR",
        message:   `Iniciando creación de tarea para aprobación "${job.payload.trigger.approvalTitle}".`,
      }),
    ];

    try {
      const draftInput = buildTaskDraftFromJob(job);

      // Build a minimal TaskDraft compatible with taskService.createTaskFromDraft
      const { buildTaskDraftFromCopilotAction: _ } = await import(
        "@/lib/copilot/actions/task-action-adapter"
      );
      // We build the draft manually — task-action-adapter is for Copilot context, not our domain.
      // taskService.createTaskFromDraft accepts a TaskDraft directly.
      const taskDraft = {
        id:          `draft_wex_${Date.now()}`,
        title:       draftInput.title,
        description: draftInput.description,
        priority:    draftInput.priority,
        category:    draftInput.category,
        status:      "open" as const,
        source:      draftInput.source,
        owner: {
          id:   draftInput.owner.id,
          type: draftInput.owner.type,
          name: draftInput.owner.name,
        },
        relationships: [] as [],
        auditTrail:    [] as [],
        businessContext: draftInput.businessContext,
        metadata:     draftInput.metadata,
      };

      const result = await taskService.createTaskFromDraft(
        taskDraft as unknown as Parameters<typeof taskService.createTaskFromDraft>[0],
        draftInput.orgSlug,
      );

      if (!result.success || !result.task) {
        auditTrail.push(
          createExecutionAudit({
            jobId:     job.id,
            event:     "failed",
            actorId:   "task-assignment-executor",
            actorType: "EXECUTOR",
            message:   `No se pudo crear la tarea: ${result.message}`,
          }),
        );
        return createExecutionResult({
          jobId:      job.id,
          success:    false,
          status:     "FAILED",
          message:    `Creación de tarea fallida: ${result.message}`,
          errors:     [createExecutionError("TASK_CREATE_FAILED", result.message)],
          auditTrail,
          startedAt,
        });
      }

      auditTrail.push(
        createExecutionAudit({
          jobId:     job.id,
          event:     "completed",
          actorId:   "task-assignment-executor",
          actorType: "EXECUTOR",
          message:   `Tarea ${result.task.id} creada correctamente: "${result.task.draft.title}".`,
          metadata:  { taskId: result.task.id },
        }),
      );

      return createExecutionResult({
        jobId:      job.id,
        success:    true,
        status:     "COMPLETED",
        message:    `Tarea creada correctamente: "${result.task.draft.title}".`,
        output: {
          taskId:     result.task.id,
          taskTitle:  result.task.draft.title,
          taskStatus: result.task.draft.status,
          createdAt:  result.task.createdAt,
        },
        auditTrail,
        startedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado al crear tarea.";
      auditTrail.push(
        createExecutionAudit({
          jobId:     job.id,
          event:     "failed",
          actorId:   "task-assignment-executor",
          actorType: "EXECUTOR",
          message,
        }),
      );
      return createExecutionResult({
        jobId:      job.id,
        success:    false,
        status:     "FAILED",
        message:    "Error inesperado en el executor de asignación de tarea.",
        errors:     [createExecutionError("UNEXPECTED_ERROR", message)],
        auditTrail,
        startedAt,
      });
    }
  }

  async rollback(jobId: string): Promise<ExecutorRollbackResult> {
    // Rollback would cancel the created task — not implemented yet
    return {
      success: false,
      message: "Rollback de tareas no implementado en esta versión.",
      jobId,
      errors:  ["ROLLBACK_NOT_IMPLEMENTED"],
    };
  }

  async healthCheck(): Promise<ExecutorHealthStatus> {
    return {
      executorType: this.type,
      healthy:      true,
      message:      "TaskAssignmentExecutor operativo.",
      checkedAt:    new Date().toISOString(),
    };
  }
}

export const taskAssignmentExecutor = new TaskAssignmentExecutor();
