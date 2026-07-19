/**
 * source-inference.ts
 *
 * SAG Source-Aware Layer — Sprint
 *
 * Pure functions for inferring SagSourceType and SourceDocumentStage from
 * available signals at import time.
 *
 * Signal priority (highest → lowest):
 *   1. sagDocumentFamily (from documentFamilyMap — tenant-confirmed)
 *   2. explicit source column in CSV ("fuente", "f", "tipo_fuente", "source")
 *      Supports: "Fuente 1"/"Fuente 2", "F1"/"F2", numeric "1"/"2",
 *                "OFICIAL"/"REMISION", "factura"/"despacho", SAG codes
 *   3. comprobanteCode pattern (heuristic)
 *   4. comprobante full-reference pattern (heuristic)
 *   5. filename hint (from import wizard "hint" parameter)
 *   6. fallback: OFICIAL / FACTURADO (conservative default)
 *
 * Finance rules encoded here:
 *   OFICIAL  (Fuente 1) = recognized revenue, creates receivable
 *   REMISION (Fuente 2) = operational demand, pending invoice conversion
 *
 * Castillitos-specific:
 *   The documentFamilyMap is the authoritative mapping once confirmed.
 *   Until then, comprobanteCode heuristics provide a best-effort inference.
 */

// ── Type mirrors (avoids circular @prisma/client import in pure lib) ──────────

export type SagSourceType       = "OFICIAL" | "REMISION";
export type SourceDocumentStage = "FACTURADO" | "REMITIDO" | "DESPACHADO" | "PENDIENTE";

// InferredFrom audit trail — mirrors SourceInferredFrom in source-semantics.ts
export type InferredFrom =
  | "family"
  | "explicit_column"
  | "code_pattern"
  | "ref_pattern"
  | "filename"
  | "default";

export type SagDocumentFamilyStr =
  | "OFFICIAL_INVOICE"
  | "DISPATCH_REMISION"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "OTHER";

// ── Source labels ─────────────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<SagSourceType, string> = {
  OFICIAL:  "Fuente 1",
  REMISION: "Fuente 2",
};

export const STAGE_LABELS: Record<SourceDocumentStage, string> = {
  FACTURADO:  "Facturado",
  REMITIDO:   "Remitido",
  DESPACHADO: "Despachado",
  PENDIENTE:  "Pendiente",
};

// ── Primary derivation from sagDocumentFamily ─────────────────────────────────

const FAMILY_TO_SOURCE: Record<SagDocumentFamilyStr, SagSourceType> = {
  OFFICIAL_INVOICE:  "OFICIAL",
  DISPATCH_REMISION: "REMISION",
  CREDIT_NOTE:       "OFICIAL",   // credit note on an invoice — still official
  DEBIT_NOTE:        "OFICIAL",
  OTHER:             "OFICIAL",   // conservative default
};

const FAMILY_TO_STAGE: Record<SagDocumentFamilyStr, SourceDocumentStage> = {
  OFFICIAL_INVOICE:  "FACTURADO",
  DISPATCH_REMISION: "REMITIDO",
  CREDIT_NOTE:       "FACTURADO",
  DEBIT_NOTE:        "FACTURADO",
  OTHER:             "PENDIENTE",  // unknown — needs heuristic or wizard
};

// ── Heuristic patterns for comprobanteCode ────────────────────────────────────
//
// Conservative: only tag REMISION when the code strongly suggests it.
// Patterns derived from common Colombian SAG configurations:
//   NV = Nota de Venta / remisión (some PYA configs)
//   REM, RD, GD = remisión / guía de despacho
//   NR = Nota de Remisión
//   GD = Guía de Despacho
//
// Castillitos-specific (from FUENTES.xlsx, 2026-04-20):
//   F2 = REMISION (ka=2, NO_OFICIAL/REMISION)
//
// Excluded to avoid false positives:
//   FV, FA, FE = Factura de Venta (OFFICIAL_INVOICE)
//   NC, NE, NX = Nota Crédito (CREDIT_NOTE)
//   ND, DB = Nota Débito (DEBIT_NOTE)
//   RE = Recibo / Reembolso

const REMISION_CODE_RE = /^(NV|REM|RD|GD|NR|NDL|RR|GDE|F2)$/i;

// ── Heuristic patterns for full comprobante reference ─────────────────────────
//
// Matches: "NV-001234", "REM-2024-001", "GD-001", "RD001234", "R0012"

