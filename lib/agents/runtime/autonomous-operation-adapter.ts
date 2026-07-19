/**
 * lib/agents/runtime/autonomous-operation-adapter.ts
 *
 * Agentik — Autonomous Operations Adapter
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Maps AgentRuntimeResult → AutonomousOperationInput[].
 * CLIENT-SAFE — pure domain transformation, no server imports.
 */

import type { AgentRuntimeResult } from "./agent-runtime-result";
import type {
  AutonomousOperationInput,
  AutonomousOperationMode,
} from "../../autonomous-operations/autonomous-operation-types";
import { buildAutonomousOperationIdempotencyKey } from "../../idempotency/idempotency-key";

// ── Mode mapping ──────────────────────────────────────────────────────────────

function mapRuntimeMode(agentMode: string): AutonomousOperationMode {
  const map: Record<string, AutonomousOperationMode> = {
    PREVIEW:             "PREVIEW",
    ASSISTED:            "ASSISTED",
    APPROVAL_REQUIRED:   "APPROVAL_REQUIRED",
    AUTONOMOUS_DISABLED: "AUTONOMOUS_DISABLED",
  };
  return map[agentMode] ?? "APPROVAL_REQUIRED";
}

// ── Public adapter ────────────────────────────────────────────────────────────

/**
 * Build one AutonomousOperationInput per ProposedAction in the runtime result.
 * The caller decides which to execute (e.g., top-1, all, filtered by score).
 */
export function buildAutonomousInputsFromAgentRuntimeResult(
  result:  AgentRuntimeResult,
  orgSlug: string,
): AutonomousOperationInput[] {
  if (!result.proposedActions || result.proposedActions.length === 0) {
    return [];
  }

  const mode = mapRuntimeMode(result.agentMode);

  return result.proposedActions.map(action => {
    const input: AutonomousOperationInput = {
      orgSlug,
      agentId:        result.agentId,
      agentName:      result.agentId,
      agentDomain:    result.agentDomain,
      runtimeMode:    mode,
      proposedAction: action,
      sourceRunId:    result.runId,
      metadata: {
        runId:       result.runId,
        agentDomain: result.agentDomain,
        agentMode:   result.agentMode,
        orgSlug,
      },
    };
    // Generate idempotency key if sourceRunId is available
    if (result.runId) {
      input.idempotencyKey = buildAutonomousOperationIdempotencyKey(input);
    }
    return input;
  });
}

/**
 * Build a single AutonomousOperationInput for one specific ProposedAction
 * from a runtime result (by action ID).
 */
export function buildAutonomousInputForAction(
  result:   AgentRuntimeResult,
  actionId: string,
  orgSlug:  string,
): AutonomousOperationInput | null {
  const action = result.proposedActions?.find(a => a.id === actionId);
  if (!action) return null;

  const mode = mapRuntimeMode(result.agentMode);

  const input: AutonomousOperationInput = {
    orgSlug,
    agentId:        result.agentId,
    agentName:      result.agentId,
    agentDomain:    result.agentDomain,
    runtimeMode:    mode,
    proposedAction: action,
    sourceRunId:    result.runId,
    metadata: {
      runId:       result.runId,
      agentDomain: result.agentDomain,
      agentMode:   result.agentMode,
      orgSlug,
    },
  };
  if (result.runId) {
    input.idempotencyKey = buildAutonomousOperationIdempotencyKey(input);
  }
  return input;
}
