/**
 * lib/copilot/memory-graph/persistence/prisma-memory-graph-repository.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Prisma Persistence Repository
 *
 * Server-only. Implements MemoryGraphRepository using Prisma.
 * Maps between GraphNode/GraphEdge domain types and Prisma models.
 */

import "server-only";

import type { GraphNode, GraphEdge } from "../memory-graph-types";
import type {
  MemoryGraphRepository,
  NodeFilter,
  EdgeFilter,
} from "../memory-graph-repository";
import { prisma } from "@/lib/prisma";

// ── Prisma-backed implementation ───────────────────────────────────────────────

export class PrismaMemoryGraphRepository implements MemoryGraphRepository {

  // ── Node operations ──────────────────────────────────────────────────────────

  async saveNode(node: GraphNode): Promise<GraphNode> {
    await (prisma as any).memoryGraphNode.upsert({
      where: { id: node.id },
      update: {
        label:     node.label,
        metadata:  node.metadata,
        tags:      node.tags,
        weight:    node.weight,
        updatedAt: new Date(),
      },
      create: {
        id:        node.id,
        orgSlug:   node.orgSlug,
        nodeType:  node.type,
        label:     node.label,
        metadata:  node.metadata,
        source:    node.source,
        tags:      node.tags,
        weight:    node.weight,
        createdAt: new Date(node.createdAt),
      },
    });
    return node;
  }

  async saveNodes(nodes: GraphNode[]): Promise<GraphNode[]> {
    for (const n of nodes) await this.saveNode(n);
    return nodes;
  }

  async getNode(orgSlug: string, nodeId: string): Promise<GraphNode | null> {
    const row = await (prisma as any).memoryGraphNode.findFirst({
      where: { id: nodeId, orgSlug },
    });
    if (!row) return null;
    return _rowToNode(row);
  }

  async listNodes(filter: NodeFilter): Promise<GraphNode[]> {
    const rows = await (prisma as any).memoryGraphNode.findMany({
      where: {
        orgSlug:  filter.orgSlug,
        nodeType: filter.type,
        weight:   filter.minWeight !== undefined ? { gte: filter.minWeight } : undefined,
      },
      take:  filter.limit,
      skip:  filter.offset,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(_rowToNode);
  }

  async deleteNode(orgSlug: string, nodeId: string): Promise<void> {
    await (prisma as any).memoryGraphNode.deleteMany({
      where: { id: nodeId, orgSlug },
    });
  }

  // ── Edge operations ──────────────────────────────────────────────────────────

  async saveEdge(edge: GraphEdge): Promise<GraphEdge> {
    await (prisma as any).memoryGraphEdge.upsert({
      where: { id: edge.id },
      update: {
        weight:    edge.weight,
        label:     edge.label,
        metadata:  edge.metadata,
        reasoning: edge.reasoning,
      },
      create: {
        id:           edge.id,
        orgSlug:      edge.orgSlug,
        edgeType:     edge.type,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        weight:       edge.weight,
        label:        edge.label,
        metadata:     edge.metadata,
        source:       edge.source,
        reasoning:    edge.reasoning,
        createdAt:    new Date(edge.createdAt),
      },
    });
    return edge;
  }

  async saveEdges(edges: GraphEdge[]): Promise<GraphEdge[]> {
    for (const e of edges) await this.saveEdge(e);
    return edges;
  }

  async getEdge(orgSlug: string, edgeId: string): Promise<GraphEdge | null> {
    const row = await (prisma as any).memoryGraphEdge.findFirst({
      where: { id: edgeId, orgSlug },
    });
    if (!row) return null;
    return _rowToEdge(row);
  }

  async listEdges(filter: EdgeFilter): Promise<GraphEdge[]> {
    const rows = await (prisma as any).memoryGraphEdge.findMany({
      where: {
        orgSlug:      filter.orgSlug,
        edgeType:     filter.type,
        sourceNodeId: filter.sourceNodeId,
        targetNodeId: filter.targetNodeId,
        weight:       filter.minWeight !== undefined ? { gte: filter.minWeight } : undefined,
      },
      take:    filter.limit,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(_rowToEdge);
  }

  async deleteEdge(orgSlug: string, edgeId: string): Promise<void> {
    await (prisma as any).memoryGraphEdge.deleteMany({
      where: { id: edgeId, orgSlug },
    });
  }

  async queryGraph(orgSlug: string, fromNodeId: string, maxDepth = 2): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }> {
    // BFS using DB queries
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
        const outbound = await this.listEdges({ orgSlug, sourceNodeId: id });
        const inbound  = await this.listEdges({ orgSlug, targetNodeId: id });

        for (const e of [...outbound, ...inbound]) {
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
    return (prisma as any).memoryGraphNode.count({ where: { orgSlug } });
  }

  async countEdges(orgSlug: string): Promise<number> {
    return (prisma as any).memoryGraphEdge.count({ where: { orgSlug } });
  }
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function _rowToNode(row: any): GraphNode {
  return {
    id:        row.id,
    orgSlug:   row.orgSlug,
    type:      row.nodeType,
    label:     row.label,
    metadata:  (row.metadata as Record<string, unknown>) ?? {},
    source:    row.source,
    tags:      row.tags ?? [],
    weight:    row.weight ?? 0.5,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

function _rowToEdge(row: any): GraphEdge {
  return {
    id:           row.id,
    orgSlug:      row.orgSlug,
    type:         row.edgeType,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    weight:       row.weight ?? 0.5,
    label:        row.label,
    metadata:     (row.metadata as Record<string, unknown>) ?? {},
    source:       row.source,
    reasoning:    row.reasoning,
    createdAt:    row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}
