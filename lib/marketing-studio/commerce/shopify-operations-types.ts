/**
 * lib/marketing-studio/commerce/shopify-operations-types.ts
 *
 * SHOPIFY-OPERATIONS-01B — Canonical domain types for the Operations module.
 *
 * ── Architectural principle ───────────────────────────────────────────────────
 *
 * Operaciones is NOT an order list.
 * It is the intelligent center that manages the full commercial cycle:
 *
 *   Pedido → Pago → Preparación → Despacho → Tránsito → Entrega
 *        ↘ Incidencia → Devolución → Reembolso → Cancelación
 *
 * ── Platform independence ────────────────────────────────────────────────────
 *
 * These types are deliberately platform-agnostic.
 * The `source` field identifies the origin platform (Shopify, WooCommerce, …).
 * Shopify-specific REST/GraphQL internals live ONLY in:
 *   lib/integrations/shopify/shopify-types.ts  (raw API contracts)
 *   lib/marketing-studio/commerce/shopify-operations-service.ts (mapping layer)
 *
 * ── Copilot-ready contract ────────────────────────────────────────────────────
 *
 * All types are usable from service functions without any React dependency.
 * Copilot agents share the same input/output contracts as the UI.
 *
 * Copilot natural language scenarios:
 *   "Muéstrame pedidos pendientes."
 *     → listOperations({ status: ["pending", "pending_payment"] })
 *
 *   "¿Qué envíos llevan más de 5 días sin movimiento?"
 *     → listDelayedShipments(orgId, token, domain, { minDays: 5 })
 *
 *   "¿Cuántos pagos fallaron hoy?"
 *     → listFailedPayments(orgId, token, domain)
 *
 *   "¿Qué clientes presentan más devoluciones?"
 *     → listReturns(orgId, token, domain) → group by customerEmail
 *
 *   "¿Qué transportadora tiene más retrasos?"
 *     → listDelayedShipments → group by carrier
 *
 *   "¿Qué pedidos están en riesgo de devolución?"
 *     → findOrdersAtRisk(orgId, token, domain)
 *
 * ── Future connector sources ──────────────────────────────────────────────────
 *
 *   Currently implemented: Shopify (via shopify-operations-service.ts)
 *   Planned:
 *     WooCommerce   — REST API v3
 *     Amazon        — SP-API
 *     Mercado Libre — ML API v2
 *     ERP           — via integration-gateway connector
 */

// ── Platform source ─────────────────────────────────────────────────────────

/**
 * The platform that originated this operation.
 * Used to tag every domain model so Copilot can filter by source.
 */
export type OperationSource =
  | "shopify"
  | "woocommerce"
  | "amazon"
  | "mercadolibre"
  | "erp"
  | "manual";

// ── Risk level ──────────────────────────────────────────────────────────────

/**
 * Operational risk level — applies to orders, shipments, incidents and alerts.
 * Computed deterministically from state + elapsed time; never guessed.
 *
 * Examples:
 *   low      — order progressing normally
 *   medium   — return initiated; paid order not yet dispatched
 *   high     — delivery attempt failed; shipment stalled 5+ days
 *   critical — payment voided; shipment stalled 10+ days
 */
export type OperationRiskLevel = "low" | "medium" | "high" | "critical";

// ── Order lifecycle states ──────────────────────────────────────────────────

/**
 * Full order lifecycle status.
 *
 * Linear path:
 *   pending → pending_payment → paid → preparing → dispatched → in_transit → delivered
 *
 * Branch states (can occur at any point):
 *   on_hold             — action required before processing can continue
 *   cancelled           — order was cancelled
 *   refunded            — full refund issued
 *   partially_refunded  — partial refund issued
 *   returned            — customer return received
 *   failed              — unrecoverable failure (payment or fulfillment)
 */
export type OperationOrderStatus =
  | "pending"
  | "pending_payment"
  | "paid"
  | "preparing"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "on_hold"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "returned"
  | "failed";

// ── Payment states ──────────────────────────────────────────────────────────

export type OperationPaymentStatus =
  | "pending"
  | "authorized"
  | "partially_paid"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "voided"    // payment was cancelled/reversed after capture
  | "failed";

