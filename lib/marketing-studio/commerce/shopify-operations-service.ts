/**
 * lib/marketing-studio/commerce/shopify-operations-service.ts
 *
 * SHOPIFY-OPERATIONS-01 — Operations Domain Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Central service for the Operations module. Maps Shopify REST data to the
 * platform-agnostic canonical domain types in shopify-operations-types.ts.
 *
 * ── Copilot Action Registry ────────────────────────────────────────────────────
 *
 *   operations.listOperations()          — full operational snapshot by stage
 *   operations.findOperation()           — find order by number or ID
 *   operations.getOperationTimeline()    — chronological order reconstruction
 *   operations.listDelayedShipments()    — shipments stalled N+ days
 *   operations.listFailedPayments()      — voided / failed payment orders
 *   operations.listReturns()             — return requests from refund data
 *   operations.listRefunds()             — all refunds across orders
 *   operations.listOperationalAlerts()   — full alert summary for Copilot
 *   operations.generateOperationalSummary() — narrative summary string
 *   operations.buildTimeline()           — reconstruct from raw order data
 *
 * ── Natural language scenarios (Copilot) ──────────────────────────────────────
 *
 *   "Muéstrame los pedidos con riesgo de devolución."
 *     → listOperationalAlerts → filter type="order_at_risk"
 *
 *   "¿Qué envíos llevan más de 7 días sin actualizarse?"
 *     → listDelayedShipments(orgId, token, domain, { minDays: 7 })
 *
 *   "Resume los pagos fallidos de hoy."
 *     → listFailedPayments → filter createdAt >= today
 *
 *   "Genera una lista de operaciones que requieren seguimiento."
 *     → listOperations → filter requiresAttention=true
 *
 *   "¿Qué transportadora está presentando más retrasos esta semana?"
 *     → listDelayedShipments → group by carrier → sort by count desc
 *
 * ── Platform mapping ───────────────────────────────────────────────────────────
 *
 * This service maps Shopify REST types to canonical domain types.
 * No Shopify field names or API concepts exposed in the return values.
 *
 * ── Safety guarantees ─────────────────────────────────────────────────────────
 *
 *   - All functions are organizationId-scoped.
 *   - Access token injected at call time — never stored.
 *   - No writes to Shopify in this service (read-only in this sprint).
 *   - Errors are caught per-order and returned as alerts, never thrown to UI.
 *
 * ── Future automation hooks ───────────────────────────────────────────────────
 *
 *   TODO(SHOPIFY-OPERATIONS-02): Write operations — cancel, refund, update
 *   TODO(SHOPIFY-OPERATIONS-03): Live tracking via carrier webhooks
 *   TODO(SHOPIFY-OPERATIONS-04): Return management (GraphQL Returns API)
 *   TODO(SHOPIFY-OPERATIONS-05): Customer risk scoring (return frequency)
 *   TODO(SHOPIFY-OPERATIONS-06): Carrier performance ranking
 *   TODO(SHOPIFY-OPERATIONS-07): Automated escalation — contact customer
 *   TODO(SHOPIFY-OPERATIONS-08): Copilot signal integration
 *   TODO(SHOPIFY-OPERATIONS-09): Cross-platform unification (WooCommerce, ML)
 */

import { createShopifyClient } from "@/lib/integrations/shopify/shopify-client";
import type {
  ShopifyOrder,
  ShopifyFulfillment,
  ShopifyRefund,
} from "@/lib/integrations/shopify/shopify-types";
import type {
  OperationSource,
  OperationRiskLevel,
  OperationOrderStatus,
  OperationPaymentStatus,
  OperationShipmentStatus,
  OperationTrackingHealth,
  OperationReturnStatus,
  OperationRefundStatus,
  OperationOrderSummary,
  OperationPaymentSummary,
  OperationShipmentSummary,
  OperationReturnSummary,
  OperationRefundSummary,
  OperationIncidentSummary,
  OperationRecommendedAction,
  OperationTimelineEvent,
  OperationTimelineEventType,
  OperationTimeline,
  OperationAlert,
  OperationAlertSummary,
  OperationListResult,
  OperationQueryFilter,
} from "./shopify-operations-types";

const SOURCE: OperationSource = "shopify";

// ── Status mapping ────────────────────────────────────────────────────────────

function mapPaymentStatus(s: ShopifyOrder["financial_status"]): OperationPaymentStatus {
  switch (s) {
    case "authorized":         return "authorized";
    case "partially_paid":     return "partially_paid";
    case "paid":               return "paid";
    case "partially_refunded": return "partially_refunded";
    case "refunded":           return "refunded";
    case "voided":             return "voided";
    default:                   return "pending";
  }
}

function mapOrderStatus(order: ShopifyOrder): OperationOrderStatus {
  if (order.cancelled_at)                               return "cancelled";
  if (order.financial_status === "refunded")            return "refunded";
  if (order.financial_status === "partially_refunded")  return "partially_refunded";
  if (order.financial_status === "voided")              return "failed";
  if (order.fulfillment_status === "fulfilled")         return "delivered";
  if (order.fulfillment_status === "partial")           return "preparing";
  const hasFulfillment = order.fulfillments?.length > 0;
  if (hasFulfillment) {
    const latest = order.fulfillments[order.fulfillments.length - 1];
    if (latest.shipment_status === "in_transit" || latest.shipment_status === "out_for_delivery")
      return "in_transit";
    if (latest.shipment_status === "confirmed")  return "dispatched";
    if (latest.status === "success")             return "dispatched";
    return "preparing";
  }
  if (order.financial_status === "paid" || order.financial_status === "authorized")
    return "paid";
  return "pending_payment";
}

