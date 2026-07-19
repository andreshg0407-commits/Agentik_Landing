/**
 * domains/customer/customer-quality-rules.ts
 *
 * Quality evaluation rules specific to the Customer Domain.
 * Uses the shared CommercialQualityEvaluator with customer-specific configuration.
 *
 * Sprint: CUSTOMER-DOMAIN-01 (foundation)
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02 (multi-dimensional quality)
 */

import type { CustomerProfile, CustomerCommercialAssignment, CustomerCreditProfile } from "./customer-entities";
import type { CommercialQualityResult, FieldRule } from "../../quality";
import { evaluateCommercialQuality } from "../../quality";
import type { FreshnessEvaluationResult } from "../../shared/freshness-evaluator";
import { evaluateCommercialFreshness } from "../../shared/freshness-evaluator";

// ── Customer Quality Configuration ──────────────────────────────────────────

const CUSTOMER_REQUIRED_FIELDS = [
  "taxId",
  "name",
  "segment",
  "creditTermDays",
];

const CUSTOMER_OPTIONAL_FIELDS = [
  "tradeName",
  "contact",
  "location",
  "fiscal",
  "crmId",
];

const CUSTOMER_FIELD_RULES: FieldRule[] = [
  { field: "taxId", type: "string", minLength: 1, maxLength: 20 },
  { field: "name", type: "string", minLength: 1, maxLength: 200 },
];

/** Customer Domain freshness SLA: 24 hours (daily sync) */
const CUSTOMER_FRESHNESS_SLA_SECONDS = 86400;

// ── Evaluate Customer Quality ───────────────────────────────────────────────

export function evaluateCustomerQuality(
  profile: CustomerProfile,
  options?: { now?: Date }
): CommercialQualityResult {
  const now = options?.now ?? new Date();

  const record: Record<string, unknown> = {
    taxId: profile.taxId,
    name: profile.name,
    tradeName: profile.tradeName,
    segment: profile.segment.code ? profile.segment : null,
    creditTermDays: profile.creditTermDays,
    contact: (profile.contact.primaryPhone || profile.contact.email || profile.contact.mobile) ? profile.contact : null,
    location: (profile.location.city || profile.location.address) ? profile.location : null,
    fiscal: profile.fiscal.regime ? profile.fiscal : null,
    crmId: profile.crmId,
  };

  const conflicts: Array<{ field: string; values: unknown[] }> = [];

  return evaluateCommercialQuality({
    record,
    requiredFields: CUSTOMER_REQUIRED_FIELDS,
    optionalFields: CUSTOMER_OPTIONAL_FIELDS,
    fieldRules: CUSTOMER_FIELD_RULES,
    source: profile.sourceMetadata.sourceType,
    freshness: {
      observedAt: profile.timestamps.lastSyncAt,
      slaSeconds: CUSTOMER_FRESHNESS_SLA_SECONDS,
      now,
    },
    conflicts,
    evaluatorVersion: "customer-v2.0.0",
  });
}

// ── Evaluate Customer Freshness ─────────────────────────────────────────────

export function evaluateCustomerFreshness(
  profile: CustomerProfile,
  options?: { now?: Date }
): FreshnessEvaluationResult {
  const now = options?.now ?? new Date();

  return evaluateCommercialFreshness({
    observedAt: profile.timestamps.lastSyncAt,
    sourceUpdatedAt: profile.timestamps.sourceModifiedAt,
    now,
    slaSeconds: CUSTOMER_FRESHNESS_SLA_SECONDS,
    syncMode: profile.sourceMetadata.extractionMode as any,
  });
}

// ── Customer Completeness Assessment ────────────────────────────────────────

export interface CustomerCompletenessAssessment {
  readonly hasIdentity: boolean;
  readonly hasContact: boolean;
  readonly hasLocation: boolean;
  readonly hasFiscal: boolean;
  readonly hasCrmLink: boolean;
  readonly hasCommercialAssignment: boolean;
  readonly hasCreditConfig: boolean;
  readonly completenessScore: number;
  readonly missingFields: string[];
  readonly dimensions: CustomerQualityDimensions;
}

