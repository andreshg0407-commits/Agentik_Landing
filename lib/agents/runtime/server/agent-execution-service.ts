/**
 * lib/agents/runtime/server/agent-execution-service.ts
 *
 * Agentik — Agent Execution Service
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * SERVER-ONLY. Orchestrates the full agent execution lifecycle:
 *   plan → permission check → dispatch → collect results → return AgentExecutionResult
 *
 * Never throws — returns structured AgentExecutionResult.
 * Never dispatches when dryRun=true, PREVIEW, or PLAN_ONLY.
 */
import "server-only";

import type {
  AgentExecutionInput,
  AgentExecutionResult,
  AgentExecutionStep,
  AgentExecutionAuditEvent,
} from "../agent-execution-types";
import type { AutonomousOperationResult }  from "../../../autonomous-operations/autonomous-operation-result";

import { planAgentExecution }             from "../agent-execution-planner";
import { autonomousOperationService }     from "../../../autonomous-operations/server/autonomous-operation-service";
import { checkExecutionPermission, isNoExecuteMode } from "../agent-execution-permissions";
import {
  auditExecutionSkipped,
  auditOperationExecuted,
  auditOperationWaitingApproval,
  auditOperationAlreadyProcessed,
  auditExecutionCompleted,
  auditExecutionFailed,
} from "../agent-execution-audit";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(prefix: string): string {
  _seq++;
  return `${prefix}_${Date.now()}_${(_seq).toString(36)}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const agentExecutionService = {

  /**
   * Execute a pre-built AgentExecutionPlan against real services.
   * Returns a complete AgentExecutionResult with per-step outcomes.
   */
  async executeAgentPlan(input: AgentExecutionInput): Promise<AgentExecutionResult> {
    return executeAgentRuntime(input);
  },

  /**
   * Full lifecycle: plan + (optionally) execute.
   * This is the primary entry point for all external callers.
   */
  async executeAgentRuntime(input: AgentExecutionInput): Promise<AgentExecutionResult> {
    return executeAgentRuntime(input);
  },

  /**
   * Execute only the specified action IDs from an agent runtime run.
   * Convenience wrapper that sets selectedActionIds on the input.
   */
  async executeSelectedAgentActions(
    input:     AgentExecutionInput,
    actionIds: string[],
  ): Promise<AgentExecutionResult> {
    return executeAgentRuntime({ ...input, selectedActionIds: actionIds });
  },

};

// ── Core executor ─────────────────────────────────────────────────────────────

async function executeAgentRuntime(input: AgentExecutionInput): Promise<AgentExecutionResult> {
  const executionId = nextId("aex");
  const now         = new Date().toISOString();
  const audit:      AgentExecutionAuditEvent[] = [];
  const warnings:   string[] = [];
  const errors:     string[] = [];

  try {
    // ── 1. Build plan (pure domain) ─────────────────────────────────────────

    const plan = planAgentExecution(input);

    // ── 2. Collect plan-phase audit events ──────────────────────────────────

    const planAudit = (plan.metadata as Record<string, unknown> | undefined)?.["auditTrail"] as AgentExecutionAuditEvent[] | undefined;
    if (planAudit) audit.push(...planAudit);

    // ── 3. No-execute fast path ─────────────────────────────────────────────

    if (isNoExecuteMode(input.executionMode, input.dryRun)) {
      audit.push(auditExecutionSkipped(
        executionId, input.agentId, input.orgSlug,
        `executionMode=${input.executionMode} dryRun=${input.dryRun}`,
      ));

      return buildResult({
        executionId,
        input,
        plan,
        steps:            plan.steps,
        operationResults: [],
        audit,
        warnings,
        errors,
        now,
      });
    }

    // ── 4. Dispatch each PLANNED step ───────────────────────────────────────

    const dispatchedSteps: AgentExecutionStep[] = [];
    const operationResults: AutonomousOperationResult[] = [];

    for (const step of plan.steps) {
      // Skip blocked / already-handled steps
      if (step.status === "BLOCKED" || step.status === "SKIPPED" || step.status === "COMPLETED") {
        dispatchedSteps.push(step);
        continue;
      }

      // Need a plan to dispatch
      if (!step.plan) {
        dispatchedSteps.push({ ...step, status: "SKIPPED", warnings: [...step.warnings, "No plan available"] });
        continue;
      }

      const actionType  = step.actionType as import("../agent-runtime-types").AgentRuntimeActionType;
      const riskLevel   = step.plan.riskLevel;

      // Permission check
      const perm = checkExecutionPermission(input.executionMode, actionType, riskLevel, input.dryRun);

      if (!perm.permitted) {
        const updatedStep: AgentExecutionStep = {
          ...step,
          status:       perm.blocked ? "BLOCKED" : "SKIPPED",
          blockedReason: perm.reason,
          warnings:     [...step.warnings, perm.reason],
        };
        dispatchedSteps.push(updatedStep);
        continue;
      }

      // Dispatch via Autonomous Operations
      let opResult: AutonomousOperationResult;
      try {
        opResult = await autonomousOperationService.executeOperationPlan(step.plan);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Dispatch failed for ${step.actionId}: ${msg}`);
        dispatchedSteps.push({
          ...step,
          status: "FAILED",
          errors: [...step.errors, msg],
        });
        continue;
      }

      operationResults.push(opResult);

      // Build updated step from result
      const updatedStep: AgentExecutionStep = {
        ...step,
        operationResult:  opResult,
        idempotencyKey:   opResult.idempotencyKey ?? step.idempotencyKey,
        alreadyProcessed: opResult.alreadyProcessed,
        existingEntityId: opResult.existingEntityId,
        existingEntityType: opResult.existingEntityType,
        createdTaskId:    opResult.createdTaskId,
        createdApprovalId: opResult.createdApprovalId,
        errors:           [...step.errors, ...opResult.errors],
        warnings:         [...step.warnings, ...opResult.warnings],
      };

      if (opResult.alreadyProcessed && opResult.existingEntityId) {
        updatedStep.status = "EXECUTED";
        audit.push(auditOperationAlreadyProcessed(
          executionId, input.agentId, input.orgSlug,
          step.actionId,
          opResult.existingEntityId,
          opResult.idempotencyKey ?? "",
        ));
      } else if (opResult.createdApprovalId) {
        updatedStep.status = "WAITING_APPROVAL";
        audit.push(auditOperationWaitingApproval(
          executionId, input.agentId, input.orgSlug,
          step.actionId,
          opResult.createdApprovalId,
        ));
      } else if (opResult.createdTaskId) {
        updatedStep.status = "EXECUTED";
        audit.push(auditOperationExecuted(
          executionId, input.agentId, input.orgSlug,
          step.actionId, "task", opResult.createdTaskId,
        ));
      } else if (opResult.success) {
        updatedStep.status = "EXECUTED";
      } else {
        updatedStep.status = "FAILED";
        errors.push(...opResult.errors);
      }

      dispatchedSteps.push(updatedStep);
    }

    // ── 5. Summary ──────────────────────────────────────────────────────────

    const executedCount = dispatchedSteps.filter(s => s.status === "EXECUTED").length;
    const blockedCount  = dispatchedSteps.filter(s => s.status === "BLOCKED").length;

    audit.push(auditExecutionCompleted(executionId, input.agentId, input.orgSlug, executedCount, blockedCount));

    return buildResult({
      executionId,
      input,
      plan: { ...plan, steps: dispatchedSteps },
      steps: dispatchedSteps,
      operationResults,
      audit,
      warnings,
      errors,
      now,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    audit.push(auditExecutionFailed(executionId, input.agentId, input.orgSlug, msg));

    return {
      success:              false,
      message:              `Agent execution failed: ${msg}`,
      agentRunId:           "",
      agentId:              input.agentId,
      executionMode:        input.executionMode,
      dryRun:               input.dryRun,
      runtimeResult:        {
        success:         false,
        message:         msg,
        runId:           "",
        agentId:         input.agentId,
        agentDomain:     "",
        agentMode:       input.executionMode,
        status:          "FAILED",
        proposedActions: [],
        auditTrail:      [],
        errors:          [msg],
        warnings:        [],
      },
      steps:                [],
      operationResults:     [],
      executedCount:        0,
      plannedCount:         0,
      blockedCount:         0,
      waitingApprovalCount: 0,
      alreadyProcessedCount: 0,
      skippedCount:         0,
      createdTaskIds:       [],
      createdApprovalIds:   [],
      auditTrail:           audit,
      errors,
      warnings,
      completedAt:          new Date().toISOString(),
    };
  }
}