function mapShipmentStatus(f: ShopifyFulfillment): OperationShipmentStatus {
  switch (f.shipment_status) {
    case "delivered":          return "delivered";
    case "out_for_delivery":   return "out_for_delivery";
    case "in_transit":         return "in_transit";
    case "confirmed":          return "dispatched";
    case "attempted_delivery": return "failed_delivery";
    case "failure":            return "returned_to_sender";
    default:
      if (f.status === "success")    return "dispatched";
      if (f.status === "cancelled")  return "returned_to_sender";
      if (f.status === "failure")    return "failed_delivery";
      return "preparing";
  }
}

function mapReturnStatus(refund: ShopifyRefund): OperationReturnStatus {
  if (refund.processed_at) return "completed";
  return "requested";
}

function mapRefundStatus(refund: ShopifyRefund): OperationRefundStatus {
  const tx = refund.transactions?.[0];
  if (!tx) return "pending";
  if (tx.status === "success") return "completed";
  if (tx.status === "failure" || tx.status === "error") return "failed";
  return "pending";
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function customerName(order: ShopifyOrder): string | null {
  if (!order.customer) return null;
  const parts = [order.customer.first_name, order.customer.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(iso: string): number {
  return daysBetween(iso, new Date().toISOString());
}

// ── Risk level computation ────────────────────────────────────────────────────

/**
 * Derives the operational risk level for an order from its current state
 * and elapsed time. Pure function — no side effects.
 */
function computeOrderRiskLevel(order: ShopifyOrder): OperationRiskLevel {
  if (order.financial_status === "voided")                           return "critical";
  const hasFailure = order.fulfillments?.some(
    f => f.status === "failure" || f.status === "error",
  );
  if (hasFailure)                                                    return "high";
  const hasFailedDelivery = order.fulfillments?.some(
    f => f.shipment_status === "attempted_delivery",
  );
  if (hasFailedDelivery)                                             return "high";
  if (
    (order.financial_status === "paid" || order.financial_status === "authorized") &&
    !order.fulfillment_status &&
    daysSince(order.created_at) > 2
  )                                                                  return "medium";
  if (order.refunds?.some(r => (r.refund_line_items?.length ?? 0) > 0))
                                                                     return "medium";
  return "low";
}

/**
 * Derives the tracking health signal for a fulfillment.
 * Pure function — no side effects.
 */
function computeTrackingHealth(
  f:    ShopifyFulfillment,
  stale: number | null,
): OperationTrackingHealth | null {
  if (f.shipment_status === "attempted_delivery") return "failed_delivery";
  if (f.shipment_status === "failure")            return "returned";
  if (f.status === "cancelled")                   return "returned";
  if ((stale ?? 0) >= 5)                          return "stalled";
  if ((stale ?? 0) >= 2)                          return "delayed";
  if (
    f.shipment_status === "in_transit" ||
    f.shipment_status === "out_for_delivery" ||
    f.shipment_status === "confirmed" ||
    f.status === "success"
  )                                               return "normal";
  return null;
}

/**
 * Derives the risk level for a shipment from its tracking health and stale days.
 */
function computeShipmentRiskLevel(
  health: OperationTrackingHealth | null,
  stale:  number | null,
): OperationRiskLevel {
  if ((stale ?? 0) >= 10)                          return "critical";
  if (health === "failed_delivery")                return "high";
  if (health === "stalled" || health === "returned") return "high";
  if (health === "delayed" || (stale ?? 0) >= 2)  return "medium";
  return "low";
}

function requiresAttention(order: ShopifyOrder): { flag: boolean; reason: string | null } {
  if (order.financial_status === "voided")
    return { flag: true, reason: "Pago revertido — requiere revisión." };

  const hasFulfillmentFailure = order.fulfillments?.some(f =>
    f.status === "failure" || f.status === "error" || f.shipment_status === "failure",
  );
  if (hasFulfillmentFailure)
    return { flag: true, reason: "Error de despacho detectado." };

  const hasFailedDelivery = order.fulfillments?.some(
    f => f.shipment_status === "attempted_delivery",
  );
  if (hasFailedDelivery)
    return { flag: true, reason: "Intento de entrega fallido — cliente no disponible." };

  // Paid but not dispatched in more than 2 days
  if (
    (order.financial_status === "paid" || order.financial_status === "authorized") &&
    !order.fulfillment_status &&
    daysSince(order.created_at) > 2
  ) {
    return { flag: true, reason: `Pedido pagado sin despacho desde hace ${daysSince(order.created_at)} días.` };
  }

  return { flag: false, reason: null };
}

// ── Order → OperationOrderSummary ─────────────────────────────────────────────

function mapOrderToSummary(order: ShopifyOrder): OperationOrderSummary {
  const status        = mapOrderStatus(order);
  const paymentStatus = mapPaymentStatus(order.financial_status);
  const latestFul     = order.fulfillments?.[order.fulfillments.length - 1];
  const shipmentStatus: OperationShipmentStatus | null = latestFul
    ? mapShipmentStatus(latestFul)
    : null;
  const { flag, reason } = requiresAttention(order);
  const dest = order.shipping_address ?? latestFul?.destination ?? null;

  return {
    id:                 `shopify:order:${order.id}`,
    source:             SOURCE,
    orderNumber:        order.name,
    customerName:       customerName(order),
    customerEmail:      order.customer?.email ?? order.email,
    status,
    paymentStatus,
    shipmentStatus,
    lineItemCount:      order.line_items?.length ?? 0,
    totalAmount:        parseFloat(order.total_price),
    currency:           order.currency,
    createdAt:          order.created_at,
    updatedAt:          order.updated_at,
    tags:               order.tags ? order.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    riskLevel:          computeOrderRiskLevel(order),
    requiresAttention:  flag,
    attentionReason:    reason,
    destinationCity:    dest?.city ?? null,
    destinationCountry: dest?.country ?? null,
  };
}

// ── Fulfillment → OperationShipmentSummary ────────────────────────────────────

function mapFulfillmentToShipment(
  order: ShopifyOrder,
  f:     ShopifyFulfillment,
): OperationShipmentSummary {
  const status     = mapShipmentStatus(f);
  const lastUpdate = f.updated_at;
  const staleDays  = status !== "delivered" ? daysSince(lastUpdate) : null;

  const shipmentEventLabel: Record<string, string> = {
    label_printed:      "Etiqueta impresa",
    label_purchased:    "Etiqueta generada",
    confirmed:          "Confirmado por transportadora",
    in_transit:         "En tránsito",
    out_for_delivery:   "En reparto",
    delivered:          "Entregado",
    attempted_delivery: "Intento de entrega fallido",
    failure:            "Error de envío",
    ready_for_pickup:   "Listo para recoger",
  };

  const trackingHealth = computeTrackingHealth(f, staleDays);

  return {
    id:                  `shopify:fulfillment:${f.id}`,
    orderId:             `shopify:order:${order.id}`,
    orderNumber:         order.name,
    status,
    carrier:             f.tracking_company,
    trackingNumber:      f.tracking_number,
    trackingUrl:         f.tracking_url,
    estimatedDeliveryAt: null,    // TODO(SHOPIFY-OPERATIONS-03): from carrier API
    deliveredAt:         f.shipment_status === "delivered" ? f.updated_at : null,
    dispatchedAt:        f.status === "success" ? f.created_at : null,
    lastEvent:           f.shipment_status ? (shipmentEventLabel[f.shipment_status] ?? f.shipment_status) : null,
    lastEventAt:         f.updated_at,
    daysSinceLastUpdate: staleDays,
    delayEstimateDays:   null,    // TODO(SHOPIFY-OPERATIONS-03): from carrier ETA
    trackingHealth,
    riskLevel:           computeShipmentRiskLevel(trackingHealth, staleDays),
    destinationCity:     f.destination?.city ?? order.shipping_address?.city ?? null,
    destinationCountry:  f.destination?.country ?? order.shipping_address?.country ?? null,
  };
}

// ── Refund → OperationReturnSummary ──────────────────────────────────────────

function mapRefundToReturn(order: ShopifyOrder, r: ShopifyRefund): OperationReturnSummary {
  const refundTotal = r.transactions
    ?.filter(t => t.status === "success")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0) ?? 0;

  return {
    id:            `shopify:return:${r.id}`,
    orderId:       `shopify:order:${order.id}`,
    orderNumber:   order.name,
    customerName:  customerName(order),
    status:        mapReturnStatus(r),
    reason:        r.note,
    lineItemCount: r.refund_line_items?.length ?? 0,
    refundAmount:  refundTotal > 0 ? refundTotal : null,
    currency:      order.currency,
    requestedAt:   r.created_at,
    resolvedAt:    r.processed_at,
  };
}

// ── Refund → OperationRefundSummary ──────────────────────────────────────────

function mapRefundToSummary(order: ShopifyOrder, r: ShopifyRefund): OperationRefundSummary {
  const amount = r.transactions
    ?.filter(t => t.status === "success")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0) ?? 0;

  return {
    id:          `shopify:refund:${r.id}`,
    orderId:     `shopify:order:${order.id}`,
    orderNumber: order.name,
    status:      mapRefundStatus(r),
    amount,
    currency:    order.currency,
    reason:      r.note,
    processedAt: r.processed_at,
  };
}

// ── buildOperationTimeline ────────────────────────────────────────────────────

/**
 * Reconstructs the full chronological timeline of an order from its data.
 * Works without any additional API calls — uses inline fulfillment/refund data.
 *
 * Copilot: "operations.buildTimeline(order)"
 */
export function buildOperationTimeline(order: ShopifyOrder): OperationTimeline {
  const events: OperationTimelineEvent[] = [];
  let eventIdx = 0;

  const push = (
    type:        OperationTimelineEventType,
    description: string,
    occurredAt:  string,
    actor:       OperationTimelineEvent["actor"] = "system",
    metadata?:   Record<string, string>,
  ) => {
    events.push({ id: `evt-${++eventIdx}`, orderId: `shopify:order:${order.id}`, type, description, occurredAt, actor, metadata });
  };

  // 1. Order created
  push("order_created", `Pedido ${order.name} creado.`, order.created_at, "customer");

  // 2. Payment state
  if (order.financial_status === "paid" || order.financial_status === "partially_paid") {
    push("payment_received", "Pago confirmado.", order.updated_at, "system");
  } else if (order.financial_status === "authorized") {
    push("payment_received", "Pago autorizado (pendiente de captura).", order.updated_at, "system");
  } else if (order.financial_status === "voided") {
    push("payment_voided", "Pago revertido o cancelado.", order.updated_at, "system");
  }

  // 3. Fulfillments — sorted chronologically
  const sortedFulfillments = [...(order.fulfillments ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const f of sortedFulfillments) {
    push("preparing_started", "Preparación del envío iniciada.", f.created_at, "merchant");

    if (f.status === "success" || f.shipment_status === "confirmed") {
      const carrier = f.tracking_company ?? "transportadora";
      const tracking = f.tracking_number ? ` · Guía: ${f.tracking_number}` : "";
      push("dispatched", `Despachado con ${carrier}.${tracking}`, f.updated_at, "merchant",
        f.tracking_number ? { trackingNumber: f.tracking_number } : undefined);
    }
    if (f.shipment_status === "in_transit") {
      push("in_transit", "En tránsito — movimiento confirmado por transportadora.", f.updated_at, "carrier");
    }
    if (f.shipment_status === "out_for_delivery") {
      push("out_for_delivery", "En reparto — con agente de última milla.", f.updated_at, "carrier");
    }
    if (f.shipment_status === "attempted_delivery") {
      push("delivery_attempted", "Intento de entrega fallido — cliente no disponible.", f.updated_at, "carrier");
    }
    if (f.shipment_status === "delivered") {
      push("delivered", "Pedido entregado al cliente.", f.updated_at, "carrier");
    }
  }

  // 4. Refunds
  const sortedRefunds = [...(order.refunds ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  for (const r of sortedRefunds) {
    if (r.refund_line_items?.length > 0) {
      push("return_requested", `Devolución solicitada (${r.refund_line_items.length} artículo(s)).`, r.created_at, "customer");
    }
    if (r.processed_at) {
      push("refund_issued", "Reembolso emitido al cliente.", r.processed_at, "merchant");
    }
  }

  // 5. Cancellation
  if (order.cancelled_at) {
    const reason = order.cancel_reason ? ` — Motivo: ${order.cancel_reason}` : "";
    push("cancelled", `Pedido cancelado.${reason}`, order.cancelled_at, "merchant");
  }

  // Sort chronologically, then deduplicate (same type + same minute = duplicate)
  events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const seen = new Set<string>();
  const deduped = events.filter(e => {
    const key = `${e.type}::${e.occurredAt.slice(0, 16)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  events.length = 0;
  deduped.forEach(e => events.push(e));

  const last = events[events.length - 1];
  const lastUpdate = order.updated_at;
  const stalledDays = daysSince(lastUpdate);
  const isStalled = stalledDays >= 3 && last?.type !== "delivered" && last?.type !== "cancelled";

  return {
    orderId:     `shopify:order:${order.id}`,
    orderNumber: order.name,
    events,
    currentState: last?.type ?? null,
    isStalled,
    stalledDays: isStalled ? stalledDays : null,
  };
}

// ── Alert detection ───────────────────────────────────────────────────────────

/**
 * Generates operational alerts from a set of mapped order summaries.
 * No Shopify API calls — pure computation over canonical data.
 *
 * Copilot: "operations.listOperationalAlerts()"
 */
function buildAlertSummary(
  orders:    OperationOrderSummary[],
  shipments: OperationShipmentSummary[],
  returns:   OperationReturnSummary[],
): OperationAlertSummary {
  const alerts: OperationAlert[] = [];
  let alertIdx = 0;
  const id = () => `alert-${++alertIdx}`;

  const mkAction = (
    action:             OperationRecommendedAction["action"],
    label:              string,
    prompt:             string,
    confidenceScore:    number,
    requiresApproval:   boolean,
    automationEligible: boolean,
  ): OperationRecommendedAction => ({ action, label, prompt, confidenceScore, requiresApproval, automationEligible });

  // Payment failures
  const failedPayments = orders.filter(o => o.paymentStatus === "voided" || o.paymentStatus === "failed");
  for (const o of failedPayments) {
    const prompt = `Revisar pago del pedido ${o.orderNumber} y contactar al cliente${o.customerName ? ` (${o.customerName})` : ""}.`;
    alerts.push({
      id:               id(),
      type:             "payment_failed",
      orderId:          o.id,
      orderNumber:      o.orderNumber,
      description:      `Pago fallido o revertido en pedido ${o.orderNumber}${o.customerName ? ` (${o.customerName})` : ""}.`,
      severity:         "critical",
      riskLevel:        "critical",
      detectedAt:       new Date().toISOString(),
      recommendedAction: mkAction("confirm_payment", "Confirmar pago", prompt, 0.95, true, false),
      copilotAction:    prompt,
    });
  }

  // Stalled shipments (no carrier update in 5+ days, not delivered)
  const stalledShipments = shipments.filter(
    s => (s.daysSinceLastUpdate ?? 0) >= 5 && s.status !== "delivered" && s.status !== "pending",
  );
  for (const s of stalledShipments) {
    const isCritical = (s.daysSinceLastUpdate ?? 0) >= 10;
    const prompt = `Investigar envío ${s.trackingNumber ?? s.orderNumber} con ${s.carrier ?? "la transportadora"} — sin movimiento ${s.daysSinceLastUpdate} días.`;
    alerts.push({
      id:               id(),
      type:             "shipment_stalled",
      orderId:          s.orderId,
      orderNumber:      s.orderNumber,
      description:      `Envío de ${s.orderNumber} sin movimiento desde hace ${s.daysSinceLastUpdate} días${s.carrier ? ` (${s.carrier})` : ""}.`,
      severity:         isCritical ? "critical" : "warning",
      riskLevel:        isCritical ? "critical" : "high",
      detectedAt:       new Date().toISOString(),
      recommendedAction: mkAction("review_carrier", "Revisar transportadora", prompt, 0.85, false, true),
      copilotAction:    prompt,
    });
  }

  // Orders at risk: paid but not dispatched in 2+ days
  const atRisk = orders.filter(o => o.requiresAttention && o.status === "paid");
  for (const o of atRisk) {
    const prompt = `Verificar estado de preparación del pedido ${o.orderNumber} — sin despacho desde hace varios días.`;
    alerts.push({
      id:               id(),
      type:             "order_at_risk",
      orderId:          o.id,
      orderNumber:      o.orderNumber,
      description:      o.attentionReason ?? `Pedido ${o.orderNumber} requiere atención.`,
      severity:         "warning",
      riskLevel:        "medium",
      detectedAt:       new Date().toISOString(),
      recommendedAction: mkAction("manual_followup", "Seguimiento manual", prompt, 0.65, true, false),
      copilotAction:    prompt,
    });
  }

  // Failed deliveries
  const failedDeliveries = shipments.filter(s => s.status === "failed_delivery");
  for (const s of failedDeliveries) {
    const prompt = `Contactar al cliente del pedido ${s.orderNumber} para coordinar nueva entrega${s.destinationCity ? ` en ${s.destinationCity}` : ""}.`;
    alerts.push({
      id:               id(),
      type:             "delivery_failed",
      orderId:          s.orderId,
      orderNumber:      s.orderNumber,
      description:      `Intento de entrega fallido — pedido ${s.orderNumber}.`,
      severity:         "warning",
      riskLevel:        "high",
      detectedAt:       new Date().toISOString(),
      recommendedAction: mkAction("contact_customer", "Contactar cliente", prompt, 0.90, true, false),
      copilotAction:    prompt,
    });
  }

  // Pending returns
  const pendingReturns = returns.filter(r => r.status === "requested" || r.status === "approved");
  for (const r of pendingReturns) {
    const prompt = `Procesar devolución del pedido ${r.orderNumber}${r.customerName ? ` (${r.customerName})` : ""}.`;
    alerts.push({
      id:               id(),
      type:             "return_pending",
      orderId:          r.orderId,
      orderNumber:      r.orderNumber,
      description:      `Devolución pendiente — pedido ${r.orderNumber}${r.customerName ? ` (${r.customerName})` : ""}.`,
      severity:         "info",
      riskLevel:        "medium",
      detectedAt:       new Date().toISOString(),
      recommendedAction: mkAction("process_refund", "Procesar devolución", prompt, 0.80, true, false),
      copilotAction:    prompt,
    });
  }

  const critical = alerts.filter(a => a.severity === "critical").length;
  const warning  = alerts.filter(a => a.severity === "warning").length;

  return {
    total:            alerts.length,
    critical,
    warning,
    paymentFailures:  failedPayments.length,
    stalledShipments: stalledShipments.length,
    pendingReturns:   pendingReturns.length,
    ordersAtRisk:     atRisk.length,
    alerts,
  };
}

// ── listOperations ────────────────────────────────────────────────────────────

/**
 * Full operational snapshot — groups orders by lifecycle stage.
 * Primary data source for the Operations page and Copilot summary.
 *
 * Copilot: "operations.listOperations()"
 */
export async function listOperations(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  filter?:         OperationQueryFilter,
): Promise<OperationListResult> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any", limit: 250 });

  const orders    = raw.map(mapOrderToSummary);
  const shipments = raw.flatMap(o =>
    (o.fulfillments ?? []).map(f => mapFulfillmentToShipment(o, f)),
  );
  const returns = raw
    .flatMap(o => (o.refunds ?? [])
      .filter(r => r.refund_line_items?.length > 0)
      .map(r => mapRefundToReturn(o, r)),
    );

  // Apply optional filter
  let filtered = orders;
  if (filter?.status?.length)
    filtered = filtered.filter(o => filter.status!.includes(o.status));
  if (filter?.requiresAttention)
    filtered = filtered.filter(o => o.requiresAttention);
  if (filter?.carrier) {
    const carrierLow = filter.carrier.toLowerCase();
    const matchedOrderIds = new Set(
      shipments
        .filter(s => s.carrier?.toLowerCase().includes(carrierLow))
        .map(s => s.orderId),
    );
    filtered = filtered.filter(o => matchedOrderIds.has(o.id));
  }

  const alerts = buildAlertSummary(orders, shipments, returns);

  return {
    orders:         filtered,
    pendingPayment: filtered.filter(o => o.status === "pending_payment" || o.status === "pending"),
    preparing:      filtered.filter(o => o.status === "preparing" || o.status === "paid"),
    inTransit:      shipments.filter(s => s.status === "in_transit" || s.status === "out_for_delivery" || s.status === "dispatched"),
    delivered:      filtered.filter(o => o.status === "delivered"),
    cancelled:      filtered.filter(o => o.status === "cancelled" || o.status === "failed"),
    alerts,
    total:          orders.length,
    source:         SOURCE,
    fetchedAt:      new Date().toISOString(),
  };
}

// ── findOperation ─────────────────────────────────────────────────────────────

/**
 * Finds a specific order by order number (e.g. "#1001") or by composite ID.
 * Returns null if not found.
 *
 * Copilot: "operations.findOperation({ orderNumber: '#1001' })"
 */
export async function findOperation(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  query:           { id?: string; orderNumber?: string },
): Promise<OperationOrderSummary | null> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any", limit: 250 });

  let match: ShopifyOrder | undefined;

  if (query.id) {
    const shopifyId = query.id.replace("shopify:order:", "");
    match = raw.find(o => String(o.id) === shopifyId);
  } else if (query.orderNumber) {
    const needle = query.orderNumber.toLowerCase().trim();
    match = raw.find(o => o.name.toLowerCase() === needle || String(o.order_number) === needle);
  }

  return match ? mapOrderToSummary(match) : null;
}

// ── getOperationTimeline ───────────────────────────────────────────────────────

/**
 * Fetches a single order and reconstructs its full chronological timeline.
 *
 * Copilot: "operations.getOperationTimeline('shopify:order:123')"
 */
export async function getOperationTimeline(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  operationId:     string,   // "shopify:order:{id}"
): Promise<OperationTimeline | null> {
  const client      = createShopifyClient(shopDomain);
  const shopifyId   = operationId.replace("shopify:order:", "");
  try {
    const order = await client.getOrder(accessToken, shopifyId);
    return buildOperationTimeline(order);
  } catch {
    return null;
  }
}

// ── listDelayedShipments ─────────────────────────────────────────────────────

/**
 * Returns shipments that have had no carrier update for at least `minDays` days
 * and have not been delivered.
 *
 * Default threshold: 5 days.
 *
 * Copilot: "operations.listDelayedShipments(orgId, token, domain, { minDays: 7 })"
 *
 * Scenarios:
 *   "¿Qué envíos llevan más de 5 días sin movimiento?"
 *   "¿Qué transportadora tiene más retrasos esta semana?"
 *     → group result by carrier
 */
export async function listDelayedShipments(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  options?:        { minDays?: number; carrier?: string },
): Promise<OperationShipmentSummary[]> {
  const minDays = options?.minDays ?? 5;
  const client  = createShopifyClient(shopDomain);
  const raw     = await client.listOrders(accessToken, { status: "open" });

  let shipments = raw.flatMap(o =>
    (o.fulfillments ?? []).map(f => mapFulfillmentToShipment(o, f)),
  );

  shipments = shipments.filter(
    s => s.status !== "delivered" && s.status !== "pending" && (s.daysSinceLastUpdate ?? 0) >= minDays,
  );

  if (options?.carrier) {
    const c = options.carrier.toLowerCase();
    shipments = shipments.filter(s => s.carrier?.toLowerCase().includes(c));
  }

  return shipments.sort((a, b) => (b.daysSinceLastUpdate ?? 0) - (a.daysSinceLastUpdate ?? 0));
}

// ── listFailedPayments ────────────────────────────────────────────────────────

/**
 * Returns orders with voided or failed payment status.
 *
 * Copilot: "operations.listFailedPayments()"
 *
 * Scenarios:
 *   "¿Cuántos pagos fallaron hoy?"
 *   "Resume los pagos fallidos de la semana."
 */
export async function listFailedPayments(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<OperationOrderSummary[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, {
    status:           "any",
    financial_status: "voided",
  });
  return raw.map(mapOrderToSummary);
}

// ── listReturns ───────────────────────────────────────────────────────────────

/**
 * Returns all return requests inferred from refunds with line items.
 * (Shopify REST does not have a dedicated Returns endpoint — uses refunds.)
 *
 * Copilot: "operations.listReturns()"
 *
 * Scenarios:
 *   "¿Qué clientes presentan más devoluciones?"
 *     → group result by customerEmail
 */
export async function listReturns(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<OperationReturnSummary[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any" });

  return raw.flatMap(o =>
    (o.refunds ?? [])
      .filter(r => (r.refund_line_items?.length ?? 0) > 0)
      .map(r => mapRefundToReturn(o, r)),
  );
}

// ── listRefunds ───────────────────────────────────────────────────────────────

/**
 * Returns all refunds across all orders (including monetary adjustments
 * without a physical return).
 *
 * Copilot: "operations.listRefunds()"
 */
export async function listRefunds(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<OperationRefundSummary[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any" });

  return raw.flatMap(o =>
    (o.refunds ?? []).map(r => mapRefundToSummary(o, r)),
  );
}

// ── listOperationalAlerts ─────────────────────────────────────────────────────

/**
 * Generates the full alert summary for a store's current operational state.
 * No Shopify writes — pure read + analysis.
 *
 * Copilot: "operations.listOperationalAlerts()"
 *
 * Scenarios:
 *   "Genera alertas operativas activas."
 *   "¿Qué requiere atención urgente en operaciones?"
 */
export async function listOperationalAlerts(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<OperationAlertSummary> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any", limit: 250 });

  const orders    = raw.map(mapOrderToSummary);
  const shipments = raw.flatMap(o => (o.fulfillments ?? []).map(f => mapFulfillmentToShipment(o, f)));
  const returns   = raw
    .flatMap(o => (o.refunds ?? [])
      .filter(r => (r.refund_line_items?.length ?? 0) > 0)
      .map(r => mapRefundToReturn(o, r)),
    );

  return buildAlertSummary(orders, shipments, returns);
}

// ── generateOperationalSummary ────────────────────────────────────────────────

/**
 * Returns a Copilot-readable narrative summary of the operational state.
 * No Shopify API call — takes pre-fetched OperationListResult.
 *
 * Copilot: "operations.generateOperationalSummary(result)"
 *
 * Example output:
 *   "Hay 12 pedidos activos. 3 pendientes de pago, 4 en preparación,
 *    5 en tránsito. 2 alertas críticas: 1 pago fallido, 1 envío detenido 8 días."
 */
export function generateOperationalSummary(result: OperationListResult): string {
  const parts: string[] = [];

  parts.push(`${result.total} pedido${result.total !== 1 ? "s" : ""} en total.`);

  if (result.pendingPayment.length > 0)
    parts.push(`${result.pendingPayment.length} pendiente${result.pendingPayment.length !== 1 ? "s" : ""} de pago.`);
  if (result.preparing.length > 0)
    parts.push(`${result.preparing.length} en preparación.`);
  if (result.inTransit.length > 0)
    parts.push(`${result.inTransit.length} en tránsito.`);
  if (result.delivered.length > 0)
    parts.push(`${result.delivered.length} entregado${result.delivered.length !== 1 ? "s" : ""}.`);
  if (result.cancelled.length > 0)
    parts.push(`${result.cancelled.length} cancelado${result.cancelled.length !== 1 ? "s" : ""} o fallido${result.cancelled.length !== 1 ? "s" : ""}.`);

  const { alerts } = result;
  if (alerts.critical > 0)
    parts.push(`${alerts.critical} alerta${alerts.critical !== 1 ? "s" : ""} crítica${alerts.critical !== 1 ? "s" : ""}.`);
  if (alerts.warning > 0)
    parts.push(`${alerts.warning} aviso${alerts.warning !== 1 ? "s" : ""} operativo${alerts.warning !== 1 ? "s" : ""}.`);

  return parts.join(" ");
}

// ── findOrdersAtRisk ──────────────────────────────────────────────────────────

/**
 * Returns orders that have been flagged as requiring immediate attention.
 * Includes: voided payments, fulfillment failures, failed deliveries,
 * and paid orders not dispatched within threshold.
 *
 * Copilot: "operations.findOrdersAtRisk()"
 *
 * Scenarios:
 *   "Muéstrame los pedidos con riesgo de devolución."
 *   "¿Qué pedidos necesitan atención urgente?"
 *   "Dame los pedidos con riesgo alto o crítico."
 */
export async function findOrdersAtRisk(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  filter?:         { riskLevel?: OperationRiskLevel[] },
): Promise<OperationOrderSummary[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any", limit: 250 });

  let orders = raw.map(mapOrderToSummary).filter(o => o.requiresAttention);

  if (filter?.riskLevel?.length) {
    orders = orders.filter(o => filter.riskLevel!.includes(o.riskLevel));
  }

  return orders.sort((a, b) => {
    const rank: Record<OperationRiskLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return rank[b.riskLevel] - rank[a.riskLevel];
  });
}

// ── findFailedDeliveries ───────────────────────────────────────────────────────

/**
 * Returns all shipments where the delivery attempt failed.
 * These require customer contact to schedule a new delivery.
 *
 * Copilot: "operations.findFailedDeliveries()"
 *
 * Scenarios:
 *   "¿Qué pedidos tuvieron entrega fallida hoy?"
 *   "Genera lista de clientes que necesitan nueva coordinación de entrega."
 */
export async function findFailedDeliveries(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<OperationShipmentSummary[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "open" });

  return raw
    .flatMap(o => (o.fulfillments ?? []).map(f => mapFulfillmentToShipment(o, f)))
    .filter(s => s.status === "failed_delivery" || s.trackingHealth === "failed_delivery");
}

// ── findPendingRefunds ────────────────────────────────────────────────────────

/**
 * Returns all refunds that are pending processing (not yet completed).
 *
 * Copilot: "operations.findPendingRefunds()"
 *
 * Scenarios:
 *   "¿Qué reembolsos están pendientes?"
 *   "Resume los reembolsos sin procesar."
 */
export async function findPendingRefunds(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<OperationRefundSummary[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listOrders(accessToken, { status: "any" });

  return raw
    .flatMap(o => (o.refunds ?? []).map(r => mapRefundToSummary(o, r)))
    .filter(r => r.status === "pending" || r.status === "processing");
}

// ── findCustomersNeedingFollowUp ───────────────────────────────────────────────

/**
 * Returns customers whose orders are in states that require merchant contact:
 * failed delivery, stalled shipment, failed payment, or pending return.
 * Sorted by priority (critical first).
 *
 * Copilot: "operations.findCustomersNeedingFollowUp()"
 *
 * Scenarios:
 *   "¿Qué clientes necesitan seguimiento urgente?"
 *   "Genera la lista de contactos para el equipo de servicio al cliente."
 */
export async function findCustomersNeedingFollowUp(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<Array<{
  customerEmail:  string | null;
  customerName:   string | null;
  orderNumber:    string;
  reason:         string;
  riskLevel:      OperationRiskLevel;
  recommendedAction: string;
}>> {
  const client   = createShopifyClient(shopDomain);
  const raw      = await client.listOrders(accessToken, { status: "any", limit: 250 });
  const orders   = raw.map(mapOrderToSummary);
  const shipments = raw.flatMap(o => (o.fulfillments ?? []).map(f => mapFulfillmentToShipment(o, f)));
  const returns  = raw.flatMap(o =>
    (o.refunds ?? [])
      .filter(r => (r.refund_line_items?.length ?? 0) > 0)
      .map(r => mapRefundToReturn(o, r)),
  );

  const rows: Array<{
    customerEmail: string | null; customerName: string | null;
    orderNumber: string; reason: string; riskLevel: OperationRiskLevel;
    recommendedAction: string;
  }> = [];

  // Failed payments
  orders
    .filter(o => o.paymentStatus === "voided" || o.paymentStatus === "failed")
    .forEach(o => rows.push({
      customerEmail:     o.customerEmail,
      customerName:      o.customerName,
      orderNumber:       o.orderNumber,
      reason:            "Pago fallido o revertido",
      riskLevel:         "critical",
      recommendedAction: "Confirmar nuevo método de pago",
    }));

  // Failed deliveries
  shipments
    .filter(s => s.status === "failed_delivery")
    .forEach(s => {
      const order = orders.find(o => o.id === s.orderId);
      rows.push({
        customerEmail:     order?.customerEmail ?? null,
        customerName:      order?.customerName ?? null,
        orderNumber:       s.orderNumber,
        reason:            "Entrega fallida — cliente no disponible",
        riskLevel:         "high",
        recommendedAction: "Coordinar nueva entrega",
      });
    });

  // Stalled shipments
  shipments
    .filter(s => s.trackingHealth === "stalled")
    .forEach(s => {
      const order = orders.find(o => o.id === s.orderId);
      rows.push({
        customerEmail:     order?.customerEmail ?? null,
        customerName:      order?.customerName ?? null,
        orderNumber:       s.orderNumber,
        reason:            `Envío detenido ${s.daysSinceLastUpdate ?? "varios"} días${s.carrier ? ` (${s.carrier})` : ""}`,
        riskLevel:         "high",
        recommendedAction: "Informar al cliente y revisar con transportadora",
      });
    });

  // Pending returns
  returns
    .filter(r => r.status === "requested")
    .forEach(r => rows.push({
      customerEmail:     null,
      customerName:      r.customerName,
      orderNumber:       r.orderNumber,
      reason:            "Devolución solicitada",
      riskLevel:         "medium",
      recommendedAction: "Aprobar y procesar devolución",
    }));

  const rank: Record<OperationRiskLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return rows.sort((a, b) => rank[b.riskLevel] - rank[a.riskLevel]);
}

// ── Stub contracts (future sprints) ───────────────────────────────────────────

/**
 * @stub — SHOPIFY-OPERATIONS-02
 * Cancels an order in Shopify.
 * Requires: write_orders scope.
 */
export async function cancelOperation(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
  _operationId:    string,
  _reason?:        string,
): Promise<void> {
  throw new Error("cancelOperation: not yet implemented (SHOPIFY-OPERATIONS-02)");
}

/**
 * @stub — SHOPIFY-OPERATIONS-04
 * Creates a return request for an order.
 * Requires: write_returns scope (GraphQL).
 * Note: Shopify REST does not support return creation — requires GraphQL Mutations.
 *
 * TODO(SHOPIFY-OPERATIONS-04): Implement via Shopify GraphQL Admin API
 *   mutation returnCreate(input: ReturnInput!) { return { id } userErrors { ... } }
 */
export async function createReturn(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
  _operationId:    string,
  _lineItemIds:    string[],
  _reason?:        string,
): Promise<void> {
  throw new Error("createReturn: not yet implemented (SHOPIFY-OPERATIONS-04)");
}

/**
 * @stub — SHOPIFY-OPERATIONS-05
 * Returns customers ranked by return frequency.
 * Designed for Copilot risk scoring.
 *
 * TODO(SHOPIFY-OPERATIONS-05): Implement by:
 *   1. listReturns() → group by customerEmail
 *   2. Count returns per customer
 *   3. Cross-reference with order volume (return rate %)
 *   4. Return sorted by risk score (high return rate + high volume = high risk)
 */
export async function listHighReturnCustomers(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
): Promise<Array<{ email: string; returnCount: number; orderCount: number; returnRate: number }>> {
  throw new Error("listHighReturnCustomers: not yet implemented (SHOPIFY-OPERATIONS-05)");
}

/**
 * @stub — SHOPIFY-OPERATIONS-06
 * Returns carriers ranked by delay rate.
 *
 * TODO(SHOPIFY-OPERATIONS-06): Implement by:
 *   1. listDelayedShipments() → group by carrier
 *   2. Count all shipments per carrier from listOperations()
 *   3. delay_rate = delayed / total per carrier
 *   4. Return sorted by delay_rate desc
 */
export async function listCarrierPerformance(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
): Promise<Array<{ carrier: string; totalShipments: number; delayed: number; delayRate: number }>> {
  throw new Error("listCarrierPerformance: not yet implemented (SHOPIFY-OPERATIONS-06)");
}
