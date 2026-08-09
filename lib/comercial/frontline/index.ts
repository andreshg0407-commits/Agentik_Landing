/**
 * lib/comercial/frontline/index.ts
 *
 * Client-safe barrel — types only.
 * Server modules must import from specific files.
 */

export type {
  FrontlineProvenance,
  ResolvedSellerIdentity,
  SellerMappingSource,
  SellerScope,
  ScopeLevel,
  CustomerTopProduct,
  TopProductRanking,
  CustomerPurchaseHistoryItem,
  CustomerPurchaseHistoryResult,
  CustomerTopProductsResult,
  CustomerReceivablesContext,
  CustomerCommercialContext,
  AttentionSeverity,
  FrontlineAttentionType,
  FrontlineAttentionItem,
  FrontlineAttentionResult,
} from "./frontline-types";

export type {
  SellerNotification,
  SellerNotificationType,
  NotificationDeliveryStatus,
  NotificationEntityType,
  OrderFulfillmentTimeline,
  FulfillmentStageStatus,
  InactiveCustomerItem,
  InactiveCustomerResult,
  InactiveCustomerClassification,
  CatalogGenerationRequest,
  SellerAppFeature,
  SellerAppFeatureFlags,
  SellerAppNavigation,
  OverdueEnforcementLevel,
  OverduePolicyConfig,
  LocationPermissionState,
  SellerLocationContext,
  CommissionBand,
  SellerCommissionStatement,
  SellerAdvanceMovement,
  SellerAdvanceStatement,
} from "./seller-app-types";

export { DEFAULT_OVERDUE_POLICY, SELLER_COMMISSION_BANDS } from "./seller-app-types";

// Canonical AR Truth types (AGENTIK-RECEIVABLES-AR-TRUTH-01)
export type {
  SagCarteraRow,
  SagRecaudoRow,
  CertifiedReceivableDocument,
  CertifiedCustomerReceivableSnapshot,
  CertifiedArSnapshot,
  ArAgingBand,
  CanonicalArResult,
  CustomerArResult,
  CertifiedCollectionApplication,
  CertifiedCustomerCollectionSnapshot,
  CanonicalRecaudosResult,
} from "./canonical-ar-types";