// ── Shipment states ─────────────────────────────────────────────────────────

/**
 * Carrier-reported shipment lifecycle state.
 * Maps from platform-specific codes to unified business language.
 * Does NOT reference any specific carrier name or platform enum.
 */
export type OperationShipmentStatus =
  | "pending"              // not yet handed to carrier
  | "preparing"            // being packed
  | "dispatched"           // handed to carrier, awaiting first scan
  | "in_transit"           // moving through carrier network
  | "out_for_delivery"     // with last-mile delivery agent
  | "delivered"            // confirmed delivery
  | "failed_delivery"      // delivery attempt failed — client unavailable
  | "returned_to_sender"   // undeliverable — returning to merchant
  | "lost"                 // carrier confirmed lost
  | "unknown";             // no carrier data available

// ── Tracking health ─────────────────────────────────────────────────────────

/**
 * Health state of a shipment based on carrier activity and elapsed time.
 * Distinct from OperationShipmentStatus — this is a RISK SIGNAL, not a lifecycle state.
 *
 * Used to generate alerts and feed Copilot recommendations.
 */
export type OperationTrackingHealth =
  | "normal"           // progressing as expected
  | "delayed"          // behind expected schedule (2–4 days without update)
  | "stalled"          // no carrier activity for 5+ days
  | "failed_delivery"  // delivery attempt failed
  | "returned";        // shipment returned to merchant

// ── Return states ───────────────────────────────────────────────────────────

export type OperationReturnStatus =
  | "requested"    // customer submitted return request
  | "approved"     // merchant approved
  | "in_transit"   // being shipped back
  | "received"     // merchant received the goods
  | "inspecting"   // quality inspection in progress
  | "completed"    // return closed, refund issued
  | "rejected";    // return denied

// ── Refund states ───────────────────────────────────────────────────────────

export type OperationRefundStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

// ── Incident types ──────────────────────────────────────────────────────────

/**
 * Type of operational incident.
 * Incidents are non-standard events that require attention or action.
 */
export type OperationIncidentType =
  | "payment_failed"
  | "delivery_failed"
  | "shipment_stalled"
  | "return_requested"
  | "dispute_opened"
  | "fraud_suspected"
  | "address_error"
  | "product_damaged"
  | "customer_complaint"
  | "carrier_issue"
  | "fulfillment_error";

// ── Alert types ─────────────────────────────────────────────────────────────

export type OperationAlertType =
  | "payment_failed"
  | "shipment_stalled"
  | "order_at_risk"
  | "return_pending"
  | "delayed_dispatch"        // paid but not dispatched within threshold
  | "refund_pending"
  | "carrier_underperforming"
  | "high_return_customer"
  | "repeat_failure"
  | "delivery_failed";

// ── Recommended action ───────────────────────────────────────────────────────

/**
 * Canonical set of machine-readable action identifiers.
 * Copilot uses these keys to dispatch the correct handler or automation.
 *
 * Extensible: future action types can be added here without modifying
 * the OperationRecommendedAction interface or any existing consumers.
 */
export const OPERATION_RECOMMENDED_ACTIONS = {
  CONTACT_CUSTOMER:  "contact_customer",
  REVIEW_CARRIER:    "review_carrier",
  CONFIRM_PAYMENT:   "confirm_payment",
  MANUAL_FOLLOWUP:   "manual_followup",
  PROCESS_REFUND:    "process_refund",
  ESCALATE:          "escalate",
} as const;

/**
 * Union of all canonical action keys.
 * The `action` field accepts this union OR any future string,
 * enabling forward compatibility without a breaking type change.
 */
export type OperationRecommendedActionKey =
  typeof OPERATION_RECOMMENDED_ACTIONS[keyof typeof OPERATION_RECOMMENDED_ACTIONS];

