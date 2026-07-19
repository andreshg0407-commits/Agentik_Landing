/**
 * lib/comercial/pedidos/sag-invoice-sync-types.ts
 *
 * Contract: SAG → Agentik for invoice data.
 * No Prisma — runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

// ── Normalized SAG invoice ───────────────────────────────────────────────────

export interface SagNormalizedInvoice {
  invoiceId:      string;
  invoiceNumber:  string;
  customerCode:   string;
  sellerCode:     string;
  date:           string;
  totalValue:     number;
  lines:          SagInvoiceLine[];
  /** Link back to Agentik order if known */
  linkedOrderId:  string | null;
  /** The externalSyncKey from the original order */
  externalSyncKey: string | null;
}

export interface SagInvoiceLine {
  referenceCode:  string;
  productName:    string;
  size:           string;
  color:          string;
  quantity:       number;
  unitPrice:      number;
  lineTotal:      number;
}

// ── Invoice link result ──────────────────────────────────────────────────────

export interface InvoiceLinkResult {
  linked:     boolean;
  orderId:    string;
  invoiceId:  string;
  matchMethod: "external_sync_key" | "customer_and_date" | "manual";
  linkedAt:   string;
}
