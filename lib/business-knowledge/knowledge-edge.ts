/**
 * knowledge-edge.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Knowledge Graph edge — represents a relationship between two nodes.
 *
 * Extends BusinessEntityRelation with graph-specific metadata:
 * confidence, temporal validity, weight, and direction.
 *
 * No Prisma. No React. Pure domain types.
 */

import type {
  BusinessEntityType,
  KnowledgeRelationType,
  KnowledgeEdgeDirection,
} from "./knowledge-types";

// -- Knowledge Edge --------------------------------------------------------

export interface KnowledgeEdge {
  /** Unique edge ID. */
  edgeId: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** Source node ID in the graph. */
  sourceNodeId: string;
  /** Target node ID in the graph. */
  targetNodeId: string;
  /** Source business entity ID. */
  sourceEntityId: string;
  /** Target business entity ID. */
  targetEntityId: string;
  /** Source entity type. */
  sourceEntityType: BusinessEntityType;
  /** Target entity type. */
  targetEntityType: BusinessEntityType;
  /** The nature of this relationship. */
  relationType: KnowledgeRelationType;
  /** Direction of the relationship. */
  direction: KnowledgeEdgeDirection;
  /** Weight of the edge (0-100). Higher = stronger relationship. */
  weight: number;
  /** Confidence in this relationship (0-100). */
  confidence: number;
  /** Source system that established this relationship. */
  source: string;
  /** ISO timestamp from which this relationship is valid. Null = always. */
  validFrom: string | null;
  /** ISO timestamp until which this relationship is valid. Null = no expiry. */
  validTo: string | null;
  /** Arbitrary edge-specific metadata. */
  metadata: Record<string, unknown>;
  /** ISO timestamp when the edge was created in the graph. */
  createdAt: string;
  /** ISO timestamp when the edge was last updated. */
  updatedAt: string;
}

// -- Builder ---------------------------------------------------------------

let _edgeSeq = 0;

/** Generate a unique edge ID. */
export function nextEdgeId(): string {
  return `ke-${Date.now()}-${++_edgeSeq}`;
}

/** Build a KnowledgeEdge with sensible defaults. */
export function buildEdge(opts: {
  organizationId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceEntityType: BusinessEntityType;
  targetEntityType: BusinessEntityType;
  relationType: KnowledgeRelationType;
  direction?: KnowledgeEdgeDirection;
  weight?: number;
  confidence?: number;
  source?: string;
  validFrom?: string | null;
  validTo?: string | null;
  metadata?: Record<string, unknown>;
}): KnowledgeEdge {
  const now = new Date().toISOString();
  return {
    edgeId: nextEdgeId(),
    organizationId: opts.organizationId,
    sourceNodeId: opts.sourceNodeId,
    targetNodeId: opts.targetNodeId,
    sourceEntityId: opts.sourceEntityId,
    targetEntityId: opts.targetEntityId,
    sourceEntityType: opts.sourceEntityType,
    targetEntityType: opts.targetEntityType,
    relationType: opts.relationType,
    direction: opts.direction ?? "outgoing",
    weight: opts.weight ?? 100,
    confidence: opts.confidence ?? 100,
    source: opts.source ?? "knowledge-graph",
    validFrom: opts.validFrom ?? null,
    validTo: opts.validTo ?? null,
    metadata: opts.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
