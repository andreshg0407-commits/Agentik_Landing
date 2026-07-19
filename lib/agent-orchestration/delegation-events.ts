/**
 * lib/agent-orchestration/delegation-events.ts
 *
 * Agentik Agent Orchestration — Delegation Runtime Events
 *
 * Defines delegation-specific event types and wires them into
 * the existing runtime event emitter.
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import type { RuntimeEvent }     from "@/lib/agent-runtime/runtime-events";
import { emitAgentRuntimeEvent } from "@/lib/agent-runtime/runtime-events";
import type { AgentDelegation }  from "./delegation-types";

// ── Delegation event types ────────────────────────────────────────────────────

export type DelegationEventType =
  | "delegation.proposed"
  | "delegation.pending_approval"
  | "delegation.approved"
  | "delegation.accepted"
  | "delegation.in_progress"
  | "delegation.completed"
  | "delegation.rejected"
  | "delegation.failed"
  | "delegation.blocked"
  | "delegation.expired";

// ── Delegation event shape ────────────────────────────────────────────────────

export interface DelegationEvent extends Omit<RuntimeEvent, "type"> {
  type: DelegationEventType;
  metadata: {
    delegationId:    string;
    sourceAgentId:   string;
    targetAgentId:   string;
    reason:          string;
    parentActionId:  string | null;
    status:          string;
    priority:        string;
    correlationId:   string;
    resolutionSummary?: string | null;
  };
}

// ── Emitter ───────────────────────────────────────────────────────────────────

export function emitDelegationEvent(
  type:       DelegationEventType,
  delegation: AgentDelegation,
): void {
  // Map delegation to RuntimeEvent shape for compatibility with the emitter
  emitAgentRuntimeEvent<RuntimeEvent>({
    type:           type as unknown as import("@/lib/agent-runtime/runtime-events").RuntimeEventType,
    organizationId: delegation.orgId,
    agentId:        delegation.sourceAgentId as import("@/lib/agent-runtime/agent-types").AgentRuntimeId,
    domain:         "commercial" as import("@/lib/agent-runtime/agent-types").AgentDomain,
    moduleKey:      delegation.sourceModuleId,
    correlationId:  delegation.correlationId,
    metadata: {
      delegationId:     delegation.id,
      sourceAgentId:    delegation.sourceAgentId,
      targetAgentId:    delegation.targetAgentId,
      reason:           delegation.reason,
      parentActionId:   delegation.parentActionId,
      status:           delegation.status,
      priority:         delegation.priority,
      correlationId:    delegation.correlationId,
      resolutionSummary: delegation.resolutionSummary,
    },
  });
}
