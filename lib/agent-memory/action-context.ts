/**
 * lib/agent-memory/action-context.ts
 *
 * Agentik Agent Runtime — Action Context Node Builder
 *
 * Transforms an ActionEnvelope + runtime state into an ActionContextNode
 * that is persisted in the memory graph. Creates the primary node and all
 * semantic edges that describe the action's relationships.
 *
 * Sprint: AGENTIK-AGENT-CONTEXT-MEMORY-GRAPH-01
 */

import type { ActionEnvelope }        from "@/lib/agent-runtime/action-envelope";
import type {
  RuntimeMemoryNode,
  RuntimeMemoryEdge,
  ActionContextNode,
  AgentObservation,
  MemoryNodeSeverity,
  RuntimeMemoryNodeType,
} from "./runtime-memory-types";
import {
  memNodeId,
  appendMemory,
  appendMemoryEdge,
  appendObservation,
  memObsId,
} from "./runtime-memory-store";
import {
  generatedBy,
  affectsModule,
  approvedBy,
  rejectedBy,
  causedBy,
} from "./context-edges";

// ── Severity mapping ─────────────────────────────────────────────────────────

function deriveSeverity(envelope: ActionEnvelope): MemoryNodeSeverity {
  if (envelope.severity === "critical") return "critical";
  if (envelope.severity === "high")     return "high";
  if (envelope.agentStatus === "failed") return "high";
  if (envelope.agentStatus === "rejected") return "medium";
  return "medium";
}

// ── Node type from envelope status ───────────────────────────────────────────

function deriveNodeType(envelope: ActionEnvelope): RuntimeMemoryNodeType {
  switch (envelope.agentStatus) {
    case "suggested":         return "action_proposed";
    case "pending_approval":  return "action_proposed";
    case "approved":          return "action_approved";
    case "rejected":          return "action_rejected";
    case "executing":         return "action_executing";
    case "executed":          return "action_executed";
    case "failed":            return "action_failed";
    case "dismissed":         return "action_rejected";
    case "expired":           return "action_failed";
    default:                  return "action_proposed";
  }
}

// ── Primary builder ───────────────────────────────────────────────────────────

/**
 * Builds an ActionContextNode from an ActionEnvelope and persists it
 * (node + edges) into the memory store.
 *
 * Returns the full ActionContextNode with the persisted node, edges,
 * and any observations attached at build time.
 */
export async function buildActionContextNode(
  envelope:      ActionEnvelope,
  orgId:         string,
  observations?: AgentObservation[],
): Promise<ActionContextNode> {
  // ── 1. Build primary node ─────────────────────────────────────────────────

  const node: RuntimeMemoryNode = {
    id:             memNodeId(),
    timestamp:      new Date().toISOString(),
    orgId,
    agentId:        envelope.sourceAgentId,
    moduleId:       envelope.moduleKey,
    actionId:       envelope.agentActionId ?? envelope.actionTaskId,
    nodeType:       deriveNodeType(envelope),
    summary:        envelope.title,
    metadata: {
      actionTaskId:   envelope.actionTaskId,
      agentActionId:  envelope.agentActionId,
      actionType:     envelope.type,
      priority:       envelope.priority,
      proposedBy:     envelope.proposedBy,
      approvedBy:     envelope.approvedBy ?? null,
      rejectedBy:     envelope.rejectedBy ?? null,
      rejectionReason:envelope.rejectionReason ?? null,
      payloadSummary: envelope.payloadSummary ?? null,
      executionMode:  envelope.executionMode,
    },
    relatedEdges:   [],
    severity:       deriveSeverity(envelope),
    lifecycleState: envelope.agentStatus,
    domain:         envelope.domain,
    actorId:        envelope.proposedBy ?? null,
  };

  await appendMemory(node);

  // ── 2. Build edges ────────────────────────────────────────────────────────

  const edges: RuntimeMemoryEdge[] = [];

  // Agent generated this node
  const genEdge = generatedBy(node.id, envelope.sourceAgentId);
  await appendMemoryEdge(genEdge);
  edges.push(genEdge);

  // Node affects its module
  const modEdge = affectsModule(node.id, envelope.moduleKey);
  await appendMemoryEdge(modEdge);
  edges.push(modEdge);

  // Approved edge — link to approver decision if approved
  if (
    (envelope.agentStatus === "approved" || envelope.agentStatus === "executed") &&
    envelope.approvedBy
  ) {
    const approvalDecisionId = `decision_${envelope.actionTaskId}_approval`;
    const apEdge = approvedBy(node.id, approvalDecisionId, envelope.approvedBy);
    await appendMemoryEdge(apEdge);
    edges.push(apEdge);
  }

  // Rejected edge
  if (envelope.agentStatus === "rejected" && envelope.rejectedBy) {
    const rejectionDecisionId = `decision_${envelope.actionTaskId}_rejection`;
    const rjEdge = rejectedBy(
      node.id,
      rejectionDecisionId,
      envelope.rejectedBy,
      envelope.rejectionReason ?? undefined,
    );
    await appendMemoryEdge(rjEdge);
    edges.push(rjEdge);
  }

  // Failed — caused_by reference to its own action task for traceability
  if (envelope.agentStatus === "failed" && envelope.actionTaskId) {
    const failEdge = causedBy(node.id, `task_${envelope.actionTaskId}`, {
      reason: "execution_failed",
      executionMode: envelope.executionMode,
    });
    await appendMemoryEdge(failEdge);
    edges.push(failEdge);
  }

  // ── 3. Attach observations ────────────────────────────────────────────────

  const attachedObs: AgentObservation[] = [];
  if (observations && observations.length > 0) {
    for (const obs of observations) {
      const persisted = await appendObservation({ ...obs, nodeId: node.id });
      attachedObs.push(persisted);
    }
  }

  return { node, edges, observations: attachedObs };
}