/** Multi-dimensional quality per customer area (CUSTOMER-SAG-ENRICHMENT-02) */
export interface CustomerQualityDimensions {
  /** Identity: taxId, name, type, status */
  readonly identity: number;
  /** Contact: phone, mobile, email, contactPerson */
  readonly contact: number;
  /** Location: city, department, address */
  readonly location: number;
  /** Commercial: salesRep, zone, segment, priceList */
  readonly commercial: number;
  /** Credit: terms, limit, status */
  readonly credit: number;
}

export function assessCustomerCompleteness(
  profile: CustomerProfile,
  assignment?: CustomerCommercialAssignment | null,
  credit?: CustomerCreditProfile | null
): CustomerCompletenessAssessment {
  const missingFields: string[] = [];

  // ── Identity (4 fields) ─────────────────────────────────────────────
  const hasIdentity = !!(profile.taxId && profile.name);
  const identityCount = [
    profile.taxId,
    profile.name,
    profile.tradeName,
    profile.adminStatus !== "UNKNOWN" ? profile.adminStatus : null,
  ].filter(Boolean).length;
  const identityScore = identityCount / 4;

  // ── Contact (4 fields) ──────────────────────────────────────────────
  const hasContact = !!(profile.contact.primaryPhone || profile.contact.email || profile.contact.mobile);
  if (!hasContact) missingFields.push("contact (phone, mobile, or email)");
  const contactCount = [
    profile.contact.primaryPhone,
    profile.contact.mobile,
    profile.contact.email,
    profile.contact.contactPerson,
  ].filter(Boolean).length;
  const contactScore = contactCount / 4;

  // ── Location (3 fields) ─────────────────────────────────────────────
  const hasLocation = !!(profile.location.city || profile.location.address);
  if (!hasLocation) missingFields.push("location (city or address)");
  const locationCount = [
    profile.location.city,
    profile.location.department,
    profile.location.address,
  ].filter(Boolean).length;
  const locationScore = locationCount / 3;

  // ── Fiscal ──────────────────────────────────────────────────────────
  const hasFiscal = !!profile.fiscal.regime;
  if (!hasFiscal) missingFields.push("fiscal regime");

  // ── CRM ─────────────────────────────────────────────────────────────
  const hasCrmLink = !!profile.crmId;
  if (!hasCrmLink) missingFields.push("CRM link");

  // ── Commercial Assignment (4 key fields) ────────────────────────────
  const hasCommercialAssignment = !!(
    assignment?.salesRepName || assignment?.zone || assignment?.segment || assignment?.priceList
  );
  if (!hasCommercialAssignment) missingFields.push("commercial assignment (salesRep, zone, segment, or priceList)");
  const commercialCount = [
    assignment?.salesRepName,
    assignment?.zone,
    assignment?.segment,
    assignment?.priceList,
  ].filter(Boolean).length;
  const commercialScore = commercialCount / 4;

  // ── Credit Config (3 key fields) ────────────────────────────────────
  const hasCreditConfig = !!(
    credit && (credit.creditTermDays > 0 || credit.creditLimit != null || credit.creditStatus !== "UNKNOWN")
  );
  if (!hasCreditConfig) missingFields.push("credit configuration");
  const creditCount = [
    credit && credit.creditTermDays > 0 ? credit.creditTermDays : null,
    credit?.creditLimit,
    credit && credit.creditStatus !== "UNKNOWN" ? credit.creditStatus : null,
  ].filter(Boolean).length;
  const creditScore = creditCount / 3;

  // ── Aggregate ───────────────────────────────────────────────────────
  // Weighted: identity 25%, contact 15%, location 15%, commercial 20%, credit 15%, fiscal 5%, crm 5%
  const completenessScore =
    identityScore * 0.25 +
    contactScore * 0.15 +
    locationScore * 0.15 +
    commercialScore * 0.20 +
    creditScore * 0.15 +
    (hasFiscal ? 0.05 : 0) +
    (hasCrmLink ? 0.05 : 0);

  const dimensions: CustomerQualityDimensions = {
    identity: identityScore,
    contact: contactScore,
    location: locationScore,
    commercial: commercialScore,
    credit: creditScore,
  };

  return {
    hasIdentity,
    hasContact,
    hasLocation,
    hasFiscal,
    hasCrmLink,
    hasCommercialAssignment,
    hasCreditConfig,
    completenessScore,
    missingFields,
    dimensions,
  };
}
