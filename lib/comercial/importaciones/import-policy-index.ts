/**
 * lib/comercial/importaciones/import-policy-index.ts
 *
 * Barrel export for Import Policy Pack.
 * Sprint: IMPORT-POLICY-PACK-01
 */

// Types
export type {
  ImportPolicyType,
  ImportEvidenceItem,
  LowRotationResult,
  RepurchaseResult,
  RepurchaseDecision,
  RepurchaseFactor,
  NextContainerItem,
  NextContainerRecommendation,
  InventoryAgingResult,
  InventoryAgingStatus,
  ImportHealthSummary,
  ImportAlertType,
  ImportAlertSeverity,
  ImportAlertRelatedEntity,
  ImportAlert,
  ImportPolicyContext,
  ImportReferenceInput,
} from "./import-policy-types";

// Config
export {
  CASTILLITOS_IMPORT_POLICY_PACK_CONFIG,
  type ImportPolicyPackConfig,
} from "./import-policy-pack-config";

// Policy pack
export {
  registerCastillitosImportPolicyPack,
  getCastillitosImportPolicies,
  CASTILLITOS_IMPORT_POLICY_PACK_VERSION,
  CASTILLITOS_IMPORT_POLICY_COUNT,
} from "./import-policy-pack";

// Decision engine
export {
  evaluateLowRotation,
  evaluateRepurchase,
  buildNextContainerRecommendations,
  evaluateInventoryAging,
  evaluateImportHealth,
} from "./import-decision-engine";

// Alerts
export {
  buildLowRotationAlert,
  buildRebuyCandidateAlert,
  buildNoRepurchaseAlert,
  buildAgingAlert,
  buildImportDataQualityAlert,
  buildAllImportAlerts,
  type ImportAlertBatchInput,
} from "./import-alerts";

// Evidence
export {
  bridgeToCommercialEvidence,
  validateImportEvidence,
  validateAllImportEvidence,
  getImportSagDiscoveryGaps,
  type ImportCommercialEvidence,
  type ImportEvidenceValidationResult,
  type SagDiscoveryGap,
} from "./import-evidence";

// BusinessDecision bridge (COMMERCIAL-INTEGRATION-01)
export {
  buildLowRotationDecisions,
  buildRepurchaseDecisions,
  buildNextContainerDecisions,
  buildAgingDecisions,
  buildAllImportBusinessDecisions,
} from "./import-business-decisions";

// Data loader (COMMERCIAL-DATA-CONNECTIVITY-01)
export {
  loadImportReferenceInputs,
  buildImportPolicyContext,
} from "./import-data-loader";
