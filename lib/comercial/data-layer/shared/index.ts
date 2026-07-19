/**
 * shared/index.ts — Barrel export for shared types.
 */

export type {
  TenantContext,
  OrganizationContext,
  ExternalSystemReference,
  ERPIdentity,
  CanonicalId,
  VersionInfo,
  AuditMetadata,
  CorrelationId,
  ExecutionContext,
} from "./shared-types";

export type {
  AdapterHealth,
  HealthStatus,
  SynchronizationMetrics,
  QualityMetrics,
  LatencyMetrics,
  SnapshotMetrics,
} from "./health-metrics";

export type { NormalizerResult } from "./normalizers";
export {
  normalizeExternalId,
  normalizeReferenceCode,
  normalizeCustomerCode,
  normalizeDocumentNumber,
  normalizeText,
  normalizeEmail,
  normalizePhone,
  normalizeDecimal,
  normalizeInteger,
  normalizeDate,
  normalizeBoolean,
  normalizeCountryCode,
  normalizeCity,
  normalizeNullableString,
} from "./normalizers";

export type { CanonicalIdComponents } from "./identifiers";
export {
  buildCanonicalId,
  parseCanonicalId,
  buildTenantScopedKey,
  buildExternalReferenceKey,
  buildNaturalKey,
  isCanonicalId,
  compareCanonicalIds,
} from "./identifiers";

export type { ExternalReferenceValidation } from "./external-reference-helpers";
export {
  buildExternalReference,
  validateExternalReference,
  externalReferenceEquals,
} from "./external-reference-helpers";

export type {
  FreshnessEvaluationInput,
  FreshnessEvaluationResult,
  FreshnessStatus,
} from "./freshness-evaluator";
export { evaluateCommercialFreshness } from "./freshness-evaluator";

// Cross-domain product reference (COMMERCIAL-DATA-LAYER-INTEGRATION-01)
export type {
  CommercialProductReference,
  ProductResolutionStatus,
  VariantReference,
  ProductExternalRef,
  ProductResolutionEvidence,
} from "./product-reference";
export {
  buildProductCanonicalId,
  buildVariantCanonicalId,
  resolveProductReference,
} from "./product-reference";

// Cross-domain errors (COMMERCIAL-DATA-LAYER-INTEGRATION-01)
export type {
  CrossDomainErrorCode,
  CrossDomainError,
} from "./cross-domain-errors";
export {
  tenantMismatch,
  productIdMismatch,
  unresolvedProduct,
  unresolvedVariant,
  duplicateOwnership,
  staleDependency,
  externalReferenceConflict,
  incompatibleQuality,
  variantIdMismatch,
} from "./cross-domain-errors";

// Cross-domain evidence envelope (COMMERCIAL-DATA-LAYER-INTEGRATION-01)
export type {
  CommercialDomainEvidence,
  EvidenceResolution,
  EvidenceQualityImpact,
} from "./domain-evidence";
export {
  buildEvidenceFromProduct,
  buildEvidenceFromSales,
  buildEvidenceFromInventory,
  buildEvidenceFromCustomer,
} from "./domain-evidence";

// Cross-domain read model (COMMERCIAL-DATA-LAYER-INTEGRATION-01)
export type {
  CommercialProductState,
  ProductStateSummary,
  VariantStateSummary,
  InventoryPositionSummary,
  SaleLineSummary,
  FreshnessSummaryEntry,
  BuildCommercialProductStateInput,
} from "./commercial-product-state";
export { buildCommercialProductState } from "./commercial-product-state";
