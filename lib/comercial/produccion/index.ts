/**
 * lib/comercial/produccion/index.ts
 *
 * Barrel export for Production Planning Policy Pack.
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

// Types
export type {
  ProductionPlanningPolicyType,
  ProductionEvidenceItem,
  ProductionNeedResult,
  ProductionNeedDecision,
  ActiveOPInfo,
  ActiveOPResult,
  ProductionPriority,
  PriorityFactor,
  ProductionPriorityResult,
  ShortageResult,
  ProductionHealthSummary,
  ProductionAlertType,
  ProductionAlertSeverity,
  ProductionAlert,
  ProductionAlertRelatedEntity,
  ProductionPlanningContext,
  SubgroupInput,
  ProductionQueueItem,
  ProductionQueue,
  BusinessDecision,
} from "./production-planning-types";

// Config
export {
  CASTILLITOS_PRODUCTION_PLANNING_CONFIG,
  type ProductionPlanningConfig,
  type TextileReorderConfig,
  type PriorityConfig,
  type ShortageConfig,
  type ProductionHealthConfig,
  type ProductionAlertConfig,
  type ProductionQueueConfig,
} from "./production-planning-config";

// Policy pack
export {
  registerCastillitosProductionPlanningPack,
  getCastillitosProductionPlanningPolicies,
  CASTILLITOS_PRODUCTION_PLANNING_PACK_VERSION,
  CASTILLITOS_PRODUCTION_PLANNING_POLICY_COUNT,
} from "./production-planning-pack";

// Decision engine
export {
  evaluateProductionNeed,
  evaluateExistingOP,
  evaluatePriority,
  evaluateShortage,
  evaluateProductionHealth,
  buildProductionQueue,
} from "./production-decision-engine";

// Alerts
export {
  buildProductionRequiredAlert,
  buildWaitOPAlert,
  buildLowStockAlert,
  buildCriticalShortageAlert,
  buildProductionDataQualityAlert,
  buildAllProductionAlerts,
  type ProductionAlertBatchInput,
} from "./production-alerts";

// Evidence
export {
  bridgeToCommercialEvidence,
  validateProductionEvidence,
  validateAllProductionEvidence,
  getProductionSagDiscoveryGaps,
  type ProductionCommercialEvidence,
  type ProductionEvidenceValidationResult,
  type SagProductionDiscoveryGap,
} from "./production-evidence";

// Read models
export {
  buildProductionPlanningState,
  buildBusinessDecision,
  buildAllBusinessDecisions,
  type ProductionPlanningState,
} from "./production-read-models";

// BusinessDecision bridge (COMMERCIAL-INTEGRATION-01)
export {
  buildProductionBusinessDecision,
  buildAllProductionBusinessDecisions,
} from "./production-business-decisions";

// Data loader (COMMERCIAL-DATA-CONNECTIVITY-01)
export {
  loadProductionSubgroupInputs,
  buildProductionContext,
} from "./production-data-loader";
