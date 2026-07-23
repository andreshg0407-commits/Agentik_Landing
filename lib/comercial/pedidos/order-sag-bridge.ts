/**
 * lib/comercial/pedidos/order-sag-bridge.ts
 *
 * Bridge: Agentik OrderDraft -> SAG Write Queue (PE document).
 *
 * This is the ONLY authorized path for sending Agentik orders to SAG.
 * It does NOT call SOAP directly -- it enqueues via the existing SAG write
 * pipeline (lib/sag/write/queue.ts -> executor.ts -> client.ts).
 *
 * Responsibilities:
 *   1. Run pre-send validation (order-sag-pre-send-validator)
 *   2. Resolve seller SAG identifier (seller-resolution-service)
 *   3. Map OrderDraft -> SagDocumentInput
 *   4. Compute payload hash for idempotency
 *   5. Check idempotency (no duplicate in queue)
 *   6. Enqueue in SAG write queue
 *   7. Update order status -> pendiente_sag
 *
 * SERVER ONLY -- never import from client components.
 *
 * Sprint: ORDER-SAG-BRIDGE-01
 * Sprint: AGENTIK-ORDERS-SAG-WRITE-ADAPTER-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/sag/write/queue";
import { sagWriteLog } from "@/lib/sag/write/sanitizer";
import type { SagDocumentInput, SagDocumentLine } from "@/lib/sag/write/types";
import type { OrderDraft } from "./order-types";
import { resolveSagWriteMode, resolveSagWriteConfig } from "./sag-order-sync-service";
import {
  computePayloadHash,
  buildIdempotencyKeyV2,
  checkIdempotency,
} from "./order-sag-idempotency";
import { validatePreSend } from "./order-sag-pre-send-validator";
import { markPendingSag } from "./order-service";
import type { ResolvedSeller } from "./seller-resolution-service";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SendToSagResult {
  ok: boolean;
  sagOperationId?: string;
  alreadyQueued?: boolean;
  alreadySynced?: boolean;
  error?: string;
  errorCode?: string;
  payloadHash?: string;
  idempotencyKey?: string;
  preSendIssues?: Array<{ code: string; field: string; message: string; severity: string }>;
}

// ── Structured log helper ────────────────────────────────────────────────────

function log(event: string, data: Record<string, unknown>): void {
  sagWriteLog("ORDER_BRIDGE", event, data);
}

// ── OBSERVACION builder ──────────────────────────────────────────────────────

const OBSERVACION_MAX_LENGTH = 250;

function buildObservacion(order: OrderDraft): string {
  const parts: string[] = [];

  parts.push(`PEDIDO AGENTIK: ${order.consecutivo}`);

  if (order.header.customerAddress?.trim()) {
    parts.push(`ENTREGA: ${order.header.customerAddress.trim()}`);
  }
  if (order.header.customerCity?.trim()) {
    parts.push(`CIUDAD: ${order.header.customerCity.trim()}`);
  }

  const scope = order.header.deliveryScope === "partial"
    ? "DESPACHO PARCIAL"
    : "DESPACHO TOTAL";
  parts.push(`TIPO: ${scope}`);

  if (order.header.customerNotes?.trim()) {
    parts.push(`NOTAS: ${order.header.customerNotes.trim()}`);
  }

  // Join with " | ", truncate safely
  const obs = parts.join(" | ");
  if (obs.length <= OBSERVACION_MAX_LENGTH) return obs;
  return obs.slice(0, OBSERVACION_MAX_LENGTH - 3) + "...";
}

// ── Seller resolution for SAG XML ────────────────────────────────────────────

/**
 * Resolve the SAG-certified seller identifier for the XML VENDEDOR field.
 *
 * Priority:
 *   1. resolvedSeller.sellerCode (SAG ka_nl_tercero_vend) — confirmed
 *   2. null (omit VENDEDOR from XML)
 *
 * Never sends: Agentik sellerId, sellerName as code, or inferred data.
 */
function resolveSellerForXml(resolvedSeller: ResolvedSeller | null): string | undefined {
  if (!resolvedSeller) return undefined;

  // Only use confirmed SAG seller code
  if (resolvedSeller.source === "sag_movimientos" && resolvedSeller.sellerCode) {
    return resolvedSeller.sellerCode;
  }

  // CRM-resolved sellers do not have a certified SAG code
  return undefined;
}

