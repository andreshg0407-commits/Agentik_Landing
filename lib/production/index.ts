/**
 * lib/production/index.ts
 *
 * PRODUCTION-DOMAIN-EXTRACTION-01 — Unified Production Domain Barrel.
 *
 * Consolidates all production sub-domains into a single import surface.
 * No logic lives here — only re-exports from specialized sub-modules.
 *
 * Sub-domains:
 *   - production-events    — Universal event model (OP, CN, ET)
 *   - production-timeline  — Event projection into timelines
 *   - production-stages    — Canonical stage activation engine
 *   - production-control   — Control center snapshot builder
 *
 * No React. No Prisma. No server-only.
 */

// ── Production Events ────────────────────────────────────────────────────────
export type {
  ProductionEventType,
} from "@/lib/production-events/production-event-types";

export type {
  ProductionEvent,
} from "@/lib/production-events/production-event";

// ── Production Timeline ──────────────────────────────────────────────────────
export type {
  ProductionTimeline,
  ProductionTimelineEvent,
  ProductionTimelineQuality,
} from "@/lib/production-timeline/production-timeline-types";

// ── Production Stages ────────────────────────────────────────────────────────
export type {
  ProductionStageCode,
  ProductionStageCategory,
  ProductionStageStatus,
  ProductionStageDefinition,
  ProductionActivatedStage,
  ProductionStageActivation,
  ProductionStageProgress,
  ProductionStageCoverage,
  ProductionStageGap,
  ProductionStageGapLevel,
  ProductionOrderClassification,
  ProductionOrderClassificationType,
  ProductionProfileId,
  ProductionProfile,
  ProductionStageSnapshot,
  ProductionStageMetrics,
  ActivationRuleConfidence,
} from "@/lib/production-stages";

export {
  PRODUCTION_STAGE_CATALOG,
  PRODUCTION_PROFILES,
  DEFAULT_ACTIVATION_RULES,
  getStageDefinition,
  getStagesByCategory,
  getProductionProfile,
  activateProductionStages,
  activateProductionStagesBatch,
} from "@/lib/production-stages";

// ── Production Control ───────────────────────────────────────────────────────
export type {
  ProductionControlSnapshot,
  ProductionControlOrder,
  ProductionKpis,
  ProductionStageSummary,
  ProductionAlert,
  ProductionAlertType,
  ProductionAlertSeverity,
  ProductionDataQuality,
  ProductionFilterKey,
} from "@/lib/production-control/production-control-types";

// ── Production Operations (V2 — universal models) ──────────────────────────
export type {
  ProductionOperationsSnapshot,
  ProductionOrderOperationalRow,
  ProductionOperationsKpi,
  ProductionOperationalAlert,
  ProductionOperationalAlertType,
  ProductionOperationalAlertSeverity,
  ProductionDataQualityIndicators,
  ProductionStageAggregate,
  ProductionOperationsFilter,
} from "./production-operations-types";