/**
 * ── Copilot Execution Policy ────────────────────────────────────────────────
 *
 * The following actions are SENSITIVE and require explicit human approval
 * before Copilot may execute them. Copilot MUST surface a confirmation UI
 * and wait for ORG_ADMIN approval. Auto-execution is PROHIBITED.
 *
 *   contact_customer  — sends a message to the customer (external comms)
 *   process_refund    — initiates a monetary refund in Shopify
 *   escalate          — opens a formal escalation ticket
 *
 * The following actions MAY be automated when automationEligible=true
 * and confidenceScore >= 0.85 (threshold: SHOPIFY-OPERATIONS-07):
 *
 *   review_carrier    — API call to carrier for status inquiry
 *
 * All other actions require human review before execution.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * A structured Copilot action recommendation.
 * Generated by the alert/risk detection engine and consumed by Copilot.
 *
 * The `action` key is machine-readable — Copilot uses it to dispatch the
 * correct handler. The `label` and `prompt` are for display and reasoning.
 *
 * Future (SHOPIFY-OPERATIONS-07): Copilot reads `prompt` and executes
 * `action` automatically when `automationEligible=true` and
 * `confidenceScore >= 0.85`.
 */
export interface OperationRecommendedAction {
  /**
   * Machine-readable action identifier.
   * Use `OPERATION_RECOMMENDED_ACTIONS.*` constants for canonical values.
   * The `string & {}` union allows future action types without a type change.
   */
  action:   OperationRecommendedActionKey | (string & {});
  /** Short label for UI display: "Contactar cliente" */
  label:    string;
  /** Full natural language Copilot prompt. */
  prompt:   string;
  /**
   * Confidence score (0–1) for this recommendation.
   * Produced deterministically from risk signals — no AI inference.
   *
   *   >= 0.90   — high confidence, strong signal
   *   0.80–0.89 — medium-high, clear pattern
   *   0.65–0.79 — medium, probable but requires review
   *   < 0.65    — low, surface as suggestion only
   */
  confidenceScore:    number;
  /**
   * True if a human must explicitly approve this action before Copilot
   * may execute it. See Copilot Execution Policy above.
   */
  requiresApproval:   boolean;
  /**
   * True if Copilot may execute this action automatically when
   * confidenceScore >= 0.85 AND requiresApproval=false.
   * Future: SHOPIFY-OPERATIONS-07 automation gate.
   */
  automationEligible: boolean;
}

// ── Core domain models ───────────────────────────────────────────────────────

/**
 * Canonical summary of a commercial order.
 * The primary unit of Operations — represents the full story of a sale.
 *
 * Copilot read-aloud:
 *   "Pedido {orderNumber} de {customerName} · {totalAmount} {currency}
 *    Estado: {status} · Pago: {paymentStatus} · Riesgo: {riskLevel}"
 */
export interface OperationOrderSummary {
  /** Composite ID: "{source}:order:{platform_id}" */
  id:               string;
  source:           OperationSource;
  /** Display order number as shown to customer: "#1001" */
  orderNumber:      string;
  customerName:     string | null;
  customerEmail:    string | null;
  status:           OperationOrderStatus;
  paymentStatus:    OperationPaymentStatus;
  shipmentStatus:   OperationShipmentStatus | null;
  lineItemCount:    number;
  totalAmount:      number;
  currency:         string;
  createdAt:        string;    // ISO8601
  updatedAt:        string;
  tags:             string[];
  /** Risk level — computed from status, time elapsed, and incident signals. */
  riskLevel:        OperationRiskLevel;
  /**
   * True if this order requires immediate attention.
   * Feeds the Attention Layer and Copilot signal engine.
   */
  requiresAttention:  boolean;
  attentionReason:    string | null;
  /** Destination city and country — used for carrier performance analysis. */
  destinationCity:    string | null;
  destinationCountry: string | null;
}

/**
 * Payment summary for a single order.
 * An order may have multiple payment attempts (gateway retries).
 */
export interface OperationPaymentSummary {
  id:            string;
  orderId:       string;
  orderNumber:   string;
  status:        OperationPaymentStatus;
  amount:        number;
  currency:      string;
  /** Payment processor name — business language, no technical IDs. */
  gateway:       string | null;
  processedAt:   string | null;
  failureReason: string | null;
  riskLevel:     OperationRiskLevel;
}

/**
 * Shipment summary — one per fulfillment line.
 * An order may have multiple shipments (partial fulfillments).
 *
 * Carrier field accepts any string — no hard-coded carrier enum.
 * Supports Servientrega, FedEx, DHL, Envia, Coordinadora, or any future provider.
 *
 * Copilot: "operations.listDelayedShipments()"
 * Alert trigger: daysSinceLastUpdate >= threshold AND status !== "delivered"
 */
