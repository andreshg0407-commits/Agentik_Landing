/**
 * lib/comercial/pedidos/order-share.ts
 *
 * Unified share payload builder for order communications.
 * Used by WhatsApp and Email flows. Tenant-aware via branding.
 *
 * Sprint: ORDER-SHARE-COMMERCIAL-01
 * Sprint: ORDER-CREATION-POLISH-01
 */

import type { OrderDraft, OrderLine } from "./order-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrderShareBranding {
  commercialName: string;
  legalName:      string;
  phone:          string;
  email:          string;
  website:        string;
  logoUrl:        string;
  documentFooter: string;
}

export interface OrderSharePayload {
  subject:        string;
  emailBody:      string;
  whatsappText:   string;
  summary: {
    recipientName:  string;
    sellerName:     string;
    total:          number;
    references:     number;
    variants:       number;
    units:          number;
    fecha:          string;
    orderNumber:    number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(v: number): string {
  return "$" + v.toLocaleString("es-CO");
}

function dateLabel(): string {
  return new Date().toLocaleDateString("es-CO", {
    year: "numeric", month: "long", day: "numeric",
  });
}

const MAX_WHATSAPP_LINES = 10;

// ── Commercial conditions block (shared by WA + email) ───────────────────────

function buildConditionsBlock(order: OrderDraft): string[] {
  const h = order.header;
  const lines: string[] = [];

  const hasDelivery      = h.deliveryMode === "scheduled";
  const hasDiscount      = (h.discountValue ?? 0) > 0;
  const hasCustomerNotes = !!(h.customerNotes);

  if (!hasDelivery && !hasDiscount && !hasCustomerNotes) return lines;

  lines.push("");
  lines.push("Condiciones comerciales:");

  // Delivery
  lines.push(`Entrega: ${hasDelivery ? "Programada" : "Inmediata"}`);
  if (hasDelivery && h.deliveryDate) {
    lines.push(`Fecha compromiso: ${h.deliveryDate}`);
  }

  // Discount
  if (hasDiscount) {
    const discountLabel = h.discountType === "percentage"
      ? `${h.discountValue}%`
      : money(h.discountValue ?? 0);
    lines.push(`Descuento: ${discountLabel}`);
  }

  // Customer notes (NOT internal notes)
  if (hasCustomerNotes) {
    lines.push("");
    lines.push(`Observaciones: ${h.customerNotes}`);
  }

  return lines;
}

// ── Main builder ─────────────────────────────────────────────────────────────

export function buildOrderSharePayload(
  order: OrderDraft,
  branding: OrderShareBranding,
): OrderSharePayload {
  const activeLines = order.lines.filter(l => !l.removed);
  const uniqueRefs = new Set(activeLines.map(l => l.referenceCode)).size;
  const fecha = dateLabel();

  const hasDiscount = (order.summary.discountAmount ?? 0) > 0;
  const displayTotal = hasDiscount
    ? (order.summary.totalFinal ?? order.summary.totalValue)
    : order.summary.totalValue;

  const summary = {
    recipientName: order.header.customerName || "Cliente",
    sellerName:    order.header.sellerName || "\u2014",
    total:         displayTotal,
    references:    uniqueRefs,
    variants:      activeLines.length,
    units:         order.summary.totalUnits,
    fecha,
    orderNumber:   order.consecutivo,
  };

  const conditionsBlock = buildConditionsBlock(order);

  // ── WhatsApp ────────────────────────────────────────────────────────────

  const lineDetails = activeLines.slice(0, MAX_WHATSAPP_LINES).map(
    (l) => `  \u2022 ${l.referenceCode} / ${l.color} / ${l.size} / ${l.quantity} uds`
  );
  if (activeLines.length > MAX_WHATSAPP_LINES) {
    lineDetails.push(`  ... y ${activeLines.length - MAX_WHATSAPP_LINES} lineas adicionales`);
  }

  const whatsappTotalBlock = hasDiscount
    ? [
        `Subtotal: ${money(order.summary.totalValue)}`,
        `Descuento: -${money(order.summary.discountAmount ?? 0)}`,
        `Valor total: ${money(displayTotal)}`,
      ]
    : [`Valor total: ${money(displayTotal)}`];

  const whatsappText = [
    `Hola ${summary.recipientName},`,
    ``,
    `Compartimos el detalle de su pedido.`,
    ``,
    `Pedido #${order.consecutivo}`,
    `Fecha: ${fecha}`,
    `Vendedor: ${summary.sellerName}`,
    ``,
    `Resumen:`,
    `\u2022 ${uniqueRefs} referencias`,
    `\u2022 ${activeLines.length} variantes`,
    `\u2022 ${order.summary.totalUnits} unidades`,
    ``,
    ...whatsappTotalBlock,
    ...conditionsBlock,
    ``,
    `Detalle:`,
    ...lineDetails,
    ``,
    branding.commercialName,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.website || "",
    ``,
    `Generado desde Agentik.`,
  ].filter(Boolean).join("\n");

  // ── Email ────────────────────────────────────────────────────────────────

  const subject = `Pedido #${order.consecutivo} - ${summary.recipientName} - ${branding.commercialName}`;

  const emailLinesTable = activeLines.map(
    (l) => `${l.referenceCode} | ${l.color} | ${l.size} | ${l.quantity} | ${money(l.lineTotal)}`
  );

  const emailTotalBlock = hasDiscount
    ? [
        `Subtotal: ${money(order.summary.totalValue)}`,
        `Descuento: -${money(order.summary.discountAmount ?? 0)}`,
        `Total: ${money(displayTotal)}`,
      ]
    : [`Total: ${money(displayTotal)}`];

  const emailBody = [
    branding.commercialName,
    branding.legalName !== branding.commercialName ? branding.legalName : "",
    ``,
    `Estimado/a ${summary.recipientName},`,
    ``,
    `Adjuntamos el detalle de su pedido.`,
    ``,
    `--- Resumen ---`,
    `Cliente: ${summary.recipientName}`,
    `Fecha: ${fecha}`,
    `Vendedor: ${summary.sellerName}`,
    `Unidades: ${order.summary.totalUnits}`,
    ...emailTotalBlock,
    ...conditionsBlock,
    ``,
    `--- Detalle ---`,
    `Ref | Color | Talla | Cant. | Valor`,
    ...emailLinesTable,
    ``,
    `---`,
    branding.documentFooter,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email ? `Email: ${branding.email}` : "",
    branding.website || "",
  ].filter(Boolean).join("\n");

  return { subject, emailBody, whatsappText, summary };
}
