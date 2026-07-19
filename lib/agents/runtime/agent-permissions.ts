/**
 * lib/agents/runtime/agent-permissions.ts
 *
 * Agentik — Agent Permission Guards
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Pure permission evaluation functions.
 * No side effects. No Prisma. No React. No Next.
 *
 * Mode semantics:
 *   PREVIEW             — analyze + recommend only; no drafts
 *   ASSISTED            — full drafts allowed; user reviews before execution
 *   APPROVAL_REQUIRED   — approval drafts allowed; execution blocked without prior approval
 *   AUTONOMOUS_DISABLED — strictly recommend; no actionable drafts
 */

import type { AgentProfile }         from "./agent-profile";
import type {
  AgentRuntimeMode,
  AgentRuntimeActionType,
  AgentRuntimeDomain,
} from "./agent-runtime-types";

// ── Action sets by mode ───────────────────────────────────────────────────────

/** Actions available in each runtime mode (most permissive superset). */
const MODE_ALLOWED_ACTIONS: Record<AgentRuntimeMode, Set<AgentRuntimeActionType>> = {
  PREVIEW: new Set([
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "ESCALATE_TO_USER",
    "NO_ACTION",
  ]),
  ASSISTED: new Set([
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
    "CREATE_APPROVAL_DRAFT",
    "START_WORKFLOW_DRAFT",
    "ESCALATE_TO_USER",
    "NO_ACTION",
  ]),
  APPROVAL_REQUIRED: new Set([
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "CREATE_TASK_DRAFT",
    "CREATE_APPROVAL_DRAFT",
    "ESCALATE_TO_USER",
    "NO_ACTION",
    // START_WORKFLOW_DRAFT is blocked in this mode — workflow start requires prior approval
  ]),
  AUTONOMOUS_DISABLED: new Set([
    "ANALYZE_SIGNALS",
    "RUN_DECISION_ENGINE",
    "RECOMMEND_ACTION",
    "ESCALATE_TO_USER",
    "NO_ACTION",
  ]),
};

// ── Permission guards ─────────────────────────────────────────────────────────

/**
 * Returns true if the agent's profile allows this actionType.
 */
export function canAgentPerformAction(
  agentProfile: AgentProfile,
  actionType:   AgentRuntimeActionType,
): boolean {
  return agentProfile.allowedActionTypes.includes(actionType);
}

/**
 * Returns true if this actionType always requires human approval for this agent.
 */
export function requiresApproval(
  agentProfile: AgentProfile,
  actionType:   AgentRuntimeActionType,
): boolean {
  return agentProfile.requiresApprovalFor.includes(actionType);
}

/**
 * Returns true if the agent is permitted to operate in the given domain.
 */
export function canAgentUseDomain(
  agentProfile: AgentProfile,
  domain:       AgentRuntimeDomain,
): boolean {
  return agentProfile.allowedDomains.includes(domain);
}

/**
 * Returns true if the current runtime mode permits the given actionType.
 */
export function isActionAllowedByMode(
  mode:       AgentRuntimeMode,
  actionType: AgentRuntimeActionType,
): boolean {
  return MODE_ALLOWED_ACTIONS[mode]?.has(actionType) ?? false;
}

/**
 * Combined guard: returns true if the agent can perform the action
 * considering both profile constraints and current runtime mode.
 */
export function isActionPermitted(
  agentProfile: AgentProfile,
  mode:         AgentRuntimeMode,
  actionType:   AgentRuntimeActionType,
  domain:       AgentRuntimeDomain,
): { permitted: boolean; reason: string } {
  if (!canAgentUseDomain(agentProfile, domain)) {
    return {
      permitted: false,
      reason:    `Agent ${agentProfile.agentId} is not permitted to operate in domain ${domain}`,
    };
  }
  if (!canAgentPerformAction(agentProfile, actionType)) {
    return {
      permitted: false,
      reason:    `Agent ${agentProfile.agentId} does not have capability for action ${actionType}`,
    };
  }
  if (!isActionAllowedByMode(mode, actionType)) {
    return {
      permitted: false,
      reason:    `Runtime mode ${mode} does not allow action ${actionType}`,
    };
  }
  return { permitted: true, reason: "" };
}
