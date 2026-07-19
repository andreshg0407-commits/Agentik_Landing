/**
 * lib/agents/runtime/agent-execution-permissions.ts
 *
 * Agentik — Agent Execution Permission Guards
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Pure permission evaluation for the execution layer.
 * No side effects. No Prisma. No React. No Next.
 *
 * Permission matrix by mode:
 *
 *   DISABLED          → no execution at all
 *   PREVIEW           → no execution at all
 *   PLAN_ONLY         → no execution at all
 *   APPROVAL_REQUIRED → only CREATE_APPROVAL_DRAFT / ESCALATE_TO_USER
 *   SAFE_AUTOMATION   → CREATE_TASK_DRAFT (LOW risk only)
 *   ASSISTED_EXECUTION → CREATE_TASK_DRAFT + CREATE_APPROVAL_DRAFT
 *
 * CRITICAL risk actions are ALWAYS blocked regardless of mode.
 */

import type { AgentExecutionMode }        from "./agent-execution-types";
import type { AgentRuntimeActionType }    from "./agent-runtime-types";
import type { AutonomousOperationRiskLevel } from "../../autonomous-operations/autonomous-operation-types";

// ── Action sets by mode ───────────────────────────────────────────────────────

/** Action types that each execution mode allows to be dispatched. */
const EXECUTION_MODE_ALLOWED_ACTIONS: Record<AgentExecutionMode, Set<AgentRuntimeActionType>> = {
  DISABLED:            new Set(),
  PREVIEW:             new Set(),
  PLAN_ONLY:           new Set(),
  APPROVAL_REQUIRED:   new Set([
    "CREATE_APPROVAL_DRAFT",
    "ESCALATE_TO_USER",
  ]),
  SAFE_AUTOMATION:     new Set([
    "CREATE_TASK_DRAFT",
    "ESCALATE_TO_USER",
  ]),
  ASSISTED_EXECUTION:  new Set([
    "CREATE_TASK_DRAFT",
    "CREATE_APPROVAL_DRAFT",
    "ESCALATE_TO_USER",
    "NO_ACTION",
  ]),
};

/** Risk levels that are ALWAYS blocked, regardless of mode. */
const ALWAYS_BLOCKED_RISK_LEVELS = new Set<AutonomousOperationRiskLevel>(["CRITICAL"]);

/** Risk levels allowed in SAFE_AUTOMATION mode. */
const SAFE_AUTOMATION_ALLOWED_RISK = new Set<AutonomousOperationRiskLevel>(["LOW"]);

// ── Permission check ──────────────────────────────────────────────────────────

export interface ExecutionPermissionResult {
  permitted:  boolean;
  reason:     string;
  blocked:    boolean;
  /** Whether the action should be converted to an approval instead of executing. */
  requiresApprovalInstead?: boolean;
}

/**
 * Check whether the execution layer is allowed to dispatch an action.
 *
 * @param executionMode  The AgentExecutionInput.executionMode
 * @param actionType     The ProposedAction type
 * @param riskLevel      The plan's assessed risk level
 * @param dryRun         If true, always blocks (no writes allowed)
 */
export function checkExecutionPermission(
  executionMode: AgentExecutionMode,
  actionType:    AgentRuntimeActionType,
  riskLevel:     AutonomousOperationRiskLevel,
  dryRun:        boolean,
): ExecutionPermissionResult {
  // dryRun always blocks
  if (dryRun) {
    return {
      permitted: false,
      reason:    "dryRun=true — no DB writes allowed",
      blocked:   true,
    };
  }

  // CRITICAL risk is always blocked regardless of mode
  if (ALWAYS_BLOCKED_RISK_LEVELS.has(riskLevel)) {
    return {
      permitted: false,
      reason:    `CRITICAL risk actions cannot be executed automatically (actionType=${actionType})`,
      blocked:   true,
    };
  }

  // DISABLED / PREVIEW / PLAN_ONLY never execute
  if (executionMode === "DISABLED" || executionMode === "PREVIEW" || executionMode === "PLAN_ONLY") {
    return {
      permitted: false,
      reason:    `executionMode=${executionMode} does not allow execution`,
      blocked:   false, // not a "hard block", just a mode constraint
    };
  }

  // Mode-level action check
  const allowed = EXECUTION_MODE_ALLOWED_ACTIONS[executionMode];
  if (!allowed.has(actionType)) {
    // APPROVAL_REQUIRED: propose approval instead of blocking outright
    if (executionMode === "APPROVAL_REQUIRED") {
      return {
        permitted:               false,
        reason:                  `APPROVAL_REQUIRED mode: ${actionType} requires approval, not direct execution`,
        blocked:                 false,
        requiresApprovalInstead: true,
      };
    }
    return {
      permitted: false,
      reason:    `executionMode=${executionMode} does not allow actionType=${actionType}`,
      blocked:   false,
    };
  }

  // SAFE_AUTOMATION: only LOW risk tasks allowed
  if (executionMode === "SAFE_AUTOMATION" && actionType === "CREATE_TASK_DRAFT") {
    if (!SAFE_AUTOMATION_ALLOWED_RISK.has(riskLevel)) {
      return {
        permitted: false,
        reason:    `SAFE_AUTOMATION only allows LOW risk tasks; got riskLevel=${riskLevel}`,
        blocked:   false,
      };
    }
  }

  return {
    permitted: true,
    reason:    `Permitted: executionMode=${executionMode} allows actionType=${actionType} at riskLevel=${riskLevel}`,
    blocked:   false,
  };
}

/**
 * Whether the given execution mode is a "no execute" mode.
 * Planner uses this to skip dispatch without inspecting individual actions.
 */
export function isNoExecuteMode(mode: AgentExecutionMode, dryRun: boolean): boolean {
  if (dryRun) return true;
  return mode === "DISABLED" || mode === "PREVIEW" || mode === "PLAN_ONLY";
}

/**
 * Map AgentExecutionMode → AutonomousOperationMode for the plan layer.
 */
export function mapExecutionModeToOperationMode(
  mode: AgentExecutionMode,
): import("../../autonomous-operations/autonomous-operation-types").AutonomousOperationMode {
  const map: Record<AgentExecutionMode, import("../../autonomous-operations/autonomous-operation-types").AutonomousOperationMode> = {
    DISABLED:           "AUTONOMOUS_DISABLED",
    PREVIEW:            "PREVIEW",
    PLAN_ONLY:          "PREVIEW",
    APPROVAL_REQUIRED:  "APPROVAL_REQUIRED",
    SAFE_AUTOMATION:    "SAFE_AUTOMATION",
    ASSISTED_EXECUTION: "ASSISTED",
  };
  return map[mode];
}
