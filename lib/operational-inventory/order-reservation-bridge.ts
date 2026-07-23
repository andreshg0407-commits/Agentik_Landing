/**
 * lib/operational-inventory/order-reservation-bridge.ts
 *
 * CRM Order → Operational Reservation Bridge.
 *
 * ─── POSITION IN ARCHITECTURE ────────────────────────────────────────────────
 *
 *   CRMQuote + CRMQuoteLine (Prisma)
 *       ↓ (CrmCommercialProvider)
 *   OperationalOrder (with real .lines)
 *       ↓ (THIS FILE)
 *   OperationalReservation (Prisma)
 *       ↓
 *   operationalAvailableQty (deducted from SAG physical snapshot)
 *       ↓
 *   Sales Portfolio pressure → David / Diego / Copilot
 *
 * ─── RULE ─────────────────────────────────────────────────────────────────────
 *   This bridge is the ONLY authorized path for converting CRM orders into
 *   Agentik operational reservations.
 *
 *   SAG is NOT involved. No PD is created. No fiscal document is touched.
 *   This is Agentik's pre-ERP soft-hold layer.
 *
 * ─── IDEMPOTENCY ──────────────────────────────────────────────────────────────
 *   Each reservation is keyed by:
 *     organizationId + sourceType="order" + sourceId (CRM order ID) + reference
 *
 *   Running sync multiple times for the same order is safe.
 *   If qty changes, the reservation is updated.
 *   If the order is cancelled, existing reservations are released.
 *   If the order is fulfilled, existing reservations are consumed.
 *
 * ─── MODES ────────────────────────────────────────────────────────────────────
 *   dry_run — computes all intents and returns the result without persisting.
 *   commit  — persists creates/updates/releases/consumes via Prisma.
 *
 * Sprint: AGENTIK-CRM-ORDER-RESERVATION-BRIDGE-01
 */

import { prisma }                      from "@/lib/prisma";
import { loadLatestCCSBatch }          from "@/lib/commercial-intelligence/ccs-reader";
import type { OperationalOrder,
              OperationalOrderLine }   from "@/lib/operational-data/operational-entities";
import type { OperationalInventoryItem } from "./operational-inventory-types";
import type {
  OperationalReservation,
  ReservationImpact,
  ReservationPressureSignal,
}                                       from "./operational-reservation-types";
import {
  createReservations,
  releaseReservation,
  consumeReservation,
}                                       from "./operational-reservation-engine";
import { mapSagInventoryToOperational } from "./sag-to-operational-mapper";

// ─── Status → action mapping ──────────────────────────────────────────────────

export type ReservationActionIntent =
  | "create_or_update"
  | "release"
  | "consume"
  | "noop";

/**
 * Determines what reservation action to take based on the operational order status.
 *
 *   draft           → noop            (not committed yet)
 *   reserved        → create_or_update (sent to customer — soft hold)
 *   confirmed       → create_or_update (customer accepted — strong hold)
 *   sent_to_erp     → consume          (committed to SAG — units locked)
 *   processing      → create_or_update (in flight — Agentik still owns)
 *   fulfilled       → consume          (delivered — units consumed)
 *   cancelled       → release          (order cancelled — free units)
 *   returned        → release          (safe fallback)
 */
export function getReservationActionForOrderStatus(
  status: OperationalOrder["status"],
): ReservationActionIntent {
  switch (status) {
    case "draft":        return "noop";
    case "reserved":     return "create_or_update";
    case "confirmed":    return "create_or_update";
    case "sent_to_erp":  return "consume";
    case "processing":   return "create_or_update";
    case "fulfilled":    return "consume";
    case "cancelled":    return "release";
    case "returned":     return "release";
    default:             return "noop";
  }
}

// ─── Pure aggregation ─────────────────────────────────────────────────────────

/**
 * Aggregates order lines by reference.
 * Multiple lines for the same reference are summed.
 * Net qty = qtyOrdered − qtyCancelled. Lines with net qty ≤ 0 are excluded.
 */
