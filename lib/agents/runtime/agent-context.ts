/**
 * lib/agents/runtime/agent-context.ts
 *
 * Agentik — Agent Runtime Context
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * AgentRuntimeContext is the complete input snapshot for one agent runtime run.
 * It wraps the agent's identity, the decision context, and operational references.
 *
 * All fields are serializable. No functions. No Prisma. No React.
 */

import type { AgentProfile }       from "./agent-profile";
import type { AgentRuntimeMode }   from "./agent-runtime-types";
import type { DecisionContext }     from "../../decisions/decision-context";
import type { DecisionSignal }      from "../../decisions/decision-signals";
import type { AgentMemorySnapshot } from "./agent-memory";

// ── Lightweight entity references (mirrors decision-context refs) ─────────────

export interface AgentActiveTaskRef {
  id:          string;
  title:       string;
  status:      string;
  domain?:     string;
  entityType?: string;
  entityId?:   string;
  createdAt:   string;
}

export interface AgentPendingApprovalRef {
  id:          string;
  title:       string;
  status:      string;
  entityType?: string;
  entityId?:   string;
  createdAt:   string;
}

export interface AgentRecentExecutionRef {
  id:          string;
  module?:     string;
  actionType?: string;
  status:      string;
  success?:    boolean;
  createdAt:   string;
}

export interface AgentWorkflowRunRef {
  id:             string;
  chainId:        string;
  status:         string;
  currentStepId?: string | null;
  createdAt:      string;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface AgentRuntimeContext {
  /** Org identifier. Required. */
  orgSlug:           string;
  /** Org DB ID. Optional — may not be available in all contexts. */
  organizationId?:   string;
  /** The agent operating in this runtime. */
  agentProfile:      AgentProfile;
  /** Runtime mode governing autonomy level. Defaults to profile default. */
  runtimeMode:       AgentRuntimeMode;
  /** Module the agent is operating in. */
  module:            string;
  /** Current UI route, used for navigation suggestions. */
  currentRoute?:     string;
  /** Human user in session, if any. */
  userId?:           string;
  userRole?:         string;
  /** ISO date for business context. */
  businessDate:      string;
  /** Business signals to analyze in this run. */
  signals:           DecisionSignal[];
  /**
   * Pre-built DecisionContext.
   * If not provided, the engine will build one from signals + refs.
   */
  decisionContext?:  DecisionContext;
  activeTasks:       AgentActiveTaskRef[];
  pendingApprovals:  AgentPendingApprovalRef[];
  recentExecutions:  AgentRecentExecutionRef[];
  workflowRuns:      AgentWorkflowRunRef[];
  memory:            AgentMemorySnapshot;
  metadata:          Record<string, unknown>;
}

// ── Builder helper ────────────────────────────────────────────────────────────

/**
 * Build an AgentRuntimeContext from an existing DecisionContext.
 * Useful when the decision context is already constructed.
 */
export function buildAgentContextFromDecisionContext(
  decisionContext: DecisionContext,
  agentProfile:    AgentProfile,
  memory:          AgentMemorySnapshot,
  runtimeMode?:    AgentRuntimeMode,
): AgentRuntimeContext {
  return {
    orgSlug:          decisionContext.orgSlug,
    organizationId:   decisionContext.organizationId,
    agentProfile,
    runtimeMode:      runtimeMode ?? agentProfile.defaultRuntimeMode,
    module:           decisionContext.module,
    currentRoute:     decisionContext.currentRoute,
    userId:           decisionContext.userId,
    userRole:         decisionContext.role,
    businessDate:     decisionContext.businessDate,
    signals:          decisionContext.signals,
    decisionContext,
    activeTasks:      decisionContext.activeTasks.map(t => ({
      id:          t.id,
      title:       t.title,
      status:      t.status,
      domain:      t.domain,
      entityType:  t.entityType,
      entityId:    t.entityId,
      createdAt:   t.createdAt,
    })),
    pendingApprovals: decisionContext.pendingApprovals.map(a => ({
      id:          a.id,
      title:       a.title,
      status:      a.status,
      entityType:  a.entityType,
      entityId:    a.entityId,
      createdAt:   a.createdAt,
    })),
    recentExecutions: decisionContext.recentExecutions.map(e => ({
      id:          e.id,
      module:      e.module,
      actionType:  e.actionType,
      status:      e.status,
      success:     e.success,
      createdAt:   e.createdAt,
    })),
    workflowRuns: decisionContext.workflowRuns.map(w => ({
      id:            w.id,
      chainId:       w.chainId,
      status:        w.status,
      currentStepId: w.currentStepId,
      createdAt:     w.createdAt,
    })),
    memory,
    metadata: decisionContext.metadata,
  };
}
