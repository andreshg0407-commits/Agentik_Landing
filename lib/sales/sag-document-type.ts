/**
 * SAG Document Source Classification
 * ====================================
 *
 * SAG PYA uses comprobante type codes (stored as cod_comprobante in exports
 * and as TIPO_DOC in the DOCUMENTOS/CARTERA SOAP tables) to distinguish
 * different kinds of commercial documents.
 *
 * Two families are commercially critical for Castillitos:
 *
 *   OFFICIAL_INVOICE   — Factura de venta fiscal (FV or equivalent).
 *                        Creates a receivable in cartera; is the document
 *                        used for tax reporting and collection tracking.
 *
 *   DISPATCH_REMISION  — Remisión / Nota de entrega (NV or equivalent).
 *                        Operational dispatch document; does NOT create a
 *                        receivable; is later reconciled against an invoice.
 *                        Including these in sales totals causes double-counting
 *                        if the corresponding invoice is also imported.
 *
 *   CREDIT_NOTE        — Nota crédito (NC or equivalent).
 *                        Reduces receivables; must be excluded from revenue.
 *
 *   DEBIT_NOTE         — Nota débito (ND or equivalent).
 *                        Adjusts receivables upward.
 *
 *   OTHER              — Default for any code not in the tenant's map.
 *                        All existing records default to OTHER until the
 *                        mapping is configured and a backfill is run.
 *
 * ── Configuration ─────────────────────────────────────────────────────────────
 *
 * The mapping from raw SAG codes to families is TENANT-SPECIFIC and must be
 * confirmed against each tenant's SAG configuration.
 *
 * Store the map in Connector.config.documentFamilyMap (JSON):
 *
 *   {
 *     "documentFamilyMap": {
 *       "FV": "OFFICIAL_INVOICE",
 *       "NV": "DISPATCH_REMISION",
 *       "NC": "CREDIT_NOTE",
 *       "ND": "DEBIT_NOTE"
 *     }
 *   }
 *
 * When documentFamilyMap is absent or empty, all documents classify as OTHER.
 * This is intentional — we never guess mappings.
 *
 * ── Castillitos — codes pending confirmation ───────────────────────────────────
 *
 * Source of truth: SAG PYA manual
 *   https://pya.com.co/wp-content/uploads/2026/02/Manual-SAG.html
 *
 * The following codes have been observed in Castillitos exports but their
 * exact families have NOT been confirmed with the client or PYA:
 *
 *   "FV"  — observed in cod_comprobante; presumed OFFICIAL_INVOICE
 *             ⚠ UNCONFIRMED — must validate against SAG manual Section: Tipos de Documento
 *
 *   "NV"  — observed or expected; presumed DISPATCH_REMISION
 *             ⚠ UNCONFIRMED — "NV" could be Nota de Venta (a fiscal document in
 *             some SAG configurations) or a remisión. Context-dependent.
 *
 *   "NC"  — standard SAG code for Nota Crédito; presumed CREDIT_NOTE
 *             ⚠ UNCONFIRMED — confirm it is present in Castillitos data
 *
 *   "ND"  — standard SAG code for Nota Débito; presumed DEBIT_NOTE
 *             ⚠ UNCONFIRMED
 *
 * Do NOT add these to DEFAULT_DOCUMENT_FAMILY_MAP until confirmed.
 * Use setup-castillitos-connectors.ts or the connector PATCH API to add
 * them once validated.
 *
 * ── Double-counting risk ───────────────────────────────────────────────────────
 *
 * Until families are confirmed and mapped:
 *   - All SaleRecord rows have sagDocumentFamily = "OTHER"
 *   - Revenue KPIs include all rows (no filtering by family)
 *   - Risk: remisiones and official invoices are summed together
 *
 * Once mapped:
 *   - Sales dashboards can filter to OFFICIAL_INVOICE only
 *   - Pending-to-invoice = DISPATCH_REMISION rows with no matching FV
 *   - Credit notes can be separated from gross revenue
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Matches the SagDocumentFamily Prisma enum exactly. */
export type SagDocumentFamily =
  | "OFFICIAL_INVOICE"
  | "DISPATCH_REMISION"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "OTHER";

