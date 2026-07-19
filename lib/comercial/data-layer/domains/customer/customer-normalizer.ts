/**
 * domains/customer/customer-normalizer.ts
 *
 * Normalizes raw SAG TERCEROS data into canonical CustomerProfile.
 * Uses shared normalizers — never contains SAG-specific constants directly.
 *
 * Known data gap (GAP-01): TERCEROS only provides ~5 core fields
 * (ID_CLIENTE, NIT, RAZON_SOCIAL, SEGMENTO, PLAZO_CREDITO).
 * Additional fields are optional and may arrive from CRM or future enrichment.
 */

import type { CustomerProfile, CustomerSegment, CustomerContact, CustomerLocation, CustomerFiscal } from "./customer-entities";
import { deriveCustomerAdminStatus } from "./customer-entities";
import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";
import {
  normalizeCustomerCode,
  normalizeText,
  normalizeNullableString,
  normalizeInteger,
  normalizeEmail,
  normalizePhone,
  normalizeCity,
  normalizeDate,
  normalizeBoolean,
} from "../../shared/normalizers";
import { buildCanonicalId } from "../../shared/identifiers";
import { buildExternalReference } from "../../shared/external-reference-helpers";

// ── Raw Input Contract ──────────────────────────────────────────────────────
// This is what the SAG adapter passes AFTER its own field-resolution logic.

export interface CustomerRawInput {
  /** Customer code / ID */
  readonly idCliente: unknown;
  /** Tax ID (NIT / CC / CE) */
  readonly nit: unknown;
  /** Legal / commercial name */
  readonly razonSocial: unknown;
  /** Segment code */
  readonly segmento: unknown;
  /** Credit term in days */
  readonly plazoCredito: unknown;

  // ── Optional fields (may arrive from CRM or enriched ERP) ──────────────
  readonly nombreComercial?: unknown;
  readonly segmentoNombre?: unknown;
  readonly tipoDocumento?: unknown;
  readonly telefono?: unknown;
  readonly telefono2?: unknown;
  readonly celular?: unknown;
  readonly email?: unknown;
  readonly contacto?: unknown;
  readonly direccion?: unknown;
  readonly ciudad?: unknown;
  readonly codigoCiudad?: unknown;
  readonly departamento?: unknown;
  readonly codigoDepartamento?: unknown;
  readonly pais?: unknown;
  readonly codigoPostal?: unknown;
  readonly zona?: unknown;
  readonly regimen?: unknown;
  readonly responsabilidades?: unknown;
  readonly agenteRetencion?: unknown;
  readonly autoretenedor?: unknown;
  readonly tipoTercero?: unknown;
  readonly crmId?: unknown;
  readonly activo?: unknown;
  readonly fechaModificacion?: unknown;
  readonly cuentaClave?: unknown;

  // ── CUSTOMER-SAG-ENRICHMENT-02: commercial assignment raw fields ──────
  readonly vendedor?: unknown;
  readonly nitVendedor?: unknown;
  readonly supervisor?: unknown;
  readonly canal?: unknown;
  readonly territorio?: unknown;
  readonly tipoCliente?: unknown;
  readonly listaPrecios?: unknown;
  readonly ruta?: unknown;
  readonly clasificacion?: unknown;

  // ── CUSTOMER-SAG-ENRICHMENT-02: credit raw fields ─────────────────────
  readonly cupoCredito?: unknown;
  readonly bloqueoComercial?: unknown;
  readonly estadoCredito?: unknown;
  readonly condicionesCredito?: unknown;

  // ── CUSTOMER-SAG-ENRICHMENT-02: CRM join fallback ─────────────────────
  readonly billingAccountId?: unknown;
  readonly crmAccountStatus?: unknown;
  readonly crmAssignedUserName?: unknown;
  readonly crmAssignedUserId?: unknown;
}

// ── Normalization Context ───────────────────────────────────────────────────

export interface CustomerNormalizationContext {
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly correlationId: string;
  readonly extractedAt: Date;
}

// ── Normalization Result ────────────────────────────────────────────────────

export interface CustomerNormalizationOutput {
  readonly customer: CustomerProfile | null;
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly warnings: string[];
}

// ── Normalizer ──────────────────────────────────────────────────────────────

