/**
 * lib/agent-runtime/execution-graph/execution-graph-consistency.ts
 *
 * Agentik Execution Graph — Consistency Checker
 *
 * Diagnostics-only integrity checks against the ExecutionGraph.
 * Reports anomalies as ExecutionGraphIssue records.
 * NEVER auto-repairs — all mutations go through lifecycle state machines.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import type {
  ExecutionGraph,
  ExecutionGraphIssue,
  GraphIssueType,
  GraphIssueSeverity,
} from "./execution-graph-types";
import { issueId } from "./execution-graph-types";
import { getOrphanNodes } from "./execution-graph-query";

// ── Main validation ───────────────────────────────────────────────────────────

export function validateExecutionGraph(graph: ExecutionGraph): ExecutionGraphIssue[] {
  return [
    ...detectOrphanExecutions(graph),
    ...detectOrphanAttempts(graph),
    ...detectOrphanDelegations(graph),
    ...detectMissingExecutionForApprovedAction(graph),
    ...detectDelegationWithoutParentAction(graph),
    ...detectPlanWithoutSteps(graph),
    ...detectDanglingEdges(graph),
    ...detectDuplicateExecutions(graph),
    ...detectUnresolvedBlocks(graph),
    ...detectGraphCycles(graph),
    ...detectMissingCorrelationMetadata(graph),
  ];
}

// ── Individual checks ─────────────────────────────────────────────────────────

/** Execution sessions with no connection to any action node. */
export function detectOrphanExecutions(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const actionRefIds = new Set(
    Object.values(graph.nodes)
      .filter(n => n.nodeType === "action")
      .map(n => n.refId),
  );

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "execution_session") continue;
    const actionId = node.metadata["actionId"] as string | undefined;
    if (!actionId || !actionRefIds.has(actionId)) {
      issues.push(makeIssue(
        "orphan_execution", "warning",
        node.id, node.refId,
        `Execution session "${node.refId}" has no linked action.`,
        "Verify the actionId on the execution session is correct.",
      ));
    }
  }
  return issues;
}

/** Attempt nodes with no connection to a session. */
export function detectOrphanAttempts(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const sessRefIds = new Set(
    Object.values(graph.nodes)
      .filter(n => n.nodeType === "execution_session")
      .map(n => n.refId),
  );

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "execution_attempt") continue;
    const sessId = node.metadata["sessionId"] as string | undefined;
    if (!sessId || !sessRefIds.has(sessId)) {
      issues.push(makeIssue(
        "orphan_attempt", "warning",
        node.id, node.refId,
        `Execution attempt "${node.refId}" has no linked session.`,
        "Verify the sessionId on the attempt record.",
      ));
    }
  }
  return issues;
}

/** Delegation nodes with no connection to a parent action. */
export function detectOrphanDelegations(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const actionRefIds = new Set(
    Object.values(graph.nodes)
      .filter(n => n.nodeType === "action")
      .map(n => n.refId),
  );

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "delegation") continue;
    const parentActionId = node.metadata["parentActionId"] as string | undefined;
    const causationId    = node.metadata["causationId"]    as string | undefined;
    // A delegation is orphaned if it has no parentActionId and no causationId linking it
    if (!parentActionId && !causationId) {
      issues.push(makeIssue(
        "orphan_delegation", "info",
        node.id, node.refId,
        `Delegation "${node.refId}" has no parent action or causation chain.`,
        "Ensure the delegation was created from a parent action with a valid parentActionId.",
      ));
    }
    void actionRefIds;
  }
  return issues;
}

/**
 * Approved actions that have no execution session.
 * These may be stuck waiting for someone to call /execute.
 */
export function detectMissingExecutionForApprovedAction(
  graph: ExecutionGraph,
): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const executionActionIds = new Set(
    Object.values(graph.nodes)
      .filter(n => n.nodeType === "execution_session")
      .map(n => n.metadata["actionId"] as string | undefined)
      .filter(Boolean),
  );

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "action") continue;
    const approved = node.status === "approved" || node.status === "executing" || node.status === "executed";
    if (approved && !executionActionIds.has(node.refId)) {
      issues.push(makeIssue(
        "missing_execution_for_approved_action", "warning",
        node.id, node.refId,
        `Action "${node.label}" is approved but has no execution session.`,
        "Call POST /execute to trigger execution of this approved action.",
      ));
    }
  }
  return issues;
}

/** Delegation nodes where parentActionId is set but action node is absent. */
export function detectDelegationWithoutParentAction(
  graph: ExecutionGraph,
): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const actionRefIds = new Set(
    Object.values(graph.nodes)
      .filter(n => n.nodeType === "action")
      .map(n => n.refId),
  );

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "delegation") continue;
    const parentActionId = node.metadata["parentActionId"] as string | undefined;
    if (parentActionId && !actionRefIds.has(parentActionId)) {
      issues.push(makeIssue(
        "delegation_without_parent_action", "warning",
        node.id, node.refId,
        `Delegation "${node.refId}" references action "${parentActionId}" which is not in the graph.`,
        "The parent action may have been archived or not loaded. Extend query scope.",
      ));
    }
  }
  return issues;
}

