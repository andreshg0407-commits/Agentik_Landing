/**
 * Universal Connector Layer — canonical (unified) type definitions.
 *
 * These types form the source-agnostic business schema that every adapter
 * must produce. They decouple business logic from any specific ERP, CRM, or
 * ecommerce system.
 *
 * Design rules:
 *   - Fields that may be absent are `optional` (?), never `field: T | null`.
 *   - Monetary amounts are plain `number` (adapter handles parsing/currency).
 *   - Dates are always `Date` objects — never strings.
 *   - `sourceId` is the record's ID in the originating system.
 *   - `meta` is a safety valve for source-specific fields that don't fit the
 *     canonical schema. Avoid relying on it in business logic.
 */

// ── Foundational identifiers ──────────────────────────────────────────────────

export type SyncModule =
  | "orders"
  | "customers"
  | "inventory"
  | "invoices"
  | "receivables"
  | "opportunities"
  | "activities"
  | "quotes";

export type SourceSystem =
  | "sag_pya"
  | "shopify"
  | "hubspot"
  | "csv"
  | "google_sheets"
  | "odoo"
  | "siigo"
  | "sap"
  | (string & {}); // extensible — extra sources without losing literal type hints

// ── Shared primitives ─────────────────────────────────────────────────────────

export interface Address {
  line1?:       string;
  line2?:       string;
  city?:        string;
  state?:       string;
  country?:     string;  // ISO 3166-1 alpha-2 preferred
  postalCode?:  string;
}

// ── Base record mixin ─────────────────────────────────────────────────────────

/** Every unified record carries these provenance fields. */
export interface SourceRecord {
  /** Record ID in the source system. Used for dedup natural key. */
  sourceId:  string;
  /** Which system produced this record. */
  source:    SourceSystem;
  /** The Agentik organisation that owns this record. */
  orgId:     string;
  /** ConnectorRun.id that fetched this record (set by the SyncEngine). */
  pullRunId?: string;
  /** Raw source-specific fields not in the canonical schema. */
  meta?:     Record<string, unknown>;
}

// ── Pull result ───────────────────────────────────────────────────────────────

/**
 * Return type for every adapter pull method.
 *
 * `nextCursor` is the value the SyncEngine stores and passes on the next call.
 * When `null`, the module is fully caught up.
 */
export interface PullResult<T> {
  records:    T[];
  nextCursor: string | null;
  hasMore:    boolean;
  /** Total records available in the source (if known by the API; else null). */
  totalCount: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical entity types
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Orders ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "fulfilled"
  | "cancelled"
  | "refunded"
  | "on_hold";

export interface OrderLineItem {
  sku?:          string;
  productId?:    string;
  productName:   string;
  variantName?:  string;
  quantity:      number;
  unitPrice:     number;
  discount?:     number;
  tax?:          number;
  total:         number;
}

export interface UnifiedOrder extends SourceRecord {
  orderNumber:    string;
  status:         OrderStatus;

  customerId?:    string;
  customerName?:  string;
  customerEmail?: string;
  customerTaxId?: string;

  lineItems:      OrderLineItem[];

  subtotal:       number;
  discountTotal:  number;
  taxTotal:       number;
  total:          number;
  currency:       string;

  channel?:       string;   // "web" | "pos" | "phone" | "marketplace"
  storeId?:       string;
  storeName?:     string;

  shippingAddress?: Address;
  billingAddress?:  Address;

  notes?:         string;

  orderedAt:      Date;
  updatedAt:      Date;
  fulfilledAt?:   Date;
  cancelledAt?:   Date;
}

// ── 2. Customers ──────────────────────────────────────────────────────────────

export type CustomerType = "individual" | "company" | "unknown";

export interface UnifiedCustomer extends SourceRecord {
  name:          string;
  email?:        string;
  phone?:        string;
  /** Tax ID: NIT / RUT / RFC / VAT / EIN — normalised (no dots/dashes). */
  taxId?:        string;

  type:          CustomerType;

  address?:      Address;

  salesRepId?:   string;
  salesRepName?: string;

  tags?:         string[];

  createdAt:     Date;
  updatedAt:     Date;
}

// ── 3. Inventory ──────────────────────────────────────────────────────────────

export interface UnifiedInventory extends SourceRecord {
  sku:              string;
  name:             string;
  barcode?:         string;

  categoryId?:      string;
  categoryName?:    string;

  quantityOnHand:   number;
  quantityReserved?: number;
  quantityAvailable?: number;

  unitCost?:        number;
  unitPrice?:       number;
  currency?:        string;

  warehouseId?:     string;
  warehouseName?:   string;

  /** Unit of measure: "each" | "kg" | "box" | … */
  unit?:            string;

