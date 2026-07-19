/**
 * lib/agents/runtime/agent-execution-planner.ts
 *
 * Agentik — Agent Execution Planner
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Pure domain planner — reads runtime result, applies selection + limits,
 * converts ProposedActions to AutonomousOperationPlans and returns an
 * AgentExecutionPlan.
 *
 * DOES NOT DISPATCH — no DB, no Task creation, no Approval creation.
 * Pure. Safe to import from any layer.
 */

import type { AgentExecutionInput, AgentExecutionPlan, AgentExecutionStep } from "./agent-execution-types";
import type { AutonomousOperationInput } from "../../autonomous-operations/autonomous-operation-types";

import { runAgentRuntime }          from "./agent-runtime-engine";
import { buildAutonomousInputsFromAgentRuntimeResult } from "./autonomous-operation-adapter";
import { planAutonomousOperation }  from "../../autonomous-operations/autonomous-operation-planner";
import { checkExecutionPermission, mapExecutionModeToOperationMode } from "./agent-execution-permissions";
import {
  auditExecutionPlanned,
  auditActionSelected,
  auditActionBlocked,
  auditOperationPlanned,
} from "./agent-execution-audit";

import type {
  AgentExecutionAuditEvent,
  AgentExecutionStatus,
} from "./agent-execution-types";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(prefix: string): string {
  _seq++;
  return `${prefix}_${Date.now()}_${(_seq).toString(36)}`;
}

// ── Planner ───────────────────────────────────────────────────────────────────

/**
 * Plan an agent execution without dispatching anything.
 *
 * Steps:
 *   1. Run the agent runtime to get ProposedActions
 *   2. Filter by selectedActionIds (if provided)
 *   3. Limit by maxActions
 *   4. Convert to AutonomousOperationInputs with correct mode
 *   5. Create AutonomousOperationPlan per action
 *   6. Return AgentExecutionPlan
 */
export function planAgentExecution(input: AgentExecutionInput): AgentExecutionPlan {
  const planId      = nextId("aex_plan");
  const now         = new Date().toISOString();
  const audit:      AgentExecutionAuditEvent[] = [];
  const MAX_ACTIONS = input.maxActions ?? 5;

  // ── 1. Run agent runtime ──────────────────────────────────────────────────

  const runtimeResult = runAgentRuntime(input.runtimeContext);

  if (!runtimeResult.success || runtimeResult.proposedActions.length === 0) {
    return {
      planId,
      agentRunId:    runtimeResult.runId,
      agentId:       input.agentId,
      orgSlug:       input.orgSlug,
      executionMode: input.executionMode,
      dryRun:        input.dryRun,
      runtimeResult,
      steps:         [],
      plannedCount:  0,
      skippedCount:  0,
      blockedCount:  0,
      createdAt:     now,
      metadata:      input.metadata,
    };
  }

  // ── 2. Filter by selectedActionIds ────────────────────────────────────────

  let candidates = runtimeResult.proposedActions;
  const hasSelection = input.selectedActionIds && input.selectedActionIds.length > 0;

  if (hasSelection) {
    candidates = candidates.filter(a => input.selectedActionIds!.includes(a.id));
  }

  // ── 3. Limit by maxActions ────────────────────────────────────────────────

  const skippedByLimit = Math.max(0, candidates.length - MAX_ACTIONS);
  candidates = candidates.slice(0, MAX_ACTIONS);

  // ── 4. Build AutonomousOperationInputs ────────────────────────────────────

  const operationMode = mapExecutionModeToOperationMode(input.executionMode);

  // Build inputs — adapter handles idempotencyKey generation
  const allInputs = buildAutonomousInputsFromAgentRuntimeResult(
    { ...runtimeResult, agentMode: operationMode },
    input.orgSlug,
  );

  // Map action id → input for quick lookup
  const inputByActionId = new Map<string, AutonomousOperationInput>();
  for (const opInput of allInputs) {
    if (opInput.proposedAction) {
      inputByActionId.set(opInput.proposedAction.id, opInput);
    }
  }

  // ── 5. Build execution steps ──────────────────────────────────────────────

  const steps: AgentExecutionStep[] = [];
  let blockedCount = 0;

  for (const action of candidates) {
    const stepId = nextId("aex_step");

    audit.push(auditActionSelected(planId, input.agentId, input.orgSlug, action.id, action.type));

    const opInput = inputByActionId.get(action.id);
    if (!opInput) {
      steps.push({
        stepId,
        actionId:    action.id,
        actionType:  action.type,
        actionLabel: action.label,
        targetDomain: action.targetDomain,
        targetModule: action.targetModule,
        status:      "SKIPPED" as AgentExecutionStatus,
        blockedReason: "No AutonomousOperationInput could be built for this action",
        errors:      ["adapter returned no input for this action id"],
        warnings:    [],
      });
      continue;
    }

    // Plan the operation
    const plan = planAutonomousOperation(opInput);

    audit.push(auditOperationPlanned(planId, input.agentId, input.orgSlug, action.id, plan.id, plan.decision));

    // Derive step status from plan
    let stepStatus: AgentExecutionStatus;
    let blockedReason: string | undefined;

    switch (plan.status) {
      case "READY_TO_EXECUTE":
        stepStatus = "PLANNED";
        break;
      case "WAITING_APPROVAL":
        stepStatus = "WAITING_APPROVAL";
        break;
      case "BLOCKED":
      case "FAILED":
        stepStatus    = "BLOCKED";
        blockedReason = plan.errors[0] ?? `Plan blocked: ${plan.decision}`;
        blockedCount++;
        audit.push(auditActionBlocked(planId, input.agentId, input.orgSlug, action.id, action.type, blockedReason));
        break;
      case "COMPLETED":
        stepStatus = "COMPLETED";
        break;
      default:
        stepStatus = "PLANNED";
    }

    steps.push({
      stepId,
      actionId:      action.id,
      actionType:    action.type,
      actionLabel:   action.label,
      targetDomain:  action.targetDomain,
      targetModule:  action.targetModule,
      status:        stepStatus,
      plan,
      idempotencyKey: opInput.idempotencyKey,
      blockedReason,
      errors:        plan.errors,
      warnings:      plan.warnings,
    });
  }

  const plannedCount = steps.filter(s => s.status === "PLANNED" || s.status === "WAITING_APPROVAL").length;

  audit.push(auditExecutionPlanned(planId, input.agentId, input.orgSlug, plannedCount));

  return {
    planId,
    agentRunId:    runtimeResult.runId,
    agentId:       input.agentId,
    orgSlug:       input.orgSlug,
    executionMode: input.executionMode,
    dryRun:        input.dryRun,
    runtimeResult,
    steps,
    plannedCount,
    skippedCount:  skippedByLimit,
    blockedCount,
    createdAt:     now,
    metadata:      { ...input.metadata, auditTrail: audit },
  };
}
