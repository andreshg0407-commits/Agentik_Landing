/**
 * lib/sag/master-validation.ts
 *
 * Pre-write master-data validation service for SAG write operations.
 *
 * PURPOSE:
 *   The schema validator (lib/sag/write/validators/index.ts) checks types and
 *   required fields. This service checks whether the VALUES are actually valid
 *   against Castillitos' real SAG master data.
 *
 * TWO LEVELS:
 *   Blocking error — the value is known to be invalid; enqueue must be prevented.
 *   Warning        — the value cannot be fully validated without Castillitos config;
 *                    enqueue is allowed but the preview UI must display the warning.
 *
 * PHILOSOPHY:
 *   "Fail fast, warn loudly."
 *   We never silently accept a value we cannot validate. Unknown = warning.
 *   Once a value set is confirmed (castillitos-overrides.ts confirmed=true),
 *   the same check becomes a blocking error automatically.
 *
 * HOW BLOCKING ESCALATES:
 *   If a CastillitosValueSet has confirmed=true  → unknown value → blocking error
 *   If a CastillitosValueSet has confirmed=false → unknown value → warning only
 *
 * INTEGRATION:
 *   Called by preview routes to add masterValidation to the preview response.
 *   Called by the enqueue route (POST /api/.../sag/write) to block bad payloads.
 */

import type { SagCustomerInput, SagProductInput, SagDocumentInput } from "@/lib/sag/write/types";
import {
  CASTILLITOS_FORMAS_PAGO,
  CASTILLITOS_ZONAS,
  CASTILLITOS_TIPOS_TERCERO,
  CASTILLITOS_TIPOS_CLIENTE,
  CASTILLITOS_VENDEDORES,
  CASTILLITOS_LISTAS_PRECIO,
  CASTILLITOS_GRUPOS,
  CASTILLITOS_SUB_GRUPOS,
  CASTILLITOS_LINEAS,
  CASTILLITOS_TARIFAS_IVA,
  CASTILLITOS_UNIDADES,
  CASTILLITOS_TALLAS,
  CASTILLITOS_COLORES,
  CASTILLITOS_BODEGAS,
  CASTILLITOS_CONFIG,
  type CastillitosValueSet,
} from "./master-data/castillitos-overrides";

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface MasterValidationError {
  field:   string;   // SAG field name (e.g. "FORMA_PAGO")
  value:   string;   // the value that failed
  message: string;
}

export interface MasterValidationWarning {
  field:   string;
  value:   string;
  message: string;
}

export interface MasterValidationResult {
  /** True only when there are zero blocking errors. Warnings do not affect this. */
  safe:     boolean;
  errors:   MasterValidationError[];    // blocking — prevent enqueue
  warnings: MasterValidationWarning[];  // advisory — allow enqueue with UI notice
}

// ─────────────────────────────────────────────────────────────────────────────
// Known-standard constants (do not need Castillitos data)
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_TIPO_DOC = new Set([
  "NIT", "CC", "CE", "PPN", "TI", "TE", "RC", "DE", "PA", "CD", "SC", "OT",
]);

const KNOWN_NATURALEZA = new Set(["J", "N"]);

const KNOWN_RESPONSABILIDAD_FISCAL = new Set([
  "O-13", "O-15", "O-23", "O-47", "R-99-PN",
  "ZA", "ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ", "ZW", "ZS",
]);

const KNOWN_IVA_PORCENTAJES = new Set([0, 5, 19]);