export function aggregateOrderLinesByReference(
  lines: OperationalOrderLine[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const ref = line.reference.toUpperCase();
    const net = Math.max(0, line.qtyOrdered - (line.qtyCancelled ?? 0));
    if (net <= 0) continue;
    map.set(ref, (map.get(ref) ?? 0) + net);
  }
  return map;
}

// ─── Intent types ─────────────────────────────────────────────────────────────

export interface LineReservationIntent {
  reference:           string;
  /** Aggregated net qty from all order lines for this reference */
  totalQty:            number;
  action:              ReservationActionIntent;
  /** Existing active reservation for this order+reference, if any */
  existingReservation: OperationalReservation | null;
  /** True if existing reservation exists but qty changed */
  qtyChanged:          boolean;
  /** True if no persistence action is needed */
  isNoop:              boolean;
}

// ─── Pure intent computation ──────────────────────────────────────────────────

/**
 * Computes the reservation intent for each reference in an order.
 * Pure function — no DB access.
 *
 * Rules:
 *   — Lines present in order with qty > 0 → create/update/consume/release per status
 *   — Lines that disappeared from order (ref in existing reservations but not in lines)
 *     → always release (line was removed)
 */
export function computeOrderReservationIntent(
  order:                     OperationalOrder,
  existingOrderReservations: OperationalReservation[],
): LineReservationIntent[] {
  const globalAction = getReservationActionForOrderStatus(order.status);
  const qtyByRef     = aggregateOrderLinesByReference(order.lines);
  const intents:       LineReservationIntent[] = [];

  // Lines present in order
  for (const [reference, totalQty] of qtyByRef) {
    const existing = existingOrderReservations.find(
      r => r.reference.toUpperCase() === reference && r.status === "active",
    ) ?? null;

    let action:    ReservationActionIntent = globalAction;
    let qtyChanged = false;
    let isNoop     = false;

    if (globalAction === "noop") {
      isNoop = true;
    } else if (globalAction === "create_or_update") {
      if (!existing) {
        // nothing yet → create
      } else if (existing.qtyReserved !== Math.round(totalQty)) {
        qtyChanged = true; // qty drifted → update
      } else {
        isNoop = true; // already matches → skip
      }
    } else if (globalAction === "release") {
      isNoop = !existing; // nothing to release
    } else if (globalAction === "consume") {
      isNoop = !existing; // nothing to consume
    }

    intents.push({ reference, totalQty, action, existingReservation: existing, qtyChanged, isNoop });
  }

  // References that existed in reservations but are no longer in the order lines
  // → their line was removed → release unconditionally
  for (const r of existingOrderReservations) {
    if (r.status !== "active") continue;
    const ref = r.reference.toUpperCase();
    if (!qtyByRef.has(ref)) {
      intents.push({
        reference:           ref,
        totalQty:            0,
        action:              "release",
        existingReservation: r,
        qtyChanged:          false,
        isNoop:              false,
      });
    }
  }

  return intents;
}

// ─── Sync options & result ────────────────────────────────────────────────────

export interface OrderReservationSyncOptions {
  organizationId:       string;
  /**
   * Existing active reservations for this org.
   * If not provided, loaded from Prisma on demand (two queries).
   */
  existingReservations?: OperationalReservation[];
  /**
   * SAG inventory snapshot.
   * If not provided, loaded from CommercialCoverageSnapshot.
   */
  inventorySnapshot?:   OperationalInventoryItem[];
  /** dry_run: compute intent, return result, persist nothing */
  mode:                 "dry_run" | "commit";
  /** TTL for new order-driven reservations. Default: 86400 s (24 h) */
  ttlSec?:              number;
  /** Internal: set by transaction wrapper to prevent re-entry */
  _inTransaction?:      boolean;
  /** Internal: Prisma transaction client. Set by transaction wrapper */
  _db?:                 any;
}

export interface OrderReservationSyncResult {
  orderId:              string;
  sourceId:             string;
  orderStatus:          OperationalOrder["status"];
  /** Global action derived from order status */
  action:               ReservationActionIntent;
  reservationsCreated:  OperationalReservation[];
  reservationsUpdated:  OperationalReservation[];
  reservationsReleased: OperationalReservation[];
  reservationsConsumed: OperationalReservation[];
  impacts:              ReservationImpact[];
  pressureSignals:      ReservationPressureSignal[];
  warnings:             string[];
  errors:               string[];
  dryRun:               boolean;
}

