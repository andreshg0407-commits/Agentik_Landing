/**
 * lib/agents/runtime/agent-state.ts
 *
 * Agentik — Agent Runtime State
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Represents the in-session state of an agent runtime.
 * Not persisted in this sprint.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AgentId,
  AgentRunId,
  AgentRuntimeStatus,
} from "./agent-runtime-types";

// ── State ─────────────────────────────────────────────────────────────────────

export interface AgentRuntimeState {
  agentId:                  AgentId;
  status:                   AgentRuntimeStatus;
  currentRunId:             AgentRunId | null;
  lastRunAt:                string | null;
  lastDecisionRunId:        string | null;
  lastRecommendationCount:  number;
  lastError:                string | null;
  activeWorkflowRunId:      string | null;
  pendingApprovalIds:       string[];
  metadata:                 Record<string, unknown>;
}

// ── Terminal states ───────────────────────────────────────────────────────────

const TERMINAL_STATUSES: Set<AgentRuntimeStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "BLOCKED",
]);

export function isTerminalAgentState(state: AgentRuntimeState): boolean {
  return TERMINAL_STATUSES.has(state.status);
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createInitialAgentState(agentId: AgentId): AgentRuntimeState {
  return {
    agentId,
    status:                  "IDLE",
    currentRunId:            null,
    lastRunAt:               null,
    lastDecisionRunId:       null,
    lastRecommendationCount: 0,
    lastError:               null,
    activeWorkflowRunId:     null,
    pendingApprovalIds:      [],
    metadata:                {},
  };
}

// ── Transition ────────────────────────────────────────────────────────────────

/**
 * Returns a new state with the updated status and optional field overrides.
 * Never mutates the input state.
 */
export function transitionAgentState(
  state:    AgentRuntimeState,
  status:   AgentRuntimeStatus,
  overrides?: Partial<AgentRuntimeState>,
): AgentRuntimeState {
  return {
    ...state,
    status,
    ...overrides,
  };
}

// ── Valid transitions ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<AgentRuntimeStatus, AgentRuntimeStatus[]> = {
  IDLE:             ["ANALYZING", "FAILED"],
  ANALYZING:        ["RECOMMENDING", "FAILED", "BLOCKED"],
  RECOMMENDING:     ["WAITING_APPROVAL", "COMPLETED", "FAILED"],
  WAITING_APPROVAL: ["EXECUTING", "COMPLETED", "FAILED", "BLOCKED"],
  EXECUTING:        ["COMPLETED", "FAILED"],
  COMPLETED:        [],
  FAILED:           ["IDLE"],
  BLOCKED:          ["IDLE", "FAILED"],
};

export function isValidTransition(from: AgentRuntimeStatus, to: AgentRuntimeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
