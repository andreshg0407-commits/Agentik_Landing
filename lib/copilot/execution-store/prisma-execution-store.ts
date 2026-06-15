/**
 * lib/copilot/execution-store/prisma-execution-store.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Prisma-backed ExecutionStore implementation.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * Persists all execution records to PostgreSQL via the shared Prisma client.
 * Uses `prisma as any` to access the new models before Prisma Client regeneration,
 * which is the standard pattern for new migrations in this codebase.
 *
 * All JSON fields are sanitised with sanitizeSnapshot() before writing.
 *
 * Dependency direction:
 *   execution-store-types ← execution-store-sanitizer ← prisma-execution-store
 *   lib/prisma             ← prisma-execution-store
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { sanitizeSnapshot } from "./execution-store-sanitizer";
import type {
  ExecutionStore,
  ExecutionRecord,
  ExecutionStepRecord,
  ApprovalRequestRecord,
  ExecutionEventRecord,
  ExecutionStoreCreateInput,
  ExecutionStoreUpdateInput,
  ExecutionStoreStepInput,
  ExecutionStoreEventInput,
  ApprovalRequestCreateInput,
  ApprovalRequestUpdateInput,
  ExecutionStoreQuery,
  IdempotencyCheckResult,
} from "./execution-store-types";

// ── Row → Record mappers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToExecutionRecord(row: any): ExecutionRecord {
  return {
    id:               row.id,
    executionId:      row.executionId,
    correlationId:    row.correlationId,
    tenantId:         row.tenantId,
    userId:           row.userId,
    status:           row.status,
    source:           row.source,
    executionMode:    row.executionMode,
    planId:           row.planId,
    planTitle:        row.planTitle,
    planSummary:      row.planSummary ?? undefined,
    idempotencyKey:   row.idempotencyKey ?? undefined,
    startedAt:        row.startedAt,
    finishedAt:       row.finishedAt ?? undefined,
    durationMs:       row.durationMs ?? undefined,
    totalSteps:       row.totalSteps,
    completedSteps:   row.completedSteps,
    failedSteps:      row.failedSteps,
    skippedSteps:     row.skippedSteps,
    blockedSteps:     row.blockedSteps,
    approvalRequired: row.approvalRequired,
    deniedByPolicy:   row.deniedByPolicy,
    inputSnapshot:    row.inputSnapshot ?? undefined,
    planSnapshot:     row.planSnapshot ?? undefined,
    reportSnapshot:   row.reportSnapshot ?? undefined,
    metadata:         row.metadata ?? undefined,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStepRecord(row: any): ExecutionStepRecord {
  return {
    id:              row.id,
    executionId:     row.executionId,
    tenantId:        row.tenantId,
    stepId:          row.stepId,
    actionId:        row.actionId,
    domain:          row.domain,
    displayName:     row.displayName,
    status:          row.status,
    approvalStatus:  row.approvalStatus,
    policyDecision:  row.policyDecision ?? undefined,
    deniedByPolicy:  row.deniedByPolicy,
    startedAt:       row.startedAt,
    finishedAt:      row.finishedAt ?? undefined,
    durationMs:      row.durationMs ?? undefined,
    inputSnapshot:   row.inputSnapshot ?? undefined,
    outputSnapshot:  row.outputSnapshot ?? undefined,
    error:           row.error ?? undefined,
    warnings:        Array.isArray(row.warnings) ? row.warnings : [],
    policyReasons:   row.policyReasons ?? undefined,
    evaluatedRules:  Array.isArray(row.evaluatedRules) ? row.evaluatedRules : undefined,
    auditNote:       row.auditNote ?? undefined,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToApprovalRecord(row: any): ApprovalRequestRecord {
  return {
    id:              row.id,
    executionId:     row.executionId,
    tenantId:        row.tenantId,
    stepId:          row.stepId,
    actionId:        row.actionId,
    domain:          row.domain,
    requestedBy:     row.requestedBy,
    approvalStatus:  String(row.approvalStatus).toLowerCase() as ApprovalRequestRecord["approvalStatus"],
    policyDecision:  row.policyDecision ?? undefined,
    policyReasons:   row.policyReasons ?? undefined,
    reason:          row.reason,
    requestedAt:     row.requestedAt,
    resolvedAt:      row.resolvedAt ?? undefined,
    resolvedBy:      row.resolvedBy ?? undefined,
    resolutionNote:  row.resolutionNote ?? undefined,
    metadata:        row.metadata ?? undefined,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
  };
}

// ── PrismaExecutionStore ───────────────────────────────────────────────────────

/**
 * Production ExecutionStore backed by PostgreSQL via Prisma.
 *
 * Use `createPrismaExecutionStore()` rather than instantiating directly —
 * it ensures a single instance is reused per process.
 */
