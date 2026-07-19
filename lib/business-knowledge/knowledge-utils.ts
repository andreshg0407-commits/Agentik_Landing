/**
 * knowledge-utils.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Utility functions for the Business Knowledge Graph.
 *
 * Includes: normalization, deduplication, filtering, conversion
 * from Business Entities Core contracts to Knowledge Graph contracts.
 *
 * No Prisma. No React. Pure domain helpers.
 */

import type { BusinessEntity, BusinessEntitySnapshot, BusinessEntityRelation } from "@/lib/business-entities/core";
import type { KnowledgeNode } from "./knowledge-node";
import type { KnowledgeEdge } from "./knowledge-edge";
import type { KnowledgeRelationType } from "./knowledge-types";
import { buildNode, nextNodeId } from "./knowledge-node";
import { buildEdge } from "./knowledge-edge";

// -- ID Normalization ------------------------------------------------------

/** Normalize an entity ID into a graph-safe node ID. */
export function normalizeNodeId(entityId: string, entityType: string): string {
  return `${entityType}::${entityId}`;
}

/** Create an edge ID from source and target node IDs + relation type. */
export function createEdgeId(
  sourceNodeId: string,
  targetNodeId: string,
  relationType: string,
): string {
  return `${sourceNodeId}--${relationType}-->${targetNodeId}`;
}

// -- Conversion: BusinessEntitySnapshot → KnowledgeNode -------------------

/** Convert a BusinessEntitySnapshot into a KnowledgeNode. */
export function snapshotToNode(
  snapshot: BusinessEntitySnapshot,
): KnowledgeNode {
  const e = snapshot.entity;
  return buildNode({
    organizationId: e.organizationId,
    entityId: e.entityId,
    entityType: e.entityType,
    label: e.displayName,
    description: e.aiContext?.summary ?? null,
    health: e.health.overall.level,
    severity: e.state.severity,
    active: e.status === "active",
    tags: [],
    freshness: e.dataFreshness.level,
    metadata: e.metadata,
  });
}

/** Convert a BusinessEntity into a KnowledgeNode. */
export function entityToNode(
  entity: BusinessEntity,
): KnowledgeNode {
  return buildNode({
    organizationId: entity.organizationId,
    entityId: entity.entityId,
    entityType: entity.entityType,
    label: entity.displayName,
    description: entity.aiContext?.summary ?? null,
    health: entity.health.overall.level,
    severity: entity.state.severity,
    active: entity.status === "active",
    tags: [],
    freshness: entity.dataFreshness.level,
    metadata: entity.metadata,
  });
}

// -- Conversion: BusinessEntityRelation → KnowledgeEdge -------------------

/**
 * Convert a BusinessEntityRelation into a KnowledgeEdge.
 *
 * Requires source and target node IDs (from the graph).
 * Relation strength maps to edge weight.
 */
export function relationToEdge(
  relation: BusinessEntityRelation,
  organizationId: string,
  sourceNodeId: string,
  targetNodeId: string,
): KnowledgeEdge {
  const weight = strengthToWeight(relation.strength);

  return buildEdge({
    organizationId,
    sourceNodeId,
    targetNodeId,
    sourceEntityId: relation.sourceEntityId,
    targetEntityId: relation.targetEntityId,
    sourceEntityType: relation.sourceEntityType,
    targetEntityType: relation.targetEntityType,
    relationType: relation.relationType as KnowledgeRelationType,
    weight,
    confidence: weight,
    source: "business-entity-relation",
    metadata: relation.metadata,
  });
}

function strengthToWeight(strength: string): number {
  switch (strength) {
    case "strong": return 100;
    case "moderate": return 70;
    case "weak": return 30;
    case "inferred": return 15;
    default: return 50;
  }
}

// -- Filtering -------------------------------------------------------------

/** Filter edges by minimum confidence. */
export function filterByConfidence(
  edges: KnowledgeEdge[],
  minConfidence: number,
): KnowledgeEdge[] {
  return edges.filter(e => e.confidence >= minConfidence);
}

/** Filter edges by minimum weight. */
export function filterByWeight(
  edges: KnowledgeEdge[],
  minWeight: number,
): KnowledgeEdge[] {
  return edges.filter(e => e.weight >= minWeight);
}

/** Filter nodes by entity type. */
export function filterNodesByType(
  nodes: KnowledgeNode[],
  entityType: string,
): KnowledgeNode[] {
  return nodes.filter(n => n.entityType === entityType);
}

// -- Deduplication ---------------------------------------------------------

/** Deduplicate nodes by nodeId. */
export function deduplicateNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
  const seen = new Set<string>();
  return nodes.filter(n => {
    if (seen.has(n.nodeId)) return false;
    seen.add(n.nodeId);
    return true;
  });
}

/** Deduplicate edges by edgeId. */
export function deduplicateEdges(edges: KnowledgeEdge[]): KnowledgeEdge[] {
  const seen = new Set<string>();
  return edges.filter(e => {
    if (seen.has(e.edgeId)) return false;
    seen.add(e.edgeId);
    return true;
  });
}

// -- Sorting ---------------------------------------------------------------

/** Sort impacts by severity (most severe first). */
export function sortImpactsBySeverity<T extends { severity: string }>(
  items: T[],
): T[] {
  const order: Record<string, number> = {
    critical: 0, high: 1, medium: 2, low: 3, info: 4,
  };
  return [...items].sort((a, b) =>
    (order[a.severity] ?? 5) - (order[b.severity] ?? 5),
  );
}
