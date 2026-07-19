/**
 * lib/agent-orchestration/delegation-memory.ts
 *
 * Agentik Agent Orchestration — Memory Graph Integration
 *
 * Records delegation lifecycle events into the memory graph.
 * Creates RuntimeMemoryNodes and semantic edges for each delegation
 * so the full audit trail is visible in the memory layer.
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import type { AgentDelegation }    from "./delegation-types";
import type { RuntimeMemoryNode }  from "@/lib/agent-memory/runtime-memory-types";
import {
  memNodeId,
  appendMemory,
  appendMemoryEdge,
} from "@/lib/agent-memory/runtime-memory-store";
import {
  generatedBy,
  delegatedTo,
  dependsOn,
  causedBy,
  blocks as blocksEdge,
  resolves as resolvesEdge,
} from "@/lib/agent-memory/context-edges";

// ── Node builder ──────────────────────────────────────────────────────────────

function buildDelegationNode(
  delegation: AgentDelegation,
  summary:    string,
): RuntimeMemoryNode {
  return {
    id:           memNodeId(),
    timestamp:    new Date().toISOString(),
    orgId:        delegation.orgId,
    agentId:      delegation.sourceAgentId,
    moduleId:     delegation.sourceModuleId,
    actionId:     delegation.parentActionId,
    nodeType:     "module_event",
    summary,
    metadata: {
      delegationId:    delegation.id,
      sourceAgentId:   delegation.sourceAgentId,
      targetAgentId:   delegation.targetAgentId,
      reason:          delegation.reason,
      status:          delegation.status,
      priority:        delegation.priority,
      correlationId:   delegation.correlationId,
      parentActionId:  delegation.parentActionId,
    },
    relatedEdges:   [],
    severity:       delegation.priority === "critical" ? "critical"
                  : delegation.priority === "high"     ? "high"
                  : delegation.priority === "medium"   ? "medium"
                  : "low",
    lifecycleState: delegation.status,
    domain:         "commercial",
    actorId:        delegation.sourceAgentId,
  };
}

// ── Record delegation proposed ────────────────────────────────────────────────

export async function recordDelegationProposed(
  delegation: AgentDelegation,
): Promise<RuntimeMemoryNode> {
  const node = buildDelegationNode(
    delegation,
    `Delegación propuesta: ${delegation.sourceAgentId} → ${delegation.targetAgentId} (${delegation.reason})`,
  );

  await appendMemory(node);

  // generated_by source agent
  const genEdge = generatedBy(node.id, delegation.sourceAgentId);
  await appendMemoryEdge(genEdge);

  // delegated_to target agent
  const delEdge = delegatedTo(node.id, `agent_${delegation.targetAgentId}`, delegation.targetAgentId);
  await appendMemoryEdge(delEdge);

  // depends_on parent action (if exists)
  if (delegation.parentActionId) {
    const depEdge = dependsOn(node.id, `action_${delegation.parentActionId}`);
    await appendMemoryEdge(depEdge);

    // This delegation blocks the parent action until resolved
    const blkEdge = blocksEdge(node.id, `action_${delegation.parentActionId}`, {
      reason: delegation.reason,
    });
    await appendMemoryEdge(blkEdge);
  }

  // caused_by causation (if chained delegation)
  if (delegation.causationId) {
    const causeEdge = causedBy(node.id, delegation.causationId, { reason: delegation.reason });
    await appendMemoryEdge(causeEdge);
  }

  return node;
}

// ── Record delegation accepted ────────────────────────────────────────────────

export async function recordDelegationAccepted(
  delegation: AgentDelegation,
): Promise<RuntimeMemoryNode> {
  const node = buildDelegationNode(
    delegation,
    `Delegación aceptada: ${delegation.targetAgentId} tomó control de "${delegation.reason}"`,
  );
  await appendMemory(node);

  const genEdge = generatedBy(node.id, delegation.targetAgentId);
  await appendMemoryEdge(genEdge);

  return node;
}

// ── Record delegation completed ───────────────────────────────────────────────

export async function recordDelegationCompleted(
  delegation: AgentDelegation,
): Promise<RuntimeMemoryNode> {
  const node = buildDelegationNode(
    delegation,
    `Delegación completada: ${delegation.targetAgentId} resolvió "${delegation.reason}". ${delegation.resolutionSummary ?? ""}`,
  );
  await appendMemory(node);

  const genEdge = generatedBy(node.id, delegation.targetAgentId);
  await appendMemoryEdge(genEdge);

  // Delegation resolves the parent action block
  if (delegation.parentActionId) {
    const resEdge = resolvesEdge(node.id, `action_${delegation.parentActionId}`, {
      resolution: delegation.resolutionSummary,
    });
    await appendMemoryEdge(resEdge);
  }

  return node;
}

// ── Record delegation rejected ────────────────────────────────────────────────

export async function recordDelegationRejected(
  delegation: AgentDelegation,
  rejectedBy: string,
): Promise<RuntimeMemoryNode> {
  const node = buildDelegationNode(
    delegation,
    `Delegación rechazada por ${rejectedBy}: ${delegation.reason}. ${delegation.resolutionSummary ?? ""}`,
  );
  await appendMemory(node);

  const causeEdge = causedBy(node.id, delegation.id, { rejectedBy, reason: delegation.resolutionSummary });
  await appendMemoryEdge(causeEdge);

  return node;
}
