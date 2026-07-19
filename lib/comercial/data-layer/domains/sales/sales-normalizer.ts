/**
 * domains/sales/sales-normalizer.ts
 *
 * Normalizes raw SAG invoice/document data into canonical SalesDocument + SaleLine[].
 * Uses shared normalizers — never contains SAG-specific constants directly.
 */

import type { SalesDocument, SalesDocumentFinancials, SalesDocumentType, SaleLine } from "./sales-entities";
import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";
import { deriveSalesDocumentStatus } from "./sales-entities";
import {
  normalizeReferenceCode,
  normalizeText,
  normalizeDecimal,
  normalizeBoolean,
  normalizeDate,
  normalizeNullableString,
  normalizeDocumentNumber,
} from "../../shared/normalizers";
import { buildCanonicalId } from "../../shared/identifiers";
import { buildExternalReference } from "../../shared/external-reference-helpers";

// ── Raw Input Contract ──────────────────────────────────────────────────────

export interface SalesDocumentRawInput {
  readonly tipoDocumento: unknown;
  readonly numeroDocumento: unknown;
  readonly fecha: unknown;
  readonly nit: unknown;
  readonly nombreCliente?: unknown;
  readonly codigoVendedor?: unknown;
  readonly nombreVendedor?: unknown;
  readonly bodega?: unknown;
  readonly subtotal: unknown;
  readonly descuento?: unknown;
  readonly ivaTotal?: unknown;
  readonly total: unknown;
  readonly observaciones?: unknown;
  readonly anulada?: unknown;
  readonly lineas?: unknown;
  readonly fechaModificacion?: unknown;
  /** Optional: linked Agentik order sync key */
  readonly externalSyncKey?: unknown;
}

export interface SaleLineRawInput {
  readonly lineaNumero?: unknown;
  readonly codigoArticulo: unknown;
  readonly descripcion?: unknown;
  readonly talla?: unknown;
  readonly color?: unknown;
  readonly cantidad: unknown;
  readonly precioUnitario: unknown;
  readonly descuento?: unknown;
  readonly totalLinea: unknown;
  readonly tarifaIva?: unknown;
  readonly ivaLinea?: unknown;
  readonly bodega?: unknown;
  readonly costo?: unknown;
}

// ── Normalization Context ───────────────────────────────────────────────────

export interface SalesNormalizationContext {
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly correlationId: string;
  readonly extractedAt: Date;
}

// ── Normalization Result ────────────────────────────────────────────────────

export interface SalesNormalizationOutput {
  readonly document: SalesDocument | null;
  readonly lines: SaleLine[];
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly warnings: string[];
}

// ── Document Type Resolution ────────────────────────────────────────────────

const DOC_TYPE_MAP: Record<string, SalesDocumentType> = {
  FA: "FACTURA",
  FACTURA: "FACTURA",
  NC: "NOTA_CREDITO",
  NOTA_CREDITO: "NOTA_CREDITO",
  ND: "NOTA_DEBITO",
  NOTA_DEBITO: "NOTA_DEBITO",
  RE: "REMISION",
  REMISION: "REMISION",
};

function resolveDocumentType(raw: unknown): SalesDocumentType | null {
  if (!raw) return null;
  const key = String(raw).toUpperCase().trim();
  return DOC_TYPE_MAP[key] ?? null;
}

// ── Normalizer ──────────────────────────────────────────────────────────────

