/**
 * lib/copilot/memory-graph/traversal-engine.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Traversal Engine
 *
 * BFS/DFS graph traversal. All operations are org-scoped.
 * Never throws — returns empty results on error.
 */

import type { GraphNode, GraphEdge, GraphPath, GraphTraversal } from "./memory-graph-types";
import { GRAPH_MAX_DEPTH } from "./memory-graph-types";
import { getNode, listEdges, edgesFrom, edgesTo } from "./graph-registry";

// ── Neighbors ──────────────────────────────────────────────────────────────────

/**
 * neighbors — get all directly connected nodes (outbound + inbound).
 */
export function neighbors(orgSlug: string, nodeId: string): GraphNode[] {
  const outbound = edgesFrom(orgSlug, nodeId).map(e => e.targetNodeId);
  const inbound  = edgesTo(orgSlug, nodeId).map(e => e.sourceNodeId);
  const ids = [...new Set([...outbound, ...inbound])];
  return ids.flatMap(id => {
    const node = getNode(orgSlug, id);
    return node ? [node] : [];
  });
}

/**
 * parents — nodes that have edges pointing TO nodeId (inbound).
 */
export function parents(orgSlug: string, nodeId: string): GraphNode[] {
  return edgesTo(orgSlug, nodeId).flatMap(e => {
    const node = getNode(orgSlug, e.sourceNodeId);
    return node ? [node] : [];
  });
}

/**
 * children — nodes that nodeId points TO (outbound).
 */
export function children(orgSlug: string, nodeId: string): GraphNode[] {
  return edgesFrom(orgSlug, nodeId).flatMap(e => {
    const node = getNode(orgSlug, e.targetNodeId);
    return node ? [node] : [];
  });
}

// ── Path finding ───────────────────────────────────────────────────────────────

/**
 * findPath — BFS shortest path between two nodes in the same org.
 * Returns a GraphPath with exists=false if no path found.
 */
export function findPath(
  orgSlug:    string,
  startId:    string,
  endId:      string,
  maxDepth:   number = GRAPH_MAX_DEPTH,
): GraphPath {
  const noPath: GraphPath = { orgSlug, nodes: [], edges: [], length: 0, exists: false };

  try {
    if (startId === endId) {
      const node = getNode(orgSlug, startId);
      if (!node) return noPath;
      return { orgSlug, nodes: [node], edges: [], length: 0, exists: true };
    }

    // BFS
    const visited = new Set<string>([startId]);
    const queue: Array<{ nodeId: string; path: string[]; edgePath: string[] }> = [
      { nodeId: startId, path: [startId], edgePath: [] },
    ];

    const edges = listEdges(orgSlug);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.path.length > maxDepth + 1) continue;

      // Get all adjacent edges
      const adjacent = edges.filter(
        e => e.sourceNodeId === current.nodeId || e.targetNodeId === current.nodeId,
      );

      for (const edge of adjacent) {
        const nextId = edge.sourceNodeId === current.nodeId ? edge.targetNodeId : edge.sourceNodeId;
        if (visited.has(nextId)) continue;
        visited.add(nextId);

        const newPath     = [...current.path, nextId];
        const newEdgePath = [...current.edgePath, edge.id];

        if (nextId === endId) {
          // Found — reconstruct GraphPath
          const pathNodes = newPath.flatMap(id => {
            const n = getNode(orgSlug, id);
            return n ? [n] : [];
          });
          const pathEdges = newEdgePath.flatMap(eid => {
            const e = edges.find(x => x.id === eid);
            return e ? [e] : [];
          });
          return { orgSlug, nodes: pathNodes, edges: pathEdges, length: pathEdges.length, exists: true };
        }

        queue.push({ nodeId: nextId, path: newPath, edgePath: newEdgePath });
      }
    }

    return noPath;
  } catch {
    return noPath;
  }
}

/**
 * findPaths — find up to maxPaths paths between two nodes.
 * Uses DFS with path deduplication.
 */
