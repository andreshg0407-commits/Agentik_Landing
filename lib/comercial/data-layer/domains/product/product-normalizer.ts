/**
 * domains/product/product-normalizer.ts
 *
 * Normalizes raw SAG article data into canonical ProductProfile.
 * Uses shared normalizers — never contains SAG-specific constants directly.
 */

import type { ProductProfile, ProductClassification, ProductPricing, ProductOperational } from "./product-entities";
import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";
import { deriveCommercialStatus } from "./product-entities";
import {
  normalizeReferenceCode,
  normalizeText,
  normalizeDecimal,
  normalizeBoolean,
  normalizeDate,
  normalizeNullableString,
} from "../../shared/normalizers";
import { buildCanonicalId } from "../../shared/identifiers";
import { buildExternalReference } from "../../shared/external-reference-helpers";

// ── Raw Input Contract ──────────────────────────────────────────────────────
// This is what the SAG adapter passes AFTER its own field-resolution logic.
// It's ERP-agnostic in the sense that any adapter producing these fields works.

export interface ProductRawInput {
  readonly codigo: unknown;
  readonly descripcion: unknown;
  readonly descripcion2?: unknown;
  readonly grupo: unknown;
  readonly subGrupo: unknown;
  readonly linea: unknown;
  readonly marca: unknown;
  readonly unidad: unknown;
  readonly iva: unknown;
  readonly tarifaIva: unknown;
  readonly precio: unknown;
  readonly costo: unknown;
  readonly manejaKardex: unknown;
  readonly manejaTallaColor: unknown;
  readonly manejaLote: unknown;
  readonly activo: unknown;
  readonly bloqueado: unknown;
  readonly fechaModificacion: unknown;

  /** Optional resolved names from lookup tables */
  readonly grupoNombre?: unknown;
  readonly subGrupoNombre?: unknown;
  readonly lineaNombre?: unknown;
}

// ── Normalization Context ───────────────────────────────────────────────────

export interface ProductNormalizationContext {
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly correlationId: string;
  readonly extractedAt: Date;
}

// ── Normalization Result ────────────────────────────────────────────────────

export interface ProductNormalizationOutput {
  readonly profile: ProductProfile | null;
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly warnings: string[];
}

// ── Normalizer ──────────────────────────────────────────────────────────────

