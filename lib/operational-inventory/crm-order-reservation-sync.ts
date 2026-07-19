/**
 * lib/operational-inventory/crm-order-reservation-sync.ts
 *
 * Batch CRM Order Reservation Sync — server-side helper.
 *
 * Fetches all active CRM orders (via CrmCommercialProvider), filters to
 * those with real lines, and runs syncOrderReservations() for each.
 *
 * ─── WHEN TO CALL ─────────────────────────────────────────────────────────────
 *   — After a CRM connector sync completes (CastillitosCrmAdapter)
 *   — After a quote line ingestion run
 *   — On-demand from the sync-order API route
 *   — (Future) as a scheduled job via cron
 *
 * ─── GUARANTEES ───────────────────────────────────────────────────────────────
 *   Idempotent: safe to call multiple times — bridge handles deduplication.
 *   No SAG writes. No fiscal documents. No ERP calls.
 *
 * Sprint: AGENTIK-CRM-ORDER-RESERVATION-BRIDGE-01
 */

import { getCrmCommercialProvider }       from "@/lib/operational-data/providers/crm-commercial-provider";
import type { OperationalInventoryItem }  from "./operational-inventory-types";
import type { OperationalReservation }    from "./operational-reservation-types";
import {
  syncOrderReservations,
  _loadInventorySnapshot,
  type OrderReservationSyncResult,
}                                          from "./order-reservation-bridge";
import { prisma }                          from "@/lib/prisma";

// ─── Batch result ─────────────────────────────────────────────────────────────

