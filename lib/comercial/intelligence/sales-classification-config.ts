/**
 * lib/comercial/intelligence/sales-classification-config.ts
 *
 * Per-tenant configuration for the Sales Classification Engine.
 *
 * Each tenant has different data availability, price structures,
 * and channel definitions. This config adapts the engine without
 * hardcoding assumptions.
 *
 * Sprint: COMMERCIAL-SALES-CLASSIFICATION-ENGINE-01
 */

import type { EvidenceType } from "./sales-classification-types";

// ── Tenant config ───────────────────────────────────────────────────────────

export interface SalesClassificationConfig {
  tenantId: string;

  /** Weight for each evidence type (0-1). Sum need not equal 1 — weights are normalized. */
  evidenceWeights: Record<EvidenceType, number>;

  /** Price comparison tolerance (percentage). E.g. 0.05 = 5% margin around PV3/PV4. */
  priceTolerance: number;

  /** Minimum confidence to classify (below this = PENDIENTE). */
  confidenceThreshold: number;

  /** Minimum number of evidence sources that must be available to classify. */
  minEvidenceSources: number;

  /** Known source codes that indicate detal sales. */
  detalSourceCodes: string[];

  /** Known source codes that indicate mayorista sales. */
  mayoristaSourceCodes: string[];

  /** Known customer types that indicate detal. */
  detalCustomerTypes: string[];

  /** Known customer types that indicate mayorista. */
  mayoristaCustomerTypes: string[];

  /** Known document types that indicate detal. */
  detalDocumentTypes: string[];

  /** Known document types that indicate mayorista. */
  mayoristaDocumentTypes: string[];
}

// ── Default config (Castillitos) ────────────────────────────────────────────

/**
 * Castillitos data reality (as of 2026-07-09):
 *
 * - SaleRecord.productCode = null on ALL rows (no product-level channel data)
 * - CustomerOrderRecord.sourceCode = "PD" on ALL rows (not a discriminator)
 * - CustomerOrderRecord.rawJson = {} on ALL rows (no channel/fuente data)
 * - CustomerProfile.customerType = "B2B" on 99.997% (not a discriminator)
 * - CustomerProfile.segment = null on ALL rows
 * - No priceList or zone fields exist
 *
 * Only viable signal: CustomerOrderLine.unitValue vs PV3/PV4 prices.
 * PV3 = precio detal, PV4 = precio mayorista.
 * Bimodal distribution confirmed on sample products.
 */
const CASTILLITOS_CONFIG: SalesClassificationConfig = {
  tenantId: "castillitos",
  evidenceWeights: {
    price_comparison: 1.0,
    sale_origin: 0.0,
    customer_type: 0.0,
    price_list: 0.0,
    operation_type: 0.0,
  },
  priceTolerance: 0.08,
  confidenceThreshold: 0.6,
  minEvidenceSources: 1,
  detalSourceCodes: [],
  mayoristaSourceCodes: [],
  detalCustomerTypes: [],
  mayoristaCustomerTypes: [],
  detalDocumentTypes: [],
  mayoristaDocumentTypes: [],
};

// ── Config registry ─────────────────────────────────────────────────────────

const CONFIG_REGISTRY = new Map<string, SalesClassificationConfig>([
  ["castillitos", CASTILLITOS_CONFIG],
]);

export function getSalesClassificationConfig(tenantId: string): SalesClassificationConfig {
  return CONFIG_REGISTRY.get(tenantId) ?? createDefaultConfig(tenantId);
}

function createDefaultConfig(tenantId: string): SalesClassificationConfig {
  return {
    ...CASTILLITOS_CONFIG,
    tenantId,
  };
}