export function normalizeCustomerRaw(
  raw: CustomerRawInput,
  ctx: CustomerNormalizationContext
): CustomerNormalizationOutput {
  const warnings: string[] = [];

  // ── Required: tax ID (NIT) ────────────────────────────────────────────
  const nitResult = normalizeCustomerCode(raw.nit);
  if (!nitResult.ok || !nitResult.value) {
    return { customer: null, skipped: true, skipReason: "Missing or invalid NIT", warnings };
  }
  const taxId = nitResult.value;

  // ── Required: name ────────────────────────────────────────────────────
  const nameResult = normalizeText(raw.razonSocial);
  if (!nameResult.ok || !nameResult.value) {
    return { customer: null, skipped: true, skipReason: "Missing customer name (razonSocial)", warnings };
  }

  // ── Customer code ─────────────────────────────────────────────────────
  const codeResult = normalizeCustomerCode(raw.idCliente);
  const customerCode = codeResult.ok && codeResult.value ? codeResult.value : taxId;

  // ── Optional fields ───────────────────────────────────────────────────
  const tradeName = normalizeNullableString(raw.nombreComercial);
  const segmentoCode = normalizeNullableString(raw.segmento);
  const segmentoNombre = normalizeNullableString(raw.segmentoNombre);
  const plazoResult = normalizeInteger(raw.plazoCredito);
  const tipoDoc = normalizeNullableString(raw.tipoDocumento);
  const tipoTercero = normalizeNullableString(raw.tipoTercero);
  const crmIdResult = normalizeNullableString(raw.crmId);
  const cuentaClave = normalizeBoolean(raw.cuentaClave);
  const activoResult = normalizeBoolean(raw.activo);

  // ── Contact ───────────────────────────────────────────────────────────
  const phone1 = normalizePhone(raw.telefono);
  const phone2 = normalizePhone(raw.telefono2);
  const mobileResult = normalizePhone(raw.celular);
  const emailResult = normalizeEmail(raw.email);
  const contactPerson = normalizeNullableString(raw.contacto);

  if (emailResult.ok === false && raw.email != null) {
    warnings.push("Invalid email format");
  }

  // ── Location ──────────────────────────────────────────────────────────
  const direccion = normalizeNullableString(raw.direccion);
  const ciudad = normalizeCity(raw.ciudad);
  const codigoCiudad = normalizeNullableString(raw.codigoCiudad);
  const departamento = normalizeNullableString(raw.departamento);
  const codigoDepartamento = normalizeNullableString(raw.codigoDepartamento);
  const pais = normalizeNullableString(raw.pais);
  const codigoPostal = normalizeNullableString(raw.codigoPostal);
  const zona = normalizeNullableString(raw.zona);

  // ── Fiscal ────────────────────────────────────────────────────────────
  const regimen = normalizeNullableString(raw.regimen);
  const agenteRetencion = normalizeBoolean(raw.agenteRetencion);
  const autoretenedor = normalizeBoolean(raw.autoretenedor);

  let responsibilities: string[] = [];
  if (raw.responsabilidades != null) {
    if (Array.isArray(raw.responsabilidades)) {
      responsibilities = raw.responsabilidades.map(r => String(r).trim()).filter(Boolean);
    } else if (typeof raw.responsabilidades === "string") {
      responsibilities = raw.responsabilidades.split(/[,;]/).map(r => r.trim()).filter(Boolean);
    }
  }

  // ── Date ──────────────────────────────────────────────────────────────
  const fechaResult = normalizeDate(raw.fechaModificacion);

  // ── Build canonical identity ──────────────────────────────────────────
  const now = new Date();

  const identity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "CUSTOMER",
      entityType: "CustomerProfile",
      naturalKey: taxId,
    }),
    tenantId: ctx.tenantId,
    domain: "CUSTOMER",
    naturalKey: taxId,
  };

  const externalRef: ExternalReference = buildExternalReference({
    externalId: customerCode,
    systemType: ctx.sourceSystem as any,
    instanceId: ctx.instanceId,
    resource: "TERCEROS",
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

  // ── Build sub-objects ─────────────────────────────────────────────────

  const segment: CustomerSegment = {
    code: segmentoCode.ok && segmentoCode.value ? segmentoCode.value : "",
    name: segmentoNombre.ok ? segmentoNombre.value : null,
    isKeyAccount: cuentaClave.ok ? (cuentaClave.value ?? false) : false,
  };

  const contact: CustomerContact = {
    primaryPhone: phone1.ok ? phone1.value : null,
    secondaryPhone: phone2.ok ? phone2.value : null,
    mobile: mobileResult.ok ? mobileResult.value : null,
    email: emailResult.ok ? emailResult.value : null,
    contactPerson: contactPerson.ok ? contactPerson.value : null,
  };

  const location: CustomerLocation = {
    address: direccion.ok ? direccion.value : null,
    city: ciudad.ok ? ciudad.value : null,
    cityCode: codigoCiudad.ok ? codigoCiudad.value : null,
    department: departamento.ok ? departamento.value : null,
    departmentCode: codigoDepartamento.ok ? codigoDepartamento.value : null,
    country: pais.ok && pais.value ? pais.value : "CO",
    postalCode: codigoPostal.ok ? codigoPostal.value : null,
    zone: zona.ok ? zona.value : null,
  };

  const fiscal: CustomerFiscal = {
    regime: regimen.ok ? regimen.value : null,
    responsibilities,
    isWithholdingAgent: agenteRetencion.ok ? (agenteRetencion.value ?? false) : false,
    isSelfWithholding: autoretenedor.ok ? (autoretenedor.value ?? false) : false,
  };

  // ── Resolve tax ID type ───────────────────────────────────────────────
  const taxIdType = resolveTaxIdType(tipoDoc.ok ? tipoDoc.value : null, taxId);

  // ── Resolve third party type ──────────────────────────────────────────
  const thirdPartyType = resolveThirdPartyType(tipoTercero.ok ? tipoTercero.value : null);

  // ── Assemble profile ──────────────────────────────────────────────────

  const customer: CustomerProfile = {
    identity,
    externalRef,
    sourceMetadata,
    timestamps,
    schemaVersion: 1,
    taxId,
    taxIdType,
    name: nameResult.value!,
    tradeName: tradeName.ok ? tradeName.value : null,
    segment,
    creditTermDays: plazoResult.ok && plazoResult.value != null ? Math.max(0, plazoResult.value) : 0,
    contact,
    location,
    fiscal,
    adminStatus: deriveCustomerAdminStatus({
      sagActivo: activoResult.ok ? activoResult.value ?? null : null,
      sagCreditBlocked: normalizeBoolean(raw.bloqueoComercial).ok
        ? normalizeBoolean(raw.bloqueoComercial).value ?? null : null,
      sagTipoTercero: tipoTercero.ok ? tipoTercero.value : null,
      crmAccountStatus: normalizeNullableString(raw.crmAccountStatus).ok
        ? normalizeNullableString(raw.crmAccountStatus).value : null,
    }),
    operationalStatus: "SYNCED",
    thirdPartyType,
    crmId: crmIdResult.ok ? crmIdResult.value : null,
  };

  return { customer, skipped: false, warnings };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveTaxIdType(tipoDoc: string | null, taxId: string): "NIT" | "CC" | "CE" | "PASSPORT" | "OTHER" | "UNKNOWN" {
  if (tipoDoc) {
    const upper = tipoDoc.toUpperCase().trim();
    if (upper === "NIT" || upper === "31") return "NIT";
    if (upper === "CC" || upper === "13") return "CC";
    if (upper === "CE" || upper === "22") return "CE";
    if (upper === "PA" || upper === "41") return "PASSPORT";
    return "OTHER";
  }
  // Heuristic: NIT typically has a dash + verification digit
  if (/^\d{6,10}-?\d$/.test(taxId)) return "NIT";
  if (/^\d{6,10}$/.test(taxId)) return "CC";
  return "UNKNOWN";
}

function resolveThirdPartyType(tipo: string | null): "CUSTOMER" | "VENDOR" | "EMPLOYEE" | "MIXED" | "UNKNOWN" {
  if (!tipo) return "UNKNOWN";
  const upper = tipo.toUpperCase().trim();
  if (upper === "CLIENTE" || upper === "CUSTOMER" || upper === "C") return "CUSTOMER";
  if (upper === "PROVEEDOR" || upper === "VENDOR" || upper === "P") return "VENDOR";
  if (upper === "EMPLEADO" || upper === "EMPLOYEE" || upper === "E") return "EMPLOYEE";
  if (upper === "MIXTO" || upper === "MIXED" || upper === "M") return "MIXED";
  return "UNKNOWN";
}
