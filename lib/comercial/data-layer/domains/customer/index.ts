/**
 * domains/customer/index.ts — Barrel export for Customer Domain.
 *
 * Sprint: CUSTOMER-DOMAIN-01 (foundation)
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02 (commercial enrichment)
 */

// Canonical entities
export type {
  CustomerProfile,
  TaxIdType,
  CustomerSegment,
  CustomerContact,
  CustomerLocation,
  CustomerFiscal,
  CustomerAdminStatus,
  CustomerOperationalStatus,
  ThirdPartyType,
  CustomerBranch,
  CustomerReceivable,
  ReceivableDocumentType,
  ReceivableAgingBracket,
  ReceivablePaymentStatus,
  CustomerBehavior,
  PurchaseFrequency,
  PaymentBehavior,
  VendorProfile,
  CollectionRecord,
  PaymentMethod,
  CollectionStatus,
} from "./customer-entities";
export {
  deriveAgingBracket,
  deriveCustomerOperationalStatus,
} from "./customer-entities";

// CUSTOMER-SAG-ENRICHMENT-02: enrichment entity types
export type {
  FieldEvidence,
  EvidenceSource,
  FieldQuality,
  ResolvedLookup,
  AssignmentConflict,
  LookupTable,
  CustomerCommercialAssignment,
  CreditStatus,
  CustomerCreditProfile,
  ActiveStatusInput,
  SalesRepInput,
  SalesRepResolution,
  CrmJoinInput,
  CrmJoinResult,
} from "./customer-entities";
export {
  deriveCustomerAdminStatus,
  resolveSalesRep,
  resolveLookup,
  resolveCrmJoin,
} from "./customer-entities";

// Normalizer
export type {
  CustomerRawInput,
  CustomerNormalizationContext,
  CustomerNormalizationOutput,
} from "./customer-normalizer";
export { normalizeCustomerRaw } from "./customer-normalizer";

// Commercial Assignment (CUSTOMER-SAG-ENRICHMENT-02)
export type {
  CommercialAssignmentRawInput,
  CommercialAssignmentLookups,
  CommercialAssignmentContext,
} from "./customer-commercial-assignment";
export { normalizeCommercialAssignment } from "./customer-commercial-assignment";

// Credit Profile (CUSTOMER-SAG-ENRICHMENT-02)
export type {
  CreditProfileRawInput,
  CreditProfileContext,
} from "./customer-credit-profile";
export { normalizeCreditProfile } from "./customer-credit-profile";

// Quality rules
export {
  evaluateCustomerQuality,
  evaluateCustomerFreshness,
  assessCustomerCompleteness,
} from "./customer-quality-rules";
export type { CustomerCompletenessAssessment, CustomerQualityDimensions } from "./customer-quality-rules";

// Evidence (CUSTOMER-SAG-ENRICHMENT-02)
export {
  buildCustomerFieldEvidence,
  buildAssignmentEvidence,
  buildCreditEvidence,
  buildStatusEvidence,
  fieldEvidenceToDomainEvidence,
} from "./customer-evidence";

// Commercial Customer State (CUSTOMER-SAG-ENRICHMENT-02)
export type { CommercialCustomerState, BuildCommercialCustomerStateInput } from "./customer-commercial-state";
export { buildCommercialCustomerState } from "./customer-commercial-state";

// Adapter
export { SAG_CUSTOMER_ADAPTER_ID, SAG_CUSTOMER_ADAPTER_VERSION, createSagCustomerAdapter } from "./customer-adapter";
export type { SagCustomerAdapterDeps } from "./customer-adapter";

// Registration
export { registerCustomerAdapter } from "./customer-registration";
