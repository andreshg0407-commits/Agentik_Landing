/**
 * lib/autonomous-operations/server/autonomous-operation-action-bridge.ts
 *
 * Agentik — Autonomous Operations Action Bridge
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Bridges AgentRuntimeResult → AutonomousOperationInput[]
 * and executes them via the autonomous operation service.
 *
 * SERVER-ONLY. Never import from client components.
 */
import "server-only";

import type { AgentRuntimeResult } from "../../agents/runtime/agent-runtime-result";
import type { AutonomousOperationInput }  from "../autonomous-operation-types";
import type { AutonomousOperationResult } from "../autonomous-operation-result";
import type { AutonomousOperationMode }   from "../autonomous-operation-types";
import { autonomousOperationService }     from "./autonomous-operation-service";

// ── Mode mapping ──────────────────────────────────────────────────────────────

/**
 * Maps AgentRuntimeMode → AutonomousOperationMode.
 * Both are structurally compatible except ASSISTED maps to ASSISTED and
 * AUTONOMOUS_DISABLED maps to AUTONOMOUS_DISABLED.
 */
function mapRuntimeMode(
  agentMode: string,
): AutonomousOperationMode {
  const map: Record<string, AutonomousOperationMode> = {
    PREVIEW:             "PREVIEW",
    ASSISTED:            "ASSISTED",
    APPROVAL_REQUIRED:   "APPROVAL_REQUIRED",
    AUTONOMOUS_DISABLED: "AUTONOMOUS_DISABLED",
  };
  return map[agentMode] ?? "APPROVAL_REQUIRED";
}

// ── Build inputs from runtime result ─────────────────────────────────────────

/**
 * Build one AutonomousOperationInput per ProposedAction in the AgentRuntimeResult.
 */
export function buildAutonomousInputsFromRuntimeResult(
  result:  AgentRuntimeResult,
  orgSlug: string,
): AutonomousOperationInput[] {
  if (!result.proposedActions || result.proposedActions.length === 0) {
    return [];
  }

  const mode = mapRuntimeMode(result.agentMode);

  return result.proposedActions.map(action => ({
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
    },
  }));
}

// ── Execute a single ProposedAction ──────────────────────────────────────────

/**
 * Execute one ProposedAction as an autonomous operation.
 * Returns the AutonomousOperationResult from the service.
 */
export async function executeProposedActionAsOperation(
  result:     AgentRuntimeResult,
  actionId:   string,
  orgSlug:    string,
): Promise<AutonomousOperationResult | null> {
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
    },
  };

  return autonomousOperationService.planAndMaybeExecute(input);
}

// ── Execute all ProposedActions from a runtime result ─────────────────────────

/**
 * Execute all ProposedActions from an AgentRuntimeResult as autonomous operations.
 * Runs sequentially. Returns one result per action.
 */
export async function executeAgentRuntimeOperations(
  result:  AgentRuntimeResult,
  orgSlug: string,
): Promise<AutonomousOperationResult[]> {
  const inputs = buildAutonomousInputsFromRuntimeResult(result, orgSlug);
  if (inputs.length === 0) return [];
  return autonomousOperationService.processBatch(inputs);
}