export interface BatchReservationSyncResult {
  organizationId:  string;
  mode:            "dry_run" | "commit";
  ordersTotal:     number;
  ordersProcessed: number;
  ordersSkipped:   number;   // no lines
  ordersErrored:   number;
  reservationsCreated:  number;
  reservationsUpdated:  number;
  reservationsReleased: number;
  reservationsConsumed: number;
  pressureSignalsFired: number;
  warnings:        string[];
  errors:          string[];
  perOrder:        Array<{
    orderId:   string;
    sourceId:  string;
    status:    string;
    result:    OrderReservationSyncResult;
  }>;
  syncedAt:        string;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface BatchReservationSyncOptions {
  mode:   "dry_run" | "commit";
  /** Only sync orders in these statuses. Default: reserved + confirmed + cancelled + fulfilled */
  statusFilter?: Array<string>;
  /** TTL for new reservations. Default: 86400 s */
  ttlSec?: number;
  /** If true, include orders with lines.length === 0 in the result (as skipped) */
  includeEmpty?: boolean;
}

// ─── Main batch function ──────────────────────────────────────────────────────

/**
 * Syncs OperationalReservations for all active CRM orders in the organization.
 *
 * Loads inventory snapshot and all active reservations ONCE upfront,
 * then passes them to each order's sync to avoid N+1 queries.
 *
 * @param organizationId  Agentik organization id (not slug)
 * @param options         Sync mode and filters
 */
export async function syncReservationsForActiveCrmOrders(
  organizationId: string,
  options:        BatchReservationSyncOptions,
): Promise<BatchReservationSyncResult> {
  const {
    mode,
    statusFilter = ["reserved", "confirmed", "cancelled", "fulfilled", "processing"],
    ttlSec       = 86400,
  } = options;

  const syncedAt = new Date().toISOString();

  const summary: BatchReservationSyncResult = {
    organizationId,
    mode,
    ordersTotal:          0,
    ordersProcessed:      0,
    ordersSkipped:        0,
    ordersErrored:        0,
    reservationsCreated:  0,
    reservationsUpdated:  0,
    reservationsReleased: 0,
    reservationsConsumed: 0,
    pressureSignalsFired: 0,
    warnings:             [],
    errors:               [],
    perOrder:             [],
    syncedAt,
  };

  // ── Load all active orders from CRM provider ───────────────────────────────
  const provider = getCrmCommercialProvider();
  let allOrders;
  try {
    allOrders = await provider.getOrders(organizationId);
  } catch (e) {
    summary.errors.push(`Failed to load CRM orders: ${(e as Error).message}`);
    return summary;
  }

  // Filter to actionable statuses
  const orders = allOrders.filter(o => statusFilter.includes(o.status));
  summary.ordersTotal = orders.length;

  if (orders.length === 0) return summary;

  // ── Pre-load shared resources once ────────────────────────────────────────
  const [inventorySnapshot, existingReservationRows] = await Promise.all([
    _loadInventorySnapshot(organizationId),
    prisma.operationalReservation.findMany({
      where: { organizationId },
    }),
  ]);

  const existingReservations: OperationalReservation[] = existingReservationRows.map(r => ({
    id:             r.id,
    organizationId: r.organizationId,
    sourceType:     r.sourceType as OperationalReservation["sourceType"],
    sourceId:       r.sourceId,
    salesRepId:     r.salesRepId ?? undefined,
    customerId:     r.customerId ?? undefined,
    reference:      r.reference,
    description:    r.description,
    qtyReserved:    r.qtyReserved,
    qtyReleased:    r.qtyReleased,
    qtyConsumed:    r.qtyConsumed,
    status:         r.status as OperationalReservation["status"],
    reason:         r.reason,
    expiresAt:      r.expiresAt?.toISOString(),
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  }));

  // ── Process each order ────────────────────────────────────────────────────
  for (const order of orders) {
    // Skip orders with no lines (warn only if includeEmpty requested)
    if (order.lines.length === 0) {
      summary.ordersSkipped++;
      if (options.includeEmpty) {
        summary.warnings.push(`Order ${order.sourceId} skipped — no lines`);
      }
      continue;
    }

    try {
      const orderResult = await syncOrderReservations(order, {
        organizationId,
        existingReservations,
        inventorySnapshot:   inventorySnapshot as OperationalInventoryItem[],
        mode,
        ttlSec,
      });

      summary.ordersProcessed++;
      summary.reservationsCreated  += orderResult.reservationsCreated.length;
      summary.reservationsUpdated  += orderResult.reservationsUpdated.length;
      summary.reservationsReleased += orderResult.reservationsReleased.length;
      summary.reservationsConsumed += orderResult.reservationsConsumed.length;
      summary.pressureSignalsFired += orderResult.pressureSignals.length;
      summary.warnings.push(...orderResult.warnings.map(w => `[${order.sourceId}] ${w}`));
      summary.errors.push(...orderResult.errors.map(e => `[${order.sourceId}] ${e}`));

      summary.perOrder.push({
        orderId:  order.id,
        sourceId: order.sourceId,
        status:   order.status,
        result:   orderResult,
      });

      // Note: We do NOT update the shared existingReservations list after each order.
      // Since each order uses a unique sourceId, there is no overlap between
      // reservations of different orders. This keeps the batch O(n) not O(n²).
    } catch (e) {
      summary.ordersErrored++;
      summary.errors.push(
        `Order ${order.sourceId} failed: ${(e as Error).message}`,
      );
    }
  }

  return summary;
}

// ─── Dev diagnostics helper ───────────────────────────────────────────────────

export interface CrmReservationDiagnostics {
  organizationId:       string;
  totalOrderReservations: number;
  activeOrderReservations: number;
  totalQtyReservedFromCrm: number;
  refsReservedFromCrm:  number;
  overcommittedRefs:    Array<{ reference: string; qtyReserved: number; physicalQty: number }>;
  computedAt:           string;
}

/**
 * Computes a quick diagnostic snapshot for CRM-sourced reservations.
 * Useful for diagnostics panels — dev-only or admin-only.
 */
export async function computeCrmReservationDiagnostics(
  organizationId: string,
): Promise<CrmReservationDiagnostics> {
  const [reservationRows, snapshot] = await Promise.all([
    prisma.operationalReservation.findMany({
      where: { organizationId, sourceType: "order" },
      select: {
        status: true, reference: true, qtyReserved: true,
        qtyReleased: true, qtyConsumed: true,
      },
    }),
    _loadInventorySnapshot(organizationId),
  ]);

  const active = reservationRows.filter(r => r.status === "active");

  // Aggregate reserved qty by reference
  const qtyByRef = new Map<string, number>();
  for (const r of active) {
    const net = r.qtyReserved - r.qtyReleased - r.qtyConsumed;
    if (net <= 0) continue;
    const ref = r.reference.toUpperCase();
    qtyByRef.set(ref, (qtyByRef.get(ref) ?? 0) + net);
  }

  // Detect overcommitted references
  const overcommittedRefs: CrmReservationDiagnostics["overcommittedRefs"] = [];
  for (const [ref, qty] of qtyByRef) {
    const inv = (snapshot as OperationalInventoryItem[]).find(
      i => i.reference.toUpperCase() === ref,
    );
    if (inv && qty > inv.physicalQty) {
      overcommittedRefs.push({
        reference:   ref,
        qtyReserved: qty,
        physicalQty: inv.physicalQty,
      });
    }
  }

  return {
    organizationId,
    totalOrderReservations:  reservationRows.length,
    activeOrderReservations: active.length,
    totalQtyReservedFromCrm: [...qtyByRef.values()].reduce((s, v) => s + v, 0),
    refsReservedFromCrm:     qtyByRef.size,
    overcommittedRefs,
    computedAt:              new Date().toISOString(),
  };
}
