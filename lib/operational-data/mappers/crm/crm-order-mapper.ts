/**
 * lib/operational-data/mappers/crm/crm-order-mapper.ts
 *
 * Maps CRM order/pedido records → OperationalOrder.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalOrder, OperationalOrderLine } from "../../operational-entities";

// ─── CRM raw shape ────────────────────────────────────────────────────────────

export interface CrmRawOrderLine {
  referencia:       string;
  descripcion:      string;
  cantidad:         number;
  cantidadEntregada?: number;
  cantidadCancelada?: number;
  precioUnitario?:  number;
  linea?:           string;
}

export interface CrmRawOrder {
  id:               string;
  referenciaPedido: string;
  clienteId?:       string;
  vendedorId?:      string;
  estado:           string;  // CRM-native status string
  lineas:           CrmRawOrderLine[];
  valorTotal?:      number;
  moneda?:          string;
  creadoEn:         string;
  confirmadoEn?:    string;
  enviadoEn?:       string;
  canceladoEn?:     string;
  referenciaERP?:   string;  // SAG PD reference when synced
  sincronizadoEn:   string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapCrmOrderToOperational(
  raw:            CrmRawOrder,
  organizationId: string,
): OperationalOrder {
  return {
    id:             `crm_order_${raw.id}`,
    organizationId,
    source:         "crm",
    sourceId:       raw.id,
    syncedAt:       raw.sincronizadoEn,
    confidence:     0.85,

    reference:      raw.referenciaPedido,
    customerId:     raw.clienteId,
    salesRepId:     raw.vendedorId,
    status:         normalizeCrmOrderStatus(raw.estado),
    lines:          raw.lineas.map(mapCrmOrderLine),
    totalValue:     raw.valorTotal,
    currency:       raw.moneda ?? "COP",
    createdAt:      raw.creadoEn,
    confirmedAt:    raw.confirmadoEn,
    shippedAt:      raw.enviadoEn,
    cancelledAt:    raw.canceladoEn,
    erpDocumentRef: raw.referenciaERP,

    metadata: {
      crmId:        raw.id,
      estadoCrm:    raw.estado,
    },
  };
}

export function mapCrmOrdersToOperational(
  rows:           CrmRawOrder[],
  organizationId: string,
): OperationalOrder[] {
  return rows.map(r => mapCrmOrderToOperational(r, organizationId));
}

// ─── Prisma-backed shape ──────────────────────────────────────────────────────
// Mirrors CRMQuote Prisma model fields needed for operational mapping.
// Does NOT import Prisma — provider converts Prisma Decimal → number before calling.
//
// ARCHITECTURE NOTE:
//   In Castillitos' operational model, an AOS_Quote IS the pre-ERP order.
//   A "Confirmed" quote = a confirmed order awaiting SAG PD issuance.

export interface PrismaCrmQuoteShape {
  id:             string;
  organizationId: string;
  crmId:          string | null;
  customerId:     string | null;
  opportunityId:  string | null;
  quoteNumber:    string | null;
  /** Prisma QuoteStatus enum as string: DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED */
  status:         string;
  amount:         number;           // provider converts Decimal.toNumber()
  currency:       string;
  issuedAt:       string;           // ISO string (provider converts Date)
  expiresAt:      string | null;
  respondedAt:    string | null;
  sellerSlug:     string | null;
  sellerName:     string | null;
  updatedAt:      string;           // ISO string
  /** rawCrmJson may contain AOS_Products_Quotes lines if embedded by V8 */
  rawCrmJson:     Record<string, unknown> | null;
}

/**
 * Maps a Prisma CRMQuote → OperationalOrder.
 *
 * Pass `lines` (PrismaCrmQuoteLineShape[]) to populate OperationalOrder.lines
 * with real product references, quantities, sizes, colors and warehouse data.
 * When `lines` is omitted or empty, falls back to [].
 *
 * @param quote  — CRMQuote Prisma row (amounts pre-converted to number)
 * @param lines  — Optional CRMQuoteLine rows for this quote
 */
export function mapPrismaCrmQuoteToOperationalOrder(
  quote:          PrismaCrmQuoteShape,
  organizationId: string,
  lines?:         PrismaCrmQuoteLineShape[],
): OperationalOrder {
  return {
    id:             `crm_quote_${quote.id}`,
    organizationId,
    source:         "crm",
    sourceId:       quote.crmId ?? quote.id,
    syncedAt:       quote.updatedAt,
    confidence:     lines && lines.length > 0 ? 0.90 : 0.75,

    reference:      quote.quoteNumber ?? `Q-${quote.crmId ?? quote.id}`,
    customerId:     quote.customerId ?? undefined,
    salesRepId:     quote.sellerSlug ?? undefined,
    status:         normalizePrismaQuoteStatus(quote.status),
    lines:          lines && lines.length > 0
                      ? lines.map(mapPrismaCrmQuoteLineToOperationalLine)
                      : [],
    totalValue:     quote.amount,
    currency:       quote.currency,
    createdAt:      quote.issuedAt,
    confirmedAt:    quote.status === "ACCEPTED" ? (quote.respondedAt ?? undefined) : undefined,
    cancelledAt:    (quote.status === "REJECTED" || quote.status === "EXPIRED")
                      ? (quote.respondedAt ?? undefined) : undefined,
    erpDocumentRef: undefined,   // set when SAG PD is issued

    metadata: {
      crmId:        quote.crmId,
      quoteStatus:  quote.status,
      opportunityId: quote.opportunityId,
      sellerSlug:   quote.sellerSlug,
      lineCount:    lines?.length ?? 0,
    },
  };
}

