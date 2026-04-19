/**
 * lib/sag/clientes/normalizer.ts
 *
 * Converts raw customer form data (camelCase, user input) to a clean
 * SagCustomerInput ready for the XML builder and validator.
 *
 * Also the single place that applies the NIT normalization rule:
 *   strip dots / spaces → strip -DV suffix → strip 10-digit concatenated DV
 *
 * Called by:
 *  - POST /api/orgs/[orgSlug]/sag/write/preview  (dry-run validation + XML preview)
 *  - POST /api/orgs/[orgSlug]/sag/write          (enqueue — after preview confirmed)
 */

import type { SagCustomerInput } from "@/lib/sag/write/types";

// ── Raw form shape ────────────────────────────────────────────────────────────
//
// Matches the HTML form field names in nuevo-cliente-form.tsx.
// All values are strings coming from form inputs; booleans come as "S"/"N".

export interface ClienteFormData {
  // Identification
  tipoDocumento:          string;
  documento:              string;  // raw NIT / CC / CE (will be normalized)
  digitoVerificacion:     string;
  naturaleza:             string;  // "J" | "N" | ""

  // Legal name & contact
  nombre:                 string;
  direccion:              string;
  codigoDaneCiudad:       string;
  ciudad:                 string;
  departamento:           string;
  telefonoPpal:           string;
  email:                  string;
  emailFacElectronica:    string;

  // Commercial
  tipoTercero:            string;
  tipoCliente:            string;
  zona:                   string;
  nitVendedor:            string;  // raw NIT (will be normalized)
  formaPago:              string;
  precioVenta:            string;  // numeric string
  cupoMaximo:             string;  // numeric string → CREDITO
  diasCredito:            string;  // numeric string

  // Fiscal
  retenedor:              string;  // "S" | "N" | ""
  iva:                    string;  // "S" | "N" | ""
  responsabilidadFiscal:  string;

  // Status
  activo:                 string;  // "S" | "N"
  activoComercial:        string;  // "S" | "N"
}

// ── NIT normalization ─────────────────────────────────────────────────────────

/**
 * Strips formatting and DV from a raw NIT/document string.
 * Returns an empty string when the input is blank.
 *
 * Examples:
 *   "900.123.456-7"  → "900123456"
 *   "9001234567"     → "900123456"  (10-digit, strips last)
 *   "123456789"      → "123456789"  (clean 9-digit)
 */
export function normalizeNit(raw: string): string {
  if (!raw) return "";
  let s = raw.trim().replace(/[.\s]/g, "");
  s = s.replace(/-\d$/, "");           // strip "-N" DV suffix
  if (/^\d{10}$/.test(s)) s = s.slice(0, 9); // strip concatenated DV
  return s;
}

function trimUpper(s: string): string | undefined {
  const v = s.trim().toUpperCase();
  return v || undefined;
}

function trimLower(s: string): string | undefined {
  const v = s.trim().toLowerCase();
  return v || undefined;
}

function trimStr(s: string): string | undefined {
  const v = s.trim();
  return v || undefined;
}

function positiveNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return isFinite(n) && n >= 0 ? n : undefined;
}

function snFlag(s: string): "S" | "N" | undefined {
  if (s === "S" || s === "N") return s;
  return undefined;
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Convert raw form data to SagCustomerInput.
 * Returns the normalized payload; callers should then run validateSagWriteInput().
 */
export function normalizeClienteForm(form: ClienteFormData): SagCustomerInput {
  const nit        = normalizeNit(form.documento);
  const nitVendedor = normalizeNit(form.nitVendedor);

  return {
    // Required
    NIT:                     nit,
    NOMBRE:                  form.nombre.trim().toUpperCase(),

    // Identity
    TIPO_DOC:                trimStr(form.tipoDocumento),
    DIGITO_VERIFICACION:     trimStr(form.digitoVerificacion),
    NATURALEZA:              (form.naturaleza === "J" || form.naturaleza === "N")
                               ? form.naturaleza
                               : undefined,

    // Contact
    DIRECCION:               trimStr(form.direccion),
    CODIGO_DANE_CIUDAD:      trimStr(form.codigoDaneCiudad),
    CIUDAD:                  trimUpper(form.ciudad),
    DEPARTAMENTO:            trimUpper(form.departamento),
    TELEFONO:                trimStr(form.telefonoPpal),
    EMAIL:                   trimLower(form.email),
    EMAIL_FAC_ELECTRONICA:   trimLower(form.emailFacElectronica),

    // Commercial
    NIT_VENDEDOR:            nitVendedor || undefined,
    TIPO_TERCERO:            trimStr(form.tipoTercero),
    TIPO_CLIENTE:            trimStr(form.tipoCliente),
    ZONA:                    trimStr(form.zona),
    FORMA_PAGO:              trimStr(form.formaPago),
    PRECIO_VENTA:            positiveNum(form.precioVenta),
    CREDITO:                 positiveNum(form.cupoMaximo),
    DIAS_CREDITO:            positiveNum(form.diasCredito),

    // Fiscal
    RETENEDOR:               snFlag(form.retenedor),
    IVA:                     snFlag(form.iva),
    RESPONSABILIDAD_FISCAL:  trimStr(form.responsabilidadFiscal),

    // Status (default to active)
    ACTIVO:                  snFlag(form.activo) ?? "S",
    ACTIVO_COMERCIAL:        snFlag(form.activoComercial) ?? "S",
    ACTIVO_FIJO:             "N",   // always N in v1

    // Financial defaults
    COMISION_VENTAS:         0,
    COMISION_COBROS:         0,
    DESCUENTO:               0,
    DESCUENTO_PP:            0,
  };
}
