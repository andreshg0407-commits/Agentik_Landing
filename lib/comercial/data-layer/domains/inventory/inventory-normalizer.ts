/**
 * domains/inventory/inventory-normalizer.ts
 *
 * Normalizes raw inventory data from any source into canonical InventoryPosition.
 * Uses shared normalizers — never contains ERP-specific constants.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

import type {
  InventoryPosition,
  InventoryLocation,
  InventoryQuantities,
  InventoryClassification,
  InventoryVariantDetail,
  InventoryLocationType,
} from "./inventory-entities";
import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";
import { derivePositionStatus } from "./inventory-entities";
import {
  normalizeReferenceCode,
  normalizeText,
  normalizeDecimal,
  normalizeInteger,
  normalizeNullableString,
  normalizeDate,
} from "../../shared/normalizers";
import { buildCanonicalId, buildNaturalKey } from "../../shared/identifiers";
import { buildExternalReference } from "../../shared/external-reference-helpers";

// -- Raw Input Contract -----------------------------------------------------
// This is what any inventory adapter passes to the normalizer.
// ERP-agnostic: any adapter producing these fields works.

export interface InventoryRawInput {
  /** Product reference code */
  readonly referenceCode: unknown;
  /** Product name/description */
  readonly productName: unknown;

  /** Location */
  readonly locationCode: unknown;
  readonly locationLabel?: unknown;
  readonly locationType?: unknown;
  readonly parentLocationCode?: unknown;
  readonly parentLocationType?: unknown;

  /** Quantities */
  readonly physicalQty: unknown;
  readonly availableQty: unknown;
  readonly reservedQty?: unknown;
  readonly committedQty?: unknown;
  readonly inTransitQty?: unknown;
  readonly blockedQty?: unknown;

  /** Unit of measure */
  readonly unitOfMeasure?: unknown;

  /** Variant (optional) */
  readonly sizeCode?: unknown;
  readonly colorCode?: unknown;
  readonly sizeName?: unknown;
  readonly colorName?: unknown;
  readonly sku?: unknown;

  /** Classification (optional) */
  readonly groupId?: unknown;
  readonly groupName?: unknown;
  readonly subGroupId?: unknown;
  readonly subGroupName?: unknown;
  readonly lineId?: unknown;
  readonly lineName?: unknown;

  /** Last modification date in source */
  readonly sourceModifiedAt?: unknown;
}

// -- Normalization Context --------------------------------------------------

export interface InventoryNormalizationContext {
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly correlationId: string;
  readonly extractedAt: Date;
}

// -- Normalization Result ---------------------------------------------------

export interface InventoryNormalizationOutput {
  readonly position: InventoryPosition | null;
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly warnings: string[];
}

// -- Normalizer -------------------------------------------------------------

