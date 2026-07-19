/**
 * lib/operational-inventory/operational-reservation-engine.ts
 *
 * Operational Reservation Engine — pure functional logic.
 *
 * ─── DESIGN PRINCIPLES ──────────────────────────────────────────────────────
 * 1. Pure functions — no Prisma, no side effects.
 *    Callers (API routes) handle persistence.
 *
 * 2. Immutability — every state change returns a NEW reservation record.
 *    The old record is never mutated. API routes persist the new state.
 *
 * 3. Impact first — every mutating function returns ReservationImpact[]
 *    so callers know exactly how operationalAvailableQty changed.
 *
 * 4. Pressure signals — returned as part of the result, not side-effected.
 *    Runtime wiring is a separate sprint.
 *
 * Sprint: AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01
 */

import type { OperationalInventoryItem } from "./operational-inventory-types";
import type {
  OperationalReservation,
  OperationalReservationLine,
  OperationalReservationSourceType,
  ReservationImpact,
  ReservationPressureSignal,
  ReservationSummary,
} from "./operational-reservation-types";
import { computePressureLevel }  from "./operational-inventory-status";

// ─── Create reservation input ─────────────────────────────────────────────────

export interface CreateReservationInput {
  organizationId: string;
  sourceType:     OperationalReservationSourceType;
  sourceId:       string;
  salesRepId?:    string;
  customerId?:    string;
  lines:          OperationalReservationLine[];
  reason:         string;
  /** TTL in seconds from now. Default: 3600 (1 hour) */
  ttlSec?:        number;
}

export interface CreateReservationResult {
  /** One reservation per line (multi-line orders create multiple reservations) */
  reservations: OperationalReservation[];
  impacts:      ReservationImpact[];
  pressureSignals: ReservationPressureSignal[];
  errors:       Array<{ reference: string; reason: string }>;
}

// ─── Create reservation ───────────────────────────────────────────────────────

/**
 * Creates operational reservations for a set of reference lines.
 *
 * Validates:
 *   - Reference exists in inventory snapshot
 *   - qtyReserved ≤ operationalAvailableQty (no overcommit)
 *
 * Returns:
 *   - One OperationalReservation per successfully validated line
 *   - ReservationImpact per line (before/after operationalAvailableQty)
 *   - ReservationPressureSignal for any line that drops below threshold
 *   - Error entries for lines that fail validation
 *
 * IMPORTANT: This function does NOT persist anything.
 *   API routes call this, then persist via Prisma.
 */
export function createReservations(
  input:                CreateReservationInput,
  inventorySnapshot:    OperationalInventoryItem[],
  existingReservations: OperationalReservation[],
): CreateReservationResult {
  const now      = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (input.ttlSec ?? 3600) * 1000).toISOString();

  // Build a mutable map of current reserved qty per reference
  const reservedByRef = computeReservedQtyByReference(existingReservations);

  const reservations: OperationalReservation[] = [];
  const impacts:      ReservationImpact[]       = [];
  const pressureSignals: ReservationPressureSignal[] = [];
  const errors: Array<{ reference: string; reason: string }> = [];

  for (const line of input.lines) {
    const refUpper = line.reference.toUpperCase();
    const inv = inventorySnapshot.find(i => i.reference.toUpperCase() === refUpper);

    if (!inv) {
      errors.push({ reference: line.reference, reason: "Referencia no encontrada en inventario operacional" });
      continue;
    }

    const currentReserved = reservedByRef.get(refUpper) ?? 0;
    const operationalAvailableBefore = Math.max(
      0,
      inv.physicalQty - currentReserved - inv.salesAssignedQty - inv.pendingTransfersQty,
    );

    if (line.qty > operationalAvailableBefore) {
      errors.push({
        reference: line.reference,
        reason:    `Cantidad solicitada (${line.qty}) supera disponible operacional (${operationalAvailableBefore})`,
      });
      continue;
    }

    // Build reservation
    const reservation: OperationalReservation = {
      id:             generateId(),
      organizationId: input.organizationId,
      sourceType:     input.sourceType,
      sourceId:       input.sourceId,
      salesRepId:     input.salesRepId ?? line.salesRepId,
      customerId:     input.customerId,
      reference:      refUpper,
      description:    inv.description,
      qtyReserved:    line.qty,
      qtyReleased:    0,
      qtyConsumed:    0,
      status:         "active",
      reason:         input.reason,
      expiresAt,
      createdAt:      now,
      updatedAt:      now,
    };

    // Compute availability AFTER this reservation
    const newReserved = currentReserved + line.qty;
    const operationalAvailableAfter = Math.max(
      0,
      inv.physicalQty - newReserved - inv.salesAssignedQty - inv.pendingTransfersQty,
    );

    // Compute pressure impact
    const mockItemAfter: OperationalInventoryItem = {
      ...inv,
      reservedQty:             newReserved,
      operationalAvailableQty: operationalAvailableAfter,
    };
    const newPressureLevel = computePressureLevel(mockItemAfter);
    const pressureTriggered = operationalAvailableAfter === 0 || newPressureLevel === "alta" || newPressureLevel === "media";

    const impact: ReservationImpact = {
      reference:                  refUpper,
      physicalQty:                inv.physicalQty,
      reservedQty:                newReserved,
      salesAssignedQty:           inv.salesAssignedQty,
      operationalAvailableBefore,
      operationalAvailableAfter,
      pressureTriggered,
      pressureLevel:              newPressureLevel,
    };

    // Emit pressure signal if triggered
    if (pressureTriggered) {
      const triggerType = operationalAvailableAfter === 0
        ? "depleted"
        : newReserved > inv.physicalQty
          ? "overcommitted"
          : "below_minimum";

      pressureSignals.push({
        organizationId:           input.organizationId,
        reference:                refUpper,
        description:              inv.description,
        triggeredByReservationId: reservation.id,
        triggerType,
        availableAfter:           operationalAvailableAfter,
        reservedQty:              newReserved,
        physicalQty:              inv.physicalQty,
        pressureLevel:            newPressureLevel === "ninguna" ? "baja" : newPressureLevel,
        salesRepId:               reservation.salesRepId,
        emittedAt:                now,
      });
    }

    // Advance the mutable map for subsequent lines in same request
    reservedByRef.set(refUpper, newReserved);

    reservations.push(reservation);
    impacts.push(impact);
  }

  return { reservations, impacts, pressureSignals, errors };
}

