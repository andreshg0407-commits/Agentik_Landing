/**
 * lib/comercial/pedidos/order-reservation-adapter.ts
 *
 * Adapter: OrderDraft → OperationalOrder for reservation sync.
 *
 * ── POSITION IN ARCHITECTURE ──────────────────────────────────────────────────
 *
 *   OrderDraft (Agentik wizard)
 *       ↓ (THIS FILE: adaptOrderDraftToOperationalOrder)
 *   OperationalOrder (Agentik operational model)
 *       ↓ (order-reservation-bridge.ts: syncOrderReservations)
 *   OperationalReservation (Prisma)
 *       ↓
 *   operationalAvailableQty (deducted from physical snapshot)
 *
 * ── RULES ──────────────────────────────────────────────────────────────────────
 *   - One reservation per REFERENCE per order (not per variant)
 *   - Multiple talla/color lines with the same referenceCode are aggregated
 *   - Lines with removed=true, quantity<=0, or no referenceCode are excluded
 *   - Idempotency key: [orgId, "order", orderId, REFERENCE]
 *   - TTL: 24 hours (existing order-sourced default)
 *   - borrador maps to "reserved" (not "draft") to trigger reservation creation
 *   - SIMULATION does NOT consume reservations
 *   - No SAG writes, no fiscal documents
 *
 * ── ERROR POLICY ─────────────────────────────────────────────────────────────
 *   Reservation sync is NOT best-effort for create/update/submit.
 *   Every operation returns OrderReservationOperationResult.
 *   Callers MUST inspect the result and surface it to the user.
 *
 * ── STATUS MAPPING ─────────────────────────────────────────────────────────────
 *   borrador         → reserved       → create_or_update
 *   listo_para_enviar → confirmed      → create_or_update (revalidate, NOT consume)
 *   pendiente_sag    → processing     → create_or_update
 *   sincronizado     → sent_to_erp    → consume (ONLY on real SAG success)
 *   cancelado        → cancelled      → release
 *   conflicto        → reserved       → create_or_update
 *
 * Sprint: AGENTIK-ORDERS-RESERVATION-ADAPTER-01
 */

import "server-only";

import type { OrderDraft } from "./order-types";
import type { OperationalOrder } from "@/lib/operational-data/operational-entities";
import {
  syncOrderReservations,
} from "@/lib/operational-inventory/order-reservation-bridge";
import type {
  OrderReservationSyncResult,
} from "@/lib/operational-inventory/order-reservation-bridge";

// Re-export pure functions from core (testable without server-only)
export {
  adaptOrderDraftToOperationalOrder,
  extractConflicts,
  STATUS_MAP,
  classifySyncStatus,
} from "./order-reservation-adapter-core";
export type {
  ReservationConflict,
  OrderReservationOperationResult,
  ReservationSyncSummary,
} from "./order-reservation-adapter-core";

import { adaptOrderDraftToOperationalOrder } from "./order-reservation-adapter-core";
import {
  extractConflicts,
  classifySyncStatus,
} from "./order-reservation-adapter-core";
import type {
  OrderReservationOperationResult,
  ReservationSyncSummary,
} from "./order-reservation-adapter-core";

// ── Sync result → summary mapper ────────────────────────────────────────────

function toSyncSummary(r: OrderReservationSyncResult): ReservationSyncSummary {
  return {
    created:  r.reservationsCreated.length,
    updated:  r.reservationsUpdated.length,
    released: r.reservationsReleased.length,
    consumed: r.reservationsConsumed.length,
    warnings: r.warnings,
    errors:   r.errors,
    dryRun:   r.dryRun,
  };
}

// ── Sync orchestrator ────────────────────────────────────────────────────────

export interface OrderReservationSyncOptions {
  /** "dry_run" computes without persisting; "commit" persists */
  mode: "dry_run" | "commit";
}

/**
 * Syncs reservations for an Agentik OrderDraft.
 *
 * Returns a typed result — NEVER throws silently.
 * Callers must inspect `result.ok` and handle conflicts.
 *
 * 1. Adapts OrderDraft → OperationalOrder
 * 2. Delegates to syncOrderReservations() (the canonical bridge)
 * 3. Inspects result for conflicts/errors
 * 4. Returns typed OrderReservationOperationResult
 */
export async function syncReservationsForDraft(
  draft: OrderDraft,
  opts: OrderReservationSyncOptions = { mode: "commit" },
): Promise<OrderReservationOperationResult> {
  const operationalOrder = adaptOrderDraftToOperationalOrder(draft);

  let bridgeResult: OrderReservationSyncResult;
  try {
    bridgeResult = await syncOrderReservations(operationalOrder, {
      organizationId: draft.organizationId,
      mode:           opts.mode,
      ttlSec:         86400, // 24 hours
    });
  } catch (err) {
    return {
      ok: false,
      status: "PERSISTENCE_ERROR",
      message: `Error al sincronizar reservas: ${(err as Error).message}`,
      retryable: true,
    };
  }

  // Check for conflicts (engine warnings about insufficient stock)
  const conflicts = extractConflicts(bridgeResult);
  if (conflicts.length > 0) {
    return {
      ok: false,
      status: "CONFLICT",
      conflicts,
      message: `Disponibilidad insuficiente para ${conflicts.length} referencia(s).`,
      retryable: false,
    };
  }

  // Check for bridge-level errors
  if (bridgeResult.errors.length > 0) {
    return {
      ok: false,
      status: "PERSISTENCE_ERROR",
      message: bridgeResult.errors.join("; "),
      retryable: true,
    };
  }

  const summary = toSyncSummary(bridgeResult);
  return {
    ok: true,
    status: classifySyncStatus(summary),
    sync: summary,
  };
}

/**
 * Releases all active reservations for an order.
 * Used when cancelling or deleting a draft.
 *
 * Creates a synthetic "cancelled" OperationalOrder with empty lines,
 * which causes the bridge to release all existing reservations.
 *
 * Returns typed result — caller must handle release failures.
 */
export async function releaseReservationsForOrder(
  draft: OrderDraft,
  opts: OrderReservationSyncOptions = { mode: "commit" },
): Promise<OrderReservationOperationResult> {
  const cancelledOrder: OperationalOrder = {
    id:             draft.id,
    organizationId: draft.organizationId,
    source:         "agentik",
    sourceId:       draft.id,
    syncedAt:       new Date().toISOString(),
    confidence:     1.0,
    reference:      draft.externalSyncKey,
    customerId:     draft.header.customerId || undefined,
    salesRepId:     draft.header.sellerId || undefined,
    status:         "cancelled",
    lines:          [], // Empty lines → bridge releases all existing reservations
    currency:       "COP",
    createdAt:      draft.createdAt,
    cancelledAt:    new Date().toISOString(),
  };

  let bridgeResult: OrderReservationSyncResult;
  try {
    bridgeResult = await syncOrderReservations(cancelledOrder, {
      organizationId: draft.organizationId,
      mode:           opts.mode,
      ttlSec:         86400,
    });
  } catch (err) {
    return {
      ok: false,
      status: "PERSISTENCE_ERROR",
      message: `Error al liberar reservas: ${(err as Error).message}`,
      retryable: true,
    };
  }

  const summary = toSyncSummary(bridgeResult);
  return {
    ok: true,
    status: "RELEASED",
    sync: summary,
  };
}

// Re-export for convenience
export type { OrderReservationSyncResult };
