/**
 * lib/comercial/pedidos/sag-order-sync-service.ts
 *
 * Agentik → SAG order sync service.
 * Builds payloads, validates, sends to SAG based on write mode.
 *
 * Write modes:
 *   DISABLED   — No SAG write. Returns immediately.
 *   SIMULATION — Builds payload, validates, logs. No SAG call.
 *   LIVE       — Full pipeline via SAG write queue.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 * Sprint: AGENTIK-ORDERS-WIZARD-IMPROVEMENTS-01
 */

import "server-only";

import type { OrderDraft } from "./order-types";
import { validateOrder } from "./order-validation";
import type {
  SagOrderPayload,
  SagOrderPayloadLine,
  SagOrderSyncResult,
  SagOrderStatusResult,
  SagOrderWriteResult,
} from "./sag-order-sync-types";
import { buildIdempotencyKey } from "./sag-order-sync-types";
import type { SagOrderWriteMode, SagWriteConfig } from "./order-policy-pack-config";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "./order-policy-pack-config";
import { sendOrderToSagQueue } from "./order-sag-bridge";

export { buildIdempotencyKey };

// ── Structured log ──────────────────────────────────────────────────────────

function log(
  event: string,
  data: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), module: "SAG_ORDER_SYNC", event, ...data }),
  );
}

// ── Resolve write config per tenant ─────────────────────────────────────────

/**
 * Resolve SAG write configuration for a given organization.
 * Currently returns Castillitos config — extend with tenant lookup when needed.
 */
export function resolveSagWriteConfig(_orgId: string): SagWriteConfig {
  return CASTILLITOS_ORDER_POLICY_PACK_CONFIG.sagWrite;
}

/**
 * Resolve the current write mode for an organization.
 */
export function resolveSagWriteMode(orgId: string): SagOrderWriteMode {
  const config = resolveSagWriteConfig(orgId);
  if (!config.enabled) return "DISABLED";
  return config.mode;
}

// ── Build SAG payload ────────────────────────────────────────────────────────

export function buildSagOrderPayload(order: OrderDraft): SagOrderPayload {
  const activeLines = order.lines.filter(l => !l.removed);

  const lines: SagOrderPayloadLine[] = activeLines.map(l => ({
    referenceCode: l.referenceCode,
    productName:   l.productName,
    size:          l.size,
    color:         l.color,
    quantity:      l.quantity,
    unitPrice:     l.unitPrice,
    lineTotal:     l.lineTotal,
  }));

  return {
    externalSyncKey: order.externalSyncKey,
    customerCode:    order.header.customerCode,
    customerName:    order.header.customerName,
    sellerCode:      order.header.sellerId,
    sellerName:      order.header.sellerName,
    warehouseCode:   order.sourceWarehouseCode,
    channel:         order.header.channel,
    notes:           order.header.notes,
    deliveryScope:   order.header.deliveryScope ?? "full",
    orderDate:       order.createdAt,
    lines,
  };
}

// ── Validate before sending ──────────────────────────────────────────────────

export function canSendToSag(order: OrderDraft): {
  canSend: boolean;
  reason:  string | null;
} {
  if (order.status !== "listo_para_enviar") {
    return { canSend: false, reason: "El pedido debe estar en estado 'Listo para enviar'." };
  }

  const validation = validateOrder(order);
  if (!validation.canSubmit) {
    return { canSend: false, reason: "El pedido tiene errores de validacion pendientes." };
  }

  if (!order.header.customerCode?.trim()) {
    return { canSend: false, reason: "El codigo de cliente SAG es obligatorio." };
  }

  if (!order.externalSyncKey) {
    return { canSend: false, reason: "El pedido no tiene clave de sincronizacion." };
  }

  return { canSend: true, reason: null };
}

// ── Mode-aware send ──────────────────────────────────────────────────────────

/**
 * Send an order to SAG using the tenant's configured write mode.
 *
 * DISABLED:    Returns immediately with ok=false, errorCode=DISABLED.
 * SIMULATION:  Builds + validates payload, logs, returns simulated success.
 * LIVE:        Delegates to the SAG write queue (order-sag-bridge.ts).
 */