// ── Snapshot builder for approval event ──────────────────────────────────────

/**
 * Records an approval decision in memory.
 * Appends a decision_point node + approved_by edge to the original action node.
 */
export async function recordApprovalDecision(
  originalNodeId: string,
  envelope:        ActionEnvelope,
  approvedByUser:  string,
  orgId:           string,
): Promise<{ decisionNode: RuntimeMemoryNode; edge: RuntimeMemoryEdge }> {
  const decisionNode: RuntimeMemoryNode = {
    id:             memNodeId(),
    timestamp:      new Date().toISOString(),
    orgId,
    agentId:        envelope.sourceAgentId,
    moduleId:       envelope.moduleKey,
    actionId:       envelope.agentActionId ?? envelope.actionTaskId,
    nodeType:       "decision_point",
    summary:        `Aprobado por ${approvedByUser}: ${envelope.title}`,
    metadata: {
      decision:       "approved",
      approvedByUser,
      actionTaskId:   envelope.actionTaskId,
    },
    relatedEdges:   [],
    severity:       "info",
    lifecycleState: "approved",
    domain:         envelope.domain,
    actorId:        approvedByUser,
  };

  await appendMemory(decisionNode);

  const edge = approvedBy(originalNodeId, decisionNode.id, approvedByUser);
  await appendMemoryEdge(edge);

  return { decisionNode, edge };
}

// ── Snapshot builder for rejection event ─────────────────────────────────────

/**
 * Records a rejection decision in memory.
 * Appends a decision_point node + rejected_by edge to the original action node.
 */
export async function recordRejectionDecision(
  originalNodeId: string,
  envelope:        ActionEnvelope,
  rejectedByUser:  string,
  reason:          string | undefined,
  orgId:           string,
): Promise<{ decisionNode: RuntimeMemoryNode; edge: RuntimeMemoryEdge }> {
  const decisionNode: RuntimeMemoryNode = {
    id:             memNodeId(),
    timestamp:      new Date().toISOString(),
    orgId,
    agentId:        envelope.sourceAgentId,
    moduleId:       envelope.moduleKey,
    actionId:       envelope.agentActionId ?? envelope.actionTaskId,
    nodeType:       "decision_point",
    summary:        `Rechazado por ${rejectedByUser}: ${envelope.title}`,
    metadata: {
      decision:       "rejected",
      rejectedByUser,
      reason:         reason ?? null,
      actionTaskId:   envelope.actionTaskId,
    },
    relatedEdges:   [],
    severity:       "medium",
    lifecycleState: "rejected",
    domain:         envelope.domain,
    actorId:        rejectedByUser,
  };

  await appendMemory(decisionNode);

  const edge = rejectedBy(originalNodeId, decisionNode.id, rejectedByUser, reason);
  await appendMemoryEdge(edge);

  return { decisionNode, edge };
}