// ── Mapper: OrderDraft -> SagDocumentInput ────────────────────────────────────

export function mapOrderToSagDocument(
  order: OrderDraft,
  resolvedSeller: ResolvedSeller | null,
): SagDocumentInput {
  const activeLines = order.lines.filter(l => !l.removed && l.quantity > 0);

  if (activeLines.length === 0) {
    throw new OrderBridgeError(
      "EMPTY_LINES",
      "El pedido no tiene lineas activas con cantidad > 0.",
    );
  }

  if (!order.header.customerCode?.trim()) {
    throw new OrderBridgeError(
      "MISSING_CUSTOMER_NIT",
      "El NIT del cliente es obligatorio para enviar a SAG.",
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

  // FECHA: use orderDate (business date) with createdAt as fallback
  const fecha = (order.header.orderDate ?? order.createdAt).slice(0, 10);

  // VENDEDOR: only SAG-certified seller code
  const vendedor = resolveSellerForXml(resolvedSeller);

  return {
    TIPO_DOC:    "PE",
    NIT:         order.header.customerCode.trim(),
    FECHA:       fecha,
    VENDEDOR:    vendedor,
    BODEGA:      order.sourceWarehouseCode ?? undefined,
    OBSERVACION: observacion,
    LINEAS:      lines,
  };
}

// ── Main bridge function ─────────────────────────────────────────────────────

/**
 * Send an Agentik order to SAG via the existing write queue.
 *
 * Idempotent: safe to call multiple times for the same order.
 * Does NOT call SOAP -- only enqueues for human approval + execution.
 */
export async function sendOrderToSagQueue(
  orgId:  string,
  userId: string,
  order:  OrderDraft,
  resolvedSeller?: ResolvedSeller | null,
): Promise<SendToSagResult> {
  const orderId = order.id;
  const sourceRef = order.externalSyncKey;
  const mode = resolveSagWriteMode(orgId);

  log("ORDER_SYNC_START", { orderId, mode });

  // ── 0. Write mode gate ──────────────────────────────────────────────────
  if (mode === "DISABLED") {
    log("ORDER_SYNC_DISABLED", { orderId });
    return { ok: false, error: "Escritura a SAG deshabilitada para esta organizacion.", errorCode: "DISABLED" };
  }

  // ── 1. Pre-send validation ──────────────────────────────────────────────
  const preSend = validatePreSend(order, { writeMode: mode });
  if (!preSend.canSend) {
    log("ORDER_SYNC_PRESEND_BLOCKED", { orderId, blockerCount: preSend.blockerCount });
    return {
      ok: false,
      error: preSend.issues.filter(i => i.severity === "blocker").map(i => i.message).join("; "),
      errorCode: "VALIDATION_FAILED",
      preSendIssues: preSend.issues,
    };
  }

  // ── 2. SIMULATION mode ─────────────────────────────────────────────────
  if (mode === "SIMULATION") {
    let sagInput: SagDocumentInput;
    try {
      sagInput = mapOrderToSagDocument(order, resolvedSeller ?? null);
    } catch (e) {
      const msg = e instanceof OrderBridgeError ? e.message : "Error mapeando pedido a formato SAG.";
      log("ORDER_SYNC_MAP_ERROR", { orderId, error: msg });
      return { ok: false, error: msg, errorCode: "VALIDATION_FAILED" };
    }

    const hash = computePayloadHash(sagInput);
    const config = resolveSagWriteConfig(orgId);
    const idempotencyKey = buildIdempotencyKeyV2(orgId, orderId, config.idempotencyKeyVersion, hash);
    const simulatedId = `SIM-${orderId.slice(0, 8)}-${Date.now()}`;

    log("ORDER_SYNC_SIMULATED", {
      orderId, simulatedId,
      lineCount: sagInput.LINEAS.length,
      hash,
    });

    return {
      ok: true,
      sagOperationId: simulatedId,
      payloadHash: hash,
      idempotencyKey,
    };
  }

  // ── 3. LIVE mode: Check if already synced ──────────────────────────────
  if (order.status === "sincronizado" || order.sagOrderId) {
    log("ORDER_SYNC_ALREADY_SYNCED", { orderId });
    return { ok: false, alreadySynced: true, error: "El pedido ya fue sincronizado con SAG.", errorCode: "IDEMPOTENT_DUPLICATE" };
  }

  // ── 4. Map OrderDraft -> SagDocumentInput ──────────────────────────────
  let sagInput: SagDocumentInput;
  try {
    sagInput = mapOrderToSagDocument(order, resolvedSeller ?? null);
  } catch (e) {
    const msg = e instanceof OrderBridgeError ? e.message : "Error mapeando pedido a formato SAG.";
    log("ORDER_SYNC_MAP_ERROR", { orderId, error: msg });
    return { ok: false, error: msg, errorCode: "VALIDATION_FAILED" };
  }

  // ── 5. Idempotency check with payload hash ─────────────────────────────
  const hash = computePayloadHash(sagInput);
  const config = resolveSagWriteConfig(orgId);
  const idempotencyKey = buildIdempotencyKeyV2(orgId, orderId, config.idempotencyKeyVersion, hash);

  const idempotencyResult = await checkIdempotency(orgId, sourceRef, hash);

  switch (idempotencyResult.action) {
    case "already_succeeded":
      log("ORDER_SYNC_ALREADY_SUCCEEDED", { orderId, operationId: idempotencyResult.operationId });
      return {
        ok: false, alreadySynced: true,
        sagOperationId: idempotencyResult.operationId,
        errorCode: "IDEMPOTENT_DUPLICATE",
      };

    case "payload_changed_after_success":
      log("ORDER_SYNC_PAYLOAD_CHANGED", { orderId, operationId: idempotencyResult.operationId });
      return {
        ok: false,
        error: "El payload cambió después de un envío exitoso. Cree una nueva versión del pedido.",
        errorCode: "PAYLOAD_CHANGED_AFTER_SUCCESS",
        sagOperationId: idempotencyResult.operationId,
      };

    case "already_queued":
      log("ORDER_SYNC_ALREADY_QUEUED", { orderId, operationId: idempotencyResult.operationId, status: idempotencyResult.status });
      return {
        ok: true, alreadyQueued: true,
        sagOperationId: idempotencyResult.operationId,
        payloadHash: hash,
        idempotencyKey,
      };

    case "failed_allow_retry":
      log("ORDER_SYNC_REQUEUE", { orderId, operationId: idempotencyResult.operationId });
      break; // proceed to enqueue

    case "proceed":
      break;
  }

  // ── 6. Enqueue in SAG write queue ──────────────────────────────────────
  const inputWithHash = {
    type: 2 as const,
    payload: sagInput,
    _payloadHash: hash,
  };

  const enqueueResult = await enqueue(orgId, userId, { type: 2, payload: sagInput }, {
    description: `Pedido #${order.consecutivo} — ${order.header.customerName?.slice(0, 40) ?? ""}`,
    sourceRef,
  });

  if (!enqueueResult.ok) {
    const error = enqueueResult.error
      ?? enqueueResult.validation?.errors.map(e => e.message).join("; ")
      ?? "Error al encolar en SAG.";
    log("ORDER_SYNC_ENQUEUE_FAILED", { orderId, error });
    return { ok: false, error, errorCode: "ENQUEUE_FAILED" };
  }

  // Persist payloadHash in the operation's inputJson for future idempotency checks
  if (enqueueResult.operationId) {
    await prisma.sagWriteOperation.update({
      where: { id: enqueueResult.operationId },
      data: {
        inputJson: inputWithHash as unknown as object,
      },
    }).catch(() => {
      // Non-critical — hash storage failure doesn't block the operation
    });
  }

  // ── 7. Update order status -> pendiente_sag ────────────────────────────
  await markPendingSag(orgId, orderId);

  log("ORDER_SYNC_ENQUEUED", {
    orderId,
    sagOperationId: enqueueResult.operationId,
    hash,
  });

  return {
    ok: true,
    sagOperationId: enqueueResult.operationId,
    payloadHash: hash,
    idempotencyKey,
  };
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
