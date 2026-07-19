/**
 * lib/agent-runtime/action-lifecycle.ts
 *
 * Agentik Agent Runtime — Action Lifecycle State Machine
 *
 * Agents propose → users approve → runtime executes → audit records.
 * No agent may transition an action to "executing" or "executed" unilaterally.
 * Every transition is validated against the allowed predecessor states.
 *
 * State graph:
 *
 *   suggested ──────────────────────────► pending_approval
 *   suggested ──────────────────────────► dismissed
 *   pending_approval ───────────────────► approved
 *   pending_approval ───────────────────► rejected
 *   pending_approval ───────────────────► dismissed
 *   approved ───────────────────────────► executing
 *   executing ──────────────────────────► executed
 *   executing ──────────────────────────► failed
 *   suggested | pending_approval ───────► expired
 *
 * Sprint: AGENTIK-AGENT-ACTION-LIFECYCLE-01
 */

import type { AgentAction, ActionStatus, AgentRuntimeId, AgentDomain, ActionSeverity } from "./agent-types";
import type { AuditEntry } from "./agent-types";

// ── Transition table ──────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ActionStatus, ReadonlyArray<ActionStatus>> = {
  suggested:        ["pending_approval", "dismissed", "expired"],
  pending_approval: ["approved", "rejected", "dismissed", "expired"],
  approved:         ["executing"],
  executing:        ["executed", "failed"],
  executed:         [],
  failed:           [],
  dismissed:        [],
  rejected:         [],
  expired:          [],
};

// ── Transition error ──────────────────────────────────────────────────────────

export class ActionTransitionError extends Error {
  constructor(
    public readonly actionId:    string,
    public readonly fromStatus:  ActionStatus,
    public readonly toStatus:    ActionStatus,
  ) {
    super(
      `Invalid action transition: ${fromStatus} → ${toStatus} (action=${actionId})`,
    );
    this.name = "ActionTransitionError";
  }
}

// ── Transition validator ──────────────────────────────────────────────────────

function validateTransition(
  action:    AgentAction,
  nextStatus: ActionStatus,
): void {
  const allowed = VALID_TRANSITIONS[action.status];
  if (!allowed.includes(nextStatus)) {
    throw new ActionTransitionError(action.id, action.status, nextStatus);
  }
}

function applyTransition(
  action:     AgentAction,
  nextStatus: ActionStatus,
  entry:      Omit<AuditEntry, "timestamp">,
): AgentAction {
  const now = new Date().toISOString();
  return {
    ...action,
    status:     nextStatus,
    updatedAt:  now,
    auditTrail: [
      ...action.auditTrail,
      { ...entry, timestamp: now },
    ],
  };
}

// ── Id generator (sequential, no external deps) ───────────────────────────────

