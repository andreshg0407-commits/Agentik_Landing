/**
 * lib/reconciliation/applied-facts-parser.ts
 *
 * Non-destructive parser for SAG invoice-payment associations.
 *
 * ── DISCOVERY FINDINGS (Sprint S2.1, 2026-05-05) ────────────────────────────
 *
 * CollectionRecord.appliedFacts is NULL for 100% of production rows.
 * Root cause: the SAG v_pagosnew view provides `Documento_pagado` as the
 * invoice reference, but the mapper was reading `Numero_Factura` (absent).
 *
 * The REAL invoice association signal lives in rawJson.raw.Documento_pagado:
 *   - Present in 100% of CollectionRecord rows
 *   - Always a positive integer (SAG MOVIMIENTOS PK of the invoice)
 *   - Join key: "MOV-" + Documento_pagado → CustomerReceivable.erpId
 *   - 55.7% of cobros match a CustomerReceivable via this join (live data)
 *   - 5,342 invoices (57.6%) have multiple cobros = partial payments
 *
 * SAG rawJson.raw shape (confirmed from v_pagosnew, 2026-04-30):
 *   {
 *     Codigo_Fuente_Comprobante: "R1" | "R2" | "RS" | "RC" | "RG" | "RA" | "SI" | "AN",
 *     Valor_Pagado:              number,   // real payment amount (always positive)
 *     Fecha_Documento:           string,   // ISO datetime
 *     Numero_Documento:          number,   // cobro/receipt number (NOT the invoice)
 *     Documento_pagado:          number,   // SAG MOVIMIENTOS PK of the invoice being paid
 *     Ka_Nl_Tercero:             number,   // SAG customer FK (sagTerceroId)
 *     Nit_Tercero:               number,   // real NIT
 *     Nombre_Tercero:            string,   // customer name
 *   }
 *
 * ── PARSER CONTRACT ──────────────────────────────────────────────────────────
 *
 * 1. NEVER throws — all errors are absorbed into LOW confidence results.
 * 2. NEVER writes to DB — pure read-only computation.
 * 3. Handles: null, malformed strings, partial structures, unknown formats.
 * 4. Two input paths:
 *    A) appliedFacts (Json? — future: when mapper fix is deployed)
 *    B) rawJson (Json? — current: Documento_pagado lives here)
 * 5. Returns canonical AppliedRelation[] for both paths.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Canonical representation of a SAG invoice-payment association.
 * Produced by parseAppliedFacts() or extractFromRawJson().
 */
export interface AppliedRelation {
  /**
   * The cobro/receipt document reference (Numero_Documento from SAG).
   * E.g. "12345" — identifies the payment receipt.
   */
  sourceDocument?: string;

  /**
   * The payment type code (Codigo_Fuente_Comprobante).
   * E.g. "R1" | "R2" | "RS" | "RC" | "RG" | "RA" | "SI" | "AN"
   */
  sourceType?: string;

  /**
   * The invoice document number as stored in SAG MOVIMIENTOS.
   * For v_pagosnew: Documento_pagado (numeric string, e.g. "10329").
   * For future views with Numero_Factura: that field's value.
   */
  targetInvoice?: string;

  /**
   * The CustomerReceivable.erpId value derived from targetInvoice.
   * Format: "MOV-" + targetInvoice (e.g. "MOV-10329").
   * Null when targetInvoice is absent or zero.
   *
   * IMPORTANT: This is the correct JOIN KEY to CustomerReceivable.erpId.
   * Do NOT join on CustomerReceivable.invoiceNumber — it is per-customer
   * sequential and produces false positives.
   */
  targetInvoiceId?: string;

  /**
   * Amount applied to this invoice by this cobro.
   * Sourced from Valor_Pagado (rawJson path) or appliedFacts.amount.
   */
  amountApplied?: number;

  /**
   * Relation type classification:
   *   PAYMENT  — standard cobro (R1/R2/RS/RC/RG/RA/SI/AN)
   *   ND       — nota débito (debit note, increases balance)
   *   NC       — nota crédito (credit note / discount)
   *   UNKNOWN  — unrecognized type
   */
  relationType: "PAYMENT" | "ND" | "NC" | "UNKNOWN";

