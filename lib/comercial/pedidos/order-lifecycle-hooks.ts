/**
 * lib/comercial/pedidos/order-lifecycle-hooks.ts
 *
 * Lifecycle hooks invoked by the SAG write pipeline after execute/reject.
 *
 * This file is the single integration point between the SAG write pipeline
 * and the Pedidos module. It determines whether a SagWriteOperation belongs
 * to an order (by checking sourceRef prefix) and dispatches accordingly.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: ORDER-SAG-LIFECYCLE-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { handleOrderSagResult } from "./order-post-sync";
import type { SagWriteResponse } from "@/lib/sag/write/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface DispatchSagResult {
  sagRef?: string;
  raw?: string;
  error?: string;
  rejectionReason?: string;
}

// ── Structured log ───────────────────────────────────────────────────────────

function log(event: string, data: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), module: "ORDER_LIFECYCLE", event, ...data }),
  );
}

// ── Source ref detection ─────────────────────────────────────────────────────

const ORDER_SOURCE_REF_PREFIX = "AGK-";

function isOrderSourceRef(sourceRef: string | null | undefined): boolean {
  return !!sourceRef && sourceRef.startsWith(ORDER_SOURCE_REF_PREFIX) && sourceRef.includes("-PED-");
}

// ── Main dispatch function ───────────────────────────────────────────────────

/**
 * Called by SAG write routes (execute, reject) after terminal state change.
 *
 * Checks if the operation originated from an order (via sourceRef pattern).
 * If yes, dispatches to order-post-sync to update order status and reservations.
 * If no (customer upsert, product sync, etc.), does nothing — returns silently.
 *
 * This function NEVER throws — failures are logged but don't block the SAG route.
 */
export async function dispatchOrderPostSync(
  organizationId: string,
  operationId: string,
  result: "SUCCEEDED" | "FAILED" | "REJECTED",
  sagResponse?: SagWriteResponse | DispatchSagResult | null,
): Promise<void> {
  try {
    // Load the operation to get sourceRef
    const op = await prisma.sagWriteOperation.findFirst({
      where: { id: operationId, organizationId },
      select: { sourceRef: true, sagResponseRaw: true, sagResponseOk: true, lastError: true, rejectionReason: true },
    });

    if (!op) {
      log("DISPATCH_OP_NOT_FOUND", { operationId });
      return;
    }

    // Only dispatch for order operations
    if (!isOrderSourceRef(op.sourceRef)) {
      return; // Not an order — silent return
    }

    const sourceRef = op.sourceRef!;

    log("DISPATCH_ORDER_CALLBACK", { operationId, sourceRef, result });

    // Build result payload for the callback
    const sagResult: DispatchSagResult = {};

    if (result === "SUCCEEDED") {
      // Extract sagRef from response
      if (sagResponse && "sagRef" in sagResponse) {
        sagResult.sagRef = (sagResponse as SagWriteResponse).sagRef;
        sagResult.raw = (sagResponse as SagWriteResponse).raw;
      } else if (op.sagResponseRaw) {
        sagResult.raw = op.sagResponseRaw;
        // Parse sagRef from raw: "OK: 12345" → "12345"
        const colonIdx = op.sagResponseRaw.indexOf(":");
        if (colonIdx > -1 && op.sagResponseOk) {
          sagResult.sagRef = op.sagResponseRaw.slice(colonIdx + 1).trim() || undefined;
        }
      }
    } else if (result === "FAILED") {
      sagResult.error = op.lastError
        ?? (sagResponse && "error" in sagResponse ? (sagResponse as DispatchSagResult).error : undefined)
        ?? "Error desconocido de SAG.";
      sagResult.raw = op.sagResponseRaw ?? undefined;
    } else if (result === "REJECTED") {
      sagResult.rejectionReason = op.rejectionReason
        ?? (sagResponse && "rejectionReason" in sagResponse ? (sagResponse as DispatchSagResult).rejectionReason : undefined)
        ?? "Rechazado por revisor.";
    }

    // Dispatch to order post-sync handler
    const postSyncResult = await handleOrderSagResult(
      organizationId,
      sourceRef,
      result,
      sagResult,
    );

    if (postSyncResult.ok) {
      log("DISPATCH_ORDER_UPDATED", {
        operationId,
        orderId: postSyncResult.orderId,
        newStatus: postSyncResult.newStatus,
      });
    } else {
      log("DISPATCH_ORDER_UPDATE_FAILED", {
        operationId,
        sourceRef,
        error: postSyncResult.error,
      });
    }

    // Release/consume reservations
    await handleReservationLifecycle(organizationId, sourceRef, result);

  } catch (e) {
    // Never throw from lifecycle hooks — log and continue
    log("DISPATCH_ERROR", {
      operationId,
      error: (e as Error).message,
    });
  }
}

// ── Reservation lifecycle ────────────────────────────────────────────────────

/**
 * Handle reservation state based on SAG result.
 *
 * SUCCESS → consume all active reservations for this order
 * FAILED/REJECTED → release all active reservations for this order
 */
async function handleReservationLifecycle(
  organizationId: string,
  sourceRef: string,
  result: "SUCCEEDED" | "FAILED" | "REJECTED",
): Promise<void> {
  try {
    // Find the order ID from AgentExecution by externalSyncKey
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderRow = await (prisma as any).agentExecution.findFirst({
      where: {
        tenantId: organizationId,
        module: "comercial",
        operation: "COMERCIAL_ORDER_DRAFT",
        metadataJson: { path: ["externalSyncKey"], equals: sourceRef },
      },
      select: { id: true },
    });

    if (!orderRow) {
      // Try without JSON path query (some Prisma versions don't support it)
      return;
    }

    const orderId = orderRow.id;
    const now = new Date();

    if (result === "SUCCEEDED") {
      // Consume: mark all active reservations for this order as consumed
      await prisma.operationalReservation.updateMany({
        where: {
          organizationId,
          sourceType: "order",
          sourceId: orderId,
          status: "active",
        },
        data: {
          status: "consumed",
          updatedAt: now,
        },
      });

      log("RESERVATION_CONSUMED", { orderId, sourceRef });
    } else {
      // Release: mark all active reservations for this order as released
      await prisma.operationalReservation.updateMany({
        where: {
          organizationId,
          sourceType: "order",
          sourceId: orderId,
          status: "active",
        },
        data: {
          status: "released",
          updatedAt: now,
        },
      });

      log("RESERVATION_RELEASED", { orderId, sourceRef, reason: result });
    }
  } catch (e) {
    // Reservation lifecycle is non-blocking — log and continue
    log("RESERVATION_LIFECYCLE_ERROR", {
      sourceRef,
      error: (e as Error).message,
    });
  }
}
