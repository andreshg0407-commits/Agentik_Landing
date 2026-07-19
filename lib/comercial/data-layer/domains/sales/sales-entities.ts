/**
 * domains/sales/sales-entities.ts
 *
 * Canonical entities for the Sales Domain.
 * Represents completed sales transactions (invoices, credit notes, debit notes)
 * that originate from SAG — NOT order creation (which lives in lib/comercial/pedidos/).
 *
 * Entity types: SalesDocument, SaleLine, SalesReturn, SalesAttribution
 */

import type { CommercialIdentity, CommercialTimestamp, ExternalReference, DataSourceMetadata } from "../../contracts";

// ── Sales Document Type ─────────────────────────────────────────────────────

export type SalesDocumentType =
  | "FACTURA"
  | "NOTA_CREDITO"
  | "NOTA_DEBITO"
  | "REMISION";

// ── Sales Document Status ───────────────────────────────────────────────────

export type SalesDocumentStatus =
  | "ACTIVE"
  | "ANULADA"
  | "PENDIENTE";

export function deriveSalesDocumentStatus(flags: {
  anulada: boolean;
  totalValue: number;
}): SalesDocumentStatus {
  if (flags.anulada) return "ANULADA";
  if (flags.totalValue <= 0) return "PENDIENTE";
  return "ACTIVE";
}

// ── Sales Document ──────────────────────────────────────────────────────────

export interface SalesDocument {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;
  readonly schemaVersion: number;

  /** Document number (SAG consecutive) */
  readonly documentNumber: string;
  /** Document type */
  readonly documentType: SalesDocumentType;
  /** Document status */
  readonly status: SalesDocumentStatus;
  /** Document date */
  readonly date: Date;

  /** Customer */
  readonly customerCode: string;
  readonly customerName: string;

  /** Seller */
  readonly sellerCode: string;
  readonly sellerName: string;

  /** Warehouse */
  readonly warehouseCode: string;

  /** Financials */
  readonly financials: SalesDocumentFinancials;

  /** Line count */
  readonly lineCount: number;
  /** Total units */
  readonly totalUnits: number;

  /** Linked order ID (if traceable back to an Agentik order) */
  readonly linkedOrderId: string | null;
  /** Linked order external sync key */
  readonly linkedOrderSyncKey: string | null;

  /** Observations/notes from SAG */
  readonly observations: string | null;
}

// ── Sales Document Financials ───────────────────────────────────────────────

export interface SalesDocumentFinancials {
  readonly subtotal: number;
  readonly discount: number;
  readonly ivaTotal: number;
  readonly total: number;
  readonly currency: string;
}

// ── Sale Line ───────────────────────────────────────────────────────────────

export interface SaleLine {
  readonly identity: CommercialIdentity;
  readonly documentIdentity: CommercialIdentity;

  /** Line number within the document */
  readonly lineNumber: number;

  /** Product reference */
  readonly referenceCode: string;
  readonly productName: string;

  /** Variant (optional) */
  readonly sizeCode: string | null;
  readonly colorCode: string | null;

  /** Quantities */
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly lineTotal: number;

  /** IVA */
  readonly ivaRate: number;
  readonly ivaAmount: number;

  /** Warehouse for this line (may differ from header) */
  readonly warehouseCode: string | null;

  /** Cost at time of sale (for margin calculation) */
  readonly unitCost: number | null;
}

// ── Sales Return ────────────────────────────────────────────────────────────

export type SalesReturnReason =
  | "DEVOLUCION_CLIENTE"
  | "PRODUCTO_DEFECTUOSO"
  | "ERROR_FACTURACION"
  | "GARANTIA"
  | "OTRO";

export interface SalesReturn {
  readonly identity: CommercialIdentity;
  readonly externalRef: ExternalReference;
  readonly sourceMetadata: DataSourceMetadata;
  readonly timestamps: CommercialTimestamp;

  /** Credit note document number */
  readonly creditNoteNumber: string;
  /** Original invoice document number */
  readonly originalInvoiceNumber: string;
  /** Return date */
  readonly date: Date;

  /** Customer */
  readonly customerCode: string;
  readonly customerName: string;

  /** Return reason */
  readonly reason: SalesReturnReason;

  /** Financial impact */
  readonly totalValue: number;
  readonly currency: string;

  /** Lines returned */
  readonly lineCount: number;
  readonly totalUnitsReturned: number;
}

// ── Sales Attribution ───────────────────────────────────────────────────────
// Links a sale to its commercial attribution chain: seller → customer → territory

export interface SalesAttribution {
  readonly identity: CommercialIdentity;
  readonly documentIdentity: CommercialIdentity;

  /** Document reference */
  readonly documentNumber: string;
  readonly documentType: SalesDocumentType;
  readonly date: Date;

  /** Attribution chain */
  readonly sellerCode: string;
  readonly sellerName: string;
  readonly customerCode: string;
  readonly customerName: string;
  readonly warehouseCode: string;

  /** Value attributed */
  readonly totalValue: number;
  readonly currency: string;

  /** Period (YYYY-MM) for aggregation */
  readonly period: string;
}