// ─── Release reservation ──────────────────────────────────────────────────────

export interface ReservationActionResult {
  reservation: OperationalReservation;
  impact:      ReservationImpact;
}

/**
 * Releases an active reservation — returns units to the operational pool.
 * Called when an order is cancelled or a portfolio assignment is removed.
 *
 * Returns the updated reservation record (not persisted — caller must save).
 */
export function releaseReservation(
  reservation:       OperationalReservation,
  inventorySnapshot: OperationalInventoryItem[],
  existingReservations: OperationalReservation[],
): ReservationActionResult {
  if (reservation.status !== "active") {
    // Already released/consumed — return no-op
    return { reservation, impact: buildNoOpImpact(reservation, inventorySnapshot) };
  }

  const now = new Date().toISOString();
  const updated: OperationalReservation = {
    ...reservation,
    qtyReleased: reservation.qtyReserved - reservation.qtyConsumed,
    status:      "released",
    updatedAt:   now,
  };

  return {
    reservation: updated,
    impact:      _computeReleaseImpact(reservation, inventorySnapshot, existingReservations),
  };
}

// ─── Consume reservation ──────────────────────────────────────────────────────

/**
 * Marks a reservation as consumed — units are now committed to SAG PD.
 * Called when an order transitions to sent_to_sag.
 *
 * Does NOT deduct from physical inventory (SAG owns that when PD is issued).
 */
export function consumeReservation(
  reservation: OperationalReservation,
): OperationalReservation {
  if (reservation.status !== "active") return reservation;
  const now = new Date().toISOString();
  return {
    ...reservation,
    qtyConsumed: reservation.qtyReserved,
    status:      "consumed",
    updatedAt:   now,
  };
}

// ─── Cancel reservation ───────────────────────────────────────────────────────

/**
 * Cancels a reservation with an explicit reason.
 * Equivalent to release but with status "cancelled" for audit clarity.
 */
export function cancelReservation(
  reservation: OperationalReservation,
  reason:      string,
): OperationalReservation {
  if (reservation.status !== "active") return reservation;
  const now = new Date().toISOString();
  return {
    ...reservation,
    qtyReleased: reservation.qtyReserved - reservation.qtyConsumed,
    status:      "cancelled",
    reason,
    updatedAt:   now,
  };
}

// ─── Expire reservations ──────────────────────────────────────────────────────

/**
 * Scans active reservations and marks expired ones.
 * Returns only the reservations that were changed (to minimize DB writes).
 *
 * Call this from a periodic job or before computing operational availability.
 */
export function expireReservations(
  reservations: OperationalReservation[],
  now:          Date = new Date(),
): OperationalReservation[] {
  const nowIso = now.toISOString();
  return reservations
    .filter(r => r.status === "active" && r.expiresAt && r.expiresAt < nowIso)
    .map(r => ({
      ...r,
      qtyReleased: r.qtyReserved - r.qtyConsumed,
      status:      "expired" as const,
      updatedAt:   nowIso,
    }));
}

// ─── Reserved qty by reference ────────────────────────────────────────────────

