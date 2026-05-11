/**
 * lib/reconciliation/canonical-record.ts
 *
 * AGENTIK-RECON-SESSIONS-01 — Task 3
 * Canonical Financial Record Contract
 *
 * Defines the universal normalized record format for ALL reconciliation sources.
 *
 * Every source adapter (SAG, DIAN, bank, gateway) must normalize its rows into
 * CanonicalReconRecord[] before passing them to the reconciliation engine.
 *
 * This contract is the DATA LAYER foundation. The engine operates on these records,
 * not on raw SAG/DIAN/bank data. This decouples the engine from any source format.
 *
 * Current status (AGENTIK-RECON-SESSIONS-01):
 *   - Contract defined — all fields specified.
 *   - Adapters NOT yet migrated. Existing adapters still use ReconSide (types.ts).
 *   - Migration of adapters is a future sprint.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { ReconciliationSourceType } from "./source-contract";

// ── Canonical record ──────────────────────────────────────────────────────────

/**
 * The universal normalized record format for reconciliation.
 *
 * All sources — SAG, DIAN, bank statements, payment gateways — must
 * normalize their data into this format before matching.
 *
 * Field naming convention follows Colombian accounting terminology
 * (NIT, comprobante, tercero, cuenta contable).
 */
export interface CanonicalReconRecord {
  // ── Identity
  /** Stable internal ID for this record (UUID or cuid). */
  id:             string;
  /** Which source produced this record. */
  sourceId:       ReconciliationSourceType;
  /** The source system's own identifier (SAG movId, DIAN CUFE, bank txnRef). */
  externalId:     string;

  // ── Document classification
  /**
   * Type of financial document.
   * Examples: "FE" (Factura Electrónica), "R1" (Remisión), "PD" (Pedido),
   *           "COBRO" (cobro), "EXTRACTO" (bank movement), "LIQUIDACION" (settlement).
   */
  documentType:   string;
  /** Document number in the source system (número de comprobante). */
  documentNumber: string | null;

  // ── Third party
  /** NIT or identification number of the counterpart (tercero). */
  thirdPartyId:   string | null;
  /** Legal name or alias of the counterpart. */
  thirdPartyName: string | null;

  // ── Monetary
  /** Net amount in the source currency. */
  amount:         number;
  /** ISO 4217 currency code. Default: "COP". */
  currency:       string;

  // ── Dates
  /**
   * Document issue or transaction date (ISO 8601 date string: "YYYY-MM-DD").
   * This is the BUSINESS date, not the system created date.
   */
  date:           string;
  /**
   * Due date for receivables/payables (ISO 8601 date string).
   * Null for non-credit instruments.
   */
  dueDate:        string | null;

  // ── Reference fields
  /**
   * Free-form reference text (descripción, concepto, referencia de pago).
   * Used as a secondary match hint.
   */
  reference:      string | null;
  /**
   * SAG PUC account code (cuenta contable) where this record is posted.
   * Null when the source does not provide an account code (e.g., bank statements).
   */
  accountCode:    string | null;

  // ── Record status
  /**
   * Status of the record in the source system.
   * Examples: "open", "applied", "paid", "cancelled", "pending", "accepted", "rejected".
   */
  status:         string;

  // ── Traceability
  /**
   * Raw reference string (e.g., "SaleRecord:clx...", "CollectionRecord:clx...").
   * Used for cross-referencing back to the source model.
   */
  rawRef:         string;
  /** Additional source-specific metadata. */
  metadata:       Record<string, unknown>;
}

// ── Match key builders ─────────────────────────────────────────────────────────

/**
 * Build a match key from a CanonicalReconRecord using the specified field combination.
 *
 * Used by the engine to compute the match key for each record.
 * The key is deterministic and stable across runs.
 *
 * Supported patterns:
 *   "documentNumber"              — match by document number only
 *   "thirdPartyId|documentNumber" — NIT + document number (most precise)
 *   "thirdPartyId|amount"         — NIT + amount (for payment matching)
 *   "externalId"                  — source's own ID (for deduplication)
 */
