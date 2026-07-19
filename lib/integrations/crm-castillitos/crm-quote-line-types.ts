/**
 * lib/integrations/crm-castillitos/crm-quote-line-types.ts
 *
 * Raw type definitions for CRM AOS_Products_Quotes (quote line items).
 *
 * ─── CRM ENDPOINT ─────────────────────────────────────────────────────────────
 *   GET {baseUrl}/Api/V8/module/AOS_Products_Quotes
 *     ?filter[operator]=and
 *     &filter[parent_id][eq]={quoteId}
 *     &page[size]=500
 *     &page[number]=1
 *
 * ─── FIELD REFERENCE ──────────────────────────────────────────────────────────
 * Confirmed from JR Consultores SuiteCRM V8 (AOS_Products_Quotes module):
 *
 *   parent_id           — UUID of the parent AOS_Quotes record
 *   parent_name         — display name of the parent quote
 *   product_id          — UUID of the linked product/catalog entry
 *   name                — SKU / reference shown on the quote line
 *   product_qty         — quantity ordered (string decimal from CRM)
 *   product_list_price  — list price before discount
 *   product_unit_price  — effective unit price (after discount)
 *   product_total_price — line total = product_unit_price × product_qty
 *   product_discount    — discount percentage
 *   product_discount_amount — discount absolute amount
 *   vat                 — VAT/IVA rate (%)
 *   vat_amt             — VAT absolute amount on this line
 *   talla_c             — custom: talla (size)
 *   color_c             — custom: color
 *   bodega_c            — custom: bodega name (warehouse)
 *   adm_bodega_id_c     — custom: bodega UUID (warehouse ID)
 *   estado_pedido_c     — custom: line status
 *   date_entered        — creation timestamp (V8 format: "YYYY-MM-DD HH:MM:SS")
 *   date_modified       — last modification timestamp
 *
 * ─── NOTE ──────────────────────────────────────────────────────────────────────
 * CRM sends numeric fields as strings. All numeric fields in
 * CrmQuoteLineAttributes are typed as `string | number` — callers must
 * use toDecimal() / parseFloat() when writing to Prisma.
 *
 * Sprint: AGENTIK-CRM-QUOTE-LINES-INGESTION-01
 */

// ── Raw attribute bag from V8 JSON:API ────────────────────────────────────────

export interface CrmQuoteLineAttributes {
  // Parent quote link
  parent_id?:              string;
  parent_name?:            string;

  // Product identity
  product_id?:             string;
  name?:                   string;     // SKU / reference

  // Quantities and pricing (CRM sends as strings)
  product_qty?:            string | number;
  product_list_price?:     string | number;
  product_unit_price?:     string | number;
  product_total_price?:    string | number;
  product_discount?:       string | number;   // percentage
  product_discount_amount?: string | number;  // absolute amount

  // Tax
  vat?:                    string | number;   // rate %
  vat_amt?:                string | number;   // absolute amount

  // Castillitos custom fields
  talla_c?:                string;
  color_c?:                string;
  bodega_c?:               string;
  adm_bodega_id_c?:        string;
  estado_pedido_c?:        string;

  // Timestamps (V8 format: "YYYY-MM-DD HH:MM:SS")
  date_entered?:           string;
  date_modified?:          string;

  // Safety valve for undocumented V8 fields
  [key: string]: unknown;
}

// ── V8 JSON:API record shape ───────────────────────────────────────────────────

export interface CrmQuoteLineRaw {
  /** V8 record UUID — used as crmId in CRMQuoteLine Prisma model */
  id:          string;
  /** Always "AOS_Products_Quotes" */
  type:        string;
  attributes:  CrmQuoteLineAttributes;
}

// ── API page response ─────────────────────────────────────────────────────────

export interface CrmQuoteLinePageResponse {
  data:           CrmQuoteLineRaw[];
  totalPages:     number;
  recordsOnPage:  number;
}

// ── Numeric coercion helper ───────────────────────────────────────────────────

/**
 * Safely converts a CRM numeric string to number.
 * CRM frequently returns "10.00", "0", "" — this handles all cases.
 */
export function crmNumToFloat(value: string | number | null | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : fallback;
}
