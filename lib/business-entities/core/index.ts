/**
 * lib/business-entities/core/index.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Barrel export for Business Entities Core.
 *
 * Client-safe: no Prisma, no server-only, no React.
 * Import from "@/lib/business-entities/core" for all entity contracts.
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  BusinessEntityType,
  DataFreshnessLevel,
  DataFreshness,
  BusinessEntity,
  BusinessEntityStatus,
  IBusinessEntityResolver,
  IBusinessEntityEngine,
} from "./business-entity-types";

// ── State ────────────────────────────────────────────────────────────────────
export type {
  BusinessEntityStateLevel,
  BusinessEntitySeverity,
  BusinessEntitySignal,
  BusinessEntityState,
} from "./business-entity-state";
export {
  computeHighestSeverity,
  severityToStateLevel,
  buildStateFromSignals,
} from "./business-entity-state";

// ── Health ───────────────────────────────────────────────────────────────────
export type {
  HealthDimensionLevel,
  HealthDimension,
  BusinessEntityHealth,
} from "./business-entity-health";
export {
  unavailableDimension,
  buildDimension,
  computeOverallHealth,
  emptyHealth,
} from "./business-entity-health";

// ── Alerts ───────────────────────────────────────────────────────────────────
export type {
  AlertCategory,
  AlertAction,
  BusinessEntityAlert,
} from "./business-entity-alerts";
export {
  nextAlertId,
  buildAlert,
} from "./business-entity-alerts";

// ── Recommendations ──────────────────────────────────────────────────────────
export type {
  BusinessEntityRecommendation,
} from "./business-entity-recommendations";
export {
  nextRecommendationId,
  buildRecommendation,
} from "./business-entity-recommendations";

// ── Timeline ─────────────────────────────────────────────────────────────────
export type {
  TimelineEventType,
  BusinessEntityTimelineEvent,
} from "./business-entity-timeline";
export {
  nextTimelineEventId,
  buildTimelineEvent,
} from "./business-entity-timeline";

// ── Metrics ──────────────────────────────────────────────────────────────────
export type {
  MetricPeriod,
  MetricTrend,
  MetricUnit,
  BusinessEntityMetric,
} from "./business-entity-metrics";
export {
  buildMetric,
  findMetric,
  metricValue,
} from "./business-entity-metrics";

// ── Relations ────────────────────────────────────────────────────────────────
export type {
  RelationType,
  RelationStrength,
  BusinessEntityRelation,
} from "./business-entity-relations";
export {
  buildRelation,
  relationsOfType,
  relatedEntityIds,
} from "./business-entity-relations";

// ── Snapshot ─────────────────────────────────────────────────────────────────
export type {
  BusinessEntityAIContext,
  BusinessEntitySnapshot,
} from "./business-entity-snapshot";
export {
  buildSnapshot,
  buildAIContext,
} from "./business-entity-snapshot";

// ── Utils ────────────────────────────────────────────────────────────────────
export {
  evaluateFreshness,
  countAlertsBySeverity,
  countPendingAlerts,
  isSameEntity,
  sortByHealthSeverity,
} from "./business-entity-utils";
