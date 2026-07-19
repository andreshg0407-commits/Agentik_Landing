/**
 * lib/copilot/execution-store/execution-store-queries.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Server-side query helpers.
 * SERVER ONLY — no React, no UI.
 * @server-only
 *
 * High-level query functions for Copilot execution history.
 * Used by API routes and server components — never from client code.
 *
 * All functions accept an ExecutionStore so they are testable with NoopExecutionStore
 * and usable independently of the Prisma implementation.
 */
import "server-only";

import type { ExecutionStore }              from "./execution-store-types";
import type {
  ExecutionRecord,
  ExecutionPersistenceSnapshot,
  ApprovalRequestRecord,
} from "./execution-store-types";
import { prisma } from "@/lib/prisma";

// ── High-level query helpers ───────────────────────────────────────────────────

/**
 * Return the N most recent executions for a tenant.
 * Ordered by startedAt descending.
 */
export async function getRecentExecutions(
  store:    ExecutionStore,
  tenantId: string,
  limit     = 20,
): Promise<ExecutionRecord[]> {
  return store.listExecutions({ tenantId, limit });
}

/**
 * Return all PENDING approval requests for a tenant.
 * Used by the approvals API route and Copilot rail.
 */
export async function getPendingExecutionApprovals(
  store:    ExecutionStore,
  tenantId: string,
): Promise<ApprovalRequestRecord[]> {
  return store.getPendingApprovals(tenantId);
}

/**
 * Return a full execution detail — record + steps + events + approvals.
 * Reconstructs the complete snapshot from the database.
 *
 * Note: steps, events, and approvals are loaded directly from Prisma
 * (the ExecutionStore interface does not yet expose step/event queries).
 */
export async function getExecutionDetail(
  tenantId:    string,
  executionId: string,
): Promise<ExecutionPersistenceSnapshot | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const [record, steps, events, approvals] = await Promise.all([
    db.copilotExecution.findFirst({ where: { executionId, tenantId } }),
    db.copilotExecutionStep.findMany({
      where:   { executionId, tenantId },
      orderBy: { startedAt: "asc" },
    }),
    db.copilotExecutionEvent.findMany({
      where:   { executionId, tenantId },
      orderBy: { createdAt: "asc" },
    }),
    db.copilotApprovalRequest.findMany({
      where:   { executionId, tenantId },
      orderBy: { requestedAt: "asc" },
    }),
  ]);

  if (!record) return null;

  return {
    executionId,
    tenantId,
    record: {
      id:               record.id,
      executionId:      record.executionId,
      correlationId:    record.correlationId,
      tenantId:         record.tenantId,
      userId:           record.userId,
      status:           record.status,
      source:           record.source,
      executionMode:    record.executionMode,
      planId:           record.planId,
      planTitle:        record.planTitle,
      planSummary:      record.planSummary  ?? undefined,
      idempotencyKey:   record.idempotencyKey ?? undefined,
      startedAt:        record.startedAt,
      finishedAt:       record.finishedAt   ?? undefined,
      durationMs:       record.durationMs   ?? undefined,
      totalSteps:       record.totalSteps,
      completedSteps:   record.completedSteps,
      failedSteps:      record.failedSteps,
      skippedSteps:     record.skippedSteps,
      blockedSteps:     record.blockedSteps,
      approvalRequired: record.approvalRequired,
      deniedByPolicy:   record.deniedByPolicy,
      inputSnapshot:    record.inputSnapshot  ?? undefined,
      planSnapshot:     record.planSnapshot   ?? undefined,
      reportSnapshot:   record.reportSnapshot ?? undefined,
      metadata:         record.metadata       ?? undefined,
      createdAt:        record.createdAt,
      updatedAt:        record.updatedAt,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: steps.map((s: any) => ({
      id:              s.id,
      executionId:     s.executionId,
      tenantId:        s.tenantId,
      stepId:          s.stepId,
      actionId:        s.actionId,
      domain:          s.domain,
      displayName:     s.displayName,
      status:          s.status,
      approvalStatus:  s.approvalStatus,
      policyDecision:  s.policyDecision  ?? undefined,
      deniedByPolicy:  s.deniedByPolicy,
      startedAt:       s.startedAt,
      finishedAt:      s.finishedAt      ?? undefined,
      durationMs:      s.durationMs      ?? undefined,
      inputSnapshot:   s.inputSnapshot   ?? undefined,
      outputSnapshot:  s.outputSnapshot  ?? undefined,
      error:           s.error           ?? undefined,
      warnings:        Array.isArray(s.warnings) ? s.warnings : [],
      policyReasons:   s.policyReasons   ?? undefined,
      evaluatedRules:  Array.isArray(s.evaluatedRules) ? s.evaluatedRules : undefined,
      auditNote:       s.auditNote       ?? undefined,
      createdAt:       s.createdAt,
      updatedAt:       s.updatedAt,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events: events.map((e: any) => ({
      id:          e.id,
      executionId: e.executionId,
      tenantId:    e.tenantId,
      eventType:   e.eventType,
      stepId:      e.stepId   ?? undefined,
      actionId:    e.actionId ?? undefined,
      domain:      e.domain   ?? undefined,
      status:      e.status   ?? undefined,
      message:     e.message  ?? undefined,
      payload:     e.payload  ?? undefined,
      createdAt:   e.createdAt,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approvals: approvals.map((a: any) => ({
      id:              a.id,
      executionId:     a.executionId,
      tenantId:        a.tenantId,
      stepId:          a.stepId,
      actionId:        a.actionId,
      domain:          a.domain,
      requestedBy:     a.requestedBy,
      approvalStatus:  String(a.approvalStatus).toLowerCase(),
      policyDecision:  a.policyDecision  ?? undefined,
      policyReasons:   a.policyReasons   ?? undefined,
      reason:          a.reason,
      requestedAt:     a.requestedAt,
      resolvedAt:      a.resolvedAt      ?? undefined,
      resolvedBy:      a.resolvedBy      ?? undefined,
      resolutionNote:  a.resolutionNote  ?? undefined,
      metadata:        a.metadata        ?? undefined,
      createdAt:       a.createdAt,
      updatedAt:       a.updatedAt,
    })),
  };
}

/**
 * Return just the event timeline for an execution (for audit replay / streaming).
 */
export async function getExecutionTimeline(
  tenantId:    string,
  executionId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const events = await db.copilotExecutionEvent.findMany({
    where:   { executionId, tenantId },
    orderBy: { createdAt: "asc" },
  });
  return events;
}
