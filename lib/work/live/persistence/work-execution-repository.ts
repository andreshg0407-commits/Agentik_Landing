/**
 * lib/work/live/persistence/work-execution-repository.ts
 *
 * Agentik — Work Execution Prisma Repository
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * SERVER-ONLY — direct Prisma access.
 *
 * Persists and queries WorkExecution records.
 * All Prisma interaction is isolated here — service and executors never touch Prisma directly.
 */
import "server-only";

import { prisma }                    from "@/lib/prisma";
import type { WorkExecutionJob, WorkExecutionResult, WorkExecutionStatus, WorkExecutionActor } from "../work-execution-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PersistedWorkExecution {
  id:                 string;
  organizationId:     string;
  approvalId:         string;
  executorType:       string;
  trigger:            string;
  // Module executor routing
  module:             string | null;
  actionType:         string | null;
  status:             string;
  success:            boolean | null;
  message:            string | null;
  durationMs:         number | null;
  payloadJson:        unknown;
  resultJson:         unknown;
  auditTrailJson:     unknown;
  errorsJson:         unknown;
  createdAt:          Date;
  updatedAt:          Date;
  startedAt:          Date | null;
  completedAt:        Date | null;
  failedAt:           Date | null;
  // Retry fields
  retryOfExecutionId: string | null;
  retryAttempt:       number;
  maxRetryAttempts:   number;
  retryReason:        string | null;
  retriedByJson:      unknown;
  retriedAt:          Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgId(orgSlug: string): Promise<string | null> {
  const org = await (prisma as any).organization.findFirst({
    where:  { slug: orgSlug },
    select: { id: true },
  });
  return org?.id ?? null;
}

// ── Repository ────────────────────────────────────────────────────────────────

export const workExecutionRepository = {

  /**
   * Persist a new WorkExecutionJob record (PENDING status).
   */
  async createExecution(job: WorkExecutionJob): Promise<PersistedWorkExecution> {
    const orgId = await getOrgId(job.orgSlug);
    if (!orgId) throw new Error(`Organization not found: ${job.orgSlug}`);

    return (prisma as any).workExecution.create({
      data: {
        id:                 job.id,
        organizationId:     orgId,
        approvalId:         job.approvalId,
        executorType:       job.executorType,
        trigger:            job.trigger,
        // Module executor routing
        module:             job.module     ?? null,
        actionType:         job.actionType ?? null,
        status:             job.status,
        payloadJson:        job.payload as object,
        createdAt:          new Date(job.createdAt),
        // Retry fields
        retryOfExecutionId: job.retryOfExecutionId ?? null,
        retryAttempt:       job.retryAttempt        ?? 0,
        maxRetryAttempts:   job.maxRetryAttempts     ?? 3,
        retryReason:        job.retryReason          ?? null,
        retriedByJson:      job.retriedBy ? (job.retriedBy as object) : null,
        retriedAt:          job.retriedAt ? new Date(job.retriedAt)  : null,
      },
    });
  },

  /**
   * Record the final result of an execution.
   */
  async saveResult(
    jobId:  string,
    result: WorkExecutionResult,
  ): Promise<PersistedWorkExecution> {
    return (prisma as any).workExecution.update({
      where: { id: jobId },
      data:  {
        status:         result.status,
        success:        result.success,
        message:        result.message,
        durationMs:     result.durationMs,
        resultJson:     result.output as object,
        auditTrailJson: result.auditTrail as object,
        errorsJson:     result.errors as object,
        startedAt:      new Date(result.startedAt),
        completedAt:    new Date(result.completedAt),
        failedAt:       result.success ? null : new Date(result.completedAt),
        updatedAt:      new Date(),
      },
    });
  },

  /**
   * Update only the status of an execution (for lifecycle transitions).
   */
  async updateStatus(
    jobId:  string,
    status: WorkExecutionStatus,
  ): Promise<PersistedWorkExecution> {
    return (prisma as any).workExecution.update({
      where: { id: jobId },
      data:  { status, updatedAt: new Date() },
    });
  },

  /**
   * Fetch a single execution by job ID.
   */
  async findById(jobId: string): Promise<PersistedWorkExecution | null> {
    return (prisma as any).workExecution.findUnique({ where: { id: jobId } });
  },

  /**
   * All executions for a given approval (may be multiple on retry).
   */
  async findByApprovalId(approvalId: string): Promise<PersistedWorkExecution[]> {
    return (prisma as any).workExecution.findMany({
      where:   { approvalId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * All retry executions for a given original execution.
   */
  async findRetriesOf(executionId: string): Promise<PersistedWorkExecution[]> {
    return (prisma as any).workExecution.findMany({
      where:   { retryOfExecutionId: executionId },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Count how many retries exist for a given original execution.
   */
  async countRetriesOf(executionId: string): Promise<number> {
    return (prisma as any).workExecution.count({
      where: { retryOfExecutionId: executionId },
    });
  },

  /**
   * Find an existing non-failed execution for a specific workflow step.
   * Used to prevent duplicate auto-dispatch executions within a chain.
   *
   * Searches by module+actionType+status, then post-filters by
   * workflowRunId and stepId stored in payloadJson.metadata.
   */
  async findByWorkflowStep(
    workflowRunId: string,
    stepId:        string,
  ): Promise<PersistedWorkExecution | null> {
    const rows: PersistedWorkExecution[] = await (prisma as any).workExecution.findMany({
      where: {
        status: { in: ["PENDING", "RUNNING", "COMPLETED"] },
      },
      orderBy: { createdAt: "desc" },
      take:    50,
    });

    for (const row of rows) {
      const payload = row.payloadJson as Record<string, unknown> | null;
      if (!payload) continue;
      const meta = payload.metadata as Record<string, unknown> | null;
      if (!meta) continue;
      if (meta.workflowRunId === workflowRunId && meta.stepId === stepId) {
        return row;
      }
    }

    return null;
  },

  /**
   * List executions for an org, newest first.
   */
  async listByOrg(
    orgSlug: string,
    limit = 50,
  ): Promise<PersistedWorkExecution[]> {
    const orgId = await getOrgId(orgSlug);
    if (!orgId) return [];

    return (prisma as any).workExecution.findMany({
      where:   { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
  },

  /**
   * AGENTIK-WORKFLOW-HARDENING-01 — Phase 13: Recovery diagnostic helper.
   *
   * Find PENDING executions older than olderThanMinutes that may be orphaned
   * (no worker picked them up, or worker died before starting).
   *
   * READ-ONLY. Never mutates. Used only by recovery diagnostics and admin tools.
   *
   * Returns lightweight records: id, approvalId, module, actionType, status, createdAt.
   */
  async findPendingExecutionsForWorkflowRecovery(
    orgSlug:          string,
    olderThanMinutes: number = 30,
    limit:            number = 20,
  ): Promise<Array<Pick<PersistedWorkExecution, "id" | "approvalId" | "module" | "actionType" | "status" | "createdAt">>> {
    const orgId = await getOrgId(orgSlug);
    if (!orgId) return [];

    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const rows: PersistedWorkExecution[] = await (prisma as any).workExecution.findMany({
      where: {
        organizationId: orgId,
        status:         "PENDING",
        createdAt:      { lt: cutoff },
      },
      orderBy: { createdAt: "asc" },
      take:    limit,
      select:  {
        id:         true,
        approvalId: true,
        module:     true,
        actionType: true,
        status:     true,
        createdAt:  true,
      },
    });

    return rows;
  },

};