export function buildMatchKey(
  record:   CanonicalReconRecord,
  pattern:  string,
): string {
  return pattern.split("|").map(field => {
    switch (field) {
      case "documentNumber":  return record.documentNumber ?? "__null__";
      case "thirdPartyId":    return record.thirdPartyId   ?? "__null__";
      case "externalId":      return record.externalId;
      case "amount":          return record.amount.toFixed(2);
      case "date":            return record.date;
      case "accountCode":     return record.accountCode    ?? "__null__";
      default:
        return (record.metadata[field] as string | undefined) ?? "__null__";
    }
  }).join("|");
}

// ── Source normalization contract ──────────────────────────────────────────────

/**
 * Interface that every source adapter must implement.
 *
 * Future adapters (SAG payments, DIAN XML, bank statements) will implement this.
 * Current adapters (orders-vs-sales.ts) use the legacy ReconSide format.
 *
 * Migration plan:
 *   1. Implement CanonicalReconAdapter for each new source.
 *   2. Migrate existing orders-vs-sales adapter in a future sprint.
 *   3. Once all adapters migrate, retire ReconSide.
 */
export interface CanonicalReconAdapter {
  /** The source type this adapter normalizes from. */
  readonly sourceType: ReconciliationSourceType;

  /**
   * Fetch and normalize records for the given organization + period.
   *
   * Must be pure: no side effects, no writes.
   * Must handle empty results gracefully (return []).
   * Must NOT fabricate data when source is unavailable.
   */
  fetchRecords(
    organizationId: string,
    period:         string,
    filters?:       Record<string, unknown>,
  ): Promise<CanonicalReconRecord[]>;
}

// ── Normalization helpers ──────────────────────────────────────────────────────

/**
 * Build a CanonicalReconRecord from a SAG SaleRecord row.
 * Used by future sag_orders and sag_sales adapters.
 *
 * NOT IMPLEMENTED — placeholder for contract documentation.
 */
export function _documentSagSaleRecordNormalization(): void {
  // Future implementation:
  //
  // Input: SaleRecord (Prisma) with importBatchId → SalesImportBatch.source
  //
  // Mapping:
  //   id             = cuid()
  //   sourceId       = "sag_orders" | "sag_sales"
  //   externalId     = SaleRecord.id
  //   documentType   = SaleRecord.sagSourceType ?? SaleRecord.comprobanteCode
  //   documentNumber = SaleRecord.documentNumber (if present)
  //   thirdPartyId   = SaleRecord.sellerSlug
  //   thirdPartyName = SaleRecord.sellerName
  //   amount         = SaleRecord.amount
  //   currency       = "COP"
  //   date           = SaleRecord.periodoAoMes
  //   accountCode    = null (SAG sales don't carry a PUC code at this level)
  //   status         = "posted"
  //   rawRef         = `SaleRecord:${SaleRecord.id}`
  //   metadata       = { productLine, channel, importSource }
}

/**
 * Build a CanonicalReconRecord from a SAG CollectionRecord row.
 * Used by future sag_payments adapter.
 *
 * NOT IMPLEMENTED — placeholder for contract documentation.
 */
export function _documentSagCollectionRecordNormalization(): void {
  // Future implementation:
  //
  // Input: CollectionRecord (Prisma) — v_pagosnew source
  //
  // Mapping:
  //   id             = cuid()
  //   sourceId       = "sag_payments"
  //   externalId     = CollectionRecord.sagMovId.toString()
  //   documentType   = CollectionRecord.sourceCode  // H1, B1, B2, CP
  //   documentNumber = CollectionRecord.documentNumber
  //   thirdPartyId   = CollectionRecord.customerNit
  //   thirdPartyName = CollectionRecord.customerName
  //   amount         = CollectionRecord.amount
  //   currency       = "COP"
  //   date           = CollectionRecord.collectedAt.toISOString().slice(0,10)
  //   dueDate        = null
  //   accountCode    = BANK_ACCOUNT_SOURCES[sourceCode]?.sagAccountCode
  //   status         = CollectionRecord.appliedStatus (mapped to lowercase)
  //   rawRef         = `CollectionRecord:${CollectionRecord.id}`
  //   metadata       = { bankCode, amountSource }
}