let _seq = 0;
function actionId(): string { return `aa_${Date.now()}_${++_seq}`; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Phase 1 of the lifecycle. Called by the agent engine when a signal warrants an action.
 * Returns a new AgentAction in state "suggested".
 */
export function createAgentActionDraft(params: {
  type:             string;
  title:            string;
  description?:     string;
  domain:           AgentDomain;
  severity:         ActionSeverity;
  sourceAgentId:    AgentRuntimeId;
  moduleKey:        string;
  payload:          Record<string, unknown>;
  requiresApproval: boolean;
}): AgentAction {
  const now = new Date().toISOString();
  const entry: AuditEntry = {
    timestamp:  now,
    event:      "action.suggested",
    actorId:    params.sourceAgentId,
    actorType:  "agent",
    detail:     `${params.sourceAgentId} proposed action "${params.title}"`,
  };
  return {
    id:               actionId(),
    type:             params.type,
    title:            params.title,
    description:      params.description,
    domain:           params.domain,
    severity:         params.severity,
    status:           "suggested",
    sourceAgentId:    params.sourceAgentId,
    moduleKey:        params.moduleKey,
    payload:          params.payload,
    requiresApproval: params.requiresApproval,
    auditTrail:       [entry],
    createdAt:        now,
    updatedAt:        now,
  };
}

/**
 * Move suggested → pending_approval.
 * Called when the action is surfaced to the user for a decision.
 */
export function markActionPendingApproval(
  action:  AgentAction,
  shownBy: string = "system",
): AgentAction {
  validateTransition(action, "pending_approval");
  return applyTransition(action, "pending_approval", {
    event:     "action.pending_approval",
    actorId:   shownBy,
    actorType: "system",
    detail:    "Action surfaced to user — awaiting approval",
  });
}

/**
 * Move pending_approval → approved.
 * Called when the user explicitly approves.
 */
export function approveAgentAction(
  action: AgentAction,
  userId: string,
): AgentAction {
  validateTransition(action, "approved");
  return applyTransition(action, "approved", {
    event:     "action.approved",
    actorId:   userId,
    actorType: "user",
    detail:    `Approved by ${userId}`,
  });
}

/**
 * Move pending_approval → rejected.
 * Called when the user explicitly rejects the proposal.
 */
export function rejectAgentAction(
  action: AgentAction,
  userId: string,
  reason?: string,
): AgentAction {
  validateTransition(action, "rejected");
  return applyTransition(action, "rejected", {
    event:     "action.rejected",
    actorId:   userId,
    actorType: "user",
    detail:    reason ? `Rejected by ${userId}: ${reason}` : `Rejected by ${userId}`,
  });
}

/**
 * Move approved → executing.
 * Called by the execution layer just before invoking the handler.
 */
export function markActionExecuting(
  action:    AgentAction,
  runnerId:  string = "system",
): AgentAction {
  validateTransition(action, "executing");
  return applyTransition(action, "executing", {
    event:     "action.executing",
    actorId:   runnerId,
    actorType: "system",
    detail:    "Execution started",
  });
}

/**
 * Move executing → executed.
 * Called after the handler completes successfully.
 */
export function markActionExecuted(
  action:  AgentAction,
  result?: Record<string, unknown>,
): AgentAction {
  validateTransition(action, "executed");
  return applyTransition(action, "executed", {
    event:     "action.executed",
    actorId:   "system",
    actorType: "system",
    detail:    result ? `Executed. result=${JSON.stringify(result).slice(0, 200)}` : "Executed successfully",
  });
}

/**
 * Move executing → failed.
 */
export function markActionFailed(
  action:   AgentAction,
  errorMsg: string,
): AgentAction {
  validateTransition(action, "failed");
  return applyTransition(action, "failed", {
    event:     "action.failed",
    actorId:   "system",
    actorType: "system",
    detail:    errorMsg,
    errorMsg,
  });
}

/**
 * Move suggested | pending_approval → dismissed.
 * Called when the user closes the suggestion without an explicit approve/reject.
 */
export function dismissAgentAction(
  action: AgentAction,
  userId: string,
): AgentAction {
  validateTransition(action, "dismissed");
  return applyTransition(action, "dismissed", {
    event:     "action.dismissed",
    actorId:   userId,
    actorType: "user",
    detail:    `Dismissed by ${userId}`,
  });
}

/**
 * Move suggested | pending_approval → expired.
 * Called by a TTL cleanup job when no user action was taken within the allowed window.
 */
export function expireAgentAction(
  action: AgentAction,
): AgentAction {
  validateTransition(action, "expired");
  return applyTransition(action, "expired", {
    event:     "action.expired",
    actorId:   "system",
    actorType: "system",
    detail:    "Action TTL exceeded — no user action taken",
  });
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

/** True when the action can still transition (not terminal). */
export function isTerminalStatus(status: ActionStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}

/** True when the action is waiting for a user decision. */
export function isAwaitingApproval(action: AgentAction): boolean {
  return action.status === "pending_approval";
}

/** True when the action can be approved right now. */
export function canApprove(action: AgentAction): boolean {
  return VALID_TRANSITIONS[action.status].includes("approved");
}

/** True when the action can be rejected right now. */
export function canReject(action: AgentAction): boolean {
  return VALID_TRANSITIONS[action.status].includes("rejected");
}
