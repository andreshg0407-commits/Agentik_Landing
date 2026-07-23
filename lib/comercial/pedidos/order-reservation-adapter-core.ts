/**
 * lib/comercial/pedidos/order-reservation-adapter-core.ts
 *
 * Pure functions for OrderDraft → OperationalOrder adapter.
 * Separated from order-reservation-adapter.ts so tests can import
 * without triggering "server-only" or Prisma dependencies.
 *
 * ── VARIANT IDENTITY DECISION ────────────────────────────────────────────────
 *
 *   Stock in Castillitos (SAG/CCS) is tracked per-reference, NOT per-variant.
 *   OperationalInventoryItem has `reference` (article code) with aggregate qty.
 *   There is no per-talla/color stock breakdown in SAG, CCS, or ProductInventoryLevel.
 *
 *   Therefore: reservations are per-reference, per-order.
 *   Variant breakdown (size, color) is preserved in:
 *     1. OrderLine (order itself) — canonical variant identity
 *     2. OperationalOrderLine.metadata — passed to bridge for audit
 *
 *   The idempotency key is: [orgId, "order", orderId, REFERENCE]
 *   Variant changes within a reference update the aggregate reservation qty.
 *
 *   When per-variant stock becomes available (future), the reservation model
 *   can be extended with variant columns and a new unique constraint.
 *
 * Sprint: AGENTIK-ORDERS-RESERVATION-ADAPTER-01
 */

import type { OrderDraft, OrderLine, OrderStatus } from "./order-types";
import type {
  OperationalOrder,
  OperationalOrderLine,
} from "@/lib/operational-data/operational-entities";

// ── Status mapping ───────────────────────────────────────────────────────────

export const STATUS_MAP: Record<OrderStatus, OperationalOrder["status"]> = {
  borrador:           "reserved",   // Create reservations on save
  listo_para_enviar:  "confirmed",  // Strengthen hold
  pendiente_sag:      "processing", // In flight
  sincronizado:       "sent_to_erp",// Consume
  cancelado:          "cancelled",  // Release
  conflicto:          "reserved",   // Re-hold
};

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Maps an Agentik OrderDraft to the OperationalOrder contract
 * expected by the reservation bridge.
 *
 * Lines preserve variant identity in metadata (size, color, lineId).
 * The bridge aggregates lines by reference for the reservation key.
 * Removed lines, zero-quantity lines, and lines without referenceCode are excluded.
 */
export function adaptOrderDraftToOperationalOrder(
  draft: OrderDraft,
): OperationalOrder {
  const activeLines = draft.lines.filter(
    l => !l.removed && l.quantity > 0 && l.referenceCode?.trim(),
  );

  const operationalLines: OperationalOrderLine[] = activeLines.map(l => ({
    reference:    l.referenceCode.toUpperCase(),
    description:  l.productName,
    qtyOrdered:   l.quantity,
    qtyDelivered: 0,
    qtyCancelled: 0,
    unitPrice:    l.unitPrice,
    metadata: {
      size:    l.size,
      color:   l.color,
      lineId:  l.id,
    },
  }));

  const totalValue = activeLines.reduce((s, l) => s + l.lineTotal, 0);

  return {
    id:             draft.id,
    organizationId: draft.organizationId,
    source:         "agentik",
    sourceId:       draft.id, // orderId IS the sourceId
    syncedAt:       draft.updatedAt,
    confidence:     1.0,
    reference:      draft.externalSyncKey,
    customerId:     draft.header.customerId || undefined,
    salesRepId:     draft.header.sellerId || undefined,
    status:         STATUS_MAP[draft.status] ?? "reserved",
    lines:          operationalLines,
    totalValue,
    currency:       "COP",
    createdAt:      draft.createdAt,
  };
}

// ── Reservation operation result ────────────────────────────────────────────

export interface ReservationSyncSummary {
  created:  number;
  updated:  number;
  released: number;
  consumed: number;
  warnings: string[];
  errors:   string[];
  dryRun:   boolean;
}

export type OrderReservationOperationResult =
  | {
      ok: true;
      status: "RESERVED" | "UPDATED" | "RELEASED" | "CONSUMED";
      sync: ReservationSyncSummary;
    }
  | {
      ok: false;
      status: "CONFLICT" | "PERSISTENCE_ERROR" | "EXPIRED" | "NO_INVENTORY_DATA";
      conflicts?: ReservationConflict[];
      message: string;
      retryable: boolean;
    };

// ── Conflict type ────────────────────────────────────────────────────────────

export interface ReservationConflict {
  reference:       string;
  requested:       number;
  available:       number;
  alreadyReserved: number;
  shortfall:       number;
}

/**
 * Extracts reservation conflicts from a sync result.
 * A conflict exists when the engine warned about insufficient stock.
 */
export function extractConflicts(
  result: { warnings: string[]; impacts: Array<{ reference: string; operationalAvailableAfter?: number; reservedQty?: number }> },
): ReservationConflict[] {
  const conflicts: ReservationConflict[] = [];

  for (const warning of result.warnings) {
    // Bridge warning format: "REFERENCE: reason (qty N capped or skipped)"
    const match = warning.match(/^([A-Z0-9\-]+):.+qty (\d+) capped/);
    if (!match) continue;

    const reference = match[1];
    const requested = parseInt(match[2], 10);

    const impact = result.impacts.find(
      i => i.reference.toUpperCase() === reference,
    );

    conflicts.push({
      reference,
      requested,
      available:       impact?.operationalAvailableAfter ?? 0,
      alreadyReserved: impact?.reservedQty ?? 0,
      shortfall:       Math.max(0, requested - (impact?.operationalAvailableAfter ?? 0)),
    });
  }

  return conflicts;
}

/**
 * Determines the operation status from a sync result.
 */
export function classifySyncStatus(
  syncResult: ReservationSyncSummary,
): "RESERVED" | "UPDATED" | "RELEASED" | "CONSUMED" {
  if (syncResult.consumed > 0) return "CONSUMED";
  if (syncResult.released > 0) return "RELEASED";
  if (syncResult.updated > 0)  return "UPDATED";
  return "RESERVED";
}
