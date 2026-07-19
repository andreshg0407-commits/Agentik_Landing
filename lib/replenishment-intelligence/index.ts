/**
 * index.ts
 *
 * REPLENISHMENT-INTELLIGENCE-01
 * Client-safe barrel export for Replenishment Intelligence.
 *
 * No Prisma. No server-only. Pure domain types.
 */

// Types
export type {
  ReplenishmentSnapshot,
  ReplenishmentRecommendation,
  ReplenishmentTarget,
  ReplenishmentTargetType,
  ReplenishmentSource,
  ReplenishmentSourceType,
  ReplenishmentReason,
  ReplenishmentReasonCategory,
  ReplenishmentUrgency,
  ReplenishmentAction,
  ReplenishmentReasoning,
  ReplenishmentEvidence,
  ReplenishmentEvidenceType,
  ReplenishmentImpact,
  ReplenishmentConfidence,
  ReplenishmentReplacement,
  ReplenishmentProductionContext,
  ReplenishmentTransferContext,
  ReplenishmentSignalType,
  ReplenishmentDecisionInput,
  ReplenishmentDecisionType,
  ReplenishmentDecisionOption,
  ReplenishmentKnowledgeRelation,
  ReplenishmentKnowledgeRelationType,
  ReplenishmentExecutiveReport,
  ReplenishmentDavidAnswer,
  ReplenishmentDavidQueryType,
  ReplenishmentDavidReference,
  ReplenishmentSummary,
} from "./replenishment-types";

// Engine
export {
  buildReplenishmentSnapshot,
  buildReplenishmentExecutiveReport,
  answerReplenishmentDavidQuery,
  buildReplenishmentDecisionInputs,
  buildReplenishmentKnowledgeRelations,
} from "./replenishment-engine";

// Signals
export {
  buildReplenishmentSignals,
} from "./replenishment-signals";
