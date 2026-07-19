/**
 * lib/agent-orchestration/index.ts
 *
 * Agentik Agent Orchestration — Public Barrel Export
 *
 * Boundary:
 *   lib/agent-runtime      = lifecycle / actions / execution / events
 *   lib/agent-memory       = memory graph / context / history
 *   lib/agent-intelligence = interpretation / insights / blockers / coordination
 *   lib/agent-orchestration= delegation / dependencies / agent-to-agent workflow
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  DelegationStatus,
  DelegationReason,
  DelegationPriority,
  AgentDelegation,
  DelegationFilter,
  DelegationSummary,
  DelegationReport,
} from "./delegation-types";

export {
  isDelegationTerminal,
  DELEGATION_TERMINAL_STATES,
  delegationId,
  delegationCorrelationId,
} from "./delegation-types";

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export {
  DelegationTransitionError,
  createDelegationProposal,
  markDelegationPendingApproval,
  approveDelegation,
  rejectDelegation,
  acceptDelegation,
  markDelegationInProgress,
  completeDelegation,
  failDelegation,
  cancelDelegation,
  expireDelegation,
  blockDelegation,
  canApproveDelegation,
  canRejectDelegation,
  canAcceptDelegation,
  canCompleteDelegation,
} from "./delegation-lifecycle";

// ── Queue ─────────────────────────────────────────────────────────────────────

export {
  setDelegationQueueAdapter,
  enqueueDelegation,
  getDelegation,
  updateDelegation,
  listDelegations,
  listDelegationsForAgent,
  listDelegationsByParentAction,
  listBlockedDelegations,
  delegationExists,
  buildDelegationReport,
} from "./delegation-queue";

export type { DelegationQueueAdapter } from "./delegation-queue";

// ── Engine ────────────────────────────────────────────────────────────────────

export { runDelegationEngine } from "./delegation-engine";

// ── Events ────────────────────────────────────────────────────────────────────

export { emitDelegationEvent } from "./delegation-events";
export type { DelegationEventType, DelegationEvent } from "./delegation-events";

// ── Memory integration ────────────────────────────────────────────────────────

export {
  recordDelegationProposed,
  recordDelegationAccepted,
  recordDelegationCompleted,
  recordDelegationRejected,
} from "./delegation-memory";
