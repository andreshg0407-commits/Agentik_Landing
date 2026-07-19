/**
 * lib/copilot/memory-graph/graph-engine.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Core Engine
 *
 * Single entry point for creating, reading, updating, and deleting
 * nodes and edges. Delegates to the registry for storage.
 * Enforces tenant isolation. Never throws — all errors returned.
 */

import type { GraphNode, GraphEdge, GraphValidationResult } from "./memory-graph-types";
import type { BuildNodeInput } from "./node-builder";
import type { BuildEdgeInput } from "./edge-builder";
import { buildNode } from "./node-builder";
import { buildEdge } from "./edge-builder";
import {
  registerNode, registerEdge, removeNode, removeEdge,
  getNode, getEdge, listNodes, listEdges, hasNode,
  edgesFrom, edgesTo, registryStats,
} from "./graph-registry";
import type { RegistryStats } from "./graph-registry";

export type { RegistryStats };

// ── Node operations ────────────────────────────────────────────────────────────

/**
 * createNode — build and register a node.
 * Returns the created node, or null on failure.
 */
export function createNode(input: BuildNodeInput): GraphNode | null {
  try {
    const node = buildNode(input);
    registerNode(node);
    return node;
  } catch {
    return null;
  }
}

/**
 * upsertNode — if a node with the same ID already exists, update its label/metadata.
 * If not, create it.
 */
export function upsertNode(input: BuildNodeInput): GraphNode | null {
  try {
    const node = buildNode(input);
    const existing = getNode(node.orgSlug, node.id);
    if (existing) {
      const updated: GraphNode = {
        ...existing,
        label:     node.label,
        metadata:  { ...existing.metadata, ...node.metadata },
        tags:      [...new Set([...existing.tags, ...node.tags])],
        updatedAt: new Date().toISOString(),
      };
      registerNode(updated);
      return updated;
    }
    registerNode(node);
    return node;
  } catch {
    return null;
  }
}

/** deleteNode — remove node and all its edges. */
export function deleteNode(orgSlug: string, nodeId: string): void {
  removeNode(orgSlug, nodeId);
}

/** fetchNode — safe node retrieval. */
export function fetchNode(orgSlug: string, nodeId: string): GraphNode | undefined {
  return getNode(orgSlug, nodeId);
}

// ── Edge operations ────────────────────────────────────────────────────────────

/**
 * createEdge — build and register an edge.
 * Fails silently if either node doesn't exist (fail-closed).
 * Returns the created edge, or null on failure.
 */
export function createEdge(input: BuildEdgeInput): GraphEdge | null {
  try {
    // Both nodes must exist and be in the same org
    if (!hasNode(input.orgSlug, input.sourceNodeId)) return null;
    if (!hasNode(input.orgSlug, input.targetNodeId)) return null;
    const edge = buildEdge(input);
    registerEdge(edge);
    return edge;
  } catch {
    return null;
  }
}

/** deleteEdge — remove a single edge. */
export function deleteEdge(orgSlug: string, edgeId: string): void {
  removeEdge(orgSlug, edgeId);
}

/** fetchEdge — safe edge retrieval. */
export function fetchEdge(orgSlug: string, edgeId: string): GraphEdge | undefined {
  return getEdge(orgSlug, edgeId);
}

// ── Graph queries ──────────────────────────────────────────────────────────────

/** getAllNodes — list all nodes for an org. */
export function getAllNodes(orgSlug: string): GraphNode[] {
  return listNodes(orgSlug);
}

/** getAllEdges — list all edges for an org. */
export function getAllEdges(orgSlug: string): GraphEdge[] {
  return listEdges(orgSlug);
}

/** getOutboundEdges — edges going out from a node. */
export function getOutboundEdges(orgSlug: string, nodeId: string): GraphEdge[] {
  return edgesFrom(orgSlug, nodeId);
}

/** getInboundEdges — edges coming into a node. */
export function getInboundEdges(orgSlug: string, nodeId: string): GraphEdge[] {
  return edgesTo(orgSlug, nodeId);
}

/** getNeighborIds — IDs of all directly connected nodes. */
export function getNeighborIds(orgSlug: string, nodeId: string): string[] {
  const outbound = edgesFrom(orgSlug, nodeId).map(e => e.targetNodeId);
  const inbound  = edgesTo(orgSlug, nodeId).map(e => e.sourceNodeId);
  return [...new Set([...outbound, ...inbound])];
}

// ── Batch operations ───────────────────────────────────────────────────────────

/** addNodes — batch-register nodes. Returns count of successfully added nodes. */
export function addNodes(nodes: GraphNode[]): number {
  let count = 0;
  for (const node of nodes) {
    try {
      registerNode(node);
      count++;
    } catch { /* skip */ }
  }
  return count;
}

/** addEdges — batch-register edges. Returns count of successfully added edges. */
export function addEdges(edges: GraphEdge[]): number {
  let count = 0;
  for (const edge of edges) {
    try {
      registerEdge(edge);
      count++;
    } catch { /* skip */ }
  }
  return count;
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * validateGraph — basic structural validation for an org's graph.
 * Checks: orphan edges, cross-tenant, self-loops.
 * Never throws.
 */
export function validateGraph(orgSlug: string): GraphValidationResult {
  const errors: GraphValidationResult["errors"] = [];
  const warnings: string[] = [];

  try {
    const nodes = listNodes(orgSlug);
    const edges = listEdges(orgSlug);
    const nodeIds = new Set(nodes.map(n => n.id));

    // Check edge integrity
    for (const edge of edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        errors.push({ code: "ORPHAN_EDGE_SOURCE", message: `Edge ${edge.id} has missing source node`, edgeId: edge.id });
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        errors.push({ code: "ORPHAN_EDGE_TARGET", message: `Edge ${edge.id} has missing target node`, edgeId: edge.id });
      }
      if (edge.sourceNodeId === edge.targetNodeId) {
        errors.push({ code: "SELF_LOOP", message: `Edge ${edge.id} is a self-loop`, edgeId: edge.id });
      }
      if (edge.orgSlug !== orgSlug) {
        errors.push({ code: "CROSS_TENANT_EDGE", message: `Edge ${edge.id} belongs to different org`, edgeId: edge.id });
      }
    }

    // Check node integrity
    for (const node of nodes) {
      if (node.orgSlug !== orgSlug) {
        errors.push({ code: "CROSS_TENANT_NODE", message: `Node ${node.id} belongs to different org`, nodeId: node.id });
      }
      if (!node.source) {
        warnings.push(`Node ${node.id} has no source provenance`);
      }
    }
  } catch {
    errors.push({ code: "VALIDATION_ERROR", message: "Graph validation encountered an unexpected error" });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export { registryStats };
