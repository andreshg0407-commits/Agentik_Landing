/**
 * lib/work/chaining/workflow-chain-router.ts
 *
 * Agentik — Workflow Chain Router
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Pure routing logic — no Prisma, no React, no server-only.
 *
 * Given a completed execution, determines:
 *   - Whether any chain applies
 *   - Which step was completed
 *   - What the next step is
 *   - Whether the next step requires approval or can auto-execute
 */

import type {
  WorkflowChainDefinition,
  WorkflowChainRun,
  WorkflowStepDefinition,
  WorkflowStepStatus,
} from "./workflow-chain-types";
import { ACTIVE_WORKFLOW_CHAINS } from "./workflow-chain-registry";

// ── Chain match result ─────────────────────────────────────────────────────────

export interface ChainMatchResult {
  chain:        WorkflowChainDefinition;
  matchedStep:  WorkflowStepDefinition;
  stepIndex:    number;
}

export interface NextStepDecision {
  nextStep:         WorkflowStepDefinition;
  nextStepIndex:    number;
  nextStatus:       WorkflowStepStatus;
  reason:           string;
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Check if a completed (module, actionType) matches the FIRST step of any active chain.
 * Used when deciding whether to start a new chain run.
 */
export function matchChainForFirstStep(
  module:     string | null | undefined,
  actionType: string | null | undefined,
): ChainMatchResult | null {
  if (!module || !actionType) return null;

  const m = module.toLowerCase().trim();
  const a = actionType.trim();

  for (const chain of ACTIVE_WORKFLOW_CHAINS) {
    if (chain.steps.length === 0) continue;
    const firstStep = chain.steps[0];
    if (
      firstStep.module.toLowerCase() === m &&
      firstStep.actionType          === a
    ) {
      return { chain, matchedStep: firstStep, stepIndex: 0 };
    }
  }

  return null;
}

/**
 * Given a chain definition + completed stepId, find the definition of that step.
 */
export function findStepById(
  chain:  WorkflowChainDefinition,
  stepId: string,
): { step: WorkflowStepDefinition; index: number } | null {
  const index = chain.steps.findIndex(s => s.id === stepId);
  if (index === -1) return null;
  return { step: chain.steps[index], index };
}

// ── Next step resolution ──────────────────────────────────────────────────────

/**
 * Determine what the next step is after a step completes.
 *
 * Rules:
 *   1. If the completed step has onSuccess, use that step ID.
 *   2. Otherwise, use the next step in array order.
 *   3. If no next step exists → chain is COMPLETED.
 *   4. If next step requiresApproval → status = WAITING_APPROVAL.
 *   5. If next step has unmet dependencies → status = BLOCKED.
 *   6. Otherwise → status = READY.
 */
export function resolveNextStep(
  chain:           WorkflowChainDefinition,
  completedStepId: string,
  completedStepIds: string[],
): NextStepDecision | null {
  const currentIdx = chain.steps.findIndex(s => s.id === completedStepId);
  if (currentIdx === -1) return null;

  const current = chain.steps[currentIdx];

  // Resolve next step ID
  let nextStep: WorkflowStepDefinition | undefined;

  if (current.onSuccess) {
    // Explicit next step
    nextStep = chain.steps.find(s => s.id === current.onSuccess);
  } else {
    // Sequential: next in array
    nextStep = chain.steps[currentIdx + 1];
  }

  if (!nextStep) return null;

  // Check dependencies
  if (nextStep.dependsOn && nextStep.dependsOn.length > 0) {
    const unmet = nextStep.dependsOn.filter(depId => !completedStepIds.includes(depId));
    if (unmet.length > 0) {
      return {
        nextStep,
        nextStepIndex: chain.steps.indexOf(nextStep),
        nextStatus:    "BLOCKED",
        reason:        `Step ${nextStep.id} waiting for: ${unmet.join(", ")}`,
      };
    }
  }

  // Approval required
  if (nextStep.requiresApproval) {
    return {
      nextStep,
      nextStepIndex: chain.steps.indexOf(nextStep),
      nextStatus:    "WAITING_APPROVAL",
      reason:        `Step ${nextStep.id} requires human approval before execution.`,
    };
  }

  return {
    nextStep,
    nextStepIndex: chain.steps.indexOf(nextStep),
    nextStatus:    "READY",
    reason:        `Step ${nextStep.id} is ready to auto-execute.`,
  };
}

// ── Run-based routing ─────────────────────────────────────────────────────────

/**
 * Extract workflow run context from execution payload metadata.
 * Returns null if this execution is not part of a chain.
 */
export function extractChainContextFromPayload(
  payloadJson: unknown,
): {
  workflowRunId: string;
  chainId:       string;
  stepId:        string;
} | null {
  if (!payloadJson || typeof payloadJson !== "object") return null;

  const p = payloadJson as Record<string, unknown>;

  // Check in metadata field
  const meta = p["metadata"] as Record<string, unknown> | undefined;
  if (meta) {
    const workflowRunId = meta["workflowRunId"] as string | undefined;
    const chainId       = meta["chainId"]       as string | undefined;
    const stepId        = meta["stepId"]        as string | undefined;
    if (workflowRunId && chainId && stepId) {
      return { workflowRunId, chainId, stepId };
    }
  }

  return null;
}

/**
 * Guard: verify the chain has not reached a terminal status.
 */
export function isChainTerminal(run: WorkflowChainRun): boolean {
  return ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status);
}

/**
 * Guard: ensure max step limit is not exceeded.
 */
export function hasExceededStepLimit(run: WorkflowChainRun, limit = 20): boolean {
  return run.stepResults.length >= limit;
}
