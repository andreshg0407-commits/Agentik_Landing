/**
 * business-entity-relations.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Common relation model for Digital Business Entities.
 *
 * Relations connect entities without coupling modules.
 * A LiveVendor can know about its portfolio, customers, and orders
 * without importing from those modules.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { BusinessEntityType } from "./business-entity-types";

// ── Relation Type ────────────────────────────────────────────────────────────

/** The nature of a relationship between two entities. */
export type RelationType =
  | "owns"
  | "assigned_to"
  | "contains"
  | "sold_by"
  | "ordered_by"
  | "stored_in"
  | "produced_by"
  | "blocked_by"
  | "depends_on"
  | "affects"
  | "belongs_to";

// ── Relation Strength ────────────────────────────────────────────────────────

/** How strong is the relationship? */
export type RelationStrength =
  | "strong"
  | "moderate"
  | "weak"
  | "inferred";

// ── Business Entity Relation ─────────────────────────────────────────────────

/**
 * A typed relationship between two business entities.
 *
 * Relations are consumed by:
 * - Entity detail views (show related entities)
 * - Copilot context (understand entity neighborhoods)
 * - Impact analysis (what happens if this entity changes?)
 * - Future graph-based intelligence
 *
 * Examples:
 * - LiveVendor --owns--> LivePortfolio
 * - LiveVendor --assigned_to--> Customer
 * - LiveProduct --stored_in--> InventoryLocation
 * - LiveProduct --produced_by--> ProductionOrder
 * - LiveOrder --ordered_by--> Customer
 * - LiveOrder --sold_by--> Vendor
 * - LiveProductionOrder --contains--> Product
 * - LiveStore --contains--> Product
 */
export interface BusinessEntityRelation {
  /** Source entity ID. */
  sourceEntityId: string;
  /** Source entity type. */
  sourceEntityType: BusinessEntityType;
  /** Target entity ID. */
  targetEntityId: string;
  /** Target entity type. */
  targetEntityType: BusinessEntityType;
  /** Nature of the relationship. */
  relationType: RelationType;
  /** Strength of the relationship. */
  strength: RelationStrength;
  /** Arbitrary relationship-specific metadata. */
  metadata: Record<string, unknown>;
}

// ── Relation Builder ─────────────────────────────────────────────────────────

/** Build a BusinessEntityRelation with sensible defaults. */
export function buildRelation(opts: {
  sourceEntityId: string;
  sourceEntityType: BusinessEntityType;
  targetEntityId: string;
  targetEntityType: BusinessEntityType;
  relationType: RelationType;
  strength?: RelationStrength;
  metadata?: Record<string, unknown>;
}): BusinessEntityRelation {
  return {
    sourceEntityId: opts.sourceEntityId,
    sourceEntityType: opts.sourceEntityType,
    targetEntityId: opts.targetEntityId,
    targetEntityType: opts.targetEntityType,
    relationType: opts.relationType,
    strength: opts.strength ?? "strong",
    metadata: opts.metadata ?? {},
  };
}

/** Filter relations by target entity type. */
export function relationsOfType(
  relations: BusinessEntityRelation[],
  targetType: BusinessEntityType,
): BusinessEntityRelation[] {
  return relations.filter(r => r.targetEntityType === targetType);
}

/** Get all target entity IDs of a given type. */
export function relatedEntityIds(
  relations: BusinessEntityRelation[],
  targetType: BusinessEntityType,
): string[] {
  return relationsOfType(relations, targetType).map(r => r.targetEntityId);
}
