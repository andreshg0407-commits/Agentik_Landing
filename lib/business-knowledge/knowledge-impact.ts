/**
 * knowledge-impact.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Impact analysis contracts for the Business Knowledge Graph.
 *
 * Impact analysis answers: "What happens to the rest of the business
 * if this entity changes or fails?"
 *
 * Example: A depleted product reference impacts vendors, portfolios,
 * orders, customers, production, and stores.
 *
 * No Prisma. No React. Pure domain types.
 */

import type {
  BusinessEntityType,
  BusinessEntitySeverity,
  ImpactType,
} from "./knowledge-types";

// -- Affected Entity Summary -----------------------------------------------

/** A single entity affected by an impact. */
export interface AffectedEntity {
  /** The affected entity ID. */
  entityId: string;
  /** The affected entity type. */
  entityType: BusinessEntityType;
  /** Human-readable label. */
  label: string;
  /** How this entity is affected. */
  impactDescription: string;
  /** Severity of the impact on this entity. */
  severity: BusinessEntitySeverity;
  /** Depth in the graph (1 = direct, 2+ = transitive). */
  depth: number;
}

// -- Knowledge Impact -----------------------------------------------------

export interface KnowledgeImpact {
  /** The source entity causing the impact. */
  sourceEntityId: string;
  /** Source entity type. */
  sourceEntityType: BusinessEntityType;
  /** Source entity label. */
  sourceLabel: string;
  /** Type of impact. */
  impactType: ImpactType;
  /** Overall severity. */
  severity: BusinessEntitySeverity;
  /** All affected entities. */
  affectedEntities: AffectedEntity[];
  /** Count of affected entities grouped by type. */
  affectedCounts: Record<string, number>;
  /** Estimated monetary value at risk (null if not computable). */
  estimatedValue: number | null;
  /** Confidence in this analysis (0-100). */
  confidence: number;
  /** Human-readable explanation of the impact. */
  explanation: string;
  /**
   * Recommended actions to mitigate.
   * All suggestedOnly until Action Engine exists.
   */
  recommendedActions: ImpactAction[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Impact Action --------------------------------------------------------

/** A suggested action to mitigate an impact (informational only). */
export interface ImpactAction {
  /** Action type identifier. */
  actionType: string;
  /** Human-readable label. */
  label: string;
  /** Description of the action. */
  description: string;
  /** Entity this action targets. */
  targetEntityId: string | null;
  /** Target entity type. */
  targetEntityType: BusinessEntityType | null;
  /** Priority for ordering (lower = higher priority). */
  priority: number;
  /** Mandatory: true until Action Engine exists. */
  suggestedOnly: true;
}

// -- Impact Builder -------------------------------------------------------

let _impactSeq = 0;

/** Build a KnowledgeImpact with sensible defaults. */
export function buildImpact(opts: {
  sourceEntityId: string;
  sourceEntityType: BusinessEntityType;
  sourceLabel: string;
  impactType: ImpactType;
  severity: BusinessEntitySeverity;
  affectedEntities: AffectedEntity[];
  estimatedValue?: number | null;
  confidence?: number;
  explanation: string;
  recommendedActions?: ImpactAction[];
  metadata?: Record<string, unknown>;
}): KnowledgeImpact {
  _impactSeq++;

  const counts: Record<string, number> = {};
  for (const ae of opts.affectedEntities) {
    counts[ae.entityType] = (counts[ae.entityType] ?? 0) + 1;
  }

  return {
    sourceEntityId: opts.sourceEntityId,
    sourceEntityType: opts.sourceEntityType,
    sourceLabel: opts.sourceLabel,
    impactType: opts.impactType,
    severity: opts.severity,
    affectedEntities: opts.affectedEntities,
    affectedCounts: counts,
    estimatedValue: opts.estimatedValue ?? null,
    confidence: opts.confidence ?? 70,
    explanation: opts.explanation,
    recommendedActions: opts.recommendedActions ?? [],
    metadata: opts.metadata ?? {},
  };
}

/** Build an ImpactAction (suggestedOnly always true). */
export function buildImpactAction(opts: {
  actionType: string;
  label: string;
  description: string;
  targetEntityId?: string | null;
  targetEntityType?: BusinessEntityType | null;
  priority?: number;
}): ImpactAction {
  return {
    actionType: opts.actionType,
    label: opts.label,
    description: opts.description,
    targetEntityId: opts.targetEntityId ?? null,
    targetEntityType: opts.targetEntityType ?? null,
    priority: opts.priority ?? 5,
    suggestedOnly: true,
  };
}
