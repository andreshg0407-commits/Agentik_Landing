/**
 * lib/comercial/sales-reps/index.ts
 *
 * Barrel export for SalesRep Policy Pack.
 * Sprint: SALES-REP-POLICY-PACK-01
 */

// Types
export type {
  SalesRepPolicyType,
  SalesRepEvidenceItem,
  MalletOutOfStockResult,
  MalletReplacementSuggestion,
  OverdueReceivableResult,
  ReceivableDataStatus,
  InactiveCustomerResult,
  CustomerActivityStatus,
  CustomerPriorityResult,
  CustomerPriorityLevel,
  CustomerPriorityFactor,
  SalesRepMalletState,
  MalletHealthStatus,
  OrderFulfillmentState,
  OrderFulfillmentStatus,
  OrderFulfillmentMilestone,
  OrderFulfillmentBlocker,
  DataFreshnessLabel,
  SalesRepDailyState,
  SalesRepProfile,
  SalesRepAlert,
  SalesRepAlertType,
  SalesRepAlertSeverity,
  SalesRepAlertRelatedEntity,
  SalesRepMobileContract,
  SalesRepMobileCapability,
  MobileCapabilityStatus,
  SalesRepPolicyContext,
  MalletItemInput,
  CustomerInput,
  ReplacementCandidateInput,
  OrderInput,
  MalletStateInput,
} from "./sales-rep-decision-types";

// Config
export {
  CASTILLITOS_SALESREP_POLICY_PACK_CONFIG,
  type SalesRepPolicyPackConfig,
} from "./sales-rep-policy-pack-config";

// Policy pack
export {
  registerCastillitosRepPolicyPack,
  getCastillitosRepPolicies,
  CASTILLITOS_SALESREP_POLICY_PACK_VERSION,
  CASTILLITOS_SALESREP_POLICY_COUNT,
} from "./sales-rep-policy-pack";

// Decision engine
export {
  evaluateMalletOutOfStock,
  evaluateMalletReplacement,
  evaluateCustomerReceivablesAlert,
  evaluateCustomerInactivity,
  evaluateCustomerPriority,
  buildSalesRepMalletState,
  buildOrderFulfillmentState,
  buildSalesRepDailyState,
} from "./sales-rep-decision-engine";

// Alerts
export {
  buildOutOfStockAlert,
  buildReplacementAlert,
  buildOverdueReceivableAlert,
  buildInactiveCustomerAlert,
  buildOrderFollowUpAlert,
  buildDataQualityAlert,
  buildAllAlerts,
  type AlertBatchInput,
} from "./sales-rep-alerts";

// Read models
export {
  buildMobileContract,
  getMobileCapabilityCount,
} from "./sales-rep-read-models";

// Evidence
export {
  bridgeToCommercialEvidence,
  summarizeDailyEvidence,
  validateEvidence,
  validateAllEvidence,
  type SalesRepCommercialEvidence,
  type DailyStateEvidenceSummary,
  type EvidenceValidationResult,
} from "./sales-rep-evidence";

// BusinessDecision bridge (COMMERCIAL-INTEGRATION-01)
export {
  buildOutOfStockDecisions,
  buildOverdueReceivableDecisions,
  buildInactiveCustomerDecisions,
  buildAllSalesRepBusinessDecisions,
} from "./sales-rep-business-decisions";

// Data loader (COMMERCIAL-DATA-CONNECTIVITY-01)
export {
  loadSalesRepData,
  listSellerSlugs,
  type SalesRepLoaderResult,
} from "./sales-rep-data-loader";
