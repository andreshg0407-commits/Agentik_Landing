/**
 * lib/copilot/memory-graph/memory-graph-repository.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Repository Contract
 *
 * Interface for persisting and querying graph data.
 * The in-memory implementation lives in graph-registry.ts.
 * The Prisma implementation lives in persistence/prisma-memory-graph-repository.ts.
 */

import type { GraphNode, GraphEdge, GraphNodeType, GraphEdgeType } from "./memory-graph-types";

// ── Repository interface ───────────────────────────────────────────────────────

export interface NodeFilter {
  orgSlug:    string;
  type?:      GraphNodeType;
  tags?:      string[];
  minWeight?: number;
  limit?:     number;
  offset?:    number;
}

export interface EdgeFilter {
  orgSlug:       string;
  type?:         GraphEdgeType;
  sourceNodeId?: string;
  targetNodeId?: string;
  minWeight?:    number;
  limit?:        number;
}

export interface MemoryGraphRepository {
  // ── Node operations ──────────────────────────────────────────────────────────
  saveNode(node: GraphNode): Promise<GraphNode>;
  saveNodes(nodes: GraphNode[]): Promise<GraphNode[]>;
  getNode(orgSlug: string, nodeId: string): Promise<GraphNode | null>;
  listNodes(filter: NodeFilter): Promise<GraphNode[]>;
  deleteNode(orgSlug: string, nodeId: string): Promise<void>;

  // ── Edge operations ──────────────────────────────────────────────────────────
  saveEdge(edge: GraphEdge): Promise<GraphEdge>;
  saveEdges(edges: GraphEdge[]): Promise<GraphEdge[]>;
  getEdge(orgSlug: string, edgeId: string): Promise<GraphEdge | null>;
  listEdges(filter: EdgeFilter): Promise<GraphEdge[]>;
  deleteEdge(orgSlug: string, edgeId: string): Promise<void>;

  // ── Graph queries ─────────────────────────────────────────────────────────────
  queryGraph(orgSlug: string, fromNodeId: string, maxDepth?: number): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>;

  // ── Stats ─────────────────────────────────────────────────────────────────────
  countNodes(orgSlug: string): Promise<number>;
  countEdges(orgSlug: string): Promise<number>;
}

// ── In-memory implementation ───────────────────────────────────────────────────

/**
 * InMemoryGraphRepository — uses the graph-registry for storage.
 * This is the default implementation, suitable for tests and development.
 */
export class InMemoryGraphRepository implements MemoryGraphRepository {
  private readonly _nodes = new Map<string, Map<string, GraphNode>>();
  private readonly _edges = new Map<string, Map<string, GraphEdge>>();

  private _orgNodes(orgSlug: string) {
    if (!this._nodes.has(orgSlug)) this._nodes.set(orgSlug, new Map());
    return this._nodes.get(orgSlug)!;
  }

  private _orgEdges(orgSlug: string) {
    if (!this._edges.has(orgSlug)) this._edges.set(orgSlug, new Map());
    return this._edges.get(orgSlug)!;
  }

  async saveNode(node: GraphNode): Promise<GraphNode> {
    this._orgNodes(node.orgSlug).set(node.id, node);
    return node;
  }

  async saveNodes(nodes: GraphNode[]): Promise<GraphNode[]> {
    for (const n of nodes) await this.saveNode(n);
    return nodes;
  }

  async getNode(orgSlug: string, nodeId: string): Promise<GraphNode | null> {
    return this._orgNodes(orgSlug).get(nodeId) ?? null;
  }

  async listNodes(filter: NodeFilter): Promise<GraphNode[]> {
    let nodes = Array.from(this._orgNodes(filter.orgSlug).values());
    if (filter.type)      nodes = nodes.filter(n => n.type === filter.type);
    if (filter.tags?.length) nodes = nodes.filter(n => filter.tags!.some(t => n.tags.includes(t)));
    if (filter.minWeight !== undefined) nodes = nodes.filter(n => n.weight >= filter.minWeight!);
    if (filter.offset) nodes = nodes.slice(filter.offset);
    if (filter.limit)  nodes = nodes.slice(0, filter.limit);
    return nodes;
  }

  async deleteNode(orgSlug: string, nodeId: string): Promise<void> {
    this._orgNodes(orgSlug).delete(nodeId);
  }

  async saveEdge(edge: GraphEdge): Promise<GraphEdge> {
    this._orgEdges(edge.orgSlug).set(edge.id, edge);
    return edge;
  }

  async saveEdges(edges: GraphEdge[]): Promise<GraphEdge[]> {
    for (const e of edges) await this.saveEdge(e);
    return edges;
  }

  async getEdge(orgSlug: string, edgeId: string): Promise<GraphEdge | null> {
    return this._orgEdges(orgSlug).get(edgeId) ?? null;
  }

  async listEdges(filter: EdgeFilter): Promise<GraphEdge[]> {
    let edges = Array.from(this._orgEdges(filter.orgSlug).values());
    if (filter.type)         edges = edges.filter(e => e.type === filter.type);
    if (filter.sourceNodeId) edges = edges.filter(e => e.sourceNodeId === filter.sourceNodeId);
    if (filter.targetNodeId) edges = edges.filter(e => e.targetNodeId === filter.targetNodeId);
    if (filter.minWeight !== undefined) edges = edges.filter(e => e.weight >= filter.minWeight!);
    if (filter.limit)  edges = edges.slice(0, filter.limit);
    return edges;
  }

  async deleteEdge(orgSlug: string, edgeId: string): Promise<void> {
    this._orgEdges(orgSlug).delete(edgeId);
  }

  async queryGraph(orgSlug: string, fromNodeId: string, maxDepth = 2) {
    // BFS using in-memory edges
    const seenNodes = new Map<string, GraphNode>();
    const seenEdges = new Map<string, GraphEdge>();
    const queue: Array<{ id: string; depth: number }> = [{ id: fromNodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (seenNodes.has(id) || depth > maxDepth) continue;
      const node = await this.getNode(orgSlug, id);
      if (!node) continue;
      seenNodes.set(id, node);

      if (depth < maxDepth) {
        const edges = await this.listEdges({ orgSlug, sourceNodeId: id });
        const inbound = await this.listEdges({ orgSlug, targetNodeId: id });
        for (const e of [...edges, ...inbound]) {
          seenEdges.set(e.id, e);
          const nextId = e.sourceNodeId === id ? e.targetNodeId : e.sourceNodeId;
          if (!seenNodes.has(nextId)) queue.push({ id: nextId, depth: depth + 1 });
        }
      }
    }

    return {
      nodes: Array.from(seenNodes.values()),
      edges: Array.from(seenEdges.values()),
    };
  }

  async countNodes(orgSlug: string): Promise<number> {
    return this._orgNodes(orgSlug).size;
  }

  async countEdges(orgSlug: string): Promise<number> {
    return this._orgEdges(orgSlug).size;
  }
}