export function normalizeProductRaw(
  raw: ProductRawInput,
  ctx: ProductNormalizationContext
): ProductNormalizationOutput {
  const warnings: string[] = [];

  // ── Required: reference code ────────────────────────────────────────────
  const codeResult = normalizeReferenceCode(raw.codigo);
  if (!codeResult.ok || !codeResult.value) {
    return { profile: null, skipped: true, skipReason: "Missing or invalid product code", warnings };
  }
  const referenceCode = codeResult.value;

  // ── Name ────────────────────────────────────────────────────────────────
  const nameResult = normalizeText(raw.descripcion);
  if (!nameResult.ok || !nameResult.value) {
    return { profile: null, skipped: true, skipReason: "Missing product name", warnings };
  }

  // ── Optional fields ─────────────────────────────────────────────────────
  const secondaryName = normalizeNullableString(raw.descripcion2);
  const grupoResult = normalizeReferenceCode(raw.grupo);
  const subGrupoResult = normalizeReferenceCode(raw.subGrupo);
  const lineaResult = normalizeReferenceCode(raw.linea);
  const marcaResult = normalizeNullableString(raw.marca);
  const unidadResult = normalizeText(raw.unidad);

  // ── Pricing ─────────────────────────────────────────────────────────────
  const precioResult = normalizeDecimal(raw.precio);
  const costoResult = normalizeDecimal(raw.costo);
  const tarifaResult = normalizeDecimal(raw.tarifaIva);
  const ivaResult = normalizeBoolean(raw.iva);

  if (precioResult.ok && precioResult.value! <= 0) {
    warnings.push("Product has zero or negative price");
  }

  // ── Operational flags ───────────────────────────────────────────────────
  const kardexResult = normalizeBoolean(raw.manejaKardex);
  const tallaColorResult = normalizeBoolean(raw.manejaTallaColor);
  const loteResult = normalizeBoolean(raw.manejaLote);
  const activoResult = normalizeBoolean(raw.activo);
  const bloqueadoResult = normalizeBoolean(raw.bloqueado);

  // ── Date ────────────────────────────────────────────────────────────────
  const fechaResult = normalizeDate(raw.fechaModificacion);

  // ── Resolved names ──────────────────────────────────────────────────────
  const grupoNombre = normalizeNullableString(raw.grupoNombre);
  const subGrupoNombre = normalizeNullableString(raw.subGrupoNombre);
  const lineaNombre = normalizeNullableString(raw.lineaNombre);

  // ── Build canonical identity ────────────────────────────────────────────
  const now = new Date();

  const identity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "PRODUCT",
      entityType: "ProductProfile",
      naturalKey: referenceCode,
    }),
    tenantId: ctx.tenantId,
    domain: "PRODUCT",
    naturalKey: referenceCode,
  };

  const externalRef: ExternalReference = buildExternalReference({
    externalId: referenceCode,
    systemType: ctx.sourceSystem as any,
    instanceId: ctx.instanceId,
    resource: "ARTICULOS",
  });

  const sourceMetadata: DataSourceMetadata = {
    sourceType: ctx.sourceSystem as any,
    adapterId: ctx.adapterId,
    adapterVersion: ctx.adapterVersion,
    extractedAt: ctx.extractedAt,
    extractionMode: "FULL",
    correlationId: ctx.correlationId,
  };

  const sourceModifiedAt = fechaResult.ok && fechaResult.value ? new Date(fechaResult.value) : null;

  const timestamps: CommercialTimestamp = {
    createdAt: now,
    updatedAt: now,
    sourceModifiedAt,
    lastSyncAt: ctx.extractedAt,
  };

  // ── Build classification ────────────────────────────────────────────────
  const classification: ProductClassification = {
    groupId: grupoResult.ok && grupoResult.value ? grupoResult.value : "",
    groupName: grupoNombre.ok ? grupoNombre.value : null,
    subGroupId: subGrupoResult.ok && subGrupoResult.value ? subGrupoResult.value : "",
    subGroupName: subGrupoNombre.ok ? subGrupoNombre.value : null,
    lineId: lineaResult.ok && lineaResult.value ? lineaResult.value : "",
    lineName: lineaNombre.ok ? lineaNombre.value : null,
    brand: marcaResult.ok ? marcaResult.value : null,
    unit: unidadResult.ok && unidadResult.value ? unidadResult.value : "UND",
  };

  // ── Build pricing ──────────────────────────────────────────────────────
  const pricing: ProductPricing = {
    salePrice: precioResult.ok && precioResult.value != null ? precioResult.value : 0,
    cost: costoResult.ok && costoResult.value != null ? costoResult.value : 0,
    currency: "COP",
    hasIva: ivaResult.ok ? (ivaResult.value ?? false) : false,
    ivaTariff: tarifaResult.ok && tarifaResult.value != null ? tarifaResult.value : 0,
  };

  // ── Build operational ──────────────────────────────────────────────────
  const operational: ProductOperational = {
    managesInventory: kardexResult.ok ? (kardexResult.value ?? false) : false,
    managesVariants: tallaColorResult.ok ? (tallaColorResult.value ?? false) : false,
    managesLot: loteResult.ok ? (loteResult.value ?? false) : false,
    active: activoResult.ok ? (activoResult.value ?? true) : true,
    blocked: bloqueadoResult.ok ? (bloqueadoResult.value ?? false) : false,
  };

  // ── Assemble profile ───────────────────────────────────────────────────
  const profile: ProductProfile = {
    identity,
    externalRef,
    sourceMetadata,
    timestamps,
    schemaVersion: 1,
    referenceCode,
    name: nameResult.value!,
    secondaryName: secondaryName.ok ? secondaryName.value : null,
    classification,
    pricing,
    operational,
    hasVariants: operational.managesVariants,
    commercialStatus: deriveCommercialStatus(operational),
  };

  return { profile, skipped: false, warnings };
}
