/**
 * lib/comercial/pedidos/sag-order-sync-service.ts
 *
 * Agentik → SAG order sync service.
 * Builds payloads, sends to SAG, reads status.
 *
 * V1: Payload construction + validation ready.
 *     Actual SAG HTTP calls require integration connection.
 *     When SAG is not connected, returns explicit "not_connected" state.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

import "server-only";

import type { OrderDraft } from "./order-types";
import { validateOrder } from "./order-validation";
import type {
  SagOrderPayload,
  SagOrderPayloadLine,
  SagOrderSyncResult,
  SagOrderStatusResult,
} from "./sag-order-sync-types";

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

// ── Send to SAG ──────────────────────────────────────────────────────────────
// V1: Returns explicit "not connected" response.
// V2: Will use tenant integration connection to call SAG API.

export async function sendOrderToSag(
  _orgId: string,
  order:  OrderDraft,
): Promise<SagOrderSyncResult> {
  const { canSend, reason } = canSendToSag(order);

  if (!canSend) {
    return {
      success:      false,
      errorCode:    "VALIDATION_FAILED",
      errorMessage: reason ?? "Validacion fallida.",
      receivedAt:   new Date().toISOString(),
    };
  }

  // V1: SAG integration not connected — return explicit state
  // V2: const connection = await getSagConnection(orgId);
  //     const payload = buildSagOrderPayload(order);
  //     const response = await connection.post("/orders", payload);

  return {
    success:      false,
    errorCode:    "SAG_NOT_CONNECTED",
    errorMessage: "La integracion con SAG no esta configurada. El pedido queda pendiente.",
    receivedAt:   new Date().toISOString(),
  };
}

// ── Get SAG order status ─────────────────────────────────────────────────────
// V1: Returns unknown status when SAG is not connected.

export async function getSagOrderStatus(
  _orgId:     string,
  sagOrderId: string,
): Promise<SagOrderStatusResult> {
  // V1: SAG not connected
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