  /**
   * Parser confidence in this relation:
   *   HIGH   — Documento_pagado present, non-zero, real amount, joined to receivable
   *   MEDIUM — Documento_pagado present but no CustomerReceivable match found
   *   LOW    — Derived from ambiguous or fallback signals
   */
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Result of parsing a single CollectionRecord's relation signals.
 * May contain multiple relations when SAG provides multiple applied invoices.
 *
 * NOTE: In production data as of 2026-05-05, each CollectionRecord maps to
 * exactly one invoice (one Documento_pagado). Multi-relation arrays are
 * theoretically possible in future views.
 */
export interface ParsedAppliedFacts {
  relations:     AppliedRelation[];
  parseStrategy: "RAW_JSON_DOC_PAGADO" | "APPLIED_FACTS_ARRAY" | "EMPTY" | "FALLBACK";
  rawInput:      unknown; // preserved for audit/debug
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * SAG codes that indicate a PAYMENT relation type.
 * Source: lib/finance/cobros-kpis.ts COBRO_CODES.
 */
const PAYMENT_CODES = new Set(["R1", "R2", "RS", "RC", "RG", "RA", "SI", "AN"]);

/**
 * Convert a raw SAG comprobanteCode to a relationType.
 * Nota débito (ND) and nota crédito (NC) codes are not yet in CollectionRecord
 * but are included for future-proofing.
 */
function codeToRelationType(code: string | null | undefined): AppliedRelation["relationType"] {
  if (!code) return "UNKNOWN";
  const upper = code.toUpperCase();
  if (PAYMENT_CODES.has(upper)) return "PAYMENT";
  if (upper.startsWith("ND")) return "ND";
  if (upper.startsWith("NC") || upper.startsWith("CR")) return "NC";
  return "UNKNOWN";
}

/**
 * Safely coerce a value to a positive number or null.
 * Returns null for: null, undefined, empty string, "0", NaN, negative, Infinity.
 */
function toPositiveNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Build the CustomerReceivable.erpId join key from a Documento_pagado value.
 * CustomerReceivable.erpId = "MOV-{ka_nl_movimiento}".
 * Documento_pagado = ka_nl_movimiento of the invoice being paid.
 *
 * Returns null when the value is absent or zero.
 */
function docPagadoToErpId(docPagado: string | number | null | undefined): string | null {
  if (docPagado == null) return null;
  const s = String(docPagado).trim();
  if (s === "" || s === "0") return null;
  // Validate it's a numeric SAG movimiento ID
  if (!/^\d+$/.test(s)) return null;
  return `MOV-${s}`;
}

// ── Path A: parse rawJson.raw (current production path) ──────────────────────

/**
 * Extract AppliedRelation from CollectionRecord.rawJson.
 *
 * Production data reality (2026-05-05):
 *   - rawJson is { raw: SAGRow, code: string, erpMovId: number | null }
 *   - SAGRow.Documento_pagado = invoice SAG MOVIMENTOS PK being paid
 *   - SAGRow.Valor_Pagado     = payment amount
 *   - SAGRow.Codigo_Fuente_Comprobante = payment type code
 *
 * This is the primary path because appliedFacts is always NULL in production.
 * When the mapper bug is fixed (reading Documento_pagado → appliedFacts),
 * path B will become the canonical path and this becomes the fallback.
 */
function extractFromRawJson(rawJson: unknown): AppliedRelation[] {
  if (rawJson == null || typeof rawJson !== "object") return [];

  // rawJson structure: { raw: SAGRow, code, erpMovId } from mapper
  const rj = rawJson as Record<string, unknown>;
  const sagRow: Record<string, unknown> =
    (rj["raw"] != null && typeof rj["raw"] === "object")
      ? rj["raw"] as Record<string, unknown>
      : rj;

  // Documento_pagado — the invoice being paid (primary join signal)
  const docPagado =
    sagRow["Documento_pagado"] ??
    sagRow["documento_pagado"] ??
    sagRow["DOCUMENTO_PAGADO"];

  const erpId = docPagadoToErpId(docPagado as any);

  // Valor_Pagado — the payment amount
  const valorPagado = toPositiveNum(
    sagRow["Valor_Pagado"] ??
    sagRow["valor_pagado"] ??
    sagRow["VALOR_PAGADO"]
  );

  // Numero_Documento — the cobro receipt number (NOT the invoice)
  const numDoc = sagRow["Numero_Documento"] ?? sagRow["numero_documento"];
  const sourceDocument = numDoc != null ? String(numDoc) : undefined;

  // Codigo_Fuente_Comprobante — payment type code
  const codigoFuente =
    (sagRow["Codigo_Fuente_Comprobante"] ??
     sagRow["codigo_fuente_comprobante"] ??
     sagRow["CODIGO_FUENTE_COMPROBANTE"] ??
     rj["code"]) as string | undefined;

  // When Documento_pagado is absent or zero, no relation can be extracted
  if (!erpId) return [];

  const relation: AppliedRelation = {
    sourceDocument,
    sourceType:    codigoFuente,
    targetInvoice: docPagado != null ? String(docPagado) : undefined,
    targetInvoiceId: erpId,
    amountApplied: valorPagado ?? undefined,
    relationType:  codeToRelationType(codigoFuente),
    // RAW_JSON path without a receivable match is MEDIUM by default;
    // callers that verify the join upgrade to HIGH.
    confidence:    erpId ? "MEDIUM" : "LOW",
  };

  return [relation];
}

// ── Path B: parse appliedFacts array (future: after mapper fix) ──────────────

/**
 * Parse CollectionRecord.appliedFacts (Json? field).
 *
 * Expected structure after mapper fix:
 *   Array<{ invoiceNumber: string | number; amount: number }>
 *
 * Historical / edge cases handled:
 *   - null / undefined → empty array
 *   - Empty array []   → empty array
 *   - Single object (not array) → wrapped as single-element
 *   - String blob → attempt JSON.parse, fallback to empty
 *   - Items with invoiceNumber = "0" → discarded
 *   - Items with amount = 0 → kept but flagged as LOW confidence
 *     (SAG structural zeros exist; they represent count-only rows)
 */
function parseAppliedFactsArray(
  appliedFacts: unknown,
  sourceType?: string,
): AppliedRelation[] {
  if (appliedFacts == null) return [];

  // String blob — attempt to deserialize
  if (typeof appliedFacts === "string") {
    if (appliedFacts.trim() === "") return [];
    try {
      appliedFacts = JSON.parse(appliedFacts);
    } catch {
      // Unparseable string — return LOW confidence unknown relation
      return [{
        relationType: "UNKNOWN",
        confidence:   "LOW",
        rawInput: appliedFacts,
      } as AppliedRelation & { rawInput: unknown }];
    }
  }

  // Single object (not array) — wrap
  if (!Array.isArray(appliedFacts)) {
    if (typeof appliedFacts === "object") {
      appliedFacts = [appliedFacts];
    } else {
      return [];
    }
  }

  const arr = appliedFacts as unknown[];
  if (arr.length === 0) return [];

  return arr.flatMap((item): AppliedRelation[] => {
    if (item == null || typeof item !== "object") return [];

    const it = item as Record<string, unknown>;

    // invoiceNumber — the invoice reference
    const invRaw = it["invoiceNumber"] ?? it["invoice_number"] ?? it["invoiceRef"];
    const invStr = invRaw != null ? String(invRaw).trim() : null;

    // Discard zero or empty invoice refs
    if (!invStr || invStr === "0" || invStr === "") return [];

    const erpId = docPagadoToErrId_strict(invStr);

    const amount    = toPositiveNum(it["amount"] ?? it["valor"] ?? it["Valor"]);
    const invoiceRef = it["invoiceRef"] as string | undefined;

    const relation: AppliedRelation = {
      sourceType:     sourceType,
      targetInvoice:  invStr,
      targetInvoiceId: erpId ?? undefined,
      amountApplied:  amount ?? undefined,
      relationType:   codeToRelationType(sourceType),
      confidence:     erpId
        ? (amount && amount > 0 ? "HIGH" : "MEDIUM")
        : "LOW",
    };

    return [relation];
  });
}

/**
 * Strict erpId derivation for appliedFacts path.
 * Unlike docPagadoToErrId, this does NOT blindly add "MOV-" prefix —
 * it only does so for numeric values that look like SAG MOVIMENTOS PKs.
 * Alphanumeric invoice numbers are returned as-is (no MOV- prefix).
 */
function docPagadoToErrId_strict(invoiceStr: string): string | null {
  if (!invoiceStr || invoiceStr === "0") return null;
  // Pure numeric → SAG MOVIMENTOS PK → add MOV- prefix
  if (/^\d+$/.test(invoiceStr)) return `MOV-${invoiceStr}`;
  // Alphanumeric (e.g. "FAC-2024-001") → return as-is
  return invoiceStr;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Primary entry point. Parses invoice-payment associations from a CollectionRecord.
 *
 * Strategy selection:
 *   1. Try appliedFacts (Path B) — used after mapper fix is deployed
 *   2. Fall back to rawJson.raw.Documento_pagado (Path A) — current production path
 *   3. Return EMPTY result when both are absent
 *
 * @param appliedFacts  CollectionRecord.appliedFacts (Json? — usually null today)
 * @param rawJson       CollectionRecord.rawJson (Json? — always populated)
 * @param sourceType    CollectionRecord.comprobanteCode (e.g. "R1")
 */
export function parseAppliedFacts(
  appliedFacts: unknown,
  rawJson:      unknown,
  sourceType?:  string,
): ParsedAppliedFacts {
  try {
    // Path B: appliedFacts array (future path, after mapper fix)
    if (appliedFacts != null) {
      const relations = parseAppliedFactsArray(appliedFacts, sourceType);
      if (relations.length > 0) {
        return {
          relations,
          parseStrategy: "APPLIED_FACTS_ARRAY",
          rawInput: appliedFacts,
        };
      }
    }

    // Path A: rawJson.raw.Documento_pagado (current production path)
    if (rawJson != null) {
      const relations = extractFromRawJson(rawJson);
      if (relations.length > 0) {
        return {
          relations,
          parseStrategy: "RAW_JSON_DOC_PAGADO",
          rawInput: rawJson,
        };
      }
    }

    // Nothing found
    return {
      relations:     [],
      parseStrategy: "EMPTY",
      rawInput:      null,
    };
  } catch {
    // Safety net — parser MUST never throw
    return {
      relations:     [],
      parseStrategy: "FALLBACK",
      rawInput:      null,
    };
  }
}

/**
 * Extract invoice candidate erpIds from a CollectionRecord.
 * These are the CustomerReceivable.erpId values to attempt joining.
 *
 * Returns empty array when no invoice reference can be extracted.
 *
 * @param appliedFacts  CollectionRecord.appliedFacts
 * @param rawJson       CollectionRecord.rawJson
 */
export function extractInvoiceCandidates(
  appliedFacts: unknown,
  rawJson:      unknown,
): string[] {
  const parsed = parseAppliedFacts(appliedFacts, rawJson);
  return parsed.relations
    .map(r => r.targetInvoiceId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Compute the overall confidence for a collection record's relation signals.
 *
 * HIGH   — Documento_pagado present, non-zero → definitive invoice reference
 * MEDIUM — appliedFacts present but no erpId derivable
 * LOW    — no invoice reference of any kind
 */
export function detectRelationConfidence(
  appliedFacts: unknown,
  rawJson:      unknown,
): "HIGH" | "MEDIUM" | "LOW" {
  const parsed = parseAppliedFacts(appliedFacts, rawJson);
  if (parsed.relations.length === 0) return "LOW";
  const confidences = parsed.relations.map(r => r.confidence);
  if (confidences.includes("HIGH"))   return "HIGH";
  if (confidences.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}