// ─── Main sync function ───────────────────────────────────────────────────────

/**
 * Syncs OperationalReservations for a single CRM-sourced OperationalOrder.
 *
 * Idempotent: safe to call multiple times for the same order.
 * Unique key per reservation: organizationId + "order" + sourceId + reference.
 *
 * Does NOT touch SAG.
 * Does NOT create fiscal documents.
 * Does NOT send orders to ERP.
 */
export async function syncOrderReservations(
  order:   OperationalOrder,
  options: OrderReservationSyncOptions,
): Promise<OrderReservationSyncResult> {
  const { organizationId, mode, ttlSec = 86400 } = options;

  // ── Transaction wrapper for commit mode ──────────────────────────────────
  // Uses PostgreSQL advisory locks to serialize concurrent reservations
  // for the same references, preventing overcommit.
  if (mode === "commit" && !options._inTransaction) {
    const inventorySnapshot =
      options.inventorySnapshot ?? await _loadInventorySnapshot(organizationId);

    return prisma.$transaction(async (tx) => {
      // Determine references to lock (from order lines + existing reservations)
      const orderRefs = [...aggregateOrderLinesByReference(order.lines).keys()];
      const existingRows = await tx.operationalReservation.findMany({
        where: { organizationId, sourceType: "order", sourceId: order.sourceId },
        select: { reference: true },
      });
      const existingRefs = existingRows.map(
        (r: { reference: string }) => r.reference.toUpperCase(),
      );
      const allRefs = [...new Set([...orderRefs, ...existingRefs])].sort();

      // Acquire per-reference advisory locks (sorted to prevent deadlocks).
      // pg_advisory_xact_lock is released when the transaction commits/rolls back.
      for (const ref of allRefs) {
        const lockKey = `${organizationId}:reservation:${ref}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      }

      // Execute sync within the locked, transactional context
      return syncOrderReservations(order, {
        ...options,
        inventorySnapshot,
        _inTransaction: true,
        _db:            tx,
      });
    }, { timeout: 15000 });
  }

  const db: any = options._db ?? prisma;

  const result: OrderReservationSyncResult = {
    orderId:              order.id,
    sourceId:             order.sourceId,
    orderStatus:          order.status,
    action:               getReservationActionForOrderStatus(order.status),
    reservationsCreated:  [],
    reservationsUpdated:  [],
    reservationsReleased: [],
    reservationsConsumed: [],
    impacts:              [],
    pressureSignals:      [],
    warnings:             [],
    errors:               [],
    dryRun:               mode === "dry_run",
  };

  // Guard: no lines — nothing to reserve (unless releasing for cancelled order)
  const globalAction = getReservationActionForOrderStatus(order.status);
  if (order.lines.length === 0 && globalAction !== "release") {
    result.warnings.push(
      `Order ${order.sourceId} has no lines. Run quote line ingestion first.`,
    );
    return result;
  }

  // Load existing reservations for this specific order
  const existingForOrder: OperationalReservation[] =
    options.existingReservations
      ? options.existingReservations.filter(
          r => r.sourceType === "order" && r.sourceId === order.sourceId,
        )
      : await _loadOrderReservations(organizationId, order.sourceId, db);

  // Load inventory snapshot
  const inventorySnapshot: OperationalInventoryItem[] =
    options.inventorySnapshot ?? await _loadInventorySnapshot(organizationId);

  // Load all active reservations (needed for engine availability math)
  const allActive: OperationalReservation[] =
    options.existingReservations
      ? options.existingReservations.filter(r => r.status === "active")
      : await _loadAllActiveReservations(organizationId, db);

  // Compute intent
  const intents = computeOrderReservationIntent(order, existingForOrder);

  if (intents.every(i => i.isNoop)) return result; // nothing to do

  // Exclude this order's own reservations from availability calculation
  // to prevent self-reservation double-counting when updating quantities.
  const allActiveExcludingSelf = allActive.filter(
    r => !(r.sourceType === "order" && r.sourceId === order.sourceId),
  );

  const now = new Date();

  for (const intent of intents) {
    if (intent.isNoop) continue;

    const { reference, totalQty, action, existingReservation, qtyChanged } = intent;

    // ── create or update ─────────────────────────────────────────────────────
    if (action === "create_or_update") {
      const roundedQty = Math.max(1, Math.round(totalQty));
      const inv = inventorySnapshot.find(i => i.reference.toUpperCase() === reference);

      if (!inv) {
        result.warnings.push(
          `Reference ${reference} not in inventory snapshot — reservation skipped`,
        );
        continue;
      }

      // Use engine to compute impact + pressure signals
      // Pass allActiveExcludingSelf so the engine doesn't count this order's
      // existing reservation as "already taken" — prevents false overcommit errors
      // when updating an order's quantity upward.
      const engineResult = createReservations(
        {
          organizationId,
          sourceType: "order",
          sourceId:   order.sourceId,
          salesRepId: order.salesRepId,
          customerId: order.customerId,
          reason:     `CRM order ${order.reference} — ${order.status}`,
          ttlSec,
          lines: [{ reference, qty: roundedQty, salesRepId: order.salesRepId }],
        },
        inventorySnapshot,
        allActiveExcludingSelf,
      );

      result.pressureSignals.push(...engineResult.pressureSignals);

      if (engineResult.errors.length > 0) {
        result.warnings.push(
          ...engineResult.errors.map(
            e => `${e.reference}: ${e.reason} (qty ${roundedQty} capped or skipped)`,
          ),
        );
        // Treat overcommit as warning, not hard error — still persist with available qty
        // If engine returned 0 reservations, skip
        if (engineResult.reservations.length === 0) continue;
      }

      const engineReservation = engineResult.reservations[0];
      result.impacts.push(...engineResult.impacts);

      if (mode === "commit") {
        if (existingReservation && qtyChanged) {
          // Update existing reservation qty
          const updated = await db.operationalReservation.update({
            where: { id: existingReservation.id },
            data: {
              qtyReserved: roundedQty,
              reason:      `CRM order ${order.reference} — ${order.status} (updated)`,
              expiresAt:   new Date(now.getTime() + ttlSec * 1000),
              status:      "active",
              updatedAt:   now,
            },
          });
          result.reservationsUpdated.push(_prismaToOperational(updated));
        } else if (!existingReservation) {
          // Upsert new (handles race conditions gracefully)
          const upserted = await db.operationalReservation.upsert({
            where: {
              organizationId_sourceType_sourceId_reference: {
                organizationId,
                sourceType: "order",
                sourceId:   order.sourceId,
                reference,
              },
            },
            update: {
              qtyReserved: roundedQty,
              salesRepId:  order.salesRepId ?? null,
              customerId:  order.customerId ?? null,
              description: inv.description,
              reason:      `CRM order ${order.reference} — ${order.status}`,
              expiresAt:   new Date(now.getTime() + ttlSec * 1000),
              status:      "active",
              updatedAt:   now,
            },
            create: {
              id:             engineReservation.id,
              organizationId,
              sourceType:     "order",
              sourceId:       order.sourceId,
              salesRepId:     order.salesRepId ?? null,
              customerId:     order.customerId ?? null,
              reference,
              description:    inv.description,
              qtyReserved:    roundedQty,
              qtyReleased:    0,
              qtyConsumed:    0,
              status:         "active",
              reason:         `CRM order ${order.reference} — ${order.status}`,
              expiresAt:      new Date(now.getTime() + ttlSec * 1000),
              createdAt:      now,
              updatedAt:      now,
            },
          });
          result.reservationsCreated.push(_prismaToOperational(upserted));
        }
        // else: same qty — already handled as isNoop before reaching this branch
      } else {
        // dry_run
        if (existingReservation && qtyChanged) {
          result.reservationsUpdated.push({
            ...existingReservation,
            qtyReserved: roundedQty,
            updatedAt:   now.toISOString(),
          });
        } else if (!existingReservation) {
          result.reservationsCreated.push(engineReservation);
        }
      }
    }

    // ── release ───────────────────────────────────────────────────────────────
    else if (action === "release" && existingReservation) {
      const releaseResult = releaseReservation(existingReservation, inventorySnapshot, allActive);
      result.impacts.push(releaseResult.impact);

      if (mode === "commit") {
        await db.operationalReservation.update({
          where: { id: existingReservation.id },
          data: {
            qtyReleased: releaseResult.reservation.qtyReleased,
            status:      "released",
            updatedAt:   now,
          },
        });
      }
      result.reservationsReleased.push(releaseResult.reservation);
    }

    // ── consume ───────────────────────────────────────────────────────────────
    else if (action === "consume" && existingReservation) {
      const consumed = consumeReservation(existingReservation);
      result.impacts.push(_buildNoOpImpact(existingReservation, inventorySnapshot));

      if (mode === "commit") {
        await db.operationalReservation.update({
          where: { id: existingReservation.id },
          data: {
            qtyConsumed: consumed.qtyConsumed,
            status:      "consumed",
            updatedAt:   now,
          },
        });
      }
      result.reservationsConsumed.push(consumed);
    }
  }

  return result;
}

// ─── Internal loaders ─────────────────────────────────────────────────────────

async function _loadOrderReservations(
  organizationId: string,
  sourceId:       string,
  db:             any = prisma,
): Promise<OperationalReservation[]> {
  const rows = await db.operationalReservation.findMany({
    where: { organizationId, sourceType: "order", sourceId },
  });
  return rows.map(_prismaToOperational);
}

async function _loadAllActiveReservations(
  organizationId: string,
  db:             any = prisma,
): Promise<OperationalReservation[]> {
  const rows = await db.operationalReservation.findMany({
    where: { organizationId, status: "active" },
  });
  return rows.map(_prismaToOperational);
}

/**
 * Loads the most recent CCS batch and maps to OperationalInventoryItem[].
 * Delegates batch loading to the canonical ccs-reader.
 */
export async function _loadInventorySnapshot(
  organizationId: string,
): Promise<OperationalInventoryItem[]> {
  try {
    const batch = await loadLatestCCSBatch(organizationId);
    if (batch.rows.length === 0) return [];

    return mapSagInventoryToOperational(
      batch.rows.map(r => ({
        reference:           r.refCode.toUpperCase(),
        description:         r.description,
        line:                r.line as "LT" | "CS",
        category:            "",
        productType:         "",
        initialWarehouseQty: r.disponible + (r.pendingOrdersQty ?? 0),
        reservedQty:         r.pendingOrdersQty ?? 0,
        availableForCases:   r.disponible,
        pendingPDQty:        r.pendingOrdersQty ?? 0,
        apCleanupQty:        0,
      })),
      "sag_excel_import",
      batch.snapshotAt ?? undefined,
    );
  } catch {
    return [];
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _prismaToOperational(r: {
  id: string; organizationId: string; sourceType: string; sourceId: string;
  salesRepId: string | null; customerId: string | null; reference: string;
  description: string; qtyReserved: number; qtyReleased: number; qtyConsumed: number;
  status: string; reason: string; expiresAt: Date | null;
  createdAt: Date; updatedAt: Date;
}): OperationalReservation {
  return {
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
  };
}

function _buildNoOpImpact(
  r:        OperationalReservation,
  snapshot: OperationalInventoryItem[],
): ReservationImpact {
  const inv = snapshot.find(i => i.reference.toUpperCase() === r.reference.toUpperCase());
  const qty = inv?.operationalAvailableQty ?? 0;
  return {
    reference:                  r.reference,
    physicalQty:                inv?.physicalQty ?? 0,
    reservedQty:                inv?.reservedQty ?? 0,
    salesAssignedQty:           inv?.salesAssignedQty ?? 0,
    operationalAvailableBefore: qty,
    operationalAvailableAfter:  qty,
    pressureTriggered:          false,
    pressureLevel:              "ninguna",
  };
}
