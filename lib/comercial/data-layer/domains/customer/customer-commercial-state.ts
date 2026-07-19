/**
 * domains/customer/customer-commercial-state.ts
 *
 * Cross-entity read model: CommercialCustomerState.
 * Pure projection — joins CustomerProfile + CommercialAssignment + CreditProfile.
 * Does NOT compute behavior, scoring, or predictions.
 *
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02
 */

import type { CustomerProfile, CustomerCommercialAssignment, CustomerCreditProfile, ResolvedLookup, AssignmentConflict } from "./customer-entities";
import type { CommercialQualityResult } from "../../quality";
import type { FreshnessEvaluationResult } from "../../shared/freshness-evaluator";
import type { CommercialDomainEvidence } from "../../shared/domain-evidence";

// ── Commercial Customer State ────────────────────────────────────────────────

export interface CommercialCustomerState {
  /** Customer canonical ID */
  readonly customerId: string;
  /** Tenant scope */
  readonly tenantId: string;

  // ── Identity ───────────────────────────────────────────────────────────
  readonly taxId: string;
  readonly name: string;
  readonly tradeName: string | null;
  readonly adminStatus: string;
  readonly operationalStatus: string;
  readonly thirdPartyType: string;

  // ── Contact summary ────────────────────────────────────────────────────
  readonly primaryPhone: string | null;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly contactPerson: string | null;

  // ── Location summary ───────────────────────────────────────────────────
  readonly city: string | null;
  readonly department: string | null;
  readonly country: string;
  readonly address: string | null;

  // ── Commercial assignment summary ──────────────────────────────────────
  readonly salesRepName: string | null;
  readonly supervisorName: string | null;
  readonly zone: ResolvedLookup | null;
  readonly channel: ResolvedLookup | null;
  readonly segment: ResolvedLookup | null;
  readonly priceList: ResolvedLookup | null;
  readonly route: ResolvedLookup | null;
  readonly classification: ResolvedLookup | null;
  readonly territory: ResolvedLookup | null;

  // ── Credit summary ────────────────────────────────────────────────────
  readonly creditTermDays: number;
  readonly creditLimit: number | null;
  readonly creditLimitCurrency: string;
  readonly creditStatus: string;
  readonly isBlocked: boolean;

  // ── CRM ────────────────────────────────────────────────────────────────
  readonly crmId: string | null;
  readonly hasCrmLink: boolean;

  // ── Quality ────────────────────────────────────────────────────────────
  readonly profileQuality: CommercialQualityResult | null;
  readonly freshness: FreshnessEvaluationResult | null;
  readonly completenessScore: number;

  // ── Evidence & conflicts ───────────────────────────────────────────────
  readonly evidence: CommercialDomainEvidence[];
  readonly conflicts: AssignmentConflict[];

  // ── Sources ────────────────────────────────────────────────────────────
  readonly sources: string[];
  readonly lastSyncAt: Date | null;

  /** When this state was assembled */
  readonly asOf: Date;
}

// ── Builder Input ────────────────────────────────────────────────────────────

export interface BuildCommercialCustomerStateInput {
  readonly profile: CustomerProfile;
  readonly assignment: CustomerCommercialAssignment | null;
  readonly credit: CustomerCreditProfile | null;
  readonly profileQuality: CommercialQualityResult | null;
  readonly freshness: FreshnessEvaluationResult | null;
  readonly completenessScore: number;
  readonly evidence: CommercialDomainEvidence[];
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildCommercialCustomerState(
  input: BuildCommercialCustomerStateInput
): CommercialCustomerState {
  const { profile, assignment, credit } = input;
  const now = new Date();

  // Determine sources
  const sources: string[] = [profile.sourceMetadata.sourceType];
  if (profile.crmId) sources.push("CRM");
  if (assignment?.salesRepEvidence?.source === "CRM") {
    if (!sources.includes("CRM")) sources.push("CRM");
  }

  return {
    customerId: profile.identity.canonicalId,
    tenantId: profile.identity.tenantId,

    // Identity
    taxId: profile.taxId,
    name: profile.name,
    tradeName: profile.tradeName,
    adminStatus: profile.adminStatus,
    operationalStatus: profile.operationalStatus,
    thirdPartyType: profile.thirdPartyType,

    // Contact
    primaryPhone: profile.contact.primaryPhone,
    mobile: profile.contact.mobile,
    email: profile.contact.email,
    contactPerson: profile.contact.contactPerson,

    // Location
    city: profile.location.city,
    department: profile.location.department,
    country: profile.location.country,
    address: profile.location.address,

    // Assignment
    salesRepName: assignment?.salesRepName ?? null,
    supervisorName: assignment?.supervisorName ?? null,
    zone: assignment?.zone ?? null,
    channel: assignment?.channel ?? null,
    segment: assignment?.segment ?? null,
    priceList: assignment?.priceList ?? null,
    route: assignment?.route ?? null,
    classification: assignment?.classification ?? null,
    territory: assignment?.territory ?? null,

    // Credit
    creditTermDays: credit?.creditTermDays ?? profile.creditTermDays,
    creditLimit: credit?.creditLimit ?? null,
    creditLimitCurrency: credit?.creditLimitCurrency ?? "COP",
    creditStatus: credit?.creditStatus ?? "UNKNOWN",
    isBlocked: credit?.isBlocked ?? false,

    // CRM
    crmId: profile.crmId,
    hasCrmLink: profile.crmId != null,

    // Quality
    profileQuality: input.profileQuality,
    freshness: input.freshness,
    completenessScore: input.completenessScore,

    // Evidence & conflicts
    evidence: input.evidence,
    conflicts: assignment?.conflicts ?? [],

    // Sources
    sources,
    lastSyncAt: profile.timestamps.lastSyncAt,

    asOf: now,
  };
}