export interface OperationShipmentSummary {
  id:                   string;
  orderId:              string;
  orderNumber:          string;
  status:               OperationShipmentStatus;
  /** Carrier name — free-form string, not an enum. Any provider is supported. */
  carrier:              string | null;
  trackingNumber:       string | null;
  trackingUrl:          string | null;
  estimatedDeliveryAt:  string | null;
  deliveredAt:          string | null;
  dispatchedAt:         string | null;
  /** Human-readable description of the last carrier event. */
  lastEvent:            string | null;
  lastEventAt:          string | null;
  /** Days since the last carrier update. Null if status is delivered. */
  daysSinceLastUpdate:  number | null;
  /** Estimated delay in business days beyond expected delivery. */
  delayEstimateDays:    number | null;
  /** Risk signal derived from carrier activity and elapsed time. */
  trackingHealth:       OperationTrackingHealth | null;
  riskLevel:            OperationRiskLevel;
  destinationCity:      string | null;
  destinationCountry:   string | null;
}

/**
 * Return summary.
 * In Shopify REST, returns are inferred from refunds with line items.
 * Future: Shopify GraphQL Returns API (write_returns scope).
 */
export interface OperationReturnSummary {
  id:            string;
  orderId:       string;
  orderNumber:   string;
  customerName:  string | null;
  status:        OperationReturnStatus;
  /** Customer-provided reason for the return. */
  reason:        string | null;
  lineItemCount: number;
  refundAmount:  number | null;
  currency:      string;
  requestedAt:   string;
  resolvedAt:    string | null;
}

/**
 * Refund summary — monetary credits issued back to the customer.
 * A refund may or may not be associated with a physical return.
 */
export interface OperationRefundSummary {
  id:          string;
  orderId:     string;
  orderNumber: string;
  status:      OperationRefundStatus;
  amount:      number;
  currency:    string;
  /** Reason for the refund — free text from merchant. */
  reason:      string | null;
  processedAt: string | null;
}

/**
 * An operational incident — an event that breaks the normal order flow.
 * Incidents are logged for Copilot reasoning and alert generation.
 */
export interface OperationIncidentSummary {
  id:                    string;
  orderId:               string;
  orderNumber:           string;
  type:                  OperationIncidentType;
  /** Human-readable description in business language. No technical terms. */
  description:           string;
  severity:              "low" | "medium" | "high" | "critical";
  riskLevel:             OperationRiskLevel;
  openedAt:              string;
  resolvedAt:            string | null;
  /** True if Copilot should surface an action recommendation. */
  requiresCopilotAction: boolean;
  recommendedAction:     OperationRecommendedAction | null;
}

// ── Timeline ─────────────────────────────────────────────────────────────────

/**
 * Type of timeline event — maps the full commercial lifecycle.
 * Extensible: add new event types without changing existing consumers.
 */
export type OperationTimelineEventType =
  | "order_created"
  | "payment_received"
  | "payment_failed"
  | "payment_voided"
  | "preparing_started"
  | "dispatched"
  | "in_transit"
  | "out_for_delivery"
  | "delivery_attempted"
  | "delivered"
  | "return_requested"
  | "return_approved"
  | "return_received"
  | "refund_issued"
  | "cancelled"
  | "incident_opened"
  | "incident_resolved"
  | "note_added";

/**
 * A single immutable event in the order timeline.
 * The building block for chronological order reconstruction.
 *
 * Immutability guarantees:
 *   - Events are sorted by occurredAt and never reordered after construction.
 *   - Duplicate events (same type + same minute) are deduplicated.
 *   - Missing upstream data produces no event (never throws).
 *
 * Copilot read-aloud:
 *   "El pedido {orderNumber} fue {description} el {occurredAt}"
 */
export interface OperationTimelineEvent {
  /** Unique event ID within the timeline. */
  id:          string;
  orderId:     string;
  type:        OperationTimelineEventType;
  /** Human-readable commercial description. No technical terms. */
  description: string;
  occurredAt:  string;   // ISO8601
  actor:       "customer" | "merchant" | "carrier" | "system" | "copilot";
  /** Optional structured context for Copilot reasoning. */
  metadata?:   Record<string, string>;
}