const REMISION_REF_RE = /^(NV-|REM-|GD-|RD-|NR-)|^R\d/i;

// ── Explicit source column normalizer ─────────────────────────────────────────
//
// Handles all known explicit-source value variants from SAG CSV exports:
//   Numeric:        "1", "2", 1, 2
//   Alpha codes:    "F1", "F2", "f1", "f2"
//   Full labels:    "Fuente 1", "fuente 2", "Fuente_2", "FUENTE_1"
//   Semantic:       "oficial", "factura", "invoice" → OFICIAL
//                   "remision", "remisión", "despacho", "dispatch" → REMISION
//   SAG doc codes:  "FV", "FA" → OFICIAL  |  "NV", "GD", "NR", "REM" → REMISION
//
// Collapses all separators (" ", "_", "-", ".") before matching.

function normalizeExplicitSourceLocal(
  raw: string | number | null | undefined,
): SagSourceType | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().replace(/[\s_\-\.]/g, "");
  if (s === "") return null;

  if (
    s === "1"       || s === "f1"      || s === "fuente1" ||
    s === "oficial" || s === "factura" || s === "invoice" ||
    s === "fv"      || s === "fa"      ||
    // Castillitos k_sc_codigo_fuente — facturas vigentes (FUENTES.xlsx 2026-04-20)
    s === "fe"  || // ka=101 Factura electrónica empresa (vigente)
    s === "fd"  || // ka=175 Factura electrónica San Diego (vigente)
    s === "fc"  || // ka=176 Factura electrónica Centro (vigente)
    s === "fg"  || // ka=177 Factura electrónica Gran Plaza (vigente)
    s === "fw"  || // ka=207 Factura electrónica Web (vigente)
    // Castillitos — facturas históricas
    s === "vc"  || // ka=48  Factura POS (histórica)
    s === "v1"  || // ka=92  Factura POS WI (histórica)
    s === "v2"  || // ka=103 Factura POS SD (histórica)
    s === "v3"  || // ka=104 Factura POS M (histórica)
    s === "v4"  || // ka=173 Factura POS Centro (histórica)
    s === "v5"  || // ka=179 Factura POS Gran Plaza (histórica)
    s === "v6"  || // ka=193 Factura POS Caldas (histórica)
    s === "ff"  || // ka=155 Factura electrónica (histórica)
    s === "fx"     // ka=143 Factura electrónica (histórica)
  ) return "OFICIAL";

  if (
    s === "2"        || s === "f2"       || s === "fuente2"           ||
    s === "remision" || s === "remisión" || s === "remision/despacho" ||
    s === "despacho" || s === "dispatch" ||
    s === "nv"       || s === "gd"       || s === "nr"   || s === "rem"
    // Nota: F2 ya está cubierto por s === "f2" — ka=2 REMISION de Castillitos
  ) return "REMISION";

  return null;
}

// ── Filename hint ─────────────────────────────────────────────────────────────

const REMISION_FILENAME_RE = /remision|remisión|despacho|dispatch|fuente[\s_-]?2|nv[_-]/i;
const OFICIAL_FILENAME_RE  = /factura|invoice|fuente[\s_-]?1|fv[_-]/i;

// ── Main inference function ───────────────────────────────────────────────────

export interface SourceInferenceInput {
  /** From documentFamilyMap lookup (highest priority). */
  sagDocumentFamily: SagDocumentFamilyStr;
  /** Raw comprobante type code from CSV (e.g. "FV", "NV"). */
  comprobanteCode?: string | null;
  /** Full comprobante reference (e.g. "FV-001234", "NV-001234"). */
  comprobante?: string | null;
  /**
   * Explicit source column value from CSV.
   * Accepts string OR number (e.g. 1, 2, "F1", "F2", "Fuente 1", "remision").
   * Checked column names: fuente, f, tipo_fuente, source, tipo_documento_fuente.
   */
  explicitSource?: string | number | null;
  /** Filename from import wizard — used as weak hint. */
  fileName?: string | null;
}

export interface SourceInferenceResult {
  sagSourceType:       SagSourceType;
  sourceDocumentStage: SourceDocumentStage;
  /** Signal that determined the result (stored in SaleRecord.sourceInferredFrom). */
  inferredFrom:        InferredFrom;
}

