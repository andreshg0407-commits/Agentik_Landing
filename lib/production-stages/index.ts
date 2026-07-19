/**
 * production-stages/index.ts
 *
 * PRODUCTION-STAGE-ACTIVATION-01 + HARDENING-01 — Public barrel export.
 *
 * Production Stage Activation layer — maps ProductionTimeline data
 * to canonical production stages.
 *
 * No React. No Prisma. No server-only. Pure domain types + engine.
 */

// Types
export type {
  ProductionStageCode,
  ProductionStageCategory,
  ProductionStageStatus,
  ProductionStageDefinition,
  ProductionActivatedStage,
  ProductionStageEvidence,
  ProductionStageActivation,
  ProductionStageProgress,
  ProductionStageCoverage,
  ProductionStageGapLevel,
  ProductionStageGap,
  ProductionOrderClassificationType,
  ProductionOrderClassification,
  ProductionProfileId,
  ProductionProfile,
  ProductionStageActivationRule,
  ActivationRuleConfidence,
  ProductionStageSnapshot,
  ProductionStageMetrics,
} from "./production-stage-types";

// Catalog
export {
  PRODUCTION_STAGE_CATALOG,
  getStageDefinition,
  getStagesByCategory,
  PRODUCTION_PROFILES,
  DEFAULT_ACTIVATION_RULES,
  getProductionProfile,
} from "./production-stage-catalog";

// Engine
export {
  activateProductionStages,
  activateProductionStagesBatch,
} from "./production-stage-engine";
export type {
  ActivateStagesInput,
  ActivateBatchInput,
} from "./production-stage-engine";