export function findPaths(
  orgSlug:   string,
  startId:   string,
  endId:     string,
  maxPaths:  number = 3,
  maxDepth:  number = GRAPH_MAX_DEPTH,
): GraphPath[] {
  const results: GraphPath[] = [];

  try {
    const edges = listEdges(orgSlug);

    function dfs(
      current: string,
      visited: Set<string>,
      path: string[],
      edgePath: string[],
    ): void {
      if (results.length >= maxPaths) return;
      if (path.length > maxDepth + 1) return;

      if (current === endId && path.length > 1) {
        const pathNodes = path.flatMap(id => {
          const n = getNode(orgSlug, id);
          return n ? [n] : [];
        });
        const pathEdges = edgePath.flatMap(eid => {
          const e = edges.find(x => x.id === eid);
          return e ? [e] : [];
        });
        results.push({ orgSlug, nodes: pathNodes, edges: pathEdges, length: pathEdges.length, exists: true });
        return;
      }

      const adjacent = edges.filter(
        e => e.sourceNodeId === current || e.targetNodeId === current,
      );

      for (const edge of adjacent) {
        const nextId = edge.sourceNodeId === current ? edge.targetNodeId : edge.sourceNodeId;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        dfs(nextId, visited, [...path, nextId], [...edgePath, edge.id]);
        visited.delete(nextId);
      }
    }

    dfs(startId, new Set([startId]), [startId], []);
  } catch { /* return what we have */ }

  return results;
}

/**
 * shortestPath — alias for findPath (already BFS-based).
 */
export function shortestPath(orgSlug: string, startId: string, endId: string): GraphPath {
  return findPath(orgSlug, startId, endId);
}

// ── BFS traversal ──────────────────────────────────────────────────────────────

/**
 * bfsTraversal — full BFS from a start node up to maxDepth hops.
 * Returns a GraphTraversal record.
 */
export function bfsTraversal(
  orgSlug:   string,
  startId:   string,
  maxDepth:  number = GRAPH_MAX_DEPTH,
): GraphTraversal {
  const visited: string[] = [];
  const pathNodes: GraphNode[] = [];
  const pathEdges: GraphEdge[] = [];

  try {
    const startNode = getNode(orgSlug, startId);
    if (!startNode) {
      return _emptyTraversal(orgSlug, startId, maxDepth);
    }

    const seenNodes = new Set<string>([startId]);
    const seenEdges = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: startId, depth: 0 }];
    const edges = listEdges(orgSlug);

    visited.push(startId);
    pathNodes.push(startNode);

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const adjacent = edges.filter(
        e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
      );

      for (const edge of adjacent) {
        const nextId = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;

        if (!seenEdges.has(edge.id)) {
          seenEdges.add(edge.id);
          pathEdges.push(edge);
        }

        if (seenNodes.has(nextId)) continue;
        seenNodes.add(nextId);
        visited.push(nextId);

        const nextNode = getNode(orgSlug, nextId);
        if (nextNode) pathNodes.push(nextNode);
        queue.push({ nodeId: nextId, depth: depth + 1 });
      }
    }
  } catch { /* return partial */ }

  const path: GraphPath = {
    orgSlug,
    nodes:  pathNodes,
    edges:  pathEdges,
    length: pathEdges.length,
    exists: pathNodes.length > 0,
  };

  return { orgSlug, startNodeId: startId, visited, path, maxDepth, traversedAt: new Date().toISOString() };
}

// ── Depth-bounded node sets ────────────────────────────────────────────────────

/**
 * nodesWithinDepth — all node IDs reachable from startId within maxDepth hops.
 */
export function nodesWithinDepth(orgSlug: string, startId: string, maxDepth = 2): string[] {
  const t = bfsTraversal(orgSlug, startId, maxDepth);
  return t.visited;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _emptyTraversal(orgSlug: string, startId: string, maxDepth: number): GraphTraversal {
  return {
    orgSlug, startNodeId: startId, visited: [], maxDepth, traversedAt: new Date().toISOString(),
    path: { orgSlug, nodes: [], edges: [], length: 0, exists: false },
  };
}