export async function sendOrderToSag(
  orgId: string,
  order: OrderDraft,
): Promise<SagOrderWriteResult> {
  const config = resolveSagWriteConfig(orgId);
  const mode = resolveSagWriteMode(orgId);
  const idempotencyKey = buildIdempotencyKey(orgId, order.id, config.idempotencyKeyVersion);
  const timestamp = new Date().toISOString();

  log("SEND_ORDER_START", { orderId: order.id, mode, idempotencyKey });

  // ── DISABLED mode ────────────────────────────────────────────────────────
  if (mode === "DISABLED") {
    log("SEND_ORDER_DISABLED", { orderId: order.id });
    return {
      ok: false,
      mode: "DISABLED",
      errorCode: "DISABLED",
      errorMessage: "Escritura a SAG deshabilitada para esta organizacion.",
      idempotencyKey,
      timestamp,
    };
  }

  // ── Validate order readiness ─────────────────────────────────────────────
  const { canSend, reason } = canSendToSag(order);
  if (!canSend) {
    log("SEND_ORDER_VALIDATION_FAILED", { orderId: order.id, reason });
    return {
      ok: false,
      mode,
      errorCode: "VALIDATION_FAILED",
      errorMessage: reason ?? "Validacion fallida.",
      idempotencyKey,
      timestamp,
    };
  }

  // ── Build payload (both SIMULATION and LIVE need it) ─────────────────────
  const payload = buildSagOrderPayload(order);

  // ── SIMULATION mode ──────────────────────────────────────────────────────
  if (mode === "SIMULATION") {
    const simulatedId = `SIM-${order.id.slice(0, 8)}-${Date.now()}`;
    log("SEND_ORDER_SIMULATED", {
      orderId: order.id,
      simulatedId,
      lineCount: payload.lines.length,
      customerCode: payload.customerCode,
      idempotencyKey,
    });

    return {
      ok: true,
      mode: "SIMULATION",
      sagOperationId: simulatedId,
      simulatedPayload: payload,
      idempotencyKey,
      timestamp,
    };
  }

  // ── LIVE mode ────────────────────────────────────────────────────────────
  // Delegates to the bridge (order-sag-bridge.ts → SAG write queue).
  // The bridge handles: idempotency check, OrderDraft → SagDocumentInput mapping,
  // enqueue in SAG write queue, and order status transition.
  //
  // Requires a userId for the audit trail. Since sendOrderToSag() does not
  // receive userId, we use "system" — the API route should call
  // sendOrderToSagQueue() directly when it has the userId.

  log("SEND_ORDER_LIVE_DELEGATING", { orderId: order.id });

  const bridgeResult = await sendOrderToSagQueue(orgId, "system", order);

  if (!bridgeResult.ok) {
    return {
      ok: false,
      mode: "LIVE",
      errorCode: bridgeResult.alreadySynced ? "IDEMPOTENT_DUPLICATE"
               : "ENQUEUE_FAILED",
      errorMessage: bridgeResult.error ?? "Error al encolar pedido en SAG.",
      idempotencyKey,
      timestamp,
    };
  }

  return {
    ok: true,
    mode: "LIVE",
    sagOperationId: bridgeResult.sagOperationId,
    idempotencyKey,
    timestamp,
  };
}

// ── Get SAG order status ─────────────────────────────────────────────────────

export async function getSagOrderStatus(
  _orgId:     string,
  sagOrderId: string,
): Promise<SagOrderStatusResult> {
  return {
    sagOrderId,
    remoteStatus:  "unknown",
    invoiceIds:    [],
    lastCheckedAt: new Date().toISOString(),
  };
}

// ── Normalize SAG response ───────────────────────────────────────────────────

export function normalizeSagOrderResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
): SagOrderSyncResult {
  if (!raw) {
    return {
      success:      false,
      errorCode:    "EMPTY_RESPONSE",
      errorMessage: "SAG devolvio una respuesta vacia.",
      receivedAt:   new Date().toISOString(),
    };
  }

  if (raw.success === true && raw.sagOrderId) {
    return {
      success:    true,
      sagOrderId: String(raw.sagOrderId),
      sagMessage: raw.message ?? null,
      receivedAt: new Date().toISOString(),
    };
  }

  return {
    success:      false,
    errorCode:    raw.errorCode ?? "UNKNOWN",
    errorMessage: raw.errorMessage ?? raw.message ?? "Error desconocido de SAG.",
    receivedAt:   new Date().toISOString(),
  };
}