  updatedAt:        Date;
}

// ── 4. Invoices ───────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "cancelled"
  | "voided";

export interface InvoiceLineItem {
  description:   string;
  productCode?:  string;
  quantity:      number;
  unitPrice:     number;
  discount?:     number;
  taxRate?:      number;
  taxAmount?:    number;
  total:         number;
}

export interface UnifiedInvoice extends SourceRecord {
  invoiceNumber:  string;
  status:         InvoiceStatus;

  customerId?:    string;
  customerName:   string;
  customerTaxId?: string;

  lineItems:      InvoiceLineItem[];

  subtotal:       number;
  taxTotal:       number;
  discountTotal:  number;
  total:          number;
  currency:       string;

  /** Link to UnifiedOrder.sourceId if this invoice relates to an order. */
  orderId?:       string;

  issueDate:      Date;
  dueDate?:       Date;
  paidDate?:      Date;

  notes?:         string;
}

// ── 5. Receivables ────────────────────────────────────────────────────────────

export type ReceivableStatus =
  | "open"
  | "partial"
  | "paid"
  | "overdue"
  | "written_off";

export interface UnifiedReceivable extends SourceRecord {
  /** Reference to the source invoice number, if any. */
  invoiceRef?:    string;
  /** UnifiedInvoice.sourceId if linked. */
  invoiceId?:     string;

  customerId?:    string;
  customerName:   string;
  customerTaxId?: string;

  originalAmount: number;
  paidAmount:     number;
  /** Computed: originalAmount − paidAmount. */
  balanceDue:     number;
  currency:       string;

  status:         ReceivableStatus;

  issueDate:      Date;
  dueDate:        Date;
  paidDate?:      Date;

  /**
   * Days past dueDate at time of pull. Negative = not yet due.
   * Computed by the adapter or the receivable normalizer.
   */
  daysOverdue:    number;
}

// ── 6. CRM Opportunity ────────────────────────────────────────────────────────

export type OpportunityStatus =
  | "open"
  | "won"
  | "lost"
  | "abandoned";

export interface UnifiedOpportunity extends SourceRecord {
  crmId?:          string;
  title:           string;
  stage:           string;        // pipeline stage key
  amount:          number;
  currency:        string;
  probability:     number;        // 0–100

  customerId?:     string;
  customerName?:   string;
  customerTaxId?:  string;

  sellerSlug?:     string;
  sellerName?:     string;

  status:          OpportunityStatus;
  lossReason?:     string;
  lossNote?:       string;

  openedAt:        Date;
  expectedCloseAt?: Date;
  closedAt?:       Date;
  lastActivityAt?: Date;
}

// ── 7. CRM Activity ───────────────────────────────────────────────────────────

export type ActivityType =
  | "call"
  | "email"
  | "visit"
  | "note"
  | "meeting"
  | "quote_sent"
  | "demo"
  | "proposal"
  | "other";

export interface UnifiedActivity extends SourceRecord {
  crmId?:          string;
  type:            ActivityType;
  subject?:        string;
  body?:           string;
  outcome?:        string;

  customerId?:     string;
  opportunityId?:  string;        // crmId of the linked opportunity

  sellerSlug?:     string;
  sellerName?:     string;

  occurredAt:      Date;
  dueAt?:          Date;
  completedAt?:    Date;
}

// ── 8. CRM Quote ──────────────────────────────────────────────────────────────

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export interface UnifiedQuote extends SourceRecord {
  crmId?:          string;
  quoteNumber?:    string;
  status:          QuoteStatus;
  amount:          number;
  currency:        string;

  customerId?:     string;
  opportunityId?:  string;

  sellerSlug?:     string;
  sellerName?:     string;

  issuedAt:        Date;
  expiresAt?:      Date;
  respondedAt?:    Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine contracts
// ─────────────────────────────────────────────────────────────────────────────

/** Opaque config blob from Connector.config. Adapters cast to their own type. */
export type AdapterConfig = Record<string, unknown>;

/** Passed into StorageHandler so records can be tagged with the run. */
export interface RunContext {
  runId:       string;
  connectorId: string;
  orgId:       string;
  source:      SourceSystem;
  module:      SyncModule;
}

/**
 * Pluggable persistence layer, one per module.
 * The SyncEngine calls this after normalising + deduplicating a page.
 */
export interface StorageHandler<T extends SourceRecord> {
  upsertMany(
    records: T[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }>;
}

/** Options forwarded to SyncEngine.syncModule(). */
export interface SyncOptions {
  /** Force full re-sync even if a cursor exists. Default: false. */
  fullSync?:        boolean;
  /** Max pages per run. Prevents runaway syncs. Default: unlimited. */
  maxPages?:        number;
  /** Upper bound on retry delay (ms). Default: 30 000. */
  maxRetryDelayMs?: number;
  /**
   * Dry-run: pull and normalise records but do not write to DB
   * and do not advance the cursor. Default: false.
   */
  dryRun?:          boolean;
}