// ── Result builder ─────────────────────────────────────────────────────────────

function buildResult(ctx: {
  executionId:      string;
  input:            AgentExecutionInput;
  plan:             ReturnType<typeof planAgentExecution>;
  steps:            AgentExecutionStep[];
  operationResults: AutonomousOperationResult[];
  audit:            AgentExecutionAuditEvent[];
  warnings:         string[];
  errors:           string[];
  now:              string;
}): AgentExecutionResult {
  const { executionId, input, plan, steps, operationResults, audit, warnings, errors, now } = ctx;

  const executedCount        = steps.filter(s => s.status === "EXECUTED").length;
  const blockedCount         = steps.filter(s => s.status === "BLOCKED").length;
  const waitingApprovalCount = steps.filter(s => s.status === "WAITING_APPROVAL").length;
  const alreadyProcessedCount = steps.filter(s => s.alreadyProcessed === true).length;
  const skippedCount         = steps.filter(s => s.status === "SKIPPED").length;
  const plannedCount         = steps.filter(s => s.status === "PLANNED").length;

  const createdTaskIds     = steps.flatMap(s => s.createdTaskId     ? [s.createdTaskId]     : []);
  const createdApprovalIds = steps.flatMap(s => s.createdApprovalId ? [s.createdApprovalId] : []);

  const runtimeWarnings = plan.runtimeResult.warnings ?? [];
  const allWarnings     = [...runtimeWarnings, ...warnings, ...steps.flatMap(s => s.warnings)];
  const allErrors       = [...errors, ...steps.flatMap(s => s.errors)];

  const success = allErrors.filter(e => e.length > 0).length === 0
    || executedCount > 0 || waitingApprovalCount > 0;

  return {
    success,
    message:              buildMessage(executionId, input.executionMode, executedCount, blockedCount, steps.length),
    agentRunId:           plan.agentRunId,
    agentId:              input.agentId,
    executionMode:        input.executionMode,
    dryRun:               input.dryRun,
    runtimeResult:        plan.runtimeResult,
    steps,
    operationResults,
    executedCount,
    plannedCount,
    blockedCount,
    waitingApprovalCount,
    alreadyProcessedCount,
    skippedCount,
    createdTaskIds,
    createdApprovalIds,
    auditTrail:           audit,
    errors:               [...new Set(allErrors.filter(Boolean))],
    warnings:             [...new Set(allWarnings.filter(Boolean))],
    completedAt:          now,
    metadata:             { executionId },
  };
}

function buildMessage(
  _executionId: string,
  mode:         string,
  executed:     number,
  blocked:      number,
  total:        number,
): string {
  if (mode === "PREVIEW" || mode === "PLAN_ONLY") {
    return `Agent execution plan ready (${total} actions, mode=${mode})`;
  }
  return `Agent execution complete: ${executed} executed, ${blocked} blocked (${total} total)`;
}
