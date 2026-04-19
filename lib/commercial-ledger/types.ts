/**
 * Unified Commercial Ledger — shared types.
 *
 * A CommercialFact is a single event in a customer's commercial timeline,
 * sourced from any of three systems:
 *   - "crm_quote"   — CRMQuote (AOS_Quotes from SuiteCRM)
 *   - "sag_invoice" — CustomerReceivable (cartera from SAG/ERP)
 *   - "xml_payment" — SaleRecord (XML-reconciled cash payment)
 */

import type { SagDocumentFamily } from "@prisma/client";

export type CommercialSourceType = "crm_quote" | "sag_invoice" | "xml_payment";

export type PaymentStatus = "paid" | "partial" | "pending" | "overdue";

// ── Unified status model ───────────────────────────────────────────────────────
//
// Reconciled across all three source systems.
//
// CRM → SAG pipeline:
//   PENDING_SAG   rawCrmJson.id_sag_c is null/empty          → not sent to SAG yet
//   SYNCED_SAG    id_sag_c present, invoice_status absent     → in SAG, not invoiced
//   INVOICED      id_sag_c present, invoice_status present    → invoiced in SAG
//
// SAG receivables:
//   CURRENT       status=OPEN, daysOverdue=0                  → pending collection
//   PARTIAL       status=PARTIAL                              → partial payment
//   OVERDUE       daysOverdue > 0, status != PAID             → past due date
//   PAID          status=PAID                                 → fully collected
//   WRITTEN_OFF   status=WRITTEN_OFF                         → bad debt
//
// XML / SaleRecord:
//   COLLECTED_XML always "paid" — XML facts represent cash movement
//
export type LedgerStatus =
  | "pending_sag"     // CRM: not sent to SAG
  | "synced_sag"      // CRM: in SAG, awaiting invoice
  | "invoiced"        // CRM: invoiced in SAG
  | "current"         // SAG: open, on-time
  | "partial"         // SAG: partial payment received
  | "overdue"         // SAG: past due date, outstanding balance
  | "paid"            // SAG: fully paid
  | "written_off"     // SAG: written off
  | "collected_xml";  // XML: cash collected

export interface CommercialFact {
  /** Internal Agentik row id */
  id: string;

  /** CustomerProfile.id (may be null for unlinked SaleRecord rows) */
  customerId: string | null;

  sourceType: CommercialSourceType;

  /** Primary key in the source table (CRMQuote.id, CustomerReceivable.id, SaleRecord.id) */
  sourceId: string;

  /** Human-readable document reference (quote number, invoice number, comprobante) */
  documentNumber: string | null;

  sellerName:  string | null;
  branch:      string | null;  // sucursal_c (CRM) or storeName (XML)

  /** Face value of the document (quote amount, invoice originalAmount, XML amount) */
  grossAmount: number | null;

  /** Amount already collected (sag_invoice: paidAmount; others: null) */
  paidAmount: number | null;

  /** Remaining balance (sag_invoice: balanceDue; crm_quote/xml: null) */
  outstandingAmount: number | null;

  /** CRM quote status string (from rawCrmJson.stage) */
  crmStatus: string | null;

  /** SAG sync status (from rawCrmJson.respuesta_sag_c) */
  sagStatus: string | null;

  paymentStatus: PaymentStatus | null;

  /** Unified reconciled status across all three source systems */
  ledgerStatus: LedgerStatus;

  /** When the document was created / issued */
  issuedAt: Date | null;

  /** When the invoice/payment was settled */
  paidAt: Date | null;

  /** Invoice due date (sag_invoice only) */
  dueAt: Date | null;

  /** SAG document source family — populated for xml_payment facts only */
  sagDocumentFamily: SagDocumentFamily | null;
}

// ── Org-level KPIs ────────────────────────────────────────────────────────────

export interface CommercialKpis {
  // ── Volume ─────────────────────────────────────────────────────────────────
  /** Sum of CRMQuote.amount for the org (total ordered via CRM) */
  totalOrdered:     number;

  /** Sum of CustomerReceivable.originalAmount (total invoiced / billed by ERP) */
  totalInvoiced:    number;

  /** Sum of CustomerReceivable.paidAmount (cash collected) */
  totalCollected:   number;

  /** Sum of CustomerReceivable.balanceDue where status != PAID (open balance) */
  totalOutstanding: number;

  /** Sum of CustomerReceivable.balanceDue where daysOverdue > 0 */
  totalOverdue:     number;

  /** totalCollected / totalInvoiced as 0–100 percentage. null when totalInvoiced = 0. */
  collectionRate: number | null;

  // ── CRM → SAG pipeline ─────────────────────────────────────────────────────
  /** Quotes with id_sag_c absent → not yet sent to SAG */
  pendingToSag:       number;
  pendingToSagAmount: number;

  /** Quotes with id_sag_c present → sent to SAG */
  syncedToSag:       number;
  syncedToSagAmount: number;

  /** Synced to SAG but invoice_status absent → pending invoice generation */
  notInvoiced:       number;
  notInvoicedAmount: number;

  /** CRM quotes with status = ACCEPTED */
  acceptedQuotes:  number;
  acceptedAmount:  number;

  // ── Counts ─────────────────────────────────────────────────────────────────
  /** Total CRMQuote rows */
  quoteCount: number;

  /** Open CustomerReceivable rows */
  openInvoiceCount: number;
}

// ── Seller-level ledger summary ────────────────────────────────────────────────

export interface SellerLedgerKpis {
  sellerSlug:         string;
  sellerName:         string | null;
  // CRM pipeline
  totalQuotes:        number;
  totalQuoteAmount:   number;
  pendingToSag:       number;
  pendingToSagAmount: number;
  syncedToSag:        number;
  notInvoiced:        number;
  notInvoicedAmount:  number;
  acceptedQuotes:     number;
  acceptedAmount:     number;
  // Receivables (customers assigned to this seller)
  totalOutstanding:   number;
  totalOverdue:       number;
  overdueCount:       number;
}

// ── Customer-level ledger summary ──────────────────────────────────────────────

export interface CustomerLedgerKpis {
  customerId:       string | null;
  customerName:     string | null;
  customerNit:      string | null;
  // CRM
  totalQuotes:      number;
  totalQuoteAmount: number;
  pendingToSag:     number;
  notInvoiced:      number;
  // Receivables
  totalInvoiced:    number;
  totalCollected:   number;
  totalOutstanding: number;
  totalOverdue:     number;
  collectionRate:   number | null;
}

// ── Customer-level timeline ────────────────────────────────────────────────────

/** CommercialFact with string-serialized Dates — safe to pass across RSC → client boundary. */
export type SerializedCommercialFact = Omit<
  CommercialFact,
  "issuedAt" | "paidAt" | "dueAt"
> & {
  issuedAt: string | null;
  paidAt:   string | null;
  dueAt:    string | null;
};
