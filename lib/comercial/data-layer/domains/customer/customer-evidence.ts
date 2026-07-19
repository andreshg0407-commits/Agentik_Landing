/**
 * domains/customer/customer-evidence.ts
 *
 * Evidence builders for customer enrichment fields.
 * All evidence is traceable to source, field, and observation time.
 *
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02
 */

import type { CommercialDomainEvidence } from "../../shared/domain-evidence";
import type { FieldEvidence, EvidenceSource } from "./customer-entities";

// ── Build Customer Field Evidence ────────────────────────────────────────────

export function buildCustomerFieldEvidence(params: {
  entityId: string;
  tenantId: string;
  field: string;
  rawValue: unknown;
  canonicalValue: unknown;
  source: EvidenceSource;
  confidence: number;
  traceId: string;
  note?: string | null;
}): CommercialDomainEvidence {
  return {
    domain: "CUSTOMER",
    entityType: "CustomerProfile",
    entityId: params.entityId,
    tenantId: params.tenantId,
    field: params.field,
    rawValue: params.rawValue,
    canonicalValue: params.canonicalValue,
    confidence: params.confidence,
    observedAt: new Date(),
    traceId: params.traceId,
    note: params.note ?? null,
    resolution: "CONFIRMED",
    qualityImpact: "NEUTRAL",
  };
}

// ── Build Assignment Evidence ────────────────────────────────────────────────

export function buildAssignmentEvidence(params: {
  entityId: string;
  tenantId: string;
  field: string;
  rawValue: unknown;
  canonicalValue: unknown;
  source: EvidenceSource;
  confidence: number;
  traceId: string;
  note?: string | null;
}): CommercialDomainEvidence {
  return {
    domain: "CUSTOMER",
    entityType: "CommercialAssignment",
    entityId: params.entityId,
    tenantId: params.tenantId,
    field: params.field,
    rawValue: params.rawValue,
    canonicalValue: params.canonicalValue,
    confidence: params.confidence,
    observedAt: new Date(),
    traceId: params.traceId,
    note: params.note ?? null,
    resolution: params.confidence < 0.7 ? "PENDING" : "CONFIRMED",
    qualityImpact: params.confidence >= 0.8 ? "IMPROVES" : "NEUTRAL",
  };
}

// ── Build Credit Evidence ────────────────────────────────────────────────────

export function buildCreditEvidence(params: {
  entityId: string;
  tenantId: string;
  field: string;
  rawValue: unknown;
  canonicalValue: unknown;
  confidence: number;
  traceId: string;
  note?: string | null;
}): CommercialDomainEvidence {
  return {
    domain: "CUSTOMER",
    entityType: "CreditProfile",
    entityId: params.entityId,
    tenantId: params.tenantId,
    field: params.field,
    rawValue: params.rawValue,
    canonicalValue: params.canonicalValue,
    confidence: params.confidence,
    observedAt: new Date(),
    traceId: params.traceId,
    note: params.note ?? null,
    resolution: "CONFIRMED",
    qualityImpact: "NEUTRAL",
  };
}

// ── Build Status Evidence ────────────────────────────────────────────────────

export function buildStatusEvidence(params: {
  entityId: string;
  tenantId: string;
  derivedStatus: string;
  indicators: Record<string, unknown>;
  traceId: string;
}): CommercialDomainEvidence {
  return {
    domain: "CUSTOMER",
    entityType: "CustomerProfile",
    entityId: params.entityId,
    tenantId: params.tenantId,
    field: "adminStatus",
    rawValue: params.indicators,
    canonicalValue: params.derivedStatus,
    confidence: params.derivedStatus === "UNKNOWN" ? 0.3 : 0.9,
    observedAt: new Date(),
    traceId: params.traceId,
    note: `Derived from ${Object.keys(params.indicators).filter(k => params.indicators[k] != null).join(", ")}`,
    resolution: params.derivedStatus === "UNKNOWN" ? "PENDING" : "CONFIRMED",
    qualityImpact: "IMPROVES",
  };
}

// ── Collect Evidence from FieldEvidence ──────────────────────────────────────

export function fieldEvidenceToDomainEvidence(
  fieldEvidence: FieldEvidence,
  entityId: string,
  tenantId: string,
  field: string,
  traceId: string
): CommercialDomainEvidence {
  return {
    domain: "CUSTOMER",
    entityType: "CommercialAssignment",
    entityId,
    tenantId,
    field,
    rawValue: fieldEvidence.rawValue,
    canonicalValue: fieldEvidence.rawValue,
    confidence: fieldEvidence.confidence,
    observedAt: fieldEvidence.observedAt,
    traceId,
    note: fieldEvidence.note,
    resolution: fieldEvidence.quality === "CONFIRMED" ? "CONFIRMED"
      : fieldEvidence.quality === "CONFLICTED" ? "CONFLICTED"
      : "PENDING",
    qualityImpact: fieldEvidence.quality === "CONFIRMED" ? "IMPROVES" : "NEUTRAL",
  };
}
