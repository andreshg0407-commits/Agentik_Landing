/**
 * lib/work/chaining/persistence/workflow-run-repository.ts
 *
 * Agentik — Workflow Run Prisma Repository
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * SERVER-ONLY — direct Prisma access.
 * All WorkflowRun persistence is isolated here.
 * Service and routers never touch Prisma directly.
 */
import "server-only";

import { prisma }                          from "@/lib/prisma";
import type { WorkflowChainRun, WorkflowChainAuditEvent } from "../workflow-chain-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgId(orgSlug: string): Promise<string | null> {
  const org = await (prisma as any).organization.findFirst({
    where:  { slug: orgSlug },
    select: { id: true },
  });
  return org?.id ?? null;
}

function toPersistedRun(row: any): WorkflowChainRun {
  return {
    id:                 row.id,
    idempotencyKey:     row.idempotencyKey ?? undefined,
    chainId:            row.chainId,
    chainName:          row.chainName,
    orgSlug:            "",                           // orgSlug not stored — resolved from org
    status:             row.status,
    triggerExecutionId: row.triggerExecutionId,
    triggerApprovalId:  row.triggerApprovalId ?? undefined,
    currentStepId:      row.currentStepId ?? null,
    completedStepIds:   (row.stepsJson as any[])?.filter((s: any) => s.status === "COMPLETED").map((s: any) => s.stepId) ?? [],
    stepResults:        (row.stepsJson as any[]) ?? [],
    auditTrail:         (row.auditTrailJson as any[]) ?? [],
    createdAt:          row.createdAt.toISOString(),
    updatedAt:          row.updatedAt.toISOString(),
    completedAt:        row.completedAt?.toISOString(),
    failedAt:           row.failedAt?.toISOString(),
    metadata:           (row.metadataJson as Record<string, unknown>) ?? {},
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

export const workflowRunRepository = {

  /**
   * Create a new WorkflowRun record.
   * Prefer createRunIdempotent for execution-triggered runs.
   */
  async createRun(run: WorkflowChainRun, orgSlug: string): Promise<WorkflowChainRun> {
    const orgId = await getOrgId(orgSlug);
    if (!orgId) throw new Error(`Organization not found: ${orgSlug}`);

    const row = await (prisma as any).workflowRun.create({
      data: {
        id:                 run.id,
        idempotencyKey:     run.idempotencyKey ?? null,
        organizationId:     orgId,
        chainId:            run.chainId,
        chainName:          run.chainName,
        status:             run.status,
        triggerExecutionId: run.triggerExecutionId,
        triggerApprovalId:  run.triggerApprovalId ?? null,
        currentStepId:      run.currentStepId ?? null,
        stepsJson:          run.stepResults as object,
        auditTrailJson:     run.auditTrail  as object,
        metadataJson:       run.metadata    as object,
        createdAt:          new Date(run.createdAt),
      },
    });

    return toPersistedRun(row);
  },

  /**
   * Idempotent create: if a run with this idempotencyKey already exists, return it.
   * If a concurrent insert races and hits the unique constraint (P2002),
   * re-reads and returns the existing record.
   * Returns { run, wasCreated: true } for new runs, { run, wasCreated: false } for duplicates.
   */
  async createRunIdempotent(
    run:            WorkflowChainRun,
    orgSlug:        string,
    idempotencyKey: string,
  ): Promise<{ run: WorkflowChainRun; wasCreated: boolean }> {
    const orgId = await getOrgId(orgSlug);
    if (!orgId) throw new Error(`Organization not found: ${orgSlug}`);

    // Fast path: check for existing run before attempting create
    const existing = await (prisma as any).workflowRun.findFirst({
      where: { idempotencyKey },
    });
    if (existing) {
      return { run: toPersistedRun(existing), wasCreated: false };
    }

    try {
      const row = await (prisma as any).workflowRun.create({
        data: {
          id:                 run.id,
          idempotencyKey,
          organizationId:     orgId,
          chainId:            run.chainId,
          chainName:          run.chainName,
          status:             run.status,
          triggerExecutionId: run.triggerExecutionId,
          triggerApprovalId:  run.triggerApprovalId ?? null,
          currentStepId:      run.currentStepId ?? null,
          stepsJson:          run.stepResults as object,
          auditTrailJson:     run.auditTrail  as object,
          metadataJson:       run.metadata    as object,
          createdAt:          new Date(run.createdAt),
        },
      });
      return { run: toPersistedRun(row), wasCreated: true };
    } catch (err: any) {
      // P2002 = Prisma unique constraint violation (concurrent insert race)
      if (err?.code === "P2002") {
        const race = await (prisma as any).workflowRun.findFirst({
          where: { idempotencyKey },
        });
        if (race) return { run: toPersistedRun(race), wasCreated: false };
      }
      throw err;
    }
  },

  /**
   * Find a run by its idempotency key.
   */
  async findByIdempotencyKey(key: string): Promise<WorkflowChainRun | null> {
    const row = await (prisma as any).workflowRun.findFirst({
      where: { idempotencyKey: key },
    });
    return row ? toPersistedRun(row) : null;
  },

  /**
   * Find runs that may be stuck (status RUNNING or BLOCKED, updated long ago).
   * Used by recoverStuckRuns — read-only, never mutates.
   */
  async listStuckRuns(orgSlug: string): Promise<WorkflowChainRun[]> {
    const orgId = await getOrgId(orgSlug);
    if (!orgId) return [];

    const cutoffRunning = new Date(Date.now() - 15 * 60 * 1000); // 15 min
    const cutoffBlocked = new Date(Date.now() -  5 * 60 * 1000); // 5 min

    const rows = await (prisma as any).workflowRun.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { status: "RUNNING", updatedAt: { lt: cutoffRunning } },
          { status: "BLOCKED", updatedAt: { lt: cutoffBlocked } },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take:    50,
    });

    return rows.map(toPersistedRun);
  },

  /**
   * Update status, currentStepId, steps and audit trail.
   */
  async updateRun(run: WorkflowChainRun): Promise<WorkflowChainRun> {
    const now = new Date();
    const row = await (prisma as any).workflowRun.update({
      where: { id: run.id },
      data:  {
        status:        run.status,
        currentStepId: run.currentStepId ?? null,
        stepsJson:     run.stepResults as object,
        auditTrailJson:run.auditTrail  as object,
        metadataJson:  run.metadata    as object,
        updatedAt:     now,
        completedAt:   run.completedAt ? new Date(run.completedAt) : null,
        failedAt:      run.failedAt    ? new Date(run.failedAt)    : null,
      },
    });
    return toPersistedRun(row);
  },

  /**
   * Fetch a run by ID.
   */
  async findById(runId: string): Promise<WorkflowChainRun | null> {
    const row = await (prisma as any).workflowRun.findUnique({ where: { id: runId } });
    return row ? toPersistedRun(row) : null;
  },

  /**
   * Find all runs triggered by a given execution (anti-duplicate guard).
   */
  async findByTriggerExecution(executionId: string): Promise<WorkflowChainRun[]> {
    const rows = await (prisma as any).workflowRun.findMany({
      where:   { triggerExecutionId: executionId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toPersistedRun);
  },

  /**
   * List runs for an org, newest first.
   */
  async listByOrg(orgSlug: string, limit = 50): Promise<WorkflowChainRun[]> {
    const orgId = await getOrgId(orgSlug);
    if (!orgId) return [];
    const rows = await (prisma as any).workflowRun.findMany({
      where:   { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
    return rows.map(toPersistedRun);
  },

  /**
   * Append a single audit event to an existing run.
   */
  async appendAuditEvent(runId: string, event: WorkflowChainAuditEvent): Promise<void> {
    const row = await (prisma as any).workflowRun.findUnique({
      where:  { id: runId },
      select: { auditTrailJson: true },
    });
    if (!row) return;

    const existing = (row.auditTrailJson as any[]) ?? [];
    await (prisma as any).workflowRun.update({
      where: { id: runId },
      data:  {
        auditTrailJson: [...existing, event] as object,
        updatedAt:      new Date(),
      },
    });
  },

};