export class PrismaExecutionStore implements ExecutionStore {

  // ── Create execution ───────────────────────────────────────────────────────

  async createExecution(input: ExecutionStoreCreateInput): Promise<ExecutionRecord> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const row = await db.copilotExecution.create({
      data: {
        executionId:    input.executionId,
        correlationId:  input.correlationId,
        tenantId:       input.tenantId,
        userId:         input.userId,
        status:         input.status,
        source:         input.source,
        executionMode:  input.executionMode,
        planId:         input.planId,
        planTitle:      input.planTitle,
        planSummary:    input.planSummary ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        startedAt:      input.startedAt,
        totalSteps:     input.totalSteps,
        inputSnapshot:  sanitizeSnapshot(input.inputSnapshot) ?? undefined,
        planSnapshot:   sanitizeSnapshot(input.planSnapshot) ?? undefined,
        metadata:       input.metadata ?? null,
        updatedAt:      new Date(),
      },
    });
    return rowToExecutionRecord(row);
  }

  // ── Update execution ───────────────────────────────────────────────────────

  async updateExecution(
    executionId: string,
    tenantId:    string,
    input:       ExecutionStoreUpdateInput,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    await db.copilotExecution.updateMany({
      where: { executionId, tenantId },
      data: {
        ...(input.status          !== undefined && { status:          input.status }),
        ...(input.finishedAt      !== undefined && { finishedAt:      input.finishedAt }),
        ...(input.durationMs      !== undefined && { durationMs:      input.durationMs }),
        ...(input.completedSteps  !== undefined && { completedSteps:  input.completedSteps }),
        ...(input.failedSteps     !== undefined && { failedSteps:     input.failedSteps }),
        ...(input.skippedSteps    !== undefined && { skippedSteps:    input.skippedSteps }),
        ...(input.blockedSteps    !== undefined && { blockedSteps:    input.blockedSteps }),
        ...(input.approvalRequired !== undefined && { approvalRequired: input.approvalRequired }),
        ...(input.deniedByPolicy  !== undefined && { deniedByPolicy:  input.deniedByPolicy }),
        ...(input.reportSnapshot  !== undefined && {
          reportSnapshot: sanitizeSnapshot(input.reportSnapshot) ?? null,
        }),
        updatedAt: new Date(),
      },
    });
  }

  // ── Record step ────────────────────────────────────────────────────────────

  async recordStep(input: ExecutionStoreStepInput): Promise<ExecutionStepRecord> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const row = await db.copilotExecutionStep.create({
      data: {
        executionId:    input.executionId,
        tenantId:       input.tenantId,
        stepId:         input.stepId,
        actionId:       input.actionId,
        domain:         input.domain,
        displayName:    input.displayName,
        status:         input.status,
        approvalStatus: input.approvalStatus,
        policyDecision: input.policyDecision ?? null,
        deniedByPolicy: input.deniedByPolicy ?? false,
        startedAt:      input.startedAt,
        finishedAt:     input.finishedAt ?? null,
        durationMs:     input.durationMs ?? null,
        inputSnapshot:  sanitizeSnapshot(input.inputSnapshot) ?? undefined,
        outputSnapshot: sanitizeSnapshot(input.outputSnapshot) ?? undefined,
        error:          input.error ?? null,
        warnings:       input.warnings ?? [],
        policyReasons:  input.policyReasons ?? null,
        evaluatedRules: input.evaluatedRules ?? null,
        auditNote:      input.auditNote ?? null,
        updatedAt:      new Date(),
      },
    });
    return rowToStepRecord(row);
  }

  // ── Record event ───────────────────────────────────────────────────────────

  async recordEvent(input: ExecutionStoreEventInput): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    await db.copilotExecutionEvent.create({
      data: {
        executionId: input.executionId,
        tenantId:    input.tenantId,
        eventType:   input.eventType,
        stepId:      input.stepId ?? null,
        actionId:    input.actionId ?? null,
        domain:      input.domain ?? null,
        status:      input.status ?? null,
        message:     input.message ?? null,
        payload:     input.payload ?? null,
      },
    });
  }

  // ── Create approval request ────────────────────────────────────────────────

  async createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequestRecord> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const row = await db.copilotApprovalRequest.create({
      data: {
        executionId:    input.executionId,
        tenantId:       input.tenantId,
        stepId:         input.stepId,
        actionId:       input.actionId,
        domain:         input.domain,
        requestedBy:    input.requestedBy,
        approvalStatus: "PENDING",
        policyDecision: input.policyDecision ?? null,
        policyReasons:  input.policyReasons ?? null,
        reason:         input.reason,
        requestedAt:    input.requestedAt,
        metadata:       input.metadata ?? null,
        updatedAt:      new Date(),
      },
    });
    return rowToApprovalRecord(row);
  }

  // ── Update approval request ────────────────────────────────────────────────

  async updateApprovalRequest(id: string, input: ApprovalRequestUpdateInput): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    await db.copilotApprovalRequest.update({
      where: { id },
      data: {
        approvalStatus: input.approvalStatus.toUpperCase(),
        resolvedAt:     input.resolvedAt ?? null,
        resolvedBy:     input.resolvedBy ?? null,
        resolutionNote: input.resolutionNote ?? null,
        updatedAt:      new Date(),
      },
    });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async getExecutionById(executionId: string, tenantId: string): Promise<ExecutionRecord | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const row = await db.copilotExecution.findFirst({
      where: { executionId, tenantId },
    });
    return row ? rowToExecutionRecord(row) : null;
  }

  async listExecutions(query: ExecutionStoreQuery): Promise<ExecutionRecord[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const rows = await db.copilotExecution.findMany({
      where: {
        tenantId: query.tenantId,
        ...(query.status && { status: query.status }),
        ...(query.since  && { startedAt: { gte: query.since } }),
      },
      orderBy: { startedAt: "desc" },
      take:    query.limit  ?? 50,
      skip:    query.offset ?? 0,
    });
    return rows.map(rowToExecutionRecord);
  }

  async getPendingApprovals(tenantId: string): Promise<ApprovalRequestRecord[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const rows = await db.copilotApprovalRequest.findMany({
      where:   { tenantId, approvalStatus: "PENDING" },
      orderBy: { requestedAt: "desc" },
    });
    return rows.map(rowToApprovalRecord);
  }

  // ── Idempotency ────────────────────────────────────────────────────────────

  async checkIdempotency(tenantId: string, idempotencyKey: string): Promise<IdempotencyCheckResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const row = await db.copilotExecution.findFirst({
      where: { tenantId, idempotencyKey },
      orderBy: { createdAt: "desc" },
    });

    if (!row) return { outcome: "proceed" };

    const record = rowToExecutionRecord(row);

    switch (record.status) {
      case "completed":
        return { outcome: "existing_completed", record };
      case "running":
        return { outcome: "already_running", record };
      case "awaiting_approval":
        return { outcome: "awaiting_approval", record };
      case "failed":
      case "blocked":
        return { outcome: "failed_retry_ok", record };
      default:
        return { outcome: "proceed" };
    }
  }
}

/** Module-level singleton — avoids creating a new instance per request. */
let _store: PrismaExecutionStore | undefined;

export function createPrismaExecutionStore(): PrismaExecutionStore {
  if (!_store) _store = new PrismaExecutionStore();
  return _store;
}
