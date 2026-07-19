/**
 * shared/commercial-product-state.ts
 *
 * Cross-domain read model: CommercialProductState.
 * Pure projection — not persisted, no engine calculations.
 * Joins Product + Sales + Inventory by canonical IDs.
 *
 * Sprint: COMMERCIAL-DATA-LAYER-INTEGRATION-01
 */

import type { CommercialQualityResult } from "../quality";
import type { FreshnessEvaluationResult } from "./freshness-evaluator";
import type { CommercialDomainEvidence } from "./domain-evidence";
import type { CrossDomainError } from "./cross-domain-errors";
import { buildProductCanonicalId } from "./product-reference";
import { tenantMismatch, productIdMismatch } from "./cross-domain-errors";

// -- Commercial Product State (read model) ----------------------------------

export interface CommercialProductState {
  /** Product canonical ID (from Product Domain) */
  readonly productId: string;
  /** Tenant scope */
  readonly tenantId: string;

  /** Product profile (from Product Domain) */
  readonly productProfile: ProductStateSummary | null;
  /** Variants (from Product Domain) */
  readonly variants: VariantStateSummary[];

  /** Current inventory positions (from Inventory Domain) */
  readonly currentInventoryPositions: InventoryPositionSummary[];

  /** Recent sale lines (from Sales Domain) */
  readonly recentSaleLines: SaleLineSummary[];

  /** Quality assessments per domain */
  readonly productQuality: CommercialQualityResult | null;
  readonly inventoryQuality: CommercialQualityResult | null;
  readonly salesQuality: CommercialQualityResult | null;

  /** Freshness summary per domain */
  readonly freshnessSummary: FreshnessSummaryEntry[];

  /** Evidence from all domains */
  readonly evidenceSummary: CommercialDomainEvidence[];

  /** Relations that could not be resolved */
  readonly unresolvedRelations: CrossDomainError[];

  /** When this state was assembled */
  readonly asOf: Date;
}

// -- Summary types (lightweight, no full entity) ----------------------------

export interface ProductStateSummary {
  readonly referenceCode: string;
  readonly name: string;
  readonly commercialStatus: string;
  readonly hasVariants: boolean;
  readonly groupId: string;
  readonly lineId: string;
}

export interface VariantStateSummary {
  readonly variantId: string;
  readonly sizeCode: string;
  readonly colorCode: string;
  readonly sizeName: string | null;
  readonly colorName: string | null;
  readonly active: boolean;
}

export interface InventoryPositionSummary {
  readonly locationCode: string;
  readonly locationType: string;
  readonly physicalQty: number;
  readonly availableQty: number;
  readonly reservedQty: number;
  readonly state: string;
  readonly sizeCode: string | null;
  readonly colorCode: string | null;
}

export interface SaleLineSummary {
  readonly documentNumber: string;
  readonly date: Date;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly sizeCode: string | null;
  readonly colorCode: string | null;
}

export interface FreshnessSummaryEntry {
  readonly domain: string;
  readonly status: string;
  readonly ageSeconds: number;
  readonly isStale: boolean;
}

// -- Builder ----------------------------------------------------------------

export interface BuildCommercialProductStateInput {
  readonly tenantId: string;
  readonly referenceCode: string;
  readonly product: ProductStateSummary | null;
  readonly variants: VariantStateSummary[];
  readonly inventoryPositions: InventoryPositionSummary[];
  readonly saleLines: SaleLineSummary[];
  readonly productQuality: CommercialQualityResult | null;
  readonly inventoryQuality: CommercialQualityResult | null;
  readonly salesQuality: CommercialQualityResult | null;
  readonly freshness: FreshnessSummaryEntry[];
  readonly evidence: CommercialDomainEvidence[];
  readonly asOf: Date;
}

export function buildCommercialProductState(
  input: BuildCommercialProductStateInput
): { state: CommercialProductState; errors: CrossDomainError[] } {
  const errors: CrossDomainError[] = [];
  const productId = buildProductCanonicalId(input.tenantId, input.referenceCode);

  // Validate tenant isolation on evidence
  for (const ev of input.evidence) {
    if (ev.tenantId !== input.tenantId) {
      errors.push(tenantMismatch({
        domain: ev.domain,
        expectedTenant: input.tenantId,
        actualTenant: ev.tenantId,
      }));
    }
  }

  const state: CommercialProductState = {
    productId,
    tenantId: input.tenantId,
    productProfile: input.product,
    variants: input.variants,
    currentInventoryPositions: input.inventoryPositions,
    recentSaleLines: input.saleLines,
    productQuality: input.productQuality,
    inventoryQuality: input.inventoryQuality,
    salesQuality: input.salesQuality,
    freshnessSummary: input.freshness,
    evidenceSummary: input.evidence.filter(e => e.tenantId === input.tenantId),
    unresolvedRelations: errors,
    asOf: input.asOf,
  };

  return { state, errors };
}
