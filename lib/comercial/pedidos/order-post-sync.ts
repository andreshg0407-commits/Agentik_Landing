/**
 * lib/comercial/pedidos/order-post-sync.ts
 *
 * Post-sync callback: handles SAG write results for orders.
 *
 * Called after SagWriteOperation reaches a terminal state (SUCCEEDED/FAILED/REJECTED).
 * Updates OrderDraft status, persists SAG document reference, and closes reservations.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: ORDER-SAG-BRIDGE-01
 */

import "server-only";

import { markSynced, markConflict } from "./order-service";
import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagOrderResult {
  sagRef?: string;
  raw?: string;
  error?: string;
  rejectionReason?: string;
}

export interface PostSyncResult {
  ok: boolean;
  orderId?: string;
  newStatus?: string;
  error?: string;
}

// ── Structured log helper ────────────────────────────────────────────────────

function log(
  event: string,
  data: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), module: "ORDER_POST_SYNC", event, ...data }),
  );
}

// ── Find order by sourceRef (externalSyncKey) ────────────────────────────────

async function findOrderBySourceRef(
  organizationId: string,
  sourceRef: string,
): Promise<{ id: string; organizationId: string } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).agentExecution.findFirst({
      where: {
        tenantId: organizationId,
        module: "comercial",
        operation: "COMERCIAL_ORDER_DRAFT",
        metadataJson: { path: ["externalSyncKey"], equals: sourceRef },
      },
      select: { id: true, tenantId: true },
    });
    if (!row) return null;
    return { id: row.id, organizationId: row.tenantId };
  } catch {
    // Prisma JSON path query may not be supported — fallback
    return null;
  }
}

// ── Main callback ────────────────────────────────────────────────────────────

/**
 * Handle the result of a SAG write operation for an order.
 *
 * @param organizationId - Org scope
 * @param sourceRef      - The externalSyncKey used as sourceRef in the queue
 * @param result         - "SUCCEEDED" | "FAILED" | "REJECTED"
 * @param sagResult      - Details from SAG response
 */
export async function handleOrderSagResult(
  organizationId: string,
  sourceRef: string,
  result: "SUCCEEDED" | "FAILED" | "REJECTED",
  sagResult: SagOrderResult = {},
): Promise<PostSyncResult> {
  log("CALLBACK_START", { organizationId, sourceRef, result });

  // ── Find the order ─────────────────────────────────────────────────────────
  const orderRef = await findOrderBySourceRef(organizationId, sourceRef);
  if (!orderRef) {
    log("ORDER_NOT_FOUND", { sourceRef });
    return { ok: false, error: `Order not found for sourceRef: ${sourceRef}` };
  }

  const orderId = orderRef.id;

  // ── Handle by result type ──────────────────────────────────────────────────

  switch (result) {
    case "SUCCEEDED": {
      const sagOrderId = sagResult.sagRef ?? sagResult.raw ?? "SAG-OK";
      await markSynced(organizationId, orderId, sagOrderId);

      log("ORDER_SYNC_SUCCESS", {
        orderId,
        sagOrderId,
        sourceRef,
      });

      return { ok: true, orderId, newStatus: "sincronizado" };
    }

    case "FAILED": {
      const sagError = sagResult.error ?? sagResult.raw ?? "Error desconocido de SAG.";
      await markConflict(organizationId, orderId, sagError);

      log("ORDER_SYNC_FAILED", {
        orderId,
        error: sagError,
        sourceRef,
      });

      return { ok: true, orderId, newStatus: "conflicto" };
    }

    case "REJECTED": {
      const reason = sagResult.rejectionReason ?? "Rechazado por revisor.";
      await markConflict(organizationId, orderId, `Rechazado: ${reason}`);

      log("ORDER_SYNC_REJECTED", {
        orderId,
        reason,
        sourceRef,
      });

      return { ok: true, orderId, newStatus: "conflicto" };
    }

    default:
      return { ok: false, error: `Unknown result: ${result}` };
  }
}
