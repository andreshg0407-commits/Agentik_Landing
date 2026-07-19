/**
 * business-entity-snapshot.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Snapshot model for Digital Business Entities.
 *
 * A snapshot is a complete photo of a living entity at a point in time.
 * Used for caching, executive reports, copilot context, and Data Warehouse.
 *
 * Also defines the AI readiness context model.
 *
 * No Prisma. No React. Pure domain types.
 */

import type { BusinessEntity, DataFreshness } from "./business-entity-types";

// ── AI Readiness Context ─────────────────────────────────────────────────────

/**
 * Context prepared for AI/copilot consumption.
 *
 * This sprint defines the contract only — no AI calls are made.
 * Domain engines populate this structure; copilots consume it.
 */
export interface BusinessEntityAIContext {
  /** One-paragraph natural language summary of the entity's state. */
  summary: string;
  /** Key facts about the entity (e.g. "4 references depleted", "15 orders this month"). */
  keyFacts: string[];
  /** Active risks identified by engines. */
  risks: string[];
  /** Opportunities identified by engines. */
  opportunities: string[];
  /** Questions a manager might ask about this entity. */
  recommendedQuestions: string[];
  /** ISO timestamp of last AI analysis. */
  lastAnalyzedAt: string;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * A complete snapshot of a business entity at a point in time.
 *
 * Snapshots are consumed by:
 * - Executive dashboards (aggregated team views)
 * - Copilot context builders (entity context for AI)
 * - Cache layers (avoid re-computing expensive entities)
 * - Future Data Warehouse (historical state tracking)
 *
 * The entity field contains the full BusinessEntity.
 * The snapshot adds temporal metadata around it.
 */
export interface BusinessEntitySnapshot {
  /** The full entity at capture time. */
  entity: BusinessEntity;
  /** ISO timestamp when this snapshot was captured. */
  capturedAt: string;
  /** Snapshot version (monotonically increasing). */
  version: number;
  /** Source that triggered this snapshot. */
  source: string;
  /** Data freshness at capture time. */
  dataFreshness: DataFreshness;
  /** Whether this is a partial snapshot (some data missing). */
  isPartial: boolean;
  /** Warnings about data quality or completeness. */
  warnings: string[];
}

// ── Snapshot Builder ─────────────────────────────────────────────────────────

/** Build a BusinessEntitySnapshot from an entity. */
export function buildSnapshot(opts: {
  entity: BusinessEntity;
  source: string;
  version?: number;
  isPartial?: boolean;
  warnings?: string[];
}): BusinessEntitySnapshot {
  return {
    entity: opts.entity,
    capturedAt: new Date().toISOString(),
    version: opts.version ?? 1,
    source: opts.source,
    dataFreshness: opts.entity.dataFreshness,
    isPartial: opts.isPartial ?? false,
    warnings: opts.warnings ?? [],
  };
}

/** Build a minimal AI context (no AI calls — just structured engine output). */
export function buildAIContext(opts: {
  summary: string;
  keyFacts?: string[];
  risks?: string[];
  opportunities?: string[];
  recommendedQuestions?: string[];
}): BusinessEntityAIContext {
  return {
    summary: opts.summary,
    keyFacts: opts.keyFacts ?? [],
    risks: opts.risks ?? [],
    opportunities: opts.opportunities ?? [],
    recommendedQuestions: opts.recommendedQuestions ?? [],
    lastAnalyzedAt: new Date().toISOString(),
  };
}
