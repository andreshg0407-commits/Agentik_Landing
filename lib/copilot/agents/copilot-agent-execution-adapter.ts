/**
 * lib/copilot/agents/copilot-agent-execution-adapter.ts
 *
 * Agentik — Copilot → Agent Execution Adapter
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Converts a CopilotAgentRuntimeSnapshot into an AgentExecutionInput
 * ready to be passed to agentExecutionService.executeAgentRuntime().
 *
 * Does NOT:
 *   - Execute anything
 *   - Import server services
 *   - Import Prisma
 *   - Produce side effects
 *
 * Pure adapter. Safe to import from any layer.
 */

import type { AgentExecutionInput, AgentExecutionMode } from "../../agents/runtime/agent-execution-types";
import type { CopilotAgentRuntimeSnapshot }             from "./copilot-agent-runtime-adapter";

import { buildAgentRuntimeContextFromCopilotSnapshot }  from "./copilot-agent-runtime-adapter";
import { resolveAgentForModule }                         from "../../agents/runtime/agent-runtime-registry";

// ── Mode resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the appropriate AgentExecutionMode for a module + snapshot.
 *
 * Priority:
 *   1. If snapshot.runtimeMode is present → map to execution mode
 *   2. Agent's defaultRuntimeMode
 *   3. Fallback: APPROVAL_REQUIRED
 */
function resolveExecutionMode(snapshot: CopilotAgentRuntimeSnapshot): AgentExecutionMode {
  const raw = snapshot.runtimeMode;
  if (!raw) {
    const profile = resolveAgentForModule(snapshot.module);
    return mapRuntimeModeToExecutionMode(profile.defaultRuntimeMode);
  }
  return mapRuntimeModeToExecutionMode(raw);
}

function mapRuntimeModeToExecutionMode(
  runtimeMode: string,
): AgentExecutionMode {
  const map: Record<string, AgentExecutionMode> = {
    PREVIEW:             "PREVIEW",
    ASSISTED:            "ASSISTED_EXECUTION",
    APPROVAL_REQUIRED:   "APPROVAL_REQUIRED",
    AUTONOMOUS_DISABLED: "DISABLED",
  };
  return map[runtimeMode] ?? "APPROVAL_REQUIRED";
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Build an AgentExecutionInput from a CopilotAgentRuntimeSnapshot.
 *
 * This function:
 *   1. Resolves the agent profile from the snapshot's module
 *   2. Builds an AgentRuntimeContext via the existing adapter
 *   3. Determines the execution mode
 *   4. Returns a complete AgentExecutionInput
 *
 * The caller is responsible for passing this to agentExecutionService.
 */
export function buildAgentExecutionInputFromCopilotSnapshot(
  snapshot:         CopilotAgentRuntimeSnapshot,
  options?: {
    executionMode?:     AgentExecutionMode;
    selectedActionIds?: string[];
    maxActions?:        number;
    dryRun?:            boolean;
  },
): AgentExecutionInput {
  const agentProfile    = resolveAgentForModule(snapshot.module);
  const runtimeContext  = buildAgentRuntimeContextFromCopilotSnapshot(snapshot);
  const executionMode   = options?.executionMode ?? resolveExecutionMode(snapshot);

  return {
    orgSlug:          snapshot.orgSlug,
    agentId:          agentProfile.agentId,
    runtimeContext,
    executionMode,
    selectedActionIds: options?.selectedActionIds,
    maxActions:        options?.maxActions,
    dryRun:            options?.dryRun ?? false,
    metadata: {
      source:        "copilot_snapshot",
      module:        snapshot.module,
      screen:        snapshot.screen,
      businessDate:  snapshot.businessDate,
      userId:        snapshot.userId,
      userRole:      snapshot.userRole,
      ...snapshot.metadata,
    },
  };
}

/**
 * Build a PREVIEW-only AgentExecutionInput — never executes, no side effects.
 * Use for display-only agent analysis in the Copilot rail.
 */
export function buildPreviewAgentExecutionInput(
  snapshot: CopilotAgentRuntimeSnapshot,
): AgentExecutionInput {
  return buildAgentExecutionInputFromCopilotSnapshot(snapshot, {
    executionMode: "PREVIEW",
    dryRun:        true,
  });
}

/**
 * Build an ASSISTED_EXECUTION AgentExecutionInput for the copilot panel.
 * Only specific selected actions will be processed.
 */
export function buildAssistedAgentExecutionInput(
  snapshot:          CopilotAgentRuntimeSnapshot,
  selectedActionIds: string[],
  maxActions?:       number,
): AgentExecutionInput {
  return buildAgentExecutionInputFromCopilotSnapshot(snapshot, {
    executionMode:    "ASSISTED_EXECUTION",
    selectedActionIds,
    maxActions:       maxActions ?? 3,
    dryRun:           false,
  });
}