export function normalizeSalesDocument(
  raw: SalesDocumentRawInput,
  ctx: SalesNormalizationContext
): SalesNormalizationOutput {
  const warnings: string[] = [];

  // ── Required: document number ─────────────────────────────────────────
  const docNumResult = normalizeDocumentNumber(raw.numeroDocumento);
  if (!docNumResult.ok || !docNumResult.value) {
    return { document: null, lines: [], skipped: true, skipReason: "Missing or invalid document number", warnings };
  }
  const documentNumber = docNumResult.value;

  // ── Required: document type ───────────────────────────────────────────
  const documentType = resolveDocumentType(raw.tipoDocumento);
  if (!documentType) {
    return { document: null, lines: [], skipped: true, skipReason: "Missing or invalid document type", warnings };
  }

  // ── Required: date ────────────────────────────────────────────────────
  const dateResult = normalizeDate(raw.fecha);
  if (!dateResult.ok || !dateResult.value) {
    return { document: null, lines: [], skipped: true, skipReason: "Missing or invalid document date", warnings };
  }

  // ── Required: customer code (NIT) ─────────────────────────────────────
  const nitResult = normalizeReferenceCode(raw.nit);
  if (!nitResult.ok || !nitResult.value) {
    return { document: null, lines: [], skipped: true, skipReason: "Missing customer code (NIT)", warnings };
  }

  // ── Optional fields ───────────────────────────────────────────────────
  const customerName = normalizeNullableString(raw.nombreCliente);
  const sellerCode = normalizeNullableString(raw.codigoVendedor);
  const sellerName = normalizeNullableString(raw.nombreVendedor);
  const warehouseCode = normalizeReferenceCode(raw.bodega);
  const observations = normalizeNullableString(raw.observaciones);
  const anuladaResult = normalizeBoolean(raw.anulada);
  const externalSyncKey = normalizeNullableString(raw.externalSyncKey);

  // ── Financials ────────────────────────────────────────────────────────
  const subtotalResult = normalizeDecimal(raw.subtotal);
  const discountResult = normalizeDecimal(raw.descuento);
  const ivaResult = normalizeDecimal(raw.ivaTotal);
  const totalResult = normalizeDecimal(raw.total);

  const total = totalResult.ok && totalResult.value != null ? totalResult.value : 0;

  if (total <= 0 && documentType === "FACTURA") {
    warnings.push("Invoice has zero or negative total");
  }

  // ── Modification date ─────────────────────────────────────────────────
  const fechaModResult = normalizeDate(raw.fechaModificacion);

  // ── Build canonical identity ──────────────────────────────────────────
  const now = new Date();

  const identity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "SALES",
      entityType: "SalesDocument",
      naturalKey: `${documentType}:${documentNumber}`,
    }),
    tenantId: ctx.tenantId,
    domain: "SALES",
    naturalKey: `${documentType}:${documentNumber}`,
  };

  const externalRef: ExternalReference = buildExternalReference({
    externalId: documentNumber,
    systemType: ctx.sourceSystem as any,
    instanceId: ctx.instanceId,
    resource: "DOCUMENTOS",
  });

  const sourceMetadata: DataSourceMetadata = {
    sourceType: ctx.sourceSystem as any,
    adapterId: ctx.adapterId,
    adapterVersion: ctx.adapterVersion,
    extractedAt: ctx.extractedAt,
    extractionMode: "FULL",
    correlationId: ctx.correlationId,
  };

  const sourceModifiedAt = fechaModResult.ok && fechaModResult.value ? new Date(fechaModResult.value) : null;

  const timestamps: CommercialTimestamp = {
    createdAt: now,
    updatedAt: now,
    sourceModifiedAt,
    lastSyncAt: ctx.extractedAt,
  };

  // ── Parse lines ───────────────────────────────────────────────────────
  const rawLines = Array.isArray(raw.lineas) ? raw.lineas : [];
  const lines: SaleLine[] = [];
  let totalUnits = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i] as SaleLineRawInput;
    const line = normalizeSaleLine(rawLine, identity, ctx, i + 1);
    if (line) {
      lines.push(line);
      totalUnits += line.quantity;
    } else {
      warnings.push(`Line ${i + 1} skipped: missing reference code or quantity`);
    }
  }

  // ── Build financials ──────────────────────────────────────────────────
  const financials: SalesDocumentFinancials = {
    subtotal: subtotalResult.ok && subtotalResult.value != null ? subtotalResult.value : total,
    discount: discountResult.ok && discountResult.value != null ? discountResult.value : 0,
    ivaTotal: ivaResult.ok && ivaResult.value != null ? ivaResult.value : 0,
    total,
    currency: "COP",
  };

  // ── Derive status ─────────────────────────────────────────────────────
  const anulada = anuladaResult.ok ? (anuladaResult.value ?? false) : false;
  const status = deriveSalesDocumentStatus({ anulada, totalValue: total });

  // ── Assemble document ─────────────────────────────────────────────────
  const document: SalesDocument = {
    identity,
    externalRef,
    sourceMetadata,
    timestamps,
    schemaVersion: 1,
    documentNumber,
    documentType,
    status,
    date: new Date(dateResult.value!),
    customerCode: nitResult.value!,
    customerName: customerName.ok && customerName.value ? customerName.value : "",
    sellerCode: sellerCode.ok && sellerCode.value ? sellerCode.value : "",
    sellerName: sellerName.ok && sellerName.value ? sellerName.value : "",
    warehouseCode: warehouseCode.ok && warehouseCode.value ? warehouseCode.value : "",
    financials,
    lineCount: lines.length,
    totalUnits,
    linkedOrderId: null,
    linkedOrderSyncKey: externalSyncKey.ok && externalSyncKey.value ? externalSyncKey.value : null,
    observations: observations.ok ? observations.value : null,
  };

  return { document, lines, skipped: false, warnings };
}

