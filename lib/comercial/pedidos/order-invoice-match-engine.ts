/**
 * lib/comercial/pedidos/order-invoice-match-engine.ts
 *
 * Compares an order against its linked invoices line by line.
 * Pure domain logic — no Prisma, no server-only.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

import type { OrderDraft, OrderLine } from "./order-types";
import type {
  OrderFulfillmentStatus,
  OrderInvoiceComparison,
  OrderFulfillmentLine,
  LineFulfillmentStatus,
  OrderToInvoiceMatch,
} from "./order-core-types";
import type { SagNormalizedInvoice, SagInvoiceLine } from "./sag-invoice-sync-types";

// ── Main: compare order to all linked invoices ───────────────────────────────

export function compareOrderToInvoices(
  order:    OrderDraft,
  invoices: SagNormalizedInvoice[],
): OrderToInvoiceMatch | null {
  if (invoices.length === 0) return null;

  // Merge all invoice lines into a single aggregated view
  const mergedLines: SagInvoiceLine[] = [];
  for (const inv of invoices) {
    mergedLines.push(...inv.lines);
  }

  const comparison = compareOrderLines(order, mergedLines);
  const status     = deriveFulfillmentStatus(comparison);
  const percent    = calculateFulfillmentPercent(order, mergedLines);

  return {
    orderId:            order.id,
    invoiceId:          invoices.map(i => i.invoiceId).join(","),
    invoiceNumber:      invoices.map(i => i.invoiceNumber).join(", "),
    matchedAt:          new Date().toISOString(),
    fulfillmentStatus:  status,
    fulfillmentPercent: percent,
    comparison,
  };
}

// ── Compare order lines vs aggregated invoice lines ──────────────────────────

export function compareOrderLines(
  order:        OrderDraft,
  invoiceLines: SagInvoiceLine[],
): OrderInvoiceComparison {
  const activeOrderLines = order.lines.filter(l => !l.removed);
  const lineDetails: OrderFulfillmentLine[] = [];

  // Build invoice lookup: key = ref|size|color
  const invoiceLookup = new Map<string, { qty: number; price: number; total: number }>();
  for (const il of invoiceLines) {
    const key = lineKey(il.referenceCode, il.size, il.color);
    const existing = invoiceLookup.get(key);
    if (existing) {
      existing.qty   += il.quantity;
      existing.total += il.lineTotal;
      // Use latest price
      existing.price = il.unitPrice;
    } else {
      invoiceLookup.set(key, { qty: il.quantity, price: il.unitPrice, total: il.lineTotal });
    }
  }

  const matchedKeys = new Set<string>();
  let linesMatched = 0;
  let linesMissing = 0;
  let linesWithDiff = 0;

  // Check each order line against invoice
  for (const ol of activeOrderLines) {
    const key = lineKey(ol.referenceCode, ol.size, ol.color);
    const inv = invoiceLookup.get(key);

    if (!inv) {
      lineDetails.push(buildFulfillmentLine(ol, null, "missing_in_invoice"));
      linesMissing++;
    } else {
      matchedKeys.add(key);
      const qtyDiff   = inv.qty - ol.quantity;
      const priceDiff = inv.price - ol.unitPrice;

      let status: LineFulfillmentStatus = "matched";
      if (qtyDiff !== 0)   { status = "quantity_difference"; linesWithDiff++; }
      else if (priceDiff !== 0) { status = "price_difference"; linesWithDiff++; }
      else { linesMatched++; }

      lineDetails.push({
        referenceCode:      ol.referenceCode,
        size:               ol.size,
        color:              ol.color,
        orderQuantity:      ol.quantity,
        orderUnitPrice:     ol.unitPrice,
        orderLineTotal:     ol.lineTotal,
        invoiceQuantity:    inv.qty,
        invoiceUnitPrice:   inv.price,
        invoiceLineTotal:   inv.total,
        quantityDifference: qtyDiff,
        priceDifference:    priceDiff,
        status,
      });
    }
  }

  // Check for extra lines in invoice not in order
  let linesExtra = 0;
  for (const il of invoiceLines) {
    const key = lineKey(il.referenceCode, il.size, il.color);
    if (!matchedKeys.has(key) && !activeOrderLines.some(
      ol => lineKey(ol.referenceCode, ol.size, ol.color) === key
    )) {
      // Deduplicate extras by key
      if (!lineDetails.some(d => lineKey(d.referenceCode, d.size, d.color) === key && d.status === "extra_in_invoice")) {
        lineDetails.push(buildFulfillmentLine(null, il, "extra_in_invoice"));
        linesExtra++;
      }
    }
  }

  const orderTotalUnits   = activeOrderLines.reduce((a, l) => a + l.quantity, 0);
  const invoiceTotalUnits = invoiceLines.reduce((a, l) => a + l.quantity, 0);
  const orderTotalValue   = activeOrderLines.reduce((a, l) => a + l.lineTotal, 0);
  const invoiceTotalValue = invoiceLines.reduce((a, l) => a + l.lineTotal, 0);

  return {
    orderTotalUnits,
    invoiceTotalUnits,
    orderTotalValue,
    invoiceTotalValue,
    unitsDifference:      invoiceTotalUnits - orderTotalUnits,
    valueDifference:      invoiceTotalValue - orderTotalValue,
    linesMatched,
    linesMissing,
    linesExtra,
    linesWithDifferences: linesWithDiff,
    lineDetails,
  };
}

// ── Calculate fulfillment percent ────────────────────────────────────────────

export function calculateFulfillmentPercent(
  order:        OrderDraft,
  invoiceLines: SagInvoiceLine[],
): number {
  const activeLines = order.lines.filter(l => !l.removed);
  if (activeLines.length === 0) return 0;

  const orderTotalUnits = activeLines.reduce((a, l) => a + l.quantity, 0);
  if (orderTotalUnits === 0) return 0;

  // Build invoice qty by key
  const invoiceQty = new Map<string, number>();
  for (const il of invoiceLines) {
    const key = lineKey(il.referenceCode, il.size, il.color);
    invoiceQty.set(key, (invoiceQty.get(key) ?? 0) + il.quantity);
  }

  // Sum fulfilled units (capped at ordered quantity per line)
  let fulfilledUnits = 0;
  for (const ol of activeLines) {
    const key = lineKey(ol.referenceCode, ol.size, ol.color);
    const invQty = invoiceQty.get(key) ?? 0;
    fulfilledUnits += Math.min(invQty, ol.quantity);
  }

  return Math.round((fulfilledUnits / orderTotalUnits) * 100);
}

// ── Detect specific differences ──────────────────────────────────────────────

export function detectQuantityDifferences(
  comparison: OrderInvoiceComparison,
): OrderFulfillmentLine[] {
  return comparison.lineDetails.filter(l => l.status === "quantity_difference");
}

export function detectPriceDifferences(
  comparison: OrderInvoiceComparison,
): OrderFulfillmentLine[] {
  return comparison.lineDetails.filter(l => l.status === "price_difference");
}

export function detectMissingLines(
  comparison: OrderInvoiceComparison,
): OrderFulfillmentLine[] {
  return comparison.lineDetails.filter(l => l.status === "missing_in_invoice");
}

export function detectExtraLines(
  comparison: OrderInvoiceComparison,
): OrderFulfillmentLine[] {
  return comparison.lineDetails.filter(l => l.status === "extra_in_invoice");
}

// ── Build fulfillment summary ────────────────────────────────────────────────

export function buildFulfillmentSummary(
  comparison: OrderInvoiceComparison,
): {
  fulfillmentStatus:  OrderFulfillmentStatus;
  fulfillmentPercent: number;
  description:        string;
} {
  const status  = deriveFulfillmentStatus(comparison);
  const percent = comparison.orderTotalUnits > 0
    ? Math.round((Math.min(comparison.invoiceTotalUnits, comparison.orderTotalUnits) / comparison.orderTotalUnits) * 100)
    : 0;

  const descriptions: Record<OrderFulfillmentStatus, string> = {
    sin_factura:                "Este pedido no tiene facturas vinculadas.",
    facturado_completo:         "Este pedido fue facturado al 100%.",
    facturado_parcial:          `Este pedido tiene ${percent}% de cumplimiento. Faltan ${comparison.orderTotalUnits - comparison.invoiceTotalUnits} unidades por facturar.`,
    facturado_con_diferencias:  `Este pedido tiene diferencias entre lo pedido y lo facturado.`,
    cancelado:                  "Este pedido fue cancelado.",
    pendiente_revision:         "Este pedido requiere revision manual.",
  };

  return {
    fulfillmentStatus:  status,
    fulfillmentPercent: percent,
    description:        descriptions[status],
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function lineKey(ref: string, size: string, color: string): string {
  return `${(ref ?? "").toUpperCase()}|${(size ?? "").toUpperCase()}|${(color ?? "").toUpperCase()}`;
}

function deriveFulfillmentStatus(
  comparison: OrderInvoiceComparison,
): OrderFulfillmentStatus {
  const { orderTotalUnits, invoiceTotalUnits, linesWithDifferences, linesMissing, linesExtra } = comparison;

  if (invoiceTotalUnits === 0 && orderTotalUnits > 0) return "sin_factura";
  if (linesWithDifferences > 0 || linesExtra > 0)     return "facturado_con_diferencias";
  if (linesMissing > 0 || invoiceTotalUnits < orderTotalUnits) return "facturado_parcial";
  if (invoiceTotalUnits >= orderTotalUnits && linesMissing === 0) return "facturado_completo";
  return "pendiente_revision";
}

function buildFulfillmentLine(
  orderLine:   OrderLine | null,
  invoiceLine: SagInvoiceLine | null,
  status:      LineFulfillmentStatus,
): OrderFulfillmentLine {
  return {
    referenceCode:      orderLine?.referenceCode ?? invoiceLine?.referenceCode ?? "",
    size:               orderLine?.size          ?? invoiceLine?.size ?? "",
    color:              orderLine?.color         ?? invoiceLine?.color ?? "",
    orderQuantity:      orderLine?.quantity      ?? 0,
    orderUnitPrice:     orderLine?.unitPrice     ?? 0,
    orderLineTotal:     orderLine?.lineTotal     ?? 0,
    invoiceQuantity:    invoiceLine?.quantity     ?? null,
    invoiceUnitPrice:   invoiceLine?.unitPrice   ?? null,
    invoiceLineTotal:   invoiceLine?.lineTotal   ?? null,
    quantityDifference: (invoiceLine?.quantity ?? 0) - (orderLine?.quantity ?? 0),
    priceDifference:    (invoiceLine?.unitPrice ?? 0) - (orderLine?.unitPrice ?? 0),
    status,
  };
}
