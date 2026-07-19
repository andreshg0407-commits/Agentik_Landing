/**
 * lib/work/chaining/workflow-chain-factory.ts
 *
 * Agentik — Workflow Chaining Factory
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Pure factory functions. No Prisma. No React. No side effects.
 */

import type {
  WorkflowChainDefinition,
  WorkflowChainRun,
  WorkflowChainAuditEvent,
  WorkflowChainEventType,
  WorkflowChainStatus,
  WorkflowStepDefinition,
  WorkflowStepResult,
  WorkflowStepStatus,
} from "./workflow-chain-types";

// ── ID generators ─────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Step definition factory ───────────────────────────────────────────────────

export function createWorkflowStepDefinition(
  input: Omit<WorkflowStepDefinition, "maxRetries" | "metadata"> & {
    maxRetries?: number;
    metadata?:   Record<string, unknown>;
  },
): WorkflowStepDefinition {
  return {
    ...input,
    maxRetries: input.maxRetries ?? 1,
    metadata:   input.metadata   ?? {},
  };
}

// ── Chain definition factory ──────────────────────────────────────────────────

export function createWorkflowChainDefinition(
  input: Omit<WorkflowChainDefinition, "createdAt" | "version" | "isActive" | "metadata"> & {
    version?:  string;
    isActive?: boolean;
    metadata?: Record<string, unknown>;
  },
): WorkflowChainDefinition {
  return {
    ...input,
    createdAt: new Date().toISOString(),
    version:   input.version  ?? "1.0",
    isActive:  input.isActive ?? true,
    metadata:  input.metadata ?? {},
  };
}

// ── Chain run factory ─────────────────────────────────────────────────────────

export function createWorkflowChainRun(input: {
  chainId:             string;
  chainName:           string;
  orgSlug:             string;
  triggerExecutionId:  string;
  triggerApprovalId?:  string;
  firstStepId:         string;
  metadata?:           Record<string, unknown>;
}): WorkflowChainRun {
  const now = new Date().toISOString();
  return {
    id:                 genId("wcr"),
    chainId:            input.chainId,
    chainName:          input.chainName,
    orgSlug:            input.orgSlug,
    status:             "RUNNING",
    triggerExecutionId: input.triggerExecutionId,
    triggerApprovalId:  input.triggerApprovalId,
    currentStepId:      input.firstStepId,
    completedStepIds:   [],
    stepResults:        [],
    auditTrail:         [],
    createdAt:          now,
    updatedAt:          now,
    metadata:           input.metadata ?? {},
  };
}

// ── Step result factory ───────────────────────────────────────────────────────

export function createWorkflowStepResult(input: {
  stepId:       string;
  status:       WorkflowStepStatus;
  executionId?: string;
  approvalId?:  string;
  message:      string;
  startedAt?:   string;
  completedAt?: string;
  retryCount?:  number;
  metadata?:    Record<string, unknown>;
}): WorkflowStepResult {
  return {
    stepId:      input.stepId,
    status:      input.status,
    executionId: input.executionId,
    approvalId:  input.approvalId,
    message:     input.message,
    startedAt:   input.startedAt,
    completedAt: input.completedAt,
    retryCount:  input.retryCount  ?? 0,
    metadata:    input.metadata    ?? {},
  };
}

// ── Audit event factory ───────────────────────────────────────────────────────

export function createWorkflowChainAuditEvent(input: {
  runId:        string;
  event:        WorkflowChainEventType;
  stepId?:      string;
  executionId?: string;
  approvalId?:  string;
  message:      string;
  metadata?:    Record<string, unknown>;
}): WorkflowChainAuditEvent {
  return {
    id:          genId("wca"),
    runId:       input.runId,
    event:       input.event,
    stepId:      input.stepId,
    executionId: input.executionId,
    approvalId:  input.approvalId,
    message:     input.message,
    metadata:    input.metadata ?? {},
    occurredAt:  new Date().toISOString(),
  };
}

// ── Next step payload factory ─────────────────────────────────────────────────

/**
 * Build the payload to embed in a chain step execution.
 * Embedded in payload.metadata so the chain service can track runs.
 */
export function createNextStepPayload(input: {
  chainId:             string;
  workflowRunId:       string;
  stepId:              string;
  previousExecutionId: string;
  stepTemplate?:       Record<string, unknown>;
}): Record<string, unknown> {
  return {
    chainId:             input.chainId,
    workflowRunId:       input.workflowRunId,
    stepId:              input.stepId,
    previousExecutionId: input.previousExecutionId,
    ...(input.stepTemplate ?? {}),
  };
}

// ── Run mutation helpers ──────────────────────────────────────────────────────

export function advanceRunToStep(
  run:    WorkflowChainRun,
  stepId: string,
  status: WorkflowChainStatus = "RUNNING",
): WorkflowChainRun {
  return {
    ...run,
    currentStepId: stepId,
    status,
    updatedAt:     new Date().toISOString(),
  };
}

export function completeRunStep(
  run:        WorkflowChainRun,
  stepId:     string,
  stepResult: WorkflowStepResult,
): WorkflowChainRun {
  return {
    ...run,
    completedStepIds: [...run.completedStepIds, stepId],
    stepResults:      [...run.stepResults, stepResult],
    updatedAt:        new Date().toISOString(),
  };
}

export function terminalizeRun(
  run:    WorkflowChainRun,
  status: "COMPLETED" | "FAILED" | "CANCELLED" | "BLOCKED",
): WorkflowChainRun {
  const now = new Date().toISOString();
  return {
    ...run,
    status,
    currentStepId: null,
    updatedAt:     now,
    completedAt:   status === "COMPLETED" ? now : undefined,
    failedAt:      status === "FAILED"    ? now : undefined,
  };
}