/**
 * Aggregates active reservations into a map: UPPERCASE reference → total active qtyReserved.
 *
 * Only "active" reservations deduct from availability.
 * released / consumed / expired / cancelled do NOT count.
 *
 * This is the primary input to operationalAvailableQty computation.
 */
export function computeReservedQtyByReference(
  reservations: OperationalReservation[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of reservations) {
    if (r.status !== "active") continue;
    const key = r.reference.toUpperCase();
    const active = r.qtyReserved - r.qtyReleased - r.qtyConsumed;
    if (active <= 0) continue;
    map.set(key, (map.get(key) ?? 0) + active);
  }
  return map;
}

// ─── Apply reservations to inventory snapshot ─────────────────────────────────

/**
 * Takes an inventory snapshot and a set of active reservations,
 * and returns an updated snapshot with reservedQty and operationalAvailableQty
 * reflecting the Agentik reservation layer.
 *
 * This is the core of the Operational Inventory integration with the
 * reservation engine. Call this in the boundary before returning inventory
 * to consumers.
 */
export function applyReservationsToInventory(
  items:        OperationalInventoryItem[],
  reservations: OperationalReservation[],
): OperationalInventoryItem[] {
  const reservedByRef = computeReservedQtyByReference(reservations);
  if (reservedByRef.size === 0) return items;

  return items.map(item => {
    const agentikReserved = reservedByRef.get(item.reference.toUpperCase()) ?? 0;
    if (agentikReserved === 0) return item;

    const newReservedQty = item.reservedQty + agentikReserved;
    const newOperationalAvailableQty = Math.max(
      0,
      item.physicalQty - newReservedQty - item.salesAssignedQty - item.pendingTransfersQty,
    );

    return {
      ...item,
      reservedQty:             newReservedQty,
      operationalAvailableQty: newOperationalAvailableQty,
    };
  });
}

// ─── Reservation summary ──────────────────────────────────────────────────────

/**
 * Computes a summary of reservation state for diagnostics.
 */
export function computeReservationSummary(
  organizationId: string,
  reservations:   OperationalReservation[],
  inventory:      OperationalInventoryItem[],
): ReservationSummary {
  const now     = new Date().toISOString();
  const active  = reservations.filter(r => r.status === "active");
  const expired = reservations.filter(r => r.status === "expired");

  const totalUnitsReserved = active.reduce(
    (sum, r) => sum + (r.qtyReserved - r.qtyReleased - r.qtyConsumed),
    0,
  );

  const reservedByRef = computeReservedQtyByReference(active);
  let refsUnderPressure = 0;
  for (const [ref, qty] of reservedByRef) {
    const inv = inventory.find(i => i.reference.toUpperCase() === ref);
    if (!inv) continue;
    const availAfter = Math.max(0, inv.physicalQty - qty - inv.salesAssignedQty - inv.pendingTransfersQty);
    if (availAfter === 0) refsUnderPressure++;
  }

  const bySourceType = { order: 0, portfolio: 0, manual: 0, transfer: 0 };
  for (const r of active) bySourceType[r.sourceType]++;

  return {
    organizationId,
    totalActive:        active.length,
    totalUnitsReserved,
    refsUnderPressure,
    expiredCount:       expired.length,
    bySourceType,
    computedAt:         now,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  // Deterministic enough for non-DB scenarios; Prisma uses cuid() for real IDs
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildNoOpImpact(
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

function _computeReleaseImpact(
  r:            OperationalReservation,
  snapshot:     OperationalInventoryItem[],
  existingReservations: OperationalReservation[],
): ReservationImpact {
  const inv = snapshot.find(i => i.reference.toUpperCase() === r.reference.toUpperCase());
  if (!inv) return buildNoOpImpact(r, snapshot);

  const activeQtyBefore = computeReservedQtyByReference(existingReservations).get(r.reference.toUpperCase()) ?? 0;
  const releasing = r.qtyReserved - r.qtyReleased - r.qtyConsumed;
  const activeQtyAfter = Math.max(0, activeQtyBefore - releasing);

  const before = Math.max(0, inv.physicalQty - activeQtyBefore - inv.salesAssignedQty - inv.pendingTransfersQty);
  const after  = Math.max(0, inv.physicalQty - activeQtyAfter  - inv.salesAssignedQty - inv.pendingTransfersQty);

  const mockItemAfter: OperationalInventoryItem = {
    ...inv,
    reservedQty:             activeQtyAfter,
    operationalAvailableQty: after,
  };

  return {
    reference:                  r.reference.toUpperCase(),
    physicalQty:                inv.physicalQty,
    reservedQty:                activeQtyAfter,
    salesAssignedQty:           inv.salesAssignedQty,
    operationalAvailableBefore: before,
    operationalAvailableAfter:  after,
    pressureTriggered:          false,
    pressureLevel:              computePressureLevel(mockItemAfter),
  };
}
