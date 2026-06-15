/**
 * lib/copilot/execution-store/noop-execution-store.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — No-op ExecutionStore implementation.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * Used when no persistence is required (tests, in-memory pipelines, cold starts).
 * The Runtime defaults to this store when no executionStore is provided in ExecuteOptions.
 *
 * Contract:
 *   - Never throws.
 *   - Returns minimal valid stubs with generated IDs.
 *   - checkIdempotency() always returns { outcome: "proceed" }.
 */
import "server-only";

import type {
  ExecutionStore,
  ExecutionRecord,
  ExecutionStepRecord,
  ApprovalRequestRecord,
  ExecutionStoreCreateInput,
  ExecutionStoreUpdateInput,
  ExecutionStoreStepInput,
  ExecutionStoreEventInput,
  ApprovalRequestCreateInput,
  ApprovalRequestUpdateInput,
  ExecutionStoreQuery,
  IdempotencyCheckResult,
} from "./execution-store-types";

// ── Minimal stub builders ─────────────────────────────────────────────────────

function makeId(): string {
  return `noop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowDate(): Date {
  return new Date();
}

// ── NoopExecutionStore ────────────────────────────────────────────────────────

/**
 * No-op implementation of ExecutionStore.
 * All methods succeed instantly without touching any external system.
 *
 * This is the safe default — the Runtime behaves identically to the pre-persistence
 * version when this store is active.
 */
export class NoopExecutionStore implements ExecutionStore {

  async createExecution(input: ExecutionStoreCreateInput): Promise<ExecutionRecord> {
    const now = nowDate();
    return {
      id:               makeId(),
      executionId:      input.executionId,
      correlationId:    input.correlationId,
      tenantId:         input.tenantId,
      userId:           input.userId,
      status:           input.status,
      source:           input.source,
      executionMode:    input.executionMode,
      planId:           input.planId,
      planTitle:        input.planTitle,
      planSummary:      input.planSummary,
      idempotencyKey:   input.idempotencyKey,
      startedAt:        input.startedAt,
      finishedAt:       undefined,
      durationMs:       undefined,
      totalSteps:       input.totalSteps,
      completedSteps:   0,
      failedSteps:      0,
      skippedSteps:     0,
      blockedSteps:     0,
      approvalRequired: false,
      deniedByPolicy:   0,
      inputSnapshot:    input.inputSnapshot,
      planSnapshot:     input.planSnapshot,
      reportSnapshot:   undefined,
      metadata:         input.metadata,
      createdAt:        now,
      updatedAt:        now,
    };
  }

  async updateExecution(
    _executionId: string,
    _tenantId:    string,
    _input:       ExecutionStoreUpdateInput,
  ): Promise<void> {
    // no-op
  }

  async recordStep(input: ExecutionStoreStepInput): Promise<ExecutionStepRecord> {
    const now = nowDate();
    return {
      id:              makeId(),
      executionId:     input.executionId,
      tenantId:        input.tenantId,
      stepId:          input.stepId,
      actionId:        input.actionId,
      domain:          input.domain,
      displayName:     input.displayName,
      status:          input.status,
      approvalStatus:  input.approvalStatus,
      policyDecision:  input.policyDecision,
      deniedByPolicy:  input.deniedByPolicy ?? false,
      startedAt:       input.startedAt,
      finishedAt:      input.finishedAt,
      durationMs:      input.durationMs,
      inputSnapshot:   input.inputSnapshot,
      outputSnapshot:  input.outputSnapshot,
      error:           input.error,
      warnings:        input.warnings ?? [],
      policyReasons:   input.policyReasons,
      evaluatedRules:  input.evaluatedRules,
      auditNote:       input.auditNote,
      createdAt:       now,
      updatedAt:       now,
    };
  }

  async recordEvent(_input: ExecutionStoreEventInput): Promise<void> {
    // no-op
  }

  async createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequestRecord> {
    const now = nowDate();
    return {
      id:              makeId(),
      executionId:     input.executionId,
      tenantId:        input.tenantId,
      stepId:          input.stepId,
      actionId:        input.actionId,
      domain:          input.domain,
      requestedBy:     input.requestedBy,
      approvalStatus:  "pending",
      policyDecision:  input.policyDecision,
      policyReasons:   input.policyReasons,
      reason:          input.reason,
      requestedAt:     input.requestedAt,
      resolvedAt:      undefined,
      resolvedBy:      undefined,
      resolutionNote:  undefined,
      metadata:        input.metadata,
      createdAt:       now,
      updatedAt:       now,
    };
  }

  async updateApprovalRequest(
    _id:    string,
    _input: ApprovalRequestUpdateInput,
  ): Promise<void> {
    // no-op
  }

  async getExecutionById(
    _executionId: string,
    _tenantId:    string,
  ): Promise<ExecutionRecord | null> {
    return null;
  }

  async listExecutions(_query: ExecutionStoreQuery): Promise<ExecutionRecord[]> {
    return [];
  }

  async getPendingApprovals(_tenantId: string): Promise<ApprovalRequestRecord[]> {
    return [];
  }

  async checkIdempotency(
    _tenantId:       string,
    _idempotencyKey: string,
  ): Promise<IdempotencyCheckResult> {
    return { outcome: "proceed" };
  }
}

/** Singleton no-op store — reused across executions that don't need persistence. */
export const noopExecutionStore = new NoopExecutionStore();
