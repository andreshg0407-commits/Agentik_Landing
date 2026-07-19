/**
 * shared/cross-domain-errors.ts
 *
 * Typed errors for cross-domain integration.
 * Used when domains interact and encounter inconsistencies.
 *
 * Sprint: COMMERCIAL-DATA-LAYER-INTEGRATION-01
 */

// -- Error Codes ------------------------------------------------------------

export type CrossDomainErrorCode =
  | "TENANT_MISMATCH"
  | "PRODUCT_ID_MISMATCH"
  | "VARIANT_ID_MISMATCH"
  | "UNRESOLVED_PRODUCT"
  | "UNRESOLVED_VARIANT"
  | "DUPLICATE_OWNERSHIP"
  | "INCOMPATIBLE_QUALITY"
  | "STALE_DEPENDENCY"
  | "EXTERNAL_REFERENCE_CONFLICT";

// -- Cross Domain Error -----------------------------------------------------

export interface CrossDomainError {
  readonly code: CrossDomainErrorCode;
  readonly message: string;
  readonly domain: string;
  readonly relatedDomain: string | null;
  readonly entityId: string | null;
  readonly field: string | null;
  readonly severity: "CRITICAL" | "WARNING" | "INFO";
}

// -- Error Builders ---------------------------------------------------------

export function tenantMismatch(params: {
  domain: string;
  expectedTenant: string;
  actualTenant: string;
  entityId?: string;
}): CrossDomainError {
  return {
    code: "TENANT_MISMATCH",
    message: `Tenant mismatch: expected "${params.expectedTenant}", got "${params.actualTenant}"`,
    domain: params.domain,
    relatedDomain: null,
    entityId: params.entityId ?? null,
    field: "tenantId",
    severity: "CRITICAL",
  };
}

export function productIdMismatch(params: {
  domain: string;
  expectedProductId: string;
  actualProductId: string;
  entityId?: string;
}): CrossDomainError {
  return {
    code: "PRODUCT_ID_MISMATCH",
    message: `Product ID mismatch: expected "${params.expectedProductId}", got "${params.actualProductId}"`,
    domain: params.domain,
    relatedDomain: "PRODUCT",
    entityId: params.entityId ?? null,
    field: "productId",
    severity: "CRITICAL",
  };
}

export function unresolvedProduct(params: {
  domain: string;
  referenceCode: string;
  entityId?: string;
}): CrossDomainError {
  return {
    code: "UNRESOLVED_PRODUCT",
    message: `Product reference "${params.referenceCode}" could not be resolved in Product Domain`,
    domain: params.domain,
    relatedDomain: "PRODUCT",
    entityId: params.entityId ?? null,
    field: "referenceCode",
    severity: "WARNING",
  };
}

export function unresolvedVariant(params: {
  domain: string;
  referenceCode: string;
  sizeCode: string | null;
  colorCode: string | null;
}): CrossDomainError {
  return {
    code: "UNRESOLVED_VARIANT",
    message: `Variant (${params.sizeCode ?? "?"}/${params.colorCode ?? "?"}) for "${params.referenceCode}" could not be resolved`,
    domain: params.domain,
    relatedDomain: "PRODUCT",
    entityId: null,
    field: "variantId",
    severity: "WARNING",
  };
}

export function duplicateOwnership(params: {
  entityType: string;
  claimingDomain: string;
  existingDomain: string;
}): CrossDomainError {
  return {
    code: "DUPLICATE_OWNERSHIP",
    message: `Entity type "${params.entityType}" claimed by "${params.claimingDomain}" but already owned by "${params.existingDomain}"`,
    domain: params.claimingDomain,
    relatedDomain: params.existingDomain,
    entityId: null,
    field: "entityType",
    severity: "CRITICAL",
  };
}

export function staleDependency(params: {
  domain: string;
  dependencyDomain: string;
  ageSeconds: number;
  slaSeconds: number;
}): CrossDomainError {
  return {
    code: "STALE_DEPENDENCY",
    message: `Dependency on "${params.dependencyDomain}" is stale: ${params.ageSeconds}s old, SLA is ${params.slaSeconds}s`,
    domain: params.domain,
    relatedDomain: params.dependencyDomain,
    entityId: null,
    field: null,
    severity: "WARNING",
  };
}

export function externalReferenceConflict(params: {
  domain: string;
  externalId: string;
  systemType: string;
  conflictDescription: string;
}): CrossDomainError {
  return {
    code: "EXTERNAL_REFERENCE_CONFLICT",
    message: `External reference conflict for "${params.externalId}" in system "${params.systemType}": ${params.conflictDescription}`,
    domain: params.domain,
    relatedDomain: null,
    entityId: null,
    field: "externalRef",
    severity: "WARNING",
  };
}

export function incompatibleQuality(params: {
  domain: string;
  relatedDomain: string;
  description: string;
}): CrossDomainError {
  return {
    code: "INCOMPATIBLE_QUALITY",
    message: params.description,
    domain: params.domain,
    relatedDomain: params.relatedDomain,
    entityId: null,
    field: null,
    severity: "WARNING",
  };
}

export function variantIdMismatch(params: {
  domain: string;
  expectedVariantId: string;
  actualVariantId: string;
  entityId?: string;
}): CrossDomainError {
  return {
    code: "VARIANT_ID_MISMATCH",
    message: `Variant ID mismatch: expected "${params.expectedVariantId}", got "${params.actualVariantId}"`,
    domain: params.domain,
    relatedDomain: "PRODUCT",
    entityId: params.entityId ?? null,
    field: "variantId",
    severity: "WARNING",
  };
}