export function inferSourceType(input: SourceInferenceInput): SourceInferenceResult {
  const { sagDocumentFamily, comprobanteCode, comprobante, explicitSource, fileName } = input;

  // ── Signal 1: sagDocumentFamily (authoritative when not OTHER) ───────────────
  if (sagDocumentFamily !== "OTHER") {
    return {
      sagSourceType:       FAMILY_TO_SOURCE[sagDocumentFamily],
      sourceDocumentStage: FAMILY_TO_STAGE[sagDocumentFamily],
      inferredFrom:        "family",
    };
  }

  // ── Signal 2: explicit source column in CSV ──────────────────────────────────
  if (explicitSource != null) {
    const resolved = normalizeExplicitSourceLocal(explicitSource);
    if (resolved === "REMISION") {
      return { sagSourceType: "REMISION", sourceDocumentStage: "REMITIDO", inferredFrom: "explicit_column" };
    }
    if (resolved === "OFICIAL") {
      return { sagSourceType: "OFICIAL", sourceDocumentStage: "FACTURADO", inferredFrom: "explicit_column" };
    }
  }

  // ── Signal 3: comprobanteCode pattern ────────────────────────────────────────
  if (comprobanteCode) {
    const clean = comprobanteCode.trim().toUpperCase();
    if (REMISION_CODE_RE.test(clean)) {
      return { sagSourceType: "REMISION", sourceDocumentStage: "REMITIDO", inferredFrom: "code_pattern" };
    }
  }

  // ── Signal 4: comprobante full-reference pattern ──────────────────────────────
  if (comprobante) {
    if (REMISION_REF_RE.test(comprobante.trim())) {
      return { sagSourceType: "REMISION", sourceDocumentStage: "REMITIDO", inferredFrom: "ref_pattern" };
    }
  }

  // ── Signal 5: filename hint ───────────────────────────────────────────────────
  if (fileName) {
    if (REMISION_FILENAME_RE.test(fileName)) {
      return { sagSourceType: "REMISION", sourceDocumentStage: "REMITIDO", inferredFrom: "filename" };
    }
    if (OFICIAL_FILENAME_RE.test(fileName)) {
      return { sagSourceType: "OFICIAL", sourceDocumentStage: "FACTURADO", inferredFrom: "filename" };
    }
  }

  // ── Default: OFICIAL / PENDIENTE ─────────────────────────────────────────────
  // Conservative: when we cannot determine the source, default to OFICIAL so
  // that revenue is not under-reported. The PENDIENTE stage signals the ambiguity.
  return { sagSourceType: "OFICIAL", sourceDocumentStage: "PENDIENTE", inferredFrom: "default" };
}

// ── Conversion risk assessment ────────────────────────────────────────────────
//
// A REMISION is a "pending conversion" risk when it has not been matched to an
// OFFICIAL_INVOICE after a configurable number of days.

export const REMISION_RISK_THRESHOLDS = {
  LOW:      3,    // days — recent, low risk
  MEDIUM:   7,    // days — needs follow-up
  HIGH:     15,   // days — overdue, escalate
  CRITICAL: 30,   // days — critical, potential loss
} as const;

export type RemisionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NONE";

export function assessRemisionRisk(daysSinceSale: number): RemisionRisk {
  if (daysSinceSale >= REMISION_RISK_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (daysSinceSale >= REMISION_RISK_THRESHOLDS.HIGH)     return "HIGH";
  if (daysSinceSale >= REMISION_RISK_THRESHOLDS.MEDIUM)   return "MEDIUM";
  if (daysSinceSale >= REMISION_RISK_THRESHOLDS.LOW)      return "LOW";
  return "NONE";
}

// ── Source mix analysis ───────────────────────────────────────────────────────

export interface SourceMix {
  totalAmount:     number;
  oficialAmount:   number;
  remisionAmount:  number;
  oficialPct:      number;   // 0–100
  remisionPct:     number;   // 0–100
  hasSourceData:   boolean;  // true when at least one non-default OFICIAL record
}

export function computeSourceMix(
  oficialAmount:  number,
  remisionAmount: number,
): SourceMix {
  const totalAmount = oficialAmount + remisionAmount;
  const hasSourceData = totalAmount > 0;
  return {
    totalAmount,
    oficialAmount,
    remisionAmount,
    oficialPct:  totalAmount > 0 ? (oficialAmount  / totalAmount) * 100 : 0,
    remisionPct: totalAmount > 0 ? (remisionAmount / totalAmount) * 100 : 0,
    hasSourceData,
  };
}
