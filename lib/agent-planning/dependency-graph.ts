/**
 * lib/agent-planning/dependency-graph.ts
 *
 * Agentik Runtime Planning — Dependency Graph Builder
 *
 * Constructs a directed dependency graph from ActionEnvelopes,
 * AgentDelegations, and RuntimeMemoryNodes/Edges.
 *
 * Cycle detection: DFS with gray/black marking.
 * Cycles are reported, never silently broken.
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

import type { ActionEnvelope }    from "@/lib/agent-runtime/action-envelope";
import type { AgentDelegation }   from "@/lib/agent-orchestration/delegation-types";
import type { RuntimeMemoryNode } from "@/lib/agent-memory/runtime-memory-types";
import type { RuntimeMemoryEdge } from "@/lib/agent-memory/runtime-memory-types";
import type { DependencyGraph, DependencyNode } from "./planning-types";

// ── Graph builder ─────────────────────────────────────────────────────────────

export function buildDependencyGraph(
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
  memoryNodes: RuntimeMemoryNode[],
  memoryEdges: RuntimeMemoryEdge[],
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();

  // ── 1. Add action nodes ───────────────────────────────────────────────────
  for (const e of envelopes) {
    const nid = e.agentActionId ?? e.actionTaskId ?? e.id;
    nodes.set(nid, {
      id:       nid,
      nodeType: "action",
      agentId:  String(e.sourceAgentId),
      moduleId: e.moduleKey,
      status:   e.agentStatus,
      label:    e.title,
      outEdges: [],
      inEdges:  [],
    });
  }

  // ── 2. Add delegation nodes ───────────────────────────────────────────────
  for (const d of delegations) {
    nodes.set(d.id, {
      id:       d.id,
      nodeType: "delegation",
      agentId:  d.sourceAgentId,
      moduleId: d.sourceModuleId,
      status:   d.status,
      label:    `Del: ${d.sourceAgentId}→${d.targetAgentId} (${d.reason})`,
      outEdges: [],
      inEdges:  [],
    });
  }

  // ── 3. Add memory event nodes (decision_point only) ───────────────────────
  for (const n of memoryNodes) {
    if (n.nodeType !== "decision_point") continue;
    if (nodes.has(n.id)) continue;
    nodes.set(n.id, {
      id:       n.id,
      nodeType: "memory",
      agentId:  String(n.agentId),
      moduleId: n.moduleId,
      status:   n.lifecycleState,
      label:    n.summary,
      outEdges: [],
      inEdges:  [],
    });
  }

  // ── 4. Wire delegation → action edges ────────────────────────────────────
  // A delegation "depends_on" its parent action (delegation blocks until action resolves)
  for (const d of delegations) {
    if (!d.parentActionId) continue;
    const parentId = d.parentActionId;
    const delNode  = nodes.get(d.id);
    const parNode  = nodes.get(parentId);
    if (!delNode || !parNode) continue;

    // delegation depends on parent action
    if (!delNode.outEdges.includes(parentId)) delNode.outEdges.push(parentId);
    if (!parNode.inEdges.includes(d.id))      parNode.inEdges.push(d.id);
  }

  // ── 5. Wire memory edges (depends_on, blocks, resolves) ──────────────────
  const DEPENDENCY_RELS = new Set(["depends_on", "blocks", "resolves", "caused_by"]);
  for (const edge of memoryEdges) {
    if (!DEPENDENCY_RELS.has(edge.relationType)) continue;
    const srcNode = nodes.get(edge.sourceId);
    const tgtNode = nodes.get(edge.targetId);
    if (!srcNode || !tgtNode) continue;

    if (!srcNode.outEdges.includes(edge.targetId)) srcNode.outEdges.push(edge.targetId);
    if (!tgtNode.inEdges.includes(edge.sourceId))  tgtNode.inEdges.push(edge.sourceId);
  }

  // ── 6. Wire agent-to-agent domain dependencies ───────────────────────────
  // David commercial production → depends on Diego financial review if delegation exists
  for (const e of envelopes) {
    if (String(e.sourceAgentId) !== "david_commercial") continue;
    if (e.agentStatus !== "pending_approval" && e.agentStatus !== "approved") continue;
    const eid = e.agentActionId ?? e.actionTaskId ?? e.id;
    const actionNode = nodes.get(eid);
    if (!actionNode) continue;

    // Find delegations that reference this action
    const blocking = delegations.filter(d =>
      d.parentActionId === eid &&
      !["completed", "rejected", "canceled", "expired"].includes(d.status),
    );
    for (const d of blocking) {
      const delNode = nodes.get(d.id);
      if (!delNode) continue;
      if (!actionNode.outEdges.includes(d.id)) actionNode.outEdges.push(d.id);
      if (!delNode.inEdges.includes(eid))      delNode.inEdges.push(eid);
    }
  }

  // ── 7. Identify root and leaf nodes ──────────────────────────────────────
  const rootNodeIds: string[] = [];
  const leafNodeIds: string[] = [];
  const orphanIds:   string[] = [];

  for (const [id, node] of nodes) {
    const hasIn  = node.inEdges.length  > 0;
    const hasOut = node.outEdges.length > 0;
    if (!hasIn)  rootNodeIds.push(id);
    if (!hasOut) leafNodeIds.push(id);
    if (!hasIn && !hasOut) orphanIds.push(id);
  }

  // ── 8. Detect cycles via DFS ─────────────────────────────────────────────
  const cycles = detectCycles(nodes);

  return { nodes, rootNodeIds, leafNodeIds, cycles, orphanIds };
}

// ── Cycle detection (DFS gray/black) ─────────────────────────────────────────

function detectCycles(nodes: Map<string, DependencyNode>): string[][] {
  const color = new Map<string, "white" | "gray" | "black">();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];

  for (const id of nodes.keys()) color.set(id, "white");

  function dfs(nodeId: string): void {
    color.set(nodeId, "gray");
    const node = nodes.get(nodeId);
    if (!node) return;

    for (const neighborId of node.outEdges) {
      const c = color.get(neighborId);
      if (c === "gray") {
        // Found cycle — trace back
        const cycle: string[] = [neighborId];
        let cur: string | null | undefined = nodeId;
        const seen = new Set<string>();
        while (cur && cur !== neighborId && !seen.has(cur)) {
          cycle.push(cur);
          seen.add(cur);
          cur = parent.get(cur);
        }
        cycle.push(neighborId);
        cycle.reverse();
        cycles.push(cycle);
      } else if (c === "white") {
        parent.set(neighborId, nodeId);
        dfs(neighborId);
      }
    }
    color.set(nodeId, "black");
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === "white") dfs(id);
  }

  return cycles;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getRootActions(
  graph:     DependencyGraph,
  envelopes: ActionEnvelope[],
): ActionEnvelope[] {
  const rootIds = new Set(graph.rootNodeIds);
  return envelopes.filter(e => {
    const eid = e.agentActionId ?? e.actionTaskId ?? e.id;
    return rootIds.has(eid);
  });
}

export function getBlockedActions(
  graph:     DependencyGraph,
  envelopes: ActionEnvelope[],
): ActionEnvelope[] {
  return envelopes.filter(e => {
    const eid  = e.agentActionId ?? e.actionTaskId ?? e.id;
    const node = graph.nodes.get(eid);
    if (!node) return false;
    // Blocked if any outgoing dependency node is non-terminal
    return node.outEdges.some(depId => {
      const dep = graph.nodes.get(depId);
      if (!dep) return false;
      return !["completed", "rejected", "canceled", "expired", "failed"].includes(dep.status);
    });
  });
}

export function getReadyActions(
  graph:     DependencyGraph,
  envelopes: ActionEnvelope[],
): ActionEnvelope[] {
  const blocked = new Set(getBlockedActions(graph, envelopes).map(e =>
    e.agentActionId ?? e.actionTaskId ?? e.id,
  ));
  return envelopes.filter(e => {
    const eid = e.agentActionId ?? e.actionTaskId ?? e.id;
    return (
      !blocked.has(eid) &&
      (e.agentStatus === "approved" || (!e.requiresApproval && e.agentStatus !== "failed"))
    );
  });
}

export function getDependencyChain(
  graph:    DependencyGraph,
  actionId: string,
): string[] {
  const visited = new Set<string>();
  const chain:   string[] = [];

  function traverse(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    chain.push(id);
    const node = graph.nodes.get(id);
    if (!node) return;
    for (const dep of node.outEdges) traverse(dep);
  }

  traverse(actionId);
  return chain;
}

export function detectOrphanDependencies(graph: DependencyGraph): string[] {
  return [...graph.orphanIds];
}
