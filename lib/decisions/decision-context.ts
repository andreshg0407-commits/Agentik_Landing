/**
 * lib/decisions/decision-context.ts
 *
 * Agentik — Decision Engine Context
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * DecisionContext is the input snapshot the Decision Engine operates on.
 * It contains agent identity, signals, and lightweight references to
 * existing tasks/approvals/executions — never full entity objects.
 *
 * All fields are serializable. No functions. No Prisma. No React.
 */

import type { DecisionSignal } from "./decision-signals";

// ── Lightweight entity references ─────────────────────────────────────────────

export interface ActiveTaskRef {
  id:          string;
  title:       string;
  status:      string;
  domain?:     string;
  entityType?: string;
  entityId?:   string;
  createdAt:   string;
}

export interface PendingApprovalRef {
  id:          string;
  title:       string;
  status:      string;
  entityType?: string;
  entityId?:   string;
  createdAt:   string;
}

export interface RecentExecutionRef {
  id:          string;
  module?:     string;
  actionType?: string;
  status:      string;
  success?:    boolean;
  createdAt:   string;
}

export interface WorkflowRunRef {
  id:             string;
  chainId:        string;
  status:         string;
  currentStepId?: string | null;
  createdAt:      string;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface DecisionContext {
  /** Org identifier. Required. */
  orgSlug:           string;
  /** Org DB ID. Optional — may not be available in all contexts. */
  organizationId?:   string;
  /** Business vertical (e.g. "retail", "pets", "logistics"). */
  tenantVertical?:   string;
  /** Module the agent is operating in (e.g. "finanzas", "comercial"). */
  module:            string;
  /** Agent making the decision request. */
  agentId:           string;
  agentName:         string;
  /** Human user in session, if any. */
  userId?:           string;
  role?:             string;
  /** Current UI route, for navigation suggestions. */
  currentRoute?:     string;
  /** ISO date string for business date context. */
  businessDate:      string;
  /** Signals driving this decision run. */
  signals:           DecisionSignal[];
  /** Currently open tasks (used for deduplication scoring). */
  activeTasks:       ActiveTaskRef[];
  /** Currently pending approvals (used for deduplication scoring). */
  pendingApprovals:  PendingApprovalRef[];
  /** Recent executions (used for context awareness). */
  recentExecutions:  RecentExecutionRef[];
  /** Active workflow runs (used for deduplication scoring). */
  workflowRuns:      WorkflowRunRef[];
  /** Arbitrary extension metadata. */
  metadata:          Record<string, unknown>;
}