export function mapPrismaCrmQuotesToOperationalOrders(
  quotes:         PrismaCrmQuoteShape[],
  organizationId: string,
  linesByQuoteId?: Map<string, PrismaCrmQuoteLineShape[]>,
): OperationalOrder[] {
  return quotes.map(q =>
    mapPrismaCrmQuoteToOperationalOrder(q, organizationId, linesByQuoteId?.get(q.id))
  );
}

// ─── Prisma-backed quote LINE shape ──────────────────────────────────────────
// Mirrors CRMQuoteLine Prisma model. Provider converts Decimal → number before calling.

export interface PrismaCrmQuoteLineShape {
  id:             string;
  organizationId: string;
  crmId:          string | null;
  quoteId:        string | null;
  quoteCrmId:     string | null;
  productCrmId:   string | null;
  reference:      string;
  productName:    string | null;
  qty:            number;           // provider converts Decimal.toNumber()
  unitPrice:      number;
  listPrice:      number;
  totalPrice:     number;
  discount:       number;
  discountAmount: number;
  vatRate:        number;
  vatAmount:      number;
  size:           string | null;    // talla_c
  color:          string | null;    // color_c
  warehouseName:  string | null;    // bodega_c
  warehouseId:    string | null;    // adm_bodega_id_c
  status:         string | null;    // estado_pedido_c
  syncedAt:       string;
}

/**
 * Maps a Prisma CRMQuoteLine → OperationalOrderLine.
 *
 * CRM-specific fields (talla, color, bodega, IVA, estado) are preserved
 * in `metadata` for downstream consumers that need them (e.g. warehouse routing,
 * production sizing). Engine logic must NOT read from metadata.
 */
export function mapPrismaCrmQuoteLineToOperationalLine(
  line: PrismaCrmQuoteLineShape,
): OperationalOrderLine {
  return {
    reference:    line.reference.toUpperCase(),
    description:  line.productName ?? line.reference,
    qtyOrdered:   line.qty,
    qtyDelivered: 0,      // AOS_Products_Quotes tracks desired qty, not delivery
    qtyCancelled: 0,
    unitPrice:    line.unitPrice > 0 ? line.unitPrice : undefined,
    metadata: {
      crmLineId:   line.crmId,
      productCrmId: line.productCrmId,
      talla:       line.size,
      color:       line.color,
      bodega:      line.warehouseName,
      warehouseId: line.warehouseId,
      vat:         line.vatRate,
      estadoPedido: line.status,
      totalPrice:  line.totalPrice,
      discount:    line.discount,
      vatAmount:   line.vatAmount,
    },
  };
}

export function mapPrismaCrmQuoteLinesToOperationalLines(
  lines: PrismaCrmQuoteLineShape[],
): OperationalOrderLine[] {
  return lines.map(mapPrismaCrmQuoteLineToOperationalLine);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps Prisma QuoteStatus enum values → OperationalOrder status.
 *
 *   DRAFT    → draft     (work in progress)
 *   SENT     → reserved  (presented to customer — units should be soft-held)
 *   ACCEPTED → confirmed (customer accepted — ready for SAG PD)
 *   REJECTED → cancelled
 *   EXPIRED  → cancelled
 */
function normalizePrismaQuoteStatus(status: string): OperationalOrder["status"] {
  switch (status.toUpperCase()) {
    case "DRAFT":    return "draft";
    case "SENT":     return "reserved";
    case "ACCEPTED": return "confirmed";
    case "REJECTED": return "cancelled";
    case "EXPIRED":  return "cancelled";
    default:         return "draft";
  }
}

function normalizeCrmOrderStatus(crm: string): OperationalOrder["status"] {
  const s = crm.toLowerCase().replace(/\s+/g, "_");
  if (s.includes("borrador") || s.includes("draft"))               return "draft";
  if (s.includes("reservado") || s.includes("reserved"))           return "reserved";
  if (s.includes("confirmado") || s.includes("confirmed"))         return "confirmed";
  if (s.includes("enviado_sag") || s.includes("sent_erp"))         return "sent_to_erp";
  if (s.includes("procesando") || s.includes("processing"))        return "processing";
  if (s.includes("entregado") || s.includes("fulfilled"))          return "fulfilled";
  if (s.includes("cancelado") || s.includes("cancelled"))          return "cancelled";
  if (s.includes("devuelto")  || s.includes("returned"))           return "returned";
  return "draft";
}

function mapCrmOrderLine(raw: CrmRawOrderLine): OperationalOrderLine {
  return {
    reference:    raw.referencia.toUpperCase(),
    description:  raw.descripcion,
    qtyOrdered:   raw.cantidad,
    qtyDelivered: raw.cantidadEntregada ?? 0,
    qtyCancelled: raw.cantidadCancelada ?? 0,
    unitPrice:    raw.precioUnitario,
    line:         raw.linea,
  };
}
