/**
 * domains/product/product-entities.ts
 *
 * Canonical entities for the Product Domain.
 * These represent the business concept of "product" regardless of source ERP.
 */

import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";

// ── Product Profile ─────────────────────────────────────────────────────────

export interface ProductProfile {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Human-readable product code (e.g., "ZAP-001") */
  readonly referenceCode: string;

  /** Product name / description */
  readonly name: string;

  /** Secondary description (color/variant text) */
  readonly secondaryName: string | null;

  /** Classification hierarchy */
  readonly classification: ProductClassification;

  /** Pricing at product level */
  readonly pricing: ProductPricing;

  /** Operational flags */
  readonly operational: ProductOperational;

  /** Whether this product manages size/color variants */
  readonly hasVariants: boolean;

  /** Commercial status derived from ERP flags */
  readonly commercialStatus: ProductCommercialStatus;
}

// ── Product Classification ──────────────────────────────────────────────────

export interface ProductClassification {
  /** Top-level group (SAG: GRUPO) */
  readonly groupId: string;
  readonly groupName: string | null;

  /** Sub-group (SAG: SUB_GRUPO) */
  readonly subGroupId: string;
  readonly subGroupName: string | null;

  /** Product line (SAG: LINEA) */
  readonly lineId: string;
  readonly lineName: string | null;

  /** Brand / reference (SAG: MARCA/ka_nl_ref) */
  readonly brand: string | null;

  /** Unit of measure */
  readonly unit: string;
}

// ── Product Pricing ─────────────────────────────────────────────────────────

export interface ProductPricing {
  /** List sale price */
  readonly salePrice: number;

  /** Standard cost */
  readonly cost: number;

  /** Currency (always COP for Castillitos, but multi-tenant ready) */
  readonly currency: string;

  /** IVA applicable */
  readonly hasIva: boolean;

  /** IVA tariff percentage */
  readonly ivaTariff: number;
}

// ── Product Operational ─────────────────────────────────────────────────────

export interface ProductOperational {
  /** Manages inventory (kardex) */
  readonly managesInventory: boolean;

  /** Manages size/color variants */
  readonly managesVariants: boolean;

  /** Manages lot/batch */
  readonly managesLot: boolean;

  /** Is active in ERP */
  readonly active: boolean;

  /** Is blocked in ERP */
  readonly blocked: boolean;
}

// ── Product Variant ─────────────────────────────────────────────────────────

export interface ProductVariant {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Parent product reference code */
  readonly productReferenceCode: string;

  /** Variant SKU (ka_nl_sku in SAG) */
  readonly sku: string;

  /** Size code */
  readonly sizeCode: string;

  /** Color code */
  readonly colorCode: string;

  /** Size display name (resolved) */
  readonly sizeName: string | null;

  /** Color display name (resolved) */
  readonly colorName: string | null;

  /** Variant-level status */
  readonly active: boolean;
}

// ── Commercial Status ───────────────────────────────────────────────────────

export type ProductCommercialStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "BLOCKED"
  | "DISCONTINUED";

export function deriveCommercialStatus(operational: ProductOperational): ProductCommercialStatus {
  if (operational.blocked) return "BLOCKED";
  if (!operational.active) return "INACTIVE";
  return "ACTIVE";
}
