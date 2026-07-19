/**
 * knowledge-node.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Knowledge Graph node — represents a business entity in the graph.
 *
 * A KnowledgeNode is a lightweight graph representation of a BusinessEntity.
 * It carries identity, health, state, tags, and freshness —
 * enough for traversal and reasoning without loading the full entity.
 *
 * No Prisma. No React. Pure domain types.
 */

import type {
  BusinessEntityType,
  DataFreshnessLevel,
  HealthDimensionLevel,
  BusinessEntitySeverity,
} from "./knowledge-types";

// -- Knowledge Node --------------------------------------------------------

export interface KnowledgeNode {
  /** Unique node ID within the graph. */
  nodeId: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** The underlying business entity ID. */
  entityId: string;
  /** Business entity type. */
  entityType: BusinessEntityType;
  /** Human-readable label (display name). */
  label: string;
  /** Optional description. */
  description: string | null;
  /** Overall health of the entity at graph-build time. */
  health: HealthDimensionLevel;
  /** Highest severity signal affecting this entity. */
  severity: BusinessEntitySeverity;
  /** Whether the entity is active (true) or inactive/archived. */
  active: boolean;
  /** Free-form tags for filtering and categorization. */
  tags: string[];
  /** Data freshness at graph-build time. */
  freshness: DataFreshnessLevel;
  /** Arbitrary domain-specific metadata. */
  metadata: Record<string, unknown>;
  /** ISO timestamp when the node was created in the graph. */
  createdAt: string;
  /** ISO timestamp when the node was last updated in the graph. */
  updatedAt: string;
}

// -- Builder ---------------------------------------------------------------

let _nodeSeq = 0;

/** Generate a unique node ID. */
export function nextNodeId(prefix?: string): string {
  return `${prefix ?? "kn"}-${Date.now()}-${++_nodeSeq}`;
}

/** Build a KnowledgeNode with sensible defaults. */
export function buildNode(opts: {
  organizationId: string;
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
  description?: string | null;
  health?: HealthDimensionLevel;
  severity?: BusinessEntitySeverity;
  active?: boolean;
  tags?: string[];
  freshness?: DataFreshnessLevel;
  metadata?: Record<string, unknown>;
}): KnowledgeNode {
  const now = new Date().toISOString();
  return {
    nodeId: nextNodeId(),
    organizationId: opts.organizationId,
    entityId: opts.entityId,
    entityType: opts.entityType,
    label: opts.label,
    description: opts.description ?? null,
    health: opts.health ?? "unknown",
    severity: opts.severity ?? "info",
    active: opts.active ?? true,
    tags: opts.tags ?? [],
    freshness: opts.freshness ?? "unknown",
    metadata: opts.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
