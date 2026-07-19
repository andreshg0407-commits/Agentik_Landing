/**
 * Input validators for SAG write operations.
 *
 * Validation runs BEFORE the operation is queued — bad data is rejected
 * immediately so it never reaches the approval queue or SAG.
 *
 * Rules:
 *  - Every required field must be non-empty.
 *  - Numeric fields must be finite and within expected ranges.
 *  - NIT must be normalised (9 digits, no dots/dashes/DV).
 *  - Dates must be valid ISO YYYY-MM-DD strings.
 *  - Type 6 (receipts) always returns an extra blocker error in v1.
 */

import { SAG_WRITE_TYPE }     from "../types";
import type {
  SagCustomerInput,
  SagTerceroInput,
  SagProductInput,
  SagDocumentInput,
  SagReceiptInput,
  SagWriteInput,
  ValidationError,
  ValidationResult,
} from "../types";

// ── Primitive helpers ─────────────────────────────────────────────────────────

function required(errors: ValidationError[], field: string, value: unknown): boolean {
  if (value == null || value === "") {
    errors.push({ field, message: `${field} es obligatorio.` });
    return false;
  }
  return true;
}

function positiveNumber(errors: ValidationError[], field: string, value: unknown): void {
  const n = Number(value);
  if (!isFinite(n) || n < 0) {
    errors.push({ field, message: `${field} debe ser un número positivo.` });
  }
}

function isoDate(errors: ValidationError[], field: string, value: unknown): void {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    errors.push({ field, message: `${field} debe ser una fecha ISO (YYYY-MM-DD).` });
    return;
  }
  const d = new Date(String(value) + "T00:00:00Z");
  if (isNaN(d.getTime())) {
    errors.push({ field, message: `${field} no es una fecha válida.` });
  }
}

/** Colombian NIT: exactly 9 digits, no dots/dashes/DV suffix. */
function nit(errors: ValidationError[], field: string, value: unknown): void {
  if (!value) return; // required() will have already fired
  const s = String(value).trim();
  if (!/^\d{9}$/.test(s)) {
    errors.push({
      field,
      message: `${field} debe ser el NIT en formato canónico (9 dígitos, sin puntos ni guión). Recibido: "${s}".`,
    });
  }
}

// ── Per-type validators ───────────────────────────────────────────────────────

function email(errors: ValidationError[], field: string, value: unknown): void {
  if (!value) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
    errors.push({ field, message: `${field} no es un correo electrónico válido.` });
  }
}

function sn(errors: ValidationError[], field: string, value: unknown): void {
  if (!value) return;
  if (!["S", "N"].includes(String(value))) {
    errors.push({ field, message: `${field} debe ser "S" o "N".` });
  }
}

function daneCode(errors: ValidationError[], field: string, value: unknown): void {
  if (!value) return;
  if (!/^\d{5,6}$/.test(String(value))) {
    errors.push({ field, message: `${field} debe ser el código DANE de la ciudad (5 o 6 dígitos).` });
  }
}

function validateCustomer(input: SagCustomerInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required
  if (required(errors, "NIT",    input.NIT))    nit(errors, "NIT", input.NIT);
  required(errors, "NOMBRE", input.NOMBRE);

  // Identity
  if (input.DIGITO_VERIFICACION != null && !/^\d$/.test(String(input.DIGITO_VERIFICACION))) {
    errors.push({ field: "DIGITO_VERIFICACION", message: "DIGITO_VERIFICACION debe ser un único dígito (0-9)." });
  }
  if (input.NATURALEZA && !["J", "N"].includes(input.NATURALEZA)) {
    errors.push({ field: "NATURALEZA", message: 'NATURALEZA debe ser "J" (Jurídica) o "N" (Natural).' });
  }

  // Contact
  if (input.EMAIL)                 email(errors, "EMAIL",                input.EMAIL);
  if (input.EMAIL_FAC_ELECTRONICA) email(errors, "EMAIL_FAC_ELECTRONICA", input.EMAIL_FAC_ELECTRONICA);
  if (input.CODIGO_DANE_CIUDAD)    daneCode(errors, "CODIGO_DANE_CIUDAD",  input.CODIGO_DANE_CIUDAD);

  // Commercial
  if (input.NIT_VENDEDOR) nit(errors, "NIT_VENDEDOR", input.NIT_VENDEDOR);
  if (input.PRECIO_VENTA  != null) positiveNumber(errors, "PRECIO_VENTA",  input.PRECIO_VENTA);
  if (input.CREDITO       != null) positiveNumber(errors, "CREDITO",        input.CREDITO);
  if (input.DIAS_CREDITO  != null) positiveNumber(errors, "DIAS_CREDITO",   input.DIAS_CREDITO);

  // Fiscal
  if (input.RETENEDOR) sn(errors, "RETENEDOR", input.RETENEDOR);
  if (input.IVA)       sn(errors, "IVA",       input.IVA);

  // Status
  if (input.ACTIVO_COMERCIAL) sn(errors, "ACTIVO_COMERCIAL", input.ACTIVO_COMERCIAL);
  if (input.ACTIVO_FIJO)      sn(errors, "ACTIVO_FIJO",      input.ACTIVO_FIJO);

  // Financial defaults
  if (input.DESCUENTO    != null) positiveNumber(errors, "DESCUENTO",    input.DESCUENTO);
  if (input.DESCUENTO_PP != null) positiveNumber(errors, "DESCUENTO_PP", input.DESCUENTO_PP);

  return errors;
}

