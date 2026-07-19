/**
 * lib/work/live/executors/document-generation-executor.ts
 *
 * Agentik — Document Generation Executor (stub)
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY (declared for future Prisma integration).
 *
 * Validates the execution pipeline with a WorkArtifact stub.
 * Real document generation will connect to the Document Center in a future sprint.
 */
import "server-only";

import type { WorkExecutionJob, WorkExecutionResult } from "../work-execution-types";
import type { WorkExecutorContract, ExecutorHealthStatus, ExecutorRollbackResult } from "../work-executor-contract";
import type { WorkExecutionAuditReport } from "../work-execution-audit";
import { validateExecutionJob }          from "../work-execution-audit";
import {
  createExecutionResult,
  createExecutionAudit,
}                                        from "../work-execution-factory";

export class DocumentGenerationExecutor implements WorkExecutorContract {
  readonly type = "DOCUMENT_GENERATION" as const;

  validate(job: WorkExecutionJob): WorkExecutionAuditReport {
    return validateExecutionJob(job);
  }

  async execute(job: WorkExecutionJob): Promise<WorkExecutionResult> {
    const startedAt = new Date().toISOString();
    const ctx       = job.payload.trigger;

    const auditTrail = [
      createExecutionAudit({
        jobId:     job.id,
        event:     "started",
        actorId:   "document-generation-executor",
        actorType: "EXECUTOR",
        message:   `Iniciando preparación de documento para: "${ctx.approvalTitle}".`,
      }),
      createExecutionAudit({
        jobId:     job.id,
        event:     "completed",
        actorId:   "document-generation-executor",
        actorType: "EXECUTOR",
        message:   "Documento preparado en modo stub. Generación real disponible próximamente.",
      }),
    ];

    return createExecutionResult({
      jobId:    job.id,
      success:  true,
      status:   "COMPLETED",
      message:  "Solicitud de documento registrada. Generación real disponible próximamente.",
      output: {
        stub:           true,
        documentTitle:  `Documento — ${ctx.approvalTitle}`,
        orgSlug:        job.orgSlug,
        module:         ctx.module ?? "documentos",
        entityType:     ctx.entityType,
        entityId:       ctx.entityId,
        generatedAt:    new Date().toISOString(),
        approvalRef:    ctx.approvalId,
      },
      warnings:    ["Executor en modo stub — no se generó documento real."],
      auditTrail,
      startedAt,
    });
  }

  async rollback(jobId: string): Promise<ExecutorRollbackResult> {
    return {
      success: false,
      message: "Los documentos generados no soportan rollback en esta versión.",
      jobId,
    };
  }

  async healthCheck(): Promise<ExecutorHealthStatus> {
    return {
      executorType: this.type,
      healthy:      true,
      message:      "DocumentGenerationExecutor operativo (modo stub).",
      checkedAt:    new Date().toISOString(),
    };
  }
}

export const documentGenerationExecutor = new DocumentGenerationExecutor();