export function normalizeInventoryRaw(
  raw: InventoryRawInput,
  ctx: InventoryNormalizationContext
): InventoryNormalizationOutput {
  const warnings: string[] = [];

  // -- Required: reference code -------------------------------------------
  const codeResult = normalizeReferenceCode(raw.referenceCode);
  if (!codeResult.ok || !codeResult.value) {
    return { position: null, skipped: true, skipReason: "Missing or invalid reference code", warnings };
  }
  const referenceCode = codeResult.value;

  // -- Required: product name ---------------------------------------------
  const nameResult = normalizeText(raw.productName);
  if (!nameResult.ok || !nameResult.value) {
    return { position: null, skipped: true, skipReason: "Missing product name", warnings };
  }

  // -- Required: location code --------------------------------------------
  const locCodeResult = normalizeReferenceCode(raw.locationCode);
  if (!locCodeResult.ok || !locCodeResult.value) {
    return { position: null, skipped: true, skipReason: "Missing location code", warnings };
  }

  // -- Quantities ---------------------------------------------------------
  const physicalResult = normalizeDecimal(raw.physicalQty);
  const availableResult = normalizeDecimal(raw.availableQty);

  if (!physicalResult.ok && !availableResult.ok) {
    return { position: null, skipped: true, skipReason: "Missing both physical and available quantity", warnings };
  }

  const physicalQty = physicalResult.ok && physicalResult.value != null ? physicalResult.value : 0;
  const availableQty = availableResult.ok && availableResult.value != null ? availableResult.value : physicalQty;
  const reservedQty = safeDecimal(raw.reservedQty);
  const committedQty = safeDecimal(raw.committedQty);
  const inTransitQty = safeDecimal(raw.inTransitQty);
  const blockedQty = safeDecimal(raw.blockedQty);

  // -- Location -----------------------------------------------------------
  const locLabel = normalizeNullableString(raw.locationLabel);
  const locType = normalizeLocationType(raw.locationType);
  const parentCode = normalizeNullableString(raw.parentLocationCode);
  const parentType = raw.parentLocationType ? normalizeLocationType(raw.parentLocationType) : null;

  const location: InventoryLocation = {
    type: locType,
    code: locCodeResult.value!,
    label: locLabel.ok ? locLabel.value : null,
    parentCode: parentCode.ok ? parentCode.value : null,
    parentType,
  };

  // -- Variant ------------------------------------------------------------
  const sizeCode = normalizeNullableString(raw.sizeCode);
  const colorCode = normalizeNullableString(raw.colorCode);
  const hasVariant = (sizeCode.ok && sizeCode.value != null) || (colorCode.ok && colorCode.value != null);

  let variant: InventoryVariantDetail | null = null;
  if (hasVariant) {
    const sizeName = normalizeNullableString(raw.sizeName);
    const colorName = normalizeNullableString(raw.colorName);
    const skuResult = normalizeNullableString(raw.sku);
    variant = {
      sizeCode: sizeCode.ok && sizeCode.value ? sizeCode.value : "",
      colorCode: colorCode.ok && colorCode.value ? colorCode.value : "",
      sizeName: sizeName.ok ? sizeName.value : null,
      colorName: colorName.ok ? colorName.value : null,
      sku: skuResult.ok ? skuResult.value : null,
    };
  }

  // -- Classification -----------------------------------------------------
  const groupId = normalizeNullableString(raw.groupId);
  const subGroupId = normalizeNullableString(raw.subGroupId);
  const lineId = normalizeNullableString(raw.lineId);

  const classification: InventoryClassification = {
    groupId: groupId.ok && groupId.value ? groupId.value : "",
    groupName: safeNullStr(raw.groupName),
    subGroupId: subGroupId.ok && subGroupId.value ? subGroupId.value : "",
    subGroupName: safeNullStr(raw.subGroupName),
    lineId: lineId.ok && lineId.value ? lineId.value : "",
    lineName: safeNullStr(raw.lineName),
  };

  // -- Unit of measure ----------------------------------------------------
  const unitResult = normalizeText(raw.unitOfMeasure);
  const unitOfMeasure = unitResult.ok && unitResult.value ? unitResult.value : "UND";

  // -- Quantities object --------------------------------------------------
  const quantities: InventoryQuantities = {
    physicalQty,
    availableQty,
    reservedQty,
    committedQty,
    inTransitQty,
    blockedQty,
  };

  // -- State derivation ---------------------------------------------------
  const state = availableQty > 0 ? "AVAILABLE" : physicalQty > 0 ? "RESERVED" : "UNKNOWN";

  // -- Build canonical identity -------------------------------------------
  const now = new Date();
  const naturalKey = hasVariant
    ? buildNaturalKey([referenceCode, location.code, variant!.sizeCode, variant!.colorCode])
    : buildNaturalKey([referenceCode, location.code]);

  const identity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "INVENTORY",
      entityType: "InventoryPosition",
      naturalKey,
    }),
    tenantId: ctx.tenantId,
    domain: "INVENTORY",
    naturalKey,
  };

  const externalRef: ExternalReference = buildExternalReference({
    externalId: referenceCode,
    systemType: ctx.sourceSystem as any,
    instanceId: ctx.instanceId,
    resource: "INVENTORY",
    secondaryId: location.code,
  });

  const sourceMetadata: DataSourceMetadata = {
    sourceType: ctx.sourceSystem as any,
    adapterId: ctx.adapterId,
    adapterVersion: ctx.adapterVersion,
    extractedAt: ctx.extractedAt,
    extractionMode: "FULL",
    correlationId: ctx.correlationId,
  };

  const fechaResult = normalizeDate(raw.sourceModifiedAt);
  const sourceModifiedAt = fechaResult.ok && fechaResult.value ? new Date(fechaResult.value) : null;

  const timestamps: CommercialTimestamp = {
    createdAt: now,
    updatedAt: now,
    sourceModifiedAt,
    lastSyncAt: ctx.extractedAt,
  };

  // -- Assemble position --------------------------------------------------
  const position: InventoryPosition = {
    identity,
    externalRef,
    sourceMetadata,
    timestamps,
    schemaVersion: 1,
    referenceCode,
    productName: nameResult.value!,
    variant,
    location,
    state,
    quantities,
    unitOfMeasure,
    classification,
    positionStatus: derivePositionStatus(quantities),
  };

  return { position, skipped: false, warnings };
}

// -- Helpers ----------------------------------------------------------------

function safeDecimal(input: unknown): number {
  const result = normalizeDecimal(input);
  return result.ok && result.value != null ? result.value : 0;
}

function safeNullStr(input: unknown): string | null {
  const result = normalizeNullableString(input);
  return result.ok ? result.value : null;
}

function normalizeLocationType(input: unknown): InventoryLocationType {
  if (input == null) return "WAREHOUSE";
  const str = String(input).trim().toUpperCase();
  const valid: InventoryLocationType[] = [
    "WAREHOUSE", "PHYSICAL_ZONE", "STORE", "VENDOR_BAG",
    "TRANSIT", "IMPORT_WAREHOUSE", "PRODUCTION",
  ];
  return valid.includes(str as InventoryLocationType) ? (str as InventoryLocationType) : "WAREHOUSE";
}
