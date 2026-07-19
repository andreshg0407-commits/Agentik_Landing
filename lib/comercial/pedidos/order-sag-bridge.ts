/**
 * lib/comercial/pedidos/order-sag-bridge.ts
 *
 * Bridge: Agentik OrderDraft → SAG Write Queue (PE document).
 *
 * This is the ONLY authorized path for sending Agentik orders to SAG.
 * It does NOT call SOAP directly — it enqueues via the existing SAG write
 * pipeline (lib/sag/write/queue.ts → executor.ts → client.ts).
 *
 * Responsibilities:
 *   1. Validate order is ready (canSendToSag)
 *   2. Check idempotency (no duplicate in queue)
 *   3. Map OrderDraft → SagDocumentInput
 *   4. Enqueue in SAG write queue
 *   5. Update order status → pendiente_sag
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: ORDER-SAG-BRIDGE-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/sag/write/queue";
import type { SagDocumentInput, SagDocumentLine } from "@/lib/sag/write/types";
import type { OrderDraft } from "./order-types";
import { canSendToSag } from "./sag-order-sync-service";
import { markPendingSag } from "./order-service";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SendToSagResult {
  ok: boolean;
  sagOperationId?: string;
  alreadyQueued?: boolean;
  alreadySynced?: boolean;
  error?: string;
}

// ── Structured log helper ────────────────────────────────────────────────────

function log(
  event: string,
  data: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), module: "ORDER_BRIDGE", event, ...data }),
  );
}

// ── Mapper: OrderDraft → SagDocumentInput ────────────────────────────────────

export function mapOrderToSagDocument(order: OrderDraft): SagDocumentInput {
  const activeLines = order.lines.filter(l => !l.removed && l.quantity > 0);

  if (activeLines.length === 0) {
    throw new OrderBridgeError(
      "EMPTY_LINES",
      "El pedido no tiene lineas activas con cantidad > 0.",
    );
  }

  if (!order.header.customerCode?.trim()) {
    throw new OrderBridgeError(
      "MISSING_CUSTOMER_CODE",
      "El codigo de cliente SAG (NIT) es obligatorio.",
    );
  }

  const lines: SagDocumentLine[] = activeLines.map(l => ({
    CODIGO:    l.referenceCode.toUpperCase(),
    CANTIDAD:  l.quantity,
    PRECIO:    l.unitPrice,
    DESCUENTO: 0,
    BODEGA:    order.sourceWarehouseCode ?? undefined,
  }));

  const observacion = buildObservacion(order);

  return {
    TIPO_DOC:    "PE",
    NIT:         order.header.customerCode.trim(),
    FECHA:       order.createdAt.slice(0, 10),
    VENDEDOR:    order.header.sellerName || undefined,
    BODEGA:      order.sourceWarehouseCode ?? undefined,
    OBSERVACION: observacion,
    LINEAS:      lines,
  };
}

function buildObservacion(order: OrderDraft): string {
  let obs = `Pedido Agentik #${order.externalSyncKey}`;
  if (order.header.notes?.trim()) {
    obs += ` | ${order.header.notes.trim()}`;
  }
  return obs.slice(0, 250); // SAG field limit safety
}

// ── Idempotency check ────────────────────────────────────────────────────────

async function checkExistingOperation(
  organizationId: string,
  sourceRef: string,
): Promise<{ exists: boolean; status?: string; operationId?: string }> {
  try {
    const existing = await prisma.sagWriteOperation.findFirst({
      where: { organizationId, sourceRef },
      select: { id: true, status: true },
    });
    if (!existing) return { exists: false };
    return { exists: true, status: existing.status, operationId: existing.id };
  } catch {
    return { exists: false };
  }
}

// ── Main bridge function ─────────────────────────────────────────────────────

/**
 * Send an Agentik order to SAG via the existing write queue.
 *
 * Idempotent: safe to call multiple times for the same order.
 * Does NOT call SOAP — only enqueues for human approval + execution.
 */
export async function sendOrderToSagQueue(
  orgId:  string,
  userId: string,
  order:  OrderDraft,
): Promise<SendToSagResult> {
  const orderId = order.id;
  const sourceRef = order.externalSyncKey;

  log("ORDER_SYNC_START", { orderId, sourceRef, status: order.status });

  // ── 1. Validate readiness ──────────────────────────────────────────────────
  const { canSend, reason } = canSendToSag(order);
  if (!canSend) {
    log("ORDER_SYNC_BLOCKED", { orderId, reason });
    return { ok: false, error: reason ?? "Pedido no esta listo para enviar." };
  }

  // ── 2. Check if already synced ─────────────────────────────────────────────
  if (order.status === "sincronizado" || order.sagOrderId) {
    log("ORDER_SYNC_ALREADY_SYNCED", { orderId, sagOrderId: order.sagOrderId });
    return { ok: false, alreadySynced: true, error: "El pedido ya fue sincronizado con SAG." };
  }

  // ── 3. Idempotency: check if already in queue ─────────────────────────────
  const existing = await checkExistingOperation(orgId, sourceRef);
  if (existing.exists) {
    const { status, operationId } = existing;
    if (status === "SUCCEEDED") {
      log("ORDER_SYNC_ALREADY_SUCCEEDED", { orderId, operationId });
      return { ok: false, alreadySynced: true, sagOperationId: operationId };
    }
    if (status === "PENDING" || status === "APPROVED" || status === "SENDING") {
      log("ORDER_SYNC_ALREADY_QUEUED", { orderId, operationId, status });
      return { ok: true, alreadyQueued: true, sagOperationId: operationId };
    }
    // FAILED or REJECTED — allow re-enqueue (will create new operation)
    log("ORDER_SYNC_REQUEUE", { orderId, operationId, previousStatus: status });
  }

  // ── 4. Map OrderDraft → SagDocumentInput ───────────────────────────────────
  let sagInput: SagDocumentInput;
  try {
    sagInput = mapOrderToSagDocument(order);
  } catch (e) {
    const msg = e instanceof OrderBridgeError ? e.message : "Error mapeando pedido a formato SAG.";
    log("ORDER_SYNC_MAP_ERROR", { orderId, error: msg });
    return { ok: false, error: msg };
  }

  // ── 5. Enqueue in SAG write queue ──────────────────────────────────────────
  const enqueueResult = await enqueue(orgId, userId, { type: 2, payload: sagInput }, {
    description: `Pedido #${order.consecutivo} — ${order.header.customerName}`,
    sourceRef,
  });

  if (!enqueueResult.ok) {
    const error = enqueueResult.error
      ?? enqueueResult.validation?.errors.map(e => e.message).join("; ")
      ?? "Error al encolar en SAG.";
    log("ORDER_SYNC_ENQUEUE_FAILED", { orderId, error });
    return { ok: false, error };
  }

  // ── 6. Update order status → pendiente_sag ────────────────────────────────
  await markPendingSag(orgId, orderId);

  log("ORDER_SYNC_ENQUEUED", {
    orderId,
    sagOperationId: enqueueResult.operationId,
    sourceRef,
  });

  return { ok: true, sagOperationId: enqueueResult.operationId };
}

// ── Error type ───────────────────────────────────────────────────────────────

export class OrderBridgeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "OrderBridgeError";
  }
}
