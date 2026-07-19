/**
 * business-entity-types.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * The common language for all Digital Business Entities in Agentik.
 *
 * Every living entity in the platform — vendor, product, customer,
 * production order, portfolio, store — shares this base contract.
 *
 * Modules do NOT query each other. They query entities and engines.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { BusinessEntityState } from "./business-entity-state";
import type { BusinessEntityHealth } from "./business-entity-health";
import type { BusinessEntityAlert } from "./business-entity-alerts";
import type { BusinessEntityRecommendation } from "./business-entity-recommendations";
import type { BusinessEntityTimelineEvent } from "./business-entity-timeline";
import type { BusinessEntityMetric } from "./business-entity-metrics";
import type { BusinessEntityRelation } from "./business-entity-relations";
import type { BusinessEntityAIContext } from "./business-entity-snapshot";

// ── Entity Type Registry ─────────────────────────────────────────────────────

/**
 * All supported entity types.
 * New types are added here — never inside individual modules.
 */
export type BusinessEntityType =
  | "vendor"
  | "product"
  | "customer"
  | "production_order"
  | "sales_portfolio"
  | "store"
  | "order"
  | "inventory_location"
  | "supplier"
  | "financial_account"
  | "collection_account";

// ── Data Freshness ───────────────────────────────────────────────────────────

/** How fresh is the data backing this entity? */
export type DataFreshnessLevel = "fresh" | "stale" | "expired" | "unknown";

export interface DataFreshness {
  level: DataFreshnessLevel;
  lastUpdatedAt: string | null;
  /** Expected refresh interval in seconds. Null if not scheduled. */
  expectedRefreshIntervalSeconds: number | null;
  /** Data source identifier (e.g. "SAG", "CRM", "manual"). */
  source: string;
}

// ── Business Entity Base ─────────────────────────────────────────────────────

/**
 * The universal contract every Digital Business Entity implements.
 *
 * This is NOT a database model. It is assembled in real-time from
 * multiple data sources by domain engines.
 *
 * A BusinessEntity carries:
 * - Identity (who/what is it)
 * - State (what is happening right now)
 * - Health (multi-dimensional wellness)
 * - Metrics (quantified performance)
 * - Alerts (conditions requiring attention)
 * - Recommendations (suggested actions)
 * - Timeline (history of events)
 * - Relations (connections to other entities)
 * - AI readiness (context for copilot consumption)
 * - Data freshness (how current is the data)
 */
export interface BusinessEntity {
  /** Unique entity ID. */
  entityId: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** Entity type from the registry. */
  entityType: BusinessEntityType;
  /** Human-readable display name. */
  displayName: string;
  /** Current entity status. */
  status: BusinessEntityStatus;
  /** Operational state (single dimension). */
  state: BusinessEntityState;
  /** Multi-dimensional health assessment. */
  health: BusinessEntityHealth;
  /** Quantified performance metrics. */
  metrics: BusinessEntityMetric[];
  /** Active alerts for this entity. */
  alerts: BusinessEntityAlert[];
  /** Suggested actions. */
  recommendations: BusinessEntityRecommendation[];
  /** Recent events. */
  timeline: BusinessEntityTimelineEvent[];
  /** Connections to other entities. */
  relations: BusinessEntityRelation[];
  /** AI copilot readiness context. */
  aiContext: BusinessEntityAIContext | null;
  /** Data freshness assessment. */
  dataFreshness: DataFreshness;
  /** ISO timestamp of last sync from external source. */
  lastSyncAt: string | null;
  /** ISO timestamp of last update (any source). */
  updatedAt: string;
  /** Arbitrary domain-specific metadata. */
  metadata: Record<string, unknown>;
}

// ── Entity Status ────────────────────────────────────────────────────────────

/** Administrative status of the entity. */
export type BusinessEntityStatus =
  | "active"
  | "inactive"
  | "archived"
  | "suspended"
  | "pending_setup"
  | "pending_sync";

// ── Entity Engine Interface ──────────────────────────────────────────────────

/**
 * Contract for resolving Business Entities.
 * Every entity type must have a resolver that implements this interface.
 */
export interface IBusinessEntityResolver<T extends BusinessEntity = BusinessEntity> {
  /** The entity type this resolver handles. */
  entityType: BusinessEntityType;
  /** Resolve a single entity by ID. */
  resolve(organizationId: string, entityId: string): Promise<T | null>;
  /** Resolve multiple entities. */
  resolveBatch(organizationId: string, entityIds: string[]): Promise<T[]>;
  /** Search entities with optional query. */
  search(organizationId: string, query?: string, limit?: number): Promise<T[]>;
}

/**
 * Central registry that routes entity resolution to the correct resolver.
 */
export interface IBusinessEntityEngine {
  /** Register a resolver for an entity type. */
  registerResolver(resolver: IBusinessEntityResolver): void;
  /** Resolve any entity by type and ID. */
  resolve(organizationId: string, entityType: BusinessEntityType, entityId: string): Promise<BusinessEntity | null>;
  /** Resolve multiple entities of the same type. */
  resolveBatch(organizationId: string, entityType: BusinessEntityType, entityIds: string[]): Promise<BusinessEntity[]>;
  /** Search entities across types. */
  search(organizationId: string, entityType: BusinessEntityType, query?: string, limit?: number): Promise<BusinessEntity[]>;
  /** List all registered entity types. */
  listRegisteredTypes(): BusinessEntityType[];
}
