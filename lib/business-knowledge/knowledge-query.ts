/**
 * knowledge-query.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Query contracts for the Business Knowledge Graph.
 *
 * Queries allow consumers to traverse the graph without
 * knowing its internal structure or storage mechanism.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { BusinessEntityType } from "./knowledge-types";
import type { KnowledgeRelationType, KnowledgeEdgeDirection } from "./knowledge-types";
import type { KnowledgeNode } from "./knowledge-node";
import type { KnowledgeEdge } from "./knowledge-edge";

// -- Query ----------------------------------------------------------------

/**
 * A structured query against the Knowledge Graph.
 *
 * All fields are optional — omitted fields are not filtered.
 */
export interface KnowledgeQuery {
  /** Filter by entity ID. */
  entityId?: string;
  /** Filter by entity type. */
  entityType?: BusinessEntityType;
  /** Filter by relation type. */
  relationType?: KnowledgeRelationType;
  /** Filter by edge direction. */
  direction?: KnowledgeEdgeDirection;
  /** Maximum depth for traversal (default: 1). */
  depth?: number;
  /** Maximum results to return. */
  maxResults?: number;
  /** Include inactive entities (default: false). */
  includeInactive?: boolean;
  /** Include weak relations (weight < 30) (default: false). */
  includeWeakRelations?: boolean;
  /** Minimum confidence threshold (default: 0). */
  minConfidence?: number;
  /** Filter by tags (any match). */
  tags?: string[];
  /** Filter by organization ID. */
  organizationId?: string;
}

// -- Query Result ---------------------------------------------------------

/** Result of a Knowledge Graph query. */
export interface KnowledgeQueryResult {
  /** Matching nodes. */
  nodes: KnowledgeNode[];
  /** Edges connecting the matching nodes. */
  edges: KnowledgeEdge[];
  /** Total nodes that matched (before maxResults limit). */
  totalMatches: number;
  /** Whether the result was truncated by maxResults. */
  truncated: boolean;
  /** Query execution time in milliseconds. */
  executionMs: number;
}

// -- Query Builders -------------------------------------------------------

/** Build a query to find all entities related to a given entity. */
export function relatedToQuery(
  organizationId: string,
  entityId: string,
  opts?: {
    relationType?: KnowledgeRelationType;
    depth?: number;
    maxResults?: number;
    includeInactive?: boolean;
  },
): KnowledgeQuery {
  return {
    organizationId,
    entityId,
    direction: "both",
    depth: opts?.depth ?? 1,
    maxResults: opts?.maxResults ?? 100,
    includeInactive: opts?.includeInactive ?? false,
    relationType: opts?.relationType,
  };
}

/** Build a query to find dependencies of an entity. */
export function dependenciesOfQuery(
  organizationId: string,
  entityId: string,
  depth?: number,
): KnowledgeQuery {
  return {
    organizationId,
    entityId,
    relationType: "depends_on",
    direction: "outgoing",
    depth: depth ?? 2,
    maxResults: 50,
  };
}

/** Build a query to find entities affected by changes to a given entity. */
export function affectedByQuery(
  organizationId: string,
  entityId: string,
  depth?: number,
): KnowledgeQuery {
  return {
    organizationId,
    entityId,
    relationType: "affects",
    direction: "outgoing",
    depth: depth ?? 2,
    maxResults: 100,
  };
}

/** Build a query for all entities of a given type. */
export function entitiesByTypeQuery(
  organizationId: string,
  entityType: BusinessEntityType,
  maxResults?: number,
): KnowledgeQuery {
  return {
    organizationId,
    entityType,
    maxResults: maxResults ?? 200,
    includeInactive: false,
  };
}

/** Build a subgraph query starting from an entity. */
export function subgraphQuery(
  organizationId: string,
  entityId: string,
  depth?: number,
): KnowledgeQuery {
  return {
    organizationId,
    entityId,
    direction: "both",
    depth: depth ?? 3,
    maxResults: 500,
    includeInactive: false,
    includeWeakRelations: false,
  };
}
