/**
 * production-timeline/index.ts
 *
 * PRODUCTION-TIMELINE-01 — Public barrel export.
 *
 * Production Timeline layer — chronological projection of ProductionEvent data.
 *
 * No React. No Prisma. No server-only. Pure domain types + builders.
 */

// Types
export type {
  ProductionTimelineEvent,
  ProductionTimeline,
  ProductionTimelineGroupBy,
  ProductionTimelineGroupKeyStrategy,
  ProductionTimelineSummary,
  ProductionTimelineQualityLevel,
  ProductionTimelineQuality,
  ProductionTimelineProfitability,
  ProductionTimelineSnapshot,
  ProductionTimelineMetrics,
  ProductionTimelineReadiness,
  ProductionTimelineStageReadiness,
  ProductionTimelineProfitabilityReadiness,
  ProductionTimelineSourceConfig,
  ProductionTimelineStageConfig,
  ProductionTimeboundMode,
} from "./production-timeline-types";

// Config presets (HARDENING-01)
export {
  SAG_PYA_SOURCE_CONFIG,
  CASTILLITOS_STAGE_CONFIG,
  DEFAULT_SOURCE_CONFIG,
  DEFAULT_STAGE_CONFIG,
} from "./production-timeline-types";

// Builder
export {
  normalizeToTimelineEvent,
  buildProductionTimelines,
} from "./production-timeline-builder";
export type { BuildTimelinesInput } from "./production-timeline-builder";

// Metrics
export {
  buildTimelineMetrics,
  buildProductionTimelineSnapshot,
} from "./production-timeline-metrics";

// OP Synthesis (HARDENING-01 — shared between loader and scripts)
export {
  synthesizeOpEvent,
  prismaRowToProductionEvent,
} from "./production-order-synthesis";
export type { ProductionOrderRow } from "./production-order-synthesis";
