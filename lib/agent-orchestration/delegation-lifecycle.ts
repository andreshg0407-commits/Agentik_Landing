/**
 * lib/agent-orchestration/delegation-lifecycle.ts
 *
 * Agentik Agent Orchestration — Delegation State Machine
 *
 * Validated, type-safe transitions for AgentDelegation.
 * No invalid jumps. No silent state mutations. Every transition is explicit.
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import type { AgentDelegation, DelegationStatus } from "./delegation-types";
import {
  isDelegationTerminal,
  delegationId as genDelegationId,
  delegationCorrelationId as genCorrelationId,
} from "./delegation-types";

// ── Valid transitions ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<DelegationStatus, DelegationStatus[]> = {
  proposed:         ["pending_approval", "approved", "rejected", "canceled", "expired"],
  pending_approval: ["approved", "rejected", "canceled", "expired"],
  approved:         ["accepted", "canceled", "expired"],
  accepted:         ["in_progress", "canceled", "expired"],
  in_progress:      ["completed", "failed", "blocked", "canceled", "expired"],
  blocked:          ["in_progress", "canceled", "expired"],
  completed:        [],
  rejected:         [],
  failed:           [],
  canceled:         [],
  expired:          [],
};

// ── Transition error ──────────────────────────────────────────────────────────

export class DelegationTransitionError extends Error {
  constructor(
    public readonly delegationId: string,
    public readonly from:         DelegationStatus,
    public readonly to:           DelegationStatus,
  ) {
    super(`Invalid delegation transition: ${from} → ${to} (delegation: ${delegationId})`);
    this.name = "DelegationTransitionError";
  }
}

// ── Validator ─────────────────────────────────────────────────────────────────

function validateTransition(
  delegation: AgentDelegation,
  to:         DelegationStatus,
): void {
  if (isDelegationTerminal(delegation.status)) {
    throw new DelegationTransitionError(delegation.id, delegation.status, to);
  }
  const allowed = VALID_TRANSITIONS[delegation.status] ?? [];
  if (!allowed.includes(to)) {
    throw new DelegationTransitionError(delegation.id, delegation.status, to);
  }
}

function applyTransition(
  delegation: AgentDelegation,
  to:         DelegationStatus,
  overrides:  Partial<AgentDelegation> = {},
): AgentDelegation {
  validateTransition(delegation, to);
  return { ...delegation, status: to, ...overrides };
}

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

export function createDelegationProposal(
  input: Pick<AgentDelegation,
    | "orgId" | "sourceAgentId" | "targetAgentId"
    | "sourceModuleId" | "targetModuleId"
    | "parentActionId" | "reason" | "contextSummary"
    | "payload" | "priority" | "requiresApproval"
    | "correlationId" | "causationId"
  >,
): AgentDelegation {
  return {
    id:                genDelegationId(),
    orgId:             input.orgId,
    sourceAgentId:     input.sourceAgentId,
    targetAgentId:     input.targetAgentId,
    sourceModuleId:    input.sourceModuleId,
    targetModuleId:    input.targetModuleId,
    parentActionId:    input.parentActionId,
    childActionId:     null,
    reason:            input.reason,
    contextSummary:    input.contextSummary,
    payload:           input.payload,
    status:            "proposed",
    priority:          input.priority,
    requiresApproval:  input.requiresApproval,
    createdAt:         new Date().toISOString(),
    acceptedAt:        null,
    completedAt:       null,
    rejectedAt:        null,
    failedAt:          null,
    correlationId:     input.correlationId || genCorrelationId(input.sourceAgentId),
    causationId:       input.causationId,
    resolutionSummary: null,
  };
}

export function markDelegationPendingApproval(
  delegation: AgentDelegation,
): AgentDelegation {
  return applyTransition(delegation, "pending_approval");
}

export function approveDelegation(
  delegation: AgentDelegation,
  approvedBy: string,
): AgentDelegation {
  return applyTransition(delegation, "approved", {
    payload: { ...delegation.payload, approvedBy, approvedAt: new Date().toISOString() },
  });
}

export function rejectDelegation(
  delegation: AgentDelegation,
  rejectedBy: string,
  reason?:    string,
): AgentDelegation {
  return applyTransition(delegation, "rejected", {
    rejectedAt:        new Date().toISOString(),
    resolutionSummary: reason ?? `Rechazado por ${rejectedBy}`,
    payload:           { ...delegation.payload, rejectedBy, rejectionReason: reason ?? null },
  });
}

export function acceptDelegation(
  delegation: AgentDelegation,
): AgentDelegation {
  return applyTransition(delegation, "accepted", {
    acceptedAt: new Date().toISOString(),
  });
}

export function markDelegationInProgress(
  delegation: AgentDelegation,
): AgentDelegation {
  return applyTransition(delegation, "in_progress");
}

export function completeDelegation(
  delegation:        AgentDelegation,
  resolutionSummary: string,
  childActionId?:    string,
): AgentDelegation {
  return applyTransition(delegation, "completed", {
    completedAt:       new Date().toISOString(),
    childActionId:     childActionId ?? null,
    resolutionSummary,
  });
}

export function failDelegation(
  delegation: AgentDelegation,
  reason:     string,
): AgentDelegation {
  return applyTransition(delegation, "failed", {
    failedAt:          new Date().toISOString(),
    resolutionSummary: reason,
  });
}

export function cancelDelegation(
  delegation: AgentDelegation,
  reason?:    string,
): AgentDelegation {
  return applyTransition(delegation, "canceled", {
    resolutionSummary: reason ?? "Cancelado",
  });
}

export function expireDelegation(delegation: AgentDelegation): AgentDelegation {
  return applyTransition(delegation, "expired", {
    resolutionSummary: "Expiró sin resolución",
  });
}

export function blockDelegation(
  delegation: AgentDelegation,
  reason:     string,
): AgentDelegation {
  return applyTransition(delegation, "blocked", {
    payload: { ...delegation.payload, blockedReason: reason },
  });
}

// ── Guards ────────────────────────────────────────────────────────────────────

export function canApproveDelegation(d: AgentDelegation): boolean {
  return d.status === "pending_approval";
}
export function canRejectDelegation(d: AgentDelegation): boolean {
  return d.status === "pending_approval" || d.status === "proposed";
}
export function canAcceptDelegation(d: AgentDelegation): boolean {
  return d.status === "approved";
}
export function canCompleteDelegation(d: AgentDelegation): boolean {
  return d.status === "in_progress";
}
