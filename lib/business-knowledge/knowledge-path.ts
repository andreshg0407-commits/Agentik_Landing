/**
 * knowledge-path.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Path representation for the Business Knowledge Graph.
 *
 * A path is an ordered sequence of nodes connected by edges,
 * representing how two entities are related through intermediaries.
 *
 * Example:
 *   Product --(contained_in)--> Portfolio --(assigned_to)--> Vendor
 *
 * No Prisma. No React. Pure domain types.
 */

import type { KnowledgeNode } from "./knowledge-node";
import type { KnowledgeEdge } from "./knowledge-edge";

// -- Path -----------------------------------------------------------------

export interface KnowledgePath {
  /** Unique path ID. */
  pathId: string;
  /** Ordered list of nodes in the path (start to end). */
  nodes: KnowledgeNode[];
  /** Ordered list of edges connecting consecutive nodes. */
  edges: KnowledgeEdge[];
  /** Number of edges in the path. */
  length: number;
  /** Aggregate confidence (product of edge confidences, 0-100). */
  confidence: number;
  /** Human-readable explanation of the path. */
  explanation: string;
  /** Arbitrary path-specific metadata. */
  metadata: Record<string, unknown>;
}

// -- Path Builder ---------------------------------------------------------

let _pathSeq = 0;

/** Generate a unique path ID. */
export function nextPathId(): string {
  return `kp-${Date.now()}-${++_pathSeq}`;
}

/** Build a KnowledgePath from nodes and edges. */
export function buildPath(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  metadata?: Record<string, unknown>,
): KnowledgePath {
  const confidence = computePathConfidence(edges);
  const explanation = describePathSteps(nodes, edges);

  return {
    pathId: nextPathId(),
    nodes,
    edges,
    length: edges.length,
    confidence,
    explanation,
    metadata: metadata ?? {},
  };
}

// -- Path Helpers ---------------------------------------------------------

/** Compute aggregate confidence for a path (product of edge confidences). */
export function computePathConfidence(edges: KnowledgeEdge[]): number {
  if (edges.length === 0) return 100;
  const product = edges.reduce((acc, e) => acc * (e.confidence / 100), 1);
  return Math.round(product * 100);
}

/** Build a human-readable step-by-step explanation of a path. */
export function describePathSteps(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
): string {
  if (nodes.length === 0) return "Camino vacio";
  if (nodes.length === 1) return nodes[0].label;

  const steps: string[] = [];
  for (let i = 0; i < edges.length; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const edge = edges[i];
    if (from && to && edge) {
      steps.push(`${from.label} --(${edge.relationType})--> ${to.label}`);
    }
  }
  return steps.join(" | ");
}

/** Get the start node of a path. */
export function pathStart(path: KnowledgePath): KnowledgeNode | null {
  return path.nodes[0] ?? null;
}

/** Get the end node of a path. */
export function pathEnd(path: KnowledgePath): KnowledgeNode | null {
  return path.nodes[path.nodes.length - 1] ?? null;
}