/**
 * Map from raw SAG comprobante code (e.g. "FV") to a SagDocumentFamily.
 * Keys are upper-cased before lookup so "fv" and "FV" both match.
 */
export type SagDocumentFamilyMap = Record<string, SagDocumentFamily>;

// ── Default map ───────────────────────────────────────────────────────────────
//
// INTENTIONALLY EMPTY — we do not ship assumed mappings.
// Populate Connector.config.documentFamilyMap once Castillitos codes are
// confirmed against the PYA SAG manual.

export const DEFAULT_DOCUMENT_FAMILY_MAP: SagDocumentFamilyMap = {};

// ── Classification function ───────────────────────────────────────────────────

/**
 * Classify a raw SAG comprobante code into a SagDocumentFamily.
 *
 * Returns "OTHER" when:
 *   - code is null / empty
 *   - code is not in the provided map
 *   - map is empty (not yet configured)
 *
 * Case-insensitive: "FV", "fv", "Fv" all match the same entry.
 */
export function classifyDocumentFamily(
  rawCode: string | null | undefined,
  map:     SagDocumentFamilyMap,
): SagDocumentFamily {
  if (!rawCode) return "OTHER";
  const key = rawCode.trim().toUpperCase();
  return map[key] ?? "OTHER";
}

/**
 * Extract the documentFamilyMap from a connector config JSON blob.
 * Returns DEFAULT_DOCUMENT_FAMILY_MAP (empty) when the key is absent.
 *
 * Expected connector config shape:
 *   {
 *     "documentFamilyMap": { "FV": "OFFICIAL_INVOICE", ... }
 *   }
 */
export function getDocumentFamilyMap(
  connectorConfig: Record<string, unknown> | null | undefined,
): SagDocumentFamilyMap {
  if (!connectorConfig) return DEFAULT_DOCUMENT_FAMILY_MAP;
  const raw = connectorConfig["documentFamilyMap"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_DOCUMENT_FAMILY_MAP;
  }
  // Validate and normalise entries — only accept valid family strings
  const VALID_FAMILIES = new Set<string>([
    "OFFICIAL_INVOICE",
    "DISPATCH_REMISION",
    "CREDIT_NOTE",
    "DEBIT_NOTE",
    "OTHER",
  ]);

  const result: SagDocumentFamilyMap = {};
  for (const [code, family] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof family === "string" && VALID_FAMILIES.has(family)) {
      result[code.trim().toUpperCase()] = family as SagDocumentFamily;
    }
  }
  return result;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const DOCUMENT_FAMILY_LABELS: Record<SagDocumentFamily, string> = {
  OFFICIAL_INVOICE:  "Factura de venta",
  DISPATCH_REMISION: "Remisión / Nota de entrega",
  CREDIT_NOTE:       "Nota crédito",
  DEBIT_NOTE:        "Nota débito",
  OTHER:             "Otro / Sin clasificar",
};

export const DOCUMENT_FAMILY_SHORTLABELS: Record<SagDocumentFamily, string> = {
  OFFICIAL_INVOICE:  "Factura",
  DISPATCH_REMISION: "Remisión",
  CREDIT_NOTE:       "N. Crédito",
  DEBIT_NOTE:        "N. Débito",
  OTHER:             "Otro",
};

/**
 * True for document families that represent REVENUE-generating fiscal events.
 * Use this to filter SaleRecord rows for revenue KPIs once families are confirmed.
 *
 * When all records are OTHER (map not yet configured) this returns false for
 * everything — callers must fall back to including all rows.
 */
export function isRevenueDocument(family: SagDocumentFamily): boolean {
  return family === "OFFICIAL_INVOICE";
}

/**
 * True for document families that REDUCE revenue (must be subtracted from gross).
 */
export function isReductionDocument(family: SagDocumentFamily): boolean {
  return family === "CREDIT_NOTE" || family === "DEBIT_NOTE";
}
