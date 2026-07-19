/**
 * lib/work/live/executors/report-generation-executor.ts
 *
 * Agentik — Report Generation Executor (stub)
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY (declared for future Prisma integration).
 *
 * Currently produces a WorkArtifact stub validating the execution pipeline.
 * Real report generation will be implemented in a future sprint.
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

export class ReportGenerationExecutor implements WorkExecutorContract {
  readonly type = "REPORT_GENERATION" as const;

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
        actorId:   "report-generation-executor",
        actorType: "EXECUTOR",
        message:   `Iniciando preparación de informe para: "${ctx.approvalTitle}".`,
      }),
      createExecutionAudit({
        jobId:     job.id,
        event:     "completed",
        actorId:   "report-generation-executor",
        actorType: "EXECUTOR",
        message:   "Informe preparado en modo stub. Generación real disponible próximamente.",
      }),
    ];

    return createExecutionResult({
      jobId:    job.id,
      success:  true,
      status:   "COMPLETED",
      message:  "Solicitud de informe registrada. Generación real disponible próximamente.",
      output: {
        stub:          true,
        reportTitle:   `Informe — ${ctx.approvalTitle}`,
        orgSlug:       job.orgSlug,
        module:        ctx.module ?? "finanzas",
        generatedAt:   new Date().toISOString(),
        approvalRef:   ctx.approvalId,
      },
      warnings:    ["Executor en modo stub — no se generó informe real."],
      auditTrail,
      startedAt,
    });
  }

  async rollback(jobId: string): Promise<ExecutorRollbackResult> {
    return {
      success: false,
      message: "Los informes generados no soportan rollback.",
      jobId,
    };
  }

  async healthCheck(): Promise<ExecutorHealthStatus> {
    return {
      executorType: this.type,
      healthy:      true,
      message:      "ReportGenerationExecutor operativo (modo stub).",
      checkedAt:    new Date().toISOString(),
    };
  }
}

export const reportGenerationExecutor = new ReportGenerationExecutor();