/** Plans with no steps. */
export function detectPlanWithoutSteps(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "plan") continue;
    const stepCount = (node.metadata["stepCount"] as number | undefined) ?? 0;
    if (stepCount === 0) {
      issues.push(makeIssue(
        "plan_without_steps", "info",
        node.id, node.refId,
        `Plan "${node.label}" has no steps.`,
        "The planning engine may not have generated steps — check source envelopes and delegations.",
      ));
    }
  }
  return issues;
}

/** Edges where either source or target node is missing. */
export function detectDanglingEdges(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  for (const edge of graph.edges) {
    const hasSource = !!graph.nodes[edge.sourceNodeId];
    const hasTarget = !!graph.nodes[edge.targetNodeId];
    if (!hasSource || !hasTarget) {
      issues.push(makeIssue(
        "dangling_edge", "warning",
        edge.sourceNodeId, edge.id,
        `Edge "${edge.id}" (${edge.relationType}) references missing node(s).`,
        "Graph may be partially loaded. Expand query scope.",
      ));
    }
  }
  return issues;
}

/** Multiple execution sessions for the same action in non-terminal states. */
export function detectDuplicateExecutions(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const ACTIVE = new Set(["queued", "leasing", "validating", "running", "retry_scheduled"]);
  const byActionId = new Map<string, string[]>();

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "execution_session") continue;
    const actionId = node.metadata["actionId"] as string | undefined;
    if (!actionId) continue;
    if (!ACTIVE.has(node.status)) continue;
    const arr = byActionId.get(actionId) ?? [];
    arr.push(node.id);
    byActionId.set(actionId, arr);
  }

  for (const [actionId, nodeIds] of byActionId) {
    if (nodeIds.length < 2) continue;
    for (const nid of nodeIds) {
      issues.push(makeIssue(
        "duplicate_execution_for_action", "critical",
        nid, actionId,
        `Action "${actionId}" has ${nodeIds.length} active execution sessions.`,
        "Only one active execution per action is expected. Cancel duplicates or wait for completion.",
      ));
    }
  }
  return issues;
}

/** Delegations or plans in blocked/pending states that have no resolution path. */
export function detectUnresolvedBlocks(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const BLOCKED = new Set(["blocked", "pending_approval"]);

  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "delegation" && node.nodeType !== "plan") continue;
    if (!BLOCKED.has(node.status)) continue;
    // Check if there's any "resolves" edge toward this node
    const resolveEdges = graph.edges.filter(
      e => e.targetNodeId === node.id && e.relationType === "resolves",
    );
    if (resolveEdges.length === 0) {
      issues.push(makeIssue(
        "unresolved_block", "warning",
        node.id, node.refId,
        `${node.nodeType} "${node.label}" is blocked with no resolution path in graph.`,
        "A human decision or delegation completion is needed to unblock this chain.",
      ));
    }
  }
  return issues;
}

/** Detect cycles using DFS gray/black marking. */
export function detectGraphCycles(graph: ExecutionGraph): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const arr = adj.get(e.sourceNodeId) ?? [];
    arr.push(e.targetNodeId);
    adj.set(e.sourceNodeId, arr);
  }

  const white = new Set(Object.keys(graph.nodes));
  const gray  = new Set<string>();
  const black = new Set<string>();
  const reportedCycles = new Set<string>();

  function dfs(id: string): void {
    if (gray.has(id)) {
      if (!reportedCycles.has(id)) {
        reportedCycles.add(id);
        const node = graph.nodes[id];
        issues.push(makeIssue(
          "cycle_detected", "critical",
          id, node?.refId ?? id,
          `Cycle detected in execution graph at node "${node?.label ?? id}".`,
          "Review causationId and correlationId chains for circular references.",
        ));
      }
      return;
    }
    if (black.has(id)) return;
    gray.add(id);
    white.delete(id);
    for (const next of (adj.get(id) ?? [])) dfs(next);
    gray.delete(id);
    black.add(id);
  }

  for (const id of [...white]) dfs(id);
  return issues;
}

/** Sessions and events missing correlationId / causationId linkage. */
export function detectMissingCorrelationMetadata(
  graph: ExecutionGraph,
): ExecutionGraphIssue[] {
  const issues: ExecutionGraphIssue[] = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.nodeType !== "execution_session") continue;
    const corr = node.metadata["correlationId"] as string | undefined;
    if (!corr) {
      issues.push(makeIssue(
        "missing_correlation_metadata", "info",
        node.id, node.refId,
        `Execution session "${node.refId}" has no correlationId.`,
        "Pass a correlationId when creating execution requests to enable chain tracing.",
      ));
    }
  }
  return issues;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeIssue(
  issueType:           string,
  severity:            GraphIssueSeverity,
  nodeId:              string | null,
  refId:               string | null,
  summary:             string,
  suggestedResolution: string,
): ExecutionGraphIssue {
  return {
    id: issueId(),
    issueType: issueType as GraphIssueType,
    severity,
    nodeId,
    refId,
    summary,
    suggestedResolution,
  };
}

/** Summary count helper for API responses. */
export function summarizeIssues(issues: ExecutionGraphIssue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    counts[issue.issueType] = (counts[issue.issueType] ?? 0) + 1;
  }
  return counts;
}
