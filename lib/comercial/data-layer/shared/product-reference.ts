/**
 * shared/product-reference.ts
 *
 * Cross-domain product reference contract.
 * Product Domain owns the identity. Sales and Inventory consume it.
 *
 * Sprint: COMMERCIAL-DATA-LAYER-INTEGRATION-01
 */

import { buildCanonicalId } from "./identifiers";

// -- Resolution Status ------------------------------------------------------

export type ProductResolutionStatus =
  | "RESOLVED"
  | "PARTIALLY_RESOLVED"
  | "UNRESOLVED"
  | "CONFLICTED";

// -- Commercial Product Reference ------------------------------------------

export interface CommercialProductReference {
  /** Tenant scope */
  readonly tenantId: string;

  /** Canonical Product ID — built by Product Domain (owner) */
  readonly productId: string | null;

  /** Raw product reference code (the natural key) */
  readonly productReference: string;

  /** Variant canonical ID (if resolved) */
  readonly variantId: string | null;

  /** Raw variant reference (size + color) */
  readonly variantReference: VariantReference | null;

  /** External references from the Product Domain */
  readonly externalReferences: ProductExternalRef[];

  /** Resolution status */
  readonly resolutionStatus: ProductResolutionStatus;

  /** Confidence 0.0 - 1.0 */
  readonly confidence: number;

  /** Evidence of resolution */
  readonly evidence: ProductResolutionEvidence;
}

// -- Variant Reference ------------------------------------------------------

export interface VariantReference {
  readonly sizeCode: string | null;
  readonly colorCode: string | null;
  readonly sizeName: string | null;
  readonly colorName: string | null;
  readonly sku: string | null;
}

// -- Product External Ref (lightweight) -------------------------------------

export interface ProductExternalRef {
  readonly systemType: string;
  readonly externalId: string;
  readonly resource: string;
}

// -- Resolution Evidence ----------------------------------------------------

export interface ProductResolutionEvidence {
  /** How was the resolution performed */
  readonly method: "CANONICAL_MATCH" | "REFERENCE_CODE_MATCH" | "EXTERNAL_ID_MATCH" | "UNMATCHED";
  /** When was the resolution last confirmed */
  readonly resolvedAt: Date | null;
  /** Source domain that provided the reference */
  readonly sourceDomain: string;
  /** Note explaining the resolution */
  readonly note: string | null;
}

// -- Build Product Canonical ID (the single truth) --------------------------

export function buildProductCanonicalId(tenantId: string, referenceCode: string): string {
  return buildCanonicalId({
    tenantId,
    domain: "PRODUCT",
    entityType: "ProductProfile",
    naturalKey: referenceCode,
  });
}

// -- Build Variant Canonical ID ---------------------------------------------

export function buildVariantCanonicalId(
  tenantId: string,
  referenceCode: string,
  sizeCode: string,
  colorCode: string
): string {
  return buildCanonicalId({
    tenantId,
    domain: "PRODUCT",
    entityType: "ProductVariant",
    naturalKey: `${referenceCode}:${sizeCode}:${colorCode}`,
  });
}

// -- Resolve Product Reference from any domain ------------------------------

export function resolveProductReference(params: {
  tenantId: string;
  referenceCode: string;
  sourceDomain: string;
  variant?: VariantReference | null;
}): CommercialProductReference {
  const { tenantId, referenceCode, sourceDomain, variant } = params;

  const productId = buildProductCanonicalId(tenantId, referenceCode);

  let variantId: string | null = null;
  if (variant?.sizeCode && variant?.colorCode) {
    variantId = buildVariantCanonicalId(tenantId, referenceCode, variant.sizeCode, variant.colorCode);
  }

  const hasVariant = variant?.sizeCode != null || variant?.colorCode != null;
  const variantResolved = variantId != null;

  let resolutionStatus: ProductResolutionStatus;
  if (variantResolved) {
    resolutionStatus = "RESOLVED";
  } else if (hasVariant && !variantResolved) {
    resolutionStatus = "PARTIALLY_RESOLVED";
  } else {
    resolutionStatus = "RESOLVED";
  }

  return {
    tenantId,
    productId,
    productReference: referenceCode,
    variantId,
    variantReference: variant ?? null,
    externalReferences: [],
    resolutionStatus,
    confidence: resolutionStatus === "RESOLVED" ? 1.0 : 0.6,
    evidence: {
      method: "REFERENCE_CODE_MATCH",
      resolvedAt: new Date(),
      sourceDomain,
      note: null,
    },
  };
}
