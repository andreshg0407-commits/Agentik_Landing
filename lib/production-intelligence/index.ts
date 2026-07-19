/**
 * index.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01 + PRODUCTION-FLOW-INTELLIGENCE-01
 * Client-safe barrel export for Production Intelligence.
 *
 * No Prisma. No server-only. Pure domain types.
 */

// Types (existing)
export type {
  SagProductionDocType,
  SagProductionRecord,
  ProductionStageDefinition,
  ProductionStageEvidence,
  ProductionStageConfidence,
  ProductionStageInference,
  ProductionStatus,
  ProductionRow,
  ProductionSubLineaSummary,
  ProductionInProgressReport,
} from "./production-types";

// Stage Inference
export {
  DEFAULT_PRODUCTION_STAGES,
  inferProductionStage,
} from "./production-stage-inference";

// Production Engine
export {
  buildProductionReport,
} from "./production-engine";

// Signal Generators (existing)
export {
  buildProductionSignals,
} from "./production-signals";

// Capability Catalog
export {
  PRODUCTION_INTELLIGENCE_CAPABILITIES,
} from "./capability-catalog";

// ── Production Flow Intelligence (PRODUCTION-FLOW-INTELLIGENCE-01) ────────

// Flow Types
export type {
  ProductionFlowSnapshot,
  ProductionReferenceFlow,
  ProductionOrderFlow,
  ProductionStageState,
  ProductionFlowStatus,
  ProductionDocumentEvidence,
  ProductionMovementDirection,
  ProductionInventoryImpact,
  ProductionDocumentTypeMapping,
  ProductionAvailabilityImpact,
  ProductionAvailabilityStatus,
  ProductionDelayRisk,
  ProductionDelayRiskLevel,
  ProductionRecoverySignal,
  ProductionRecoveryType,
  ProductionReadiness,
  ProductionFlowRecommendation,
  ProductionRecommendationAction,
  ProductionReplacementCandidate,
  ProductionFlowSignalType,
  ProductionKnowledgeRelation,
  ProductionKnowledgeRelationType,
  ProductionFlowSummary,
  ProductionFlowSubLineaSummary,
  ProductionFlowConfidence,
  ProductionFlowExecutiveReport,
  ProductionFlowDavidAnswer,
  ProductionFlowDavidQueryType,
  ProductionFlowDavidReference,
  ProductionDelayConfig,
} from "./production-flow-types";

export { DEFAULT_DELAY_CONFIG } from "./production-flow-types";

// Document Mapping
export {
  PRODUCTION_DOCUMENT_MAPPINGS,
  getDocumentTypeMapping,
  buildDocumentEvidence,
} from "./production-document-mapping";

// Flow Engine
export {
  buildProductionFlowSnapshot,
  buildProductionFlowExecutiveReport,
  answerDavidQuery,
} from "./production-flow-engine";

// Flow Signals
export {
  buildProductionFlowSignals,
} from "./production-flow-signals";

// Knowledge Graph
export {
  buildProductionKnowledgeRelations,
  getRelationsForReference,
  getRelationsByType,
} from "./production-flow-knowledge";
