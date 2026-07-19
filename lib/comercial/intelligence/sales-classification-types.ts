/**
 * lib/comercial/intelligence/sales-classification-types.ts
 *
 * Domain types for the Commercial Sales Classification Engine.
 *
 * The engine determines the sales channel (DETAL vs MAYORISTA) for each
 * transaction line using multiple evidence sources with confidence scoring.
 *
 * Sprint: COMMERCIAL-SALES-CLASSIFICATION-ENGINE-01
 */

// ── Classification result ───────────────────────────────────────────────────

export type SalesChannel = "DETAL" | "MAYORISTA" | "PENDIENTE";

export interface SalesClassificationResult {
  channel: SalesChannel;
  confidence: number;
  score: {
    detal: number;
    mayorista: number;
  };
  evidence: ClassificationEvidence[];
  channelPending: boolean;
}

// ── Evidence types ──────────────────────────────────────────────────────────

export type EvidenceType =
  | "price_comparison"
  | "sale_origin"
  | "customer_type"
  | "price_list"
  | "operation_type";

export type EvidenceStrength = "STRONG" | "MODERATE" | "WEAK" | "UNAVAILABLE";

export interface ClassificationEvidence {
  type: EvidenceType;
  strength: EvidenceStrength;
  weight: number;
  detalScore: number;
  mayoristaScore: number;
  reasoning: string;
  dataAvailable: boolean;
}

// ── Price comparison evidence input ─────────────────────────────────────────

export interface PriceComparisonInput {
  unitValue: number;
  pricePV3: number | null;
  pricePV4: number | null;
}

// ── Sale origin evidence input ──────────────────────────────────────────────

export interface SaleOriginInput {
  sourceCode: string | null;
  rawJson: Record<string, unknown> | null;
}

// ── Customer type evidence input ────────────────────────────────────────────

export interface CustomerTypeInput {
  customerType: string | null;
  segment: string | null;
}

// ── Operation type evidence input ───────────────────────────────────────────

export interface OperationTypeInput {
  documentType: string | null;
  warehouseId: number | null;
}

// ── Unified classification input ────────────────────────────────────────────

export interface ClassificationInput {
  price?: PriceComparisonInput;
  origin?: SaleOriginInput;
  customer?: CustomerTypeInput;
  operation?: OperationTypeInput;
}

// ── Bulk classification ─────────────────────────────────────────────────────

export interface BulkClassificationInput {
  referenceCode: string;
  lines: ClassificationInput[];
}

export interface BulkClassificationResult {
  referenceCode: string;
  dominantChannel: SalesChannel;
  confidence: number;
  totalLines: number;
  detalLines: number;
  mayoristaLines: number;
  pendingLines: number;
  lineResults: SalesClassificationResult[];
}