function validateTercero(input: SagTerceroInput): ValidationError[] {
  return validateCustomer(input); // same required fields
}

function validateProduct(input: SagProductInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required
  required(errors, "CODIGO",      input.CODIGO);
  required(errors, "DESCRIPCION", input.DESCRIPCION);
  if (required(errors, "PRECIO",  input.PRECIO)) positiveNumber(errors, "PRECIO", input.PRECIO);

  // Pricing / tax
  if (input.IVA   != null && input.IVA !== 0) {
    if (![0, 5, 19].includes(input.IVA)) {
      errors.push({ field: "IVA", message: "IVA debe ser 0, 5 o 19." });
    }
  }
  if (input.COSTO != null) positiveNumber(errors, "COSTO", input.COSTO);
  if (input.INCLUIDO_IVA) sn(errors, "INCLUIDO_IVA", input.INCLUIDO_IVA);

  // Logistics
  if (input.MANEJA_KARDEX)     sn(errors, "MANEJA_KARDEX",     input.MANEJA_KARDEX);
  if (input.MANEJA_TALLA_COLOR) sn(errors, "MANEJA_TALLA_COLOR", input.MANEJA_TALLA_COLOR);
  if (input.MANEJA_LOTE)       sn(errors, "MANEJA_LOTE",       input.MANEJA_LOTE);

  // Commerce
  if (input.COMPOSICION)    sn(errors, "COMPOSICION",    input.COMPOSICION);
  if (input.TIENDA_VIRTUAL) sn(errors, "TIENDA_VIRTUAL", input.TIENDA_VIRTUAL);

  // Status
  if (input.BLOQUEADO) sn(errors, "BLOQUEADO", input.BLOQUEADO);

  return errors;
}

function validateDocument(input: SagDocumentInput): ValidationError[] {
  const errors: ValidationError[] = [];
  required(errors, "TIPO_DOC", input.TIPO_DOC);
  if (required(errors, "NIT",  input.NIT)) nit(errors, "NIT", input.NIT);
  if (required(errors, "FECHA", input.FECHA)) isoDate(errors, "FECHA", input.FECHA);

  if (!input.LINEAS || input.LINEAS.length === 0) {
    errors.push({ field: "LINEAS", message: "El documento debe tener al menos una línea." });
  } else {
    input.LINEAS.forEach((line, i) => {
      const prefix = `LINEAS[${i}]`;
      required(errors, `${prefix}.CODIGO`,   line.CODIGO);
      if (required(errors, `${prefix}.CANTIDAD`, line.CANTIDAD)) {
        positiveNumber(errors, `${prefix}.CANTIDAD`, line.CANTIDAD);
      }
      if (required(errors, `${prefix}.PRECIO`, line.PRECIO)) {
        positiveNumber(errors, `${prefix}.PRECIO`, line.PRECIO);
      }
      if (line.DESCUENTO != null) {
        const d = Number(line.DESCUENTO);
        if (d < 0 || d > 100) {
          errors.push({ field: `${prefix}.DESCUENTO`, message: "DESCUENTO debe estar entre 0 y 100." });
        }
      }
    });
  }
  return errors;
}

function validateReceipt(input: SagReceiptInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Hard blocker: receipt/payment writes are not activated in v1
  errors.push({
    field: "_policy",
    message:
      "Tipo 6 (Recibos/Egresos) está bloqueado en v1. " +
      "Requiere validación de conciliación contable antes de activar escrituras financieras en SAG.",
  });

  required(errors, "TIPO",    input.TIPO);
  if (required(errors, "NIT",  input.NIT)) nit(errors, "NIT", input.NIT);
  if (required(errors, "FECHA", input.FECHA)) isoDate(errors, "FECHA", input.FECHA);
  if (required(errors, "VALOR",    input.VALOR))    positiveNumber(errors, "VALOR",   input.VALOR);
  required(errors, "CONCEPTO", input.CONCEPTO);
  return errors;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function validateSagWriteInput(input: SagWriteInput): ValidationResult {
  let errors: ValidationError[];

  switch (input.type) {
    case SAG_WRITE_TYPE.UPSERT_CUSTOMER:    errors = validateCustomer(input.payload); break;
    case SAG_WRITE_TYPE.UPSERT_TERCERO:     errors = validateTercero(input.payload);  break;
    case SAG_WRITE_TYPE.UPSERT_PRODUCT:     errors = validateProduct(input.payload);  break;
    case SAG_WRITE_TYPE.CREATE_DOCUMENT:    errors = validateDocument(input.payload); break;
    case SAG_WRITE_TYPE.CREATE_GENERIC_DOC: errors = validateDocument(input.payload); break;
    case SAG_WRITE_TYPE.CREATE_RECEIPT:     errors = validateReceipt(input.payload);  break;
    default:
      errors = [{ field: "type", message: `Tipo de escritura desconocido: ${(input as { type: number }).type}` }];
  }

  return { valid: errors.length === 0, errors };
}
