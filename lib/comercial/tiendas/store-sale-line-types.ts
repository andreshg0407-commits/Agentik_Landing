/**
 * lib/comercial/tiendas/store-sale-line-types.ts
 *
 * AGENTIK-STORES-PRODUCT-SALES-SYNC-01 — Client-safe types for store product sales.
 *
 * NO "server-only" import. Types and pure functions only.
 * Source: StoreSaleLineRecord (Prisma) → aggregated into StoreProductSalesAggregate.
 *
 * Semantics (certified in Phase 1 dry-run):
 *   lineTotal   = LINE TOTAL (not per-unit). Positive for facturas, negative for notas credito.
 *   quantity    = Always positive (even for NC). Do NOT multiply by revenueSign.
 *   discountPercent = 0-100 percentage. lineTotal already has discount applied.
 *   ivaRate     = 0 or 19 (percentage).
 */

// ── Per-line fact (1:1 with StoreSaleLineRecord) ─────────────────────────────

export interface StoreProductSaleFact {
  erpItemId:       number;
  erpMovId:        number;
  referenceCode:   string;
  articleName:     string;
  quantity:        number;    // n_cantidad (always positive)
  lineTotal:       number;    // n_valor (positive for FC, negative for NC)
  discountPercent: number;    // n_descuento (0-100)
  ivaRate:         number;    // n_iva (0 or 19)
  size:            string | null;
  color:           string | null;
  documentDate:    string;    // ISO date
  comprobanteCode: string;    // FG, NG, FC, NT, etc.
  comprobante:     string | null;
  storeId:         string;
  storeName:       string;
  documentFamily:  "FACTURA" | "NOTA_CREDITO";
}

// ── Per-reference aggregate ──────────────────────────────────────────────────

export interface StoreProductSalesAggregate {
  referenceCode:     string;
  articleName:       string;

  // Factura (revenue) totals
  invoiceUnits:      number;   // SUM(quantity) where documentFamily=FACTURA
  invoiceTotal:      number;   // SUM(lineTotal) where documentFamily=FACTURA

  // Nota credito (return) totals
  creditNoteUnits:   number;   // SUM(quantity) where documentFamily=NOTA_CREDITO
  creditNoteTotal:   number;   // SUM(abs(lineTotal)) where documentFamily=NOTA_CREDITO

  // Net (factura - nota credito)
  netUnits:          number;   // invoiceUnits - creditNoteUnits
  netTotal:          number;   // invoiceTotal + creditNoteTotal (NC total is already negative)

  // Variant count
  sizeCount:         number;   // COUNT(DISTINCT size)
  colorCount:        number;   // COUNT(DISTINCT color)

  // Date range
  firstSaleDate:     string | null;
  lastSaleDate:      string | null;

  // Line count
  lineCount:         number;   // total lines (facturas + notas)
}

// ── Store-level summary ──────────────────────────────────────────────────────

export interface StoreProductSalesSummary {
  storeId:            string;
  storeName:          string;
  dateFrom:           string;
  dateTo:             string;
  totalReferences:    number;
  totalLines:         number;
  totalInvoiceAmount: number;
  totalCreditAmount:  number;
  totalNetAmount:     number;
  aggregates:         StoreProductSalesAggregate[];
}