/**
 * Full reconstructed timeline of an order.
 * Usable by both UI and Copilot without any React dependency.
 *
 * Copilot: "operations.getOperationTimeline(orderId)"
 */
export interface OperationTimeline {
  orderId:      string;
  orderNumber:  string;
  /** Events sorted chronologically. Immutable after construction. */
  events:       OperationTimelineEvent[];
  /** Most recent event type — convenience for quick status reads. */
  currentState: OperationTimelineEventType | null;
  /**
   * True if no timeline event has occurred in `stalledDays` days.
   * Used to detect abandoned orders and stalled shipments.
   */
  isStalled:    boolean;
  stalledDays:  number | null;
}

// ── Alerts ───────────────────────────────────────────────────────────────────

/**
 * A single operational alert requiring attention or Copilot action.
 *
 * Alerts feed:
 *   - The Attention Layer (right rail signal strip)
 *   - Copilot reasoning engine
 *   - Future: automated escalation (SHOPIFY-OPERATIONS-07)
 */
export interface OperationAlert {
  id:               string;
  type:             OperationAlertType;
  orderId:          string | null;
  orderNumber:      string | null;
  description:      string;
  severity:         "info" | "warning" | "critical";
  /** Risk level — aligns alert priority with order risk scoring. */
  riskLevel:        OperationRiskLevel;
  detectedAt:       string;
  /**
   * Structured action recommendation for Copilot.
   * Contains the machine-readable action key, display label, and full prompt.
   */
  recommendedAction: OperationRecommendedAction | null;
  /**
   * Convenience string version of recommendedAction.prompt.
   * Kept for backward compatibility and simple text rendering.
   */
  copilotAction:    string | null;
}

/**
 * Aggregated alert summary for the Operations dashboard header.
 */
export interface OperationAlertSummary {
  total:             number;
  critical:          number;
  warning:           number;
  paymentFailures:   number;
  stalledShipments:  number;
  pendingReturns:    number;
  ordersAtRisk:      number;
  alerts:            OperationAlert[];
}

// ── Grouped list result ──────────────────────────────────────────────────────

/**
 * Full operational snapshot grouped by lifecycle stage.
 * Returned by listOperations() — primary data contract for the
 * Operations workspace and Copilot summary generation.
 */
export interface OperationListResult {
  /** Complete flat list of all orders in this snapshot. */
  orders:         OperationOrderSummary[];
  /** Awaiting payment confirmation. */
  pendingPayment: OperationOrderSummary[];
  /** Paid and being prepared for dispatch. */
  preparing:      OperationOrderSummary[];
  /** Active shipments currently in the carrier network. */
  inTransit:      OperationShipmentSummary[];
  /** Confirmed deliveries. */
  delivered:      OperationOrderSummary[];
  /** Cancelled or failed orders. */
  cancelled:      OperationOrderSummary[];
  /** Current alert summary — ready for Attention Layer consumption. */
  alerts:         OperationAlertSummary;
  total:          number;
  source:         OperationSource;
  /** ISO8601 timestamp of when this snapshot was generated. */
  fetchedAt:      string;
}

// ── Copilot query filter ─────────────────────────────────────────────────────

/**
 * Filter for Copilot-driven operation queries.
 * All fields are optional — combine freely.
 *
 * Examples:
 *   operations.listDelayedShipments({ minDays: 7, carrier: "FedEx" })
 *   operations.findOrdersAtRisk({ riskLevel: ["high", "critical"] })
 */
export interface OperationQueryFilter {
  status?:            OperationOrderStatus[];
  paymentStatus?:     OperationPaymentStatus[];
  shipmentStatus?:    OperationShipmentStatus[];
  riskLevel?:         OperationRiskLevel[];
  trackingHealth?:    OperationTrackingHealth[];
  stalledDaysMin?:    number;
  dateFrom?:          string;   // ISO8601
  dateTo?:            string;
  /** Free-form carrier name filter — substring match. */
  carrier?:           string;
  requiresAttention?: boolean;
  source?:            OperationSource;
}
