/**
 * knowledge-types.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Core types for the Business Knowledge Graph.
 *
 * The Knowledge Graph is a logical graph of business entities and relationships.
 * It does NOT depend on Neo4j or any graph database.
 * It extends Business Entities Core contracts.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { BusinessEntityType, DataFreshnessLevel } from "@/lib/business-entities/core";
import type { RelationType } from "@/lib/business-entities/core";
import type { HealthDimensionLevel } from "@/lib/business-entities/core";
import type { BusinessEntitySeverity } from "@/lib/business-entities/core";

// -- Extended Relation Types ------------------------------------------------

/**
 * All relation types supported in the Knowledge Graph.
 * Extends BusinessEntityRelation's RelationType with graph-specific types.
 */
export type KnowledgeRelationType =
  | RelationType
  | "supplies"
  | "consumes"
  | "transfers_to"
  | "unlocks"
  | "risks";

// -- Edge Direction --------------------------------------------------------

/** Direction of traversal for an edge. */
export type KnowledgeEdgeDirection = "outgoing" | "incoming" | "both";

// -- Confidence Level ------------------------------------------------------

/** Numeric confidence (0-100) with a human-readable tier. */
export type ConfidenceTier = "high" | "medium" | "low" | "inferred";

/** Derive confidence tier from a numeric score. */
export function confidenceTier(score: number): ConfidenceTier {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  if (score >= 20) return "low";
  return "inferred";
}

// -- Impact Type -----------------------------------------------------------

/** The nature of impact one entity has on another. */
export type ImpactType =
  | "supply_disruption"
  | "demand_loss"
  | "revenue_risk"
  | "fulfillment_delay"
  | "inventory_shortage"
  | "production_blockage"
  | "customer_churn"
  | "compliance_risk"
  | "operational_degradation";

// -- Graph Snapshot Status -------------------------------------------------

/** Status of a graph snapshot. */
export type GraphSnapshotStatus = "current" | "stale" | "expired" | "building";

// -- Re-exports for convenience -------------------------------------------

export type {
  BusinessEntityType,
  DataFreshnessLevel,
  RelationType,
  HealthDimensionLevel,
  BusinessEntitySeverity,
};
