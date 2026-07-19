/**
 * shared/domain-evidence.ts
 *
 * Transversal evidence envelope for the Commercial Data Layer.
 * Allows a future Copilot to read evidence from Product, Sales,
 * and Inventory without learning three incompatible contracts.
 *
 * Sprint: COMMERCIAL-DATA-LAYER-INTEGRATION-01
 */

// -- Evidence Envelope ------------------------------------------------------

export interface CommercialDomainEvidence {
  /** Source domain */
  readonly domain: string;
  /** Entity type within the domain */
  readonly entityType: string;
  /** Entity canonical ID */
  readonly entityId: string;
  /** Tenant scope */
  readonly tenantId: string;

  /** Specific field this evidence relates to (null = whole entity) */
  readonly field: string | null;

  /** Raw value as received from source */
  readonly rawValue: unknown;
  /** Canonical value after normalization */
  readonly canonicalValue: unknown;

  /** Confidence 0.0 - 1.0 */
  readonly confidence: number;

  /** When this evidence was observed */
  readonly observedAt: Date;

  /** Correlation ID (links to sync run or operation) */
  readonly traceId: string;

  /** Human-readable note */
  readonly note: string | null;

  /** Resolution status of this evidence */
  readonly resolution: EvidenceResolution;

  /** Impact on quality assessment */
  readonly qualityImpact: EvidenceQualityImpact;
}

// -- Evidence Resolution ----------------------------------------------------

export type EvidenceResolution =
  | "CONFIRMED"
  | "PENDING"
  | "CONFLICTED"
  | "OVERRIDDEN"
  | "UNKNOWN";

// -- Evidence Quality Impact ------------------------------------------------

export type EvidenceQualityImpact =
  | "IMPROVES"
  | "DEGRADES"
  | "NEUTRAL"
  | "UNKNOWN";

// -- Evidence Builders (from domain-specific data) --------------------------

export function buildEvidenceFromProduct(params: {
  entityId: string;
  tenantId: string;
  field: string | null;
  rawValue: unknown;
  canonicalValue: unknown;
  confidence: number;
  traceId: string;
  note?: string | null;
}): CommercialDomainEvidence {
  return {
    domain: "PRODUCT",
    entityType: "ProductProfile",
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

export function buildEvidenceFromSales(params: {
  entityId: string;
  tenantId: string;
  field: string | null;
  rawValue: unknown;
  canonicalValue: unknown;
  confidence: number;
  traceId: string;
  note?: string | null;
}): CommercialDomainEvidence {
  return {
    domain: "SALES",
    entityType: "SalesDocument",
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

export function buildEvidenceFromInventory(params: {
  entityId: string;
  tenantId: string;
  field: string | null;
  rawValue: unknown;
  canonicalValue: unknown;
  confidence: number;
  traceId: string;
  note?: string | null;
}): CommercialDomainEvidence {
  return {
    domain: "INVENTORY",
    entityType: "InventoryPosition",
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

export function buildEvidenceFromCustomer(params: {
  entityId: string;
  tenantId: string;
  field: string | null;
  rawValue: unknown;
  canonicalValue: unknown;
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
