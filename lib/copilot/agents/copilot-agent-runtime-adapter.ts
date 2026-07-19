/**
 * lib/copilot/agents/copilot-agent-runtime-adapter.ts
 *
 * Agentik — Copilot → Agent Runtime Adapter
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Converts a CopilotViewModel snapshot (or minimal snapshot) into an
 * AgentRuntimeContext ready to be fed to runAgentRuntime().
 *
 * Does NOT:
 *   - Import Prisma
 *   - Import server services
 *   - Call runAgentRuntime() — the caller does that
 *   - Produce side effects of any kind
 *
 * Pure adapter. Safe to import from any layer.
 */

import type { AgentRuntimeContext } from "../../agents/runtime/agent-context";
import type { AgentRuntimeMode }    from "../../agents/runtime/agent-runtime-types";
import type { DecisionSignal }      from "../../decisions/decision-signals";

import { resolveAgentForModule }    from "../../agents/runtime/agent-runtime-registry";
import { createEmptyAgentMemory }   from "../../agents/runtime/agent-memory";
import { buildDecisionContextFromCopilotSnapshot } from "../decision/copilot-decision-adapter";

// ── Snapshot shape ────────────────────────────────────────────────────────────

/**
 * Minimal snapshot the adapter reads from a CopilotViewModel.
 * Typed loosely to avoid a hard dependency on viewmodel internals.
 */
export interface CopilotAgentRuntimeSnapshot {
  orgSlug:      string;
  module:       string;
  screen?:      string;
  businessDate?: string;
  leadAgent?: {
    agentId:   string;
    agentName: string;
    role?:     string;
  } | null;
  attentionItems?: Array<{
    id:           string;
    title?:       string;
    description?: string;
    severity?:    string;
    domain?:      string;
    entityType?:  string;
    entityId?:    string;
    metadata?:    Record<string, unknown>;
  }>;
  activeWork?: Array<{
    id:          string;
    title?:      string;
    status?:     string;
    domain?:     string;
    entityType?: string;
    entityId?:   string;
    createdAt?:  string;
  }>;
  pendingApprovals?: Array<{
    id:          string;
    title?:      string;
    status?:     string;
    entityType?: string;
    entityId?:   string;
    createdAt?:  string;
  }>;
  /** Direct signals to inject (bypasses attentionItems mapping). */
  extraSignals?: DecisionSignal[];
  /** Override the resolved agent's default runtime mode. */
  runtimeMode?:  AgentRuntimeMode;
  userId?:       string;
  userRole?:     string;
  metadata?:     Record<string, unknown>;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Converts a CopilotAgentRuntimeSnapshot into an AgentRuntimeContext.
 *
 * Agent resolution:
 *   1. If snapshot.leadAgent.agentId matches a registered profile → use it.
 *   2. Otherwise → resolveAgentForModule(snapshot.module).
 *
 * This function does not call the runtime — the caller is responsible for
 * calling runAgentRuntime(context) separately.
 */
export function buildAgentRuntimeContextFromCopilotSnapshot(
  snapshot: CopilotAgentRuntimeSnapshot,
): AgentRuntimeContext {
  // Resolve agent
  const agentProfile = resolveAgentForModule(snapshot.module);

  // Build decision context via the existing copilot decision adapter
  const decisionContext = buildDecisionContextFromCopilotSnapshot({
    orgSlug:       snapshot.orgSlug,
    module:        snapshot.module,
    businessDate:  snapshot.businessDate,
    leadAgent:     snapshot.leadAgent
      ? { agentId: snapshot.leadAgent.agentId, agentName: snapshot.leadAgent.agentName }
      : null,
    attentionItems: snapshot.attentionItems,
    activeWork:     snapshot.activeWork,
    pendingApprovals: snapshot.pendingApprovals,
    extraSignals:   snapshot.extraSignals,
    metadata:       snapshot.metadata,
  });

  const runtimeMode: AgentRuntimeMode =
    snapshot.runtimeMode ?? agentProfile.defaultRuntimeMode;

  const memory = createEmptyAgentMemory(agentProfile.agentId);

  return {
    orgSlug:          snapshot.orgSlug,
    agentProfile,
    runtimeMode,
    module:           snapshot.module,
    currentRoute:     snapshot.screen,
    userId:           snapshot.userId,
    userRole:         snapshot.userRole,
    businessDate:     snapshot.businessDate ?? new Date().toISOString().slice(0, 10),
    signals:          decisionContext.signals,
    decisionContext,
    activeTasks:      decisionContext.activeTasks.map(t => ({
      id:         t.id,
      title:      t.title,
      status:     t.status,
      domain:     t.domain,
      entityType: t.entityType,
      entityId:   t.entityId,
      createdAt:  t.createdAt,
    })),
    pendingApprovals: decisionContext.pendingApprovals.map(a => ({
      id:         a.id,
      title:      a.title,
      status:     a.status,
      entityType: a.entityType,
      entityId:   a.entityId,
      createdAt:  a.createdAt,
    })),
    recentExecutions: [],
    workflowRuns:     [],
    memory,
    metadata:         snapshot.metadata ?? {},
  };
}