// ── Line Normalizer ─────────────────────────────────────────────────────────

function normalizeSaleLine(
  raw: SaleLineRawInput,
  documentIdentity: CommercialIdentity,
  ctx: SalesNormalizationContext,
  lineNumber: number
): SaleLine | null {
  const codeResult = normalizeReferenceCode(raw.codigoArticulo);
  if (!codeResult.ok || !codeResult.value) return null;

  const qtyResult = normalizeDecimal(raw.cantidad);
  if (!qtyResult.ok || !qtyResult.value || qtyResult.value <= 0) return null;

  const priceResult = normalizeDecimal(raw.precioUnitario);
  const discountResult = normalizeDecimal(raw.descuento);
  const totalResult = normalizeDecimal(raw.totalLinea);
  const ivaRateResult = normalizeDecimal(raw.tarifaIva);
  const ivaAmountResult = normalizeDecimal(raw.ivaLinea);
  const costResult = normalizeDecimal(raw.costo);
  const descResult = normalizeNullableString(raw.descripcion);
  const sizeResult = normalizeNullableString(raw.talla);
  const colorResult = normalizeNullableString(raw.color);
  const warehouseResult = normalizeNullableString(raw.bodega);

  const lineIdentity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "SALES",
      entityType: "SaleLine",
      naturalKey: `${documentIdentity.naturalKey}:L${lineNumber}`,
    }),
    tenantId: ctx.tenantId,
    domain: "SALES",
    naturalKey: `${documentIdentity.naturalKey}:L${lineNumber}`,
  };

  return {
    identity: lineIdentity,
    documentIdentity,
    lineNumber,
    referenceCode: codeResult.value,
    productName: descResult.ok && descResult.value ? descResult.value : "",
    sizeCode: sizeResult.ok ? sizeResult.value : null,
    colorCode: colorResult.ok ? colorResult.value : null,
    quantity: qtyResult.value,
    unitPrice: priceResult.ok && priceResult.value != null ? priceResult.value : 0,
    discount: discountResult.ok && discountResult.value != null ? discountResult.value : 0,
    lineTotal: totalResult.ok && totalResult.value != null ? totalResult.value : 0,
    ivaRate: ivaRateResult.ok && ivaRateResult.value != null ? ivaRateResult.value : 0,
    ivaAmount: ivaAmountResult.ok && ivaAmountResult.value != null ? ivaAmountResult.value : 0,
    warehouseCode: warehouseResult.ok ? warehouseResult.value : null,
    unitCost: costResult.ok ? costResult.value : null,
  };
}