// Units we can safely accept even without Castillitos confirmation
const SAFE_UNIDADES = new Set([
  "UND", "KG", "GR", "LT", "ML", "MT", "CM", "CJ", "BOL", "PAR", "DOC", "TON", "M2", "M3",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check a value against a CastillitosValueSet
// ─────────────────────────────────────────────────────────────────────────────

function checkValue(
  field:     string,
  value:     string | number | undefined | null,
  valueSet:  CastillitosValueSet,
  errors:    MasterValidationError[],
  warnings:  MasterValidationWarning[],
  ctx?:      string,
): void {
  if (value == null || String(value).trim() === "") return;

  const strVal = String(value).trim();

  if (valueSet.values.length === 0) {
    // Not yet homologated — warn always
    warnings.push({
      field,
      value:   strVal,
      message: `${field} = "${strVal}"${ctx ? ` (${ctx})` : ""}: `
        + `los valores válidos para esta instalación SAG no han sido homologados. `
        + `Se acepta provisionalmente pero podría ser rechazado por SAG.`,
    });
    return;
  }

  if (!valueSet.values.includes(strVal)) {
    const label = `${field} = "${strVal}"${ctx ? ` (${ctx})` : ""}`;
    const knownList = valueSet.values.slice(0, 8).join(", ")
      + (valueSet.values.length > 8 ? ", …" : "");

    if (valueSet.confirmed) {
      errors.push({
        field,
        value: strVal,
        message: `${label}: valor no reconocido en SAG Castillitos. Valores válidos: ${knownList}`,
      });
    } else {
      warnings.push({
        field,
        value: strVal,
        message: `${label}: valor no está en la lista conocida (no confirmada). Valores conocidos: ${knownList}`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer master validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateCustomerMasterData(
  payload: SagCustomerInput,
): MasterValidationResult {
  const errors:   MasterValidationError[]   = [];
  const warnings: MasterValidationWarning[] = [];

  // TIPO_DOC — known standard (DIAN)
  if (payload.TIPO_DOC && !KNOWN_TIPO_DOC.has(payload.TIPO_DOC)) {
    warnings.push({
      field:   "TIPO_DOC",
      value:   payload.TIPO_DOC,
      message: `TIPO_DOC = "${payload.TIPO_DOC}": no es un código DIAN reconocido. `
        + `Valores estándar: ${[...KNOWN_TIPO_DOC].join(", ")}`,
    });
  }

  // NATURALEZA — known standard
  if (payload.NATURALEZA && !KNOWN_NATURALEZA.has(payload.NATURALEZA)) {
    errors.push({
      field:   "NATURALEZA",
      value:   payload.NATURALEZA,
      message: `NATURALEZA = "${payload.NATURALEZA}": debe ser "J" (Jurídica) o "N" (Natural).`,
    });
  }

  // RESPONSABILIDAD_FISCAL — known DIAN standard (warn if unrecognized)
  if (payload.RESPONSABILIDAD_FISCAL) {
    const codes = payload.RESPONSABILIDAD_FISCAL.split(",").map(s => s.trim()).filter(Boolean);
    for (const code of codes) {
      if (!KNOWN_RESPONSABILIDAD_FISCAL.has(code)) {
        warnings.push({
          field:   "RESPONSABILIDAD_FISCAL",
          value:   code,
          message: `RESPONSABILIDAD_FISCAL código "${code}": no reconocido como código DIAN estándar. `
            + `Confirmar con Castillitos si SAG usa codificación propia.`,
        });
      }
    }
  }

  // CODIGO_DANE_CIUDAD — format already validated; warn if seems wrong
  if (payload.CODIGO_DANE_CIUDAD) {
    const dane = String(payload.CODIGO_DANE_CIUDAD).trim();
    if (!/^\d{5,6}$/.test(dane)) {
      errors.push({
        field:   "CODIGO_DANE_CIUDAD",
        value:   dane,
        message: `CODIGO_DANE_CIUDAD = "${dane}": debe ser 5 o 6 dígitos. `
          + `Formato requerido: código DANE del municipio (ej: 11001 para Bogotá).`,
      });
    } else {
      // Valid format but actual existence in SAG not confirmed
      warnings.push({
        field:   "CODIGO_DANE_CIUDAD",
        value:   dane,
        message: `CODIGO_DANE_CIUDAD = "${dane}": formato correcto. `
          + `Pendiente confirmar que este código exista en la tabla MUNICIPIOS de SAG Castillitos.`,
      });
    }
  }

  // FORMA_PAGO — Castillitos-specific
  if (payload.FORMA_PAGO) {
    checkValue("FORMA_PAGO", payload.FORMA_PAGO, CASTILLITOS_FORMAS_PAGO, errors, warnings);
  }

  // ZONA — Castillitos-specific
  if (payload.ZONA) {
    checkValue("ZONA", payload.ZONA, CASTILLITOS_ZONAS, errors, warnings);
  }

  // TIPO_TERCERO — Castillitos-specific
  if (payload.TIPO_TERCERO) {
    checkValue("TIPO_TERCERO", payload.TIPO_TERCERO, CASTILLITOS_TIPOS_TERCERO, errors, warnings);
  }

  // TIPO_CLIENTE — Castillitos-specific
  if (payload.TIPO_CLIENTE) {
    checkValue("TIPO_CLIENTE", payload.TIPO_CLIENTE, CASTILLITOS_TIPOS_CLIENTE, errors, warnings);
  }

  // NIT_VENDEDOR — must be an active sales rep in SAG
  if (payload.NIT_VENDEDOR) {
    checkValue("NIT_VENDEDOR", payload.NIT_VENDEDOR, CASTILLITOS_VENDEDORES, errors, warnings,
      "debe ser un vendedor activo en SAG");
  }

  // PRECIO_VENTA — price list number
  if (payload.PRECIO_VENTA != null) {
    checkValue("PRECIO_VENTA", String(payload.PRECIO_VENTA), CASTILLITOS_LISTAS_PRECIO, errors, warnings,
      "número de lista de precios");
  }

  return { safe: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Product master validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateProductMasterData(
  payload: SagProductInput,
): MasterValidationResult {
  const errors:   MasterValidationError[]   = [];
  const warnings: MasterValidationWarning[] = [];

  // IVA percentage — hard blocked (0/5/19 only)
  if (payload.IVA != null && !KNOWN_IVA_PORCENTAJES.has(payload.IVA)) {
    errors.push({
      field:   "IVA",
      value:   String(payload.IVA),
      message: `IVA = ${payload.IVA}: porcentaje inválido. Solo se aceptan 0, 5 o 19 (ley colombiana).`,
    });
  }

  // GRUPO — Castillitos-specific
  if (payload.GRUPO) {
    checkValue("GRUPO", payload.GRUPO, CASTILLITOS_GRUPOS, errors, warnings);
  }

  // SUB_GRUPO — Castillitos-specific
  if (payload.SUB_GRUPO) {
    checkValue("SUB_GRUPO", payload.SUB_GRUPO, CASTILLITOS_SUB_GRUPOS, errors, warnings);
  }

  // LINEA — Castillitos-specific
  if (payload.LINEA) {
    checkValue("LINEA", payload.LINEA, CASTILLITOS_LINEAS, errors, warnings);
  }

  // TARIFA_IVA — Castillitos-specific
  if (payload.TARIFA_IVA) {
    checkValue("TARIFA_IVA", payload.TARIFA_IVA, CASTILLITOS_TARIFAS_IVA, errors, warnings);
  }

  // UNIDAD — safe standard set + Castillitos extras
  if (payload.UNIDAD) {
    const unidad = payload.UNIDAD.trim().toUpperCase();
    if (!SAFE_UNIDADES.has(unidad)) {
      // Not in standard set — check Castillitos
      checkValue("UNIDAD", unidad, CASTILLITOS_UNIDADES, errors, warnings,
        "unidad de medida — UND es el valor seguro");
    }
    // If in SAFE_UNIDADES: no check needed
  }

  // TALLA — only relevant when MANEJA_TALLA_COLOR = S
  if (payload.MANEJA_TALLA_COLOR === "S" && payload.TALLA) {
    checkValue("TALLA", payload.TALLA, CASTILLITOS_TALLAS, errors, warnings,
      "requiere MANEJA_TALLA_COLOR = S");
  }

  // COLOR — only relevant when MANEJA_TALLA_COLOR = S
  if (payload.MANEJA_TALLA_COLOR === "S" && payload.COLOR) {
    checkValue("COLOR", payload.COLOR, CASTILLITOS_COLORES, errors, warnings,
      "requiere MANEJA_TALLA_COLOR = S");
  }

  // Consistency: if MANEJA_TALLA_COLOR = S but TALLA/COLOR are blank → warn
  if (payload.MANEJA_TALLA_COLOR === "S") {
    if (!payload.TALLA) {
      warnings.push({
        field:   "TALLA",
        value:   "",
        message: "MANEJA_TALLA_COLOR = S pero TALLA no está definida. SAG podría rechazar o crear un artículo sin talla.",
      });
    }
    if (!payload.COLOR) {
      warnings.push({
        field:   "COLOR",
        value:   "",
        message: "MANEJA_TALLA_COLOR = S pero COLOR no está definido. SAG podría rechazar o crear un artículo sin color.",
      });
    }
  }

  return { safe: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document master validation (tipo 2 / 28)
// ─────────────────────────────────────────────────────────────────────────────
//
// BODEGA is the critical field for document writes.
// Unlike other fields, we HARD BLOCK even when unconfirmed:
//   - An unknown BODEGA on a document write is irreversible.
//   - If CASTILLITOS_BODEGAS.confirmed=false we block with an explicit
//     "run homologation first" message.
//   - If CASTILLITOS_BODEGAS.confirmed=true we block when value not in list.
//
// Document writes (tipo 2/28) are HIGH/MEDIUM risk and financially irreversible.
// The BODEGA policy is deliberately stricter than the warn-only default.

export function validateDocumentMasterData(
  payload: SagDocumentInput,
): MasterValidationResult {
  const errors:   MasterValidationError[]   = [];
  const warnings: MasterValidationWarning[] = [];

  // ── BODEGA at document level (default warehouse) ─────────────────────────────

  const docBodega = payload.BODEGA?.trim();

  if (!docBodega && !CASTILLITOS_CONFIG.defaultBodegaForTipo28) {
    // No warehouse at all — hard block
    errors.push({
      field:   "BODEGA",
      value:   "",
      message:
        "BODEGA es obligatoria para documentos SAG (tipo 2/28). " +
        "Especifique la bodega en el documento o configure defaultBodegaForTipo28 " +
        "en lib/sag/master-data/castillitos-overrides.ts.",
    });
  } else {
    const effectiveBodega = docBodega || CASTILLITOS_CONFIG.defaultBodegaForTipo28 || "";
    _validateBodega(effectiveBodega, "BODEGA (documento)", errors, warnings);
  }

  // ── BODEGA at line level ─────────────────────────────────────────────────────

  if (payload.LINEAS) {
    for (let i = 0; i < payload.LINEAS.length; i++) {
      const line       = payload.LINEAS[i];
      const lineBodega = line.BODEGA?.trim();
      if (lineBodega) {
        _validateBodega(lineBodega, `LINEAS[${i}].BODEGA`, errors, warnings);
      }
    }
  }

  return { safe: errors.length === 0, errors, warnings };
}

/**
 * Shared bodega validation — hard blocks when unconfirmed (document writes only).
 */
function _validateBodega(
  value:    string,
  field:    string,
  errors:   MasterValidationError[],
  warnings: MasterValidationWarning[],
): void {
  if (!value) return;

  if (!CASTILLITOS_BODEGAS.confirmed) {
    // Stricter than normal fields — hard block even when unconfirmed
    errors.push({
      field,
      value,
      message:
        `${field} = "${value}": las bodegas de Castillitos SAG aún no han sido homologadas. ` +
        `Ejecute la homologación antes de encolar documentos: ` +
        `npx tsx scripts/sag-homologate-castillitos.ts --write`,
    });
    return;
  }

  if (!CASTILLITOS_BODEGAS.values.includes(value)) {
    const knownList = CASTILLITOS_BODEGAS.values.slice(0, 6).join(", ")
      + (CASTILLITOS_BODEGAS.values.length > 6 ? ", …" : "");
    errors.push({
      field,
      value,
      message:
        `${field} = "${value}": bodega no existe en SAG Castillitos. ` +
        `Bodegas válidas: ${knownList}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate master-data fields for any SAG write payload.
 *
 * @param type     1 = customer, 3 = tercero, 5 = product, 2/28 = document
 * @param payload  the normalized SAG input object
 */
export function validateMasterData(
  type: 1 | 2 | 3 | 5 | 28,
  payload: SagCustomerInput | SagProductInput | SagDocumentInput,
): MasterValidationResult {
  if (type === 1 || type === 3) {
    return validateCustomerMasterData(payload as SagCustomerInput);
  }
  if (type === 5) {
    return validateProductMasterData(payload as SagProductInput);
  }
  if (type === 2 || type === 28) {
    return validateDocumentMasterData(payload as SagDocumentInput);
  }
  return { safe: true, errors: [], warnings: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render helpers (for CLI script output)
// ─────────────────────────────────────────────────────────────────────────────

export function renderMasterValidationResult(result: MasterValidationResult): string {
  const lines: string[] = [];

  if (result.safe && result.warnings.length === 0) {
    lines.push("✓ Master data validation passed — no issues.");
    return lines.join("\n");
  }

  if (!result.safe) {
    lines.push(`✗ ${result.errors.length} error(es) bloqueante(s):`);
    for (const e of result.errors) {
      lines.push(`  [ERROR] ${e.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`⚠ ${result.warnings.length} advertencia(s):`);
    for (const w of result.warnings) {
      lines.push(`  [WARN]  ${w.message}`);
    }
  }

  return lines.join("\n");
}
