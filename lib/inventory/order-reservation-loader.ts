/**
 * lib/inventory/order-reservation-loader.ts
 *
 * Loads pending Agentik order reservations for a product reference.
 * Used by the CommercialProductDrawer to show:
 *   - Reservado Agentik pendiente (units committed but not yet in SAG)
 *   - Expandable list of orders that compose the reservation
 *
 * Data sources:
 *   OperationalReservation (status="active", sourceType="order")
 *   AgentExecution (metadataJson for order header/status)
 *
 * ── STATES THAT RESERVE (04A6B1 correction) ──────────────────────────────────
 *   Only committed/approved orders reserve inventory:
 *     listo_para_enviar, pendiente_sag, conflicto (reintentable), enviando
 *
 *   Do NOT reserve:
 *     borrador, cancelado, sincronizado+absorbed, facturado/cerrado
 *
 * ── HANDOFF (04A6B1 SAG-006) ─────────────────────────────────────────────────
 *   syncState=sincronizado + sagOrderId = SAG_ACK_WAITING_INVENTORY_REFRESH
 *   Still counts as local reservation until a post-confirmation inventory
 *   snapshot is observed. This pipeline does NOT yet verify the snapshot,
 *   so these orders remain in the pending count (conservative, no gap).
 *   Debt: SAG-006 — implement snapshot verification for handoff.
 *
 * ── FAIL-CLOSED (04A6B1) ─────────────────────────────────────────────────────
 *   On query error: reservadoAgentikPendiente = null (NOT 0).
 *   Callers must not compute disponibleParaPrometer from null.
 *
 * server-only — uses Prisma.
 *
 * Sprint: INVENTORY-DRAWER-ORDER-RESERVATION-04A6B
 * Correction: INVENTORY-DRAWER-ORDER-RESERVATION-04A6B1
 */

import "server-only";

import { prisma } from "@/lib/prisma";

// ── States that represent committed orders ──────────────────────────────────

/** Order statuses that commit inventory (approved, not draft/cancelled) */
const COMMITTED_ORDER_STATUSES = new Set([
  "listo_para_enviar",
  "pendiente_sag",
  "conflicto",        // reintentable — still committed
]);

/** Order statuses that explicitly do NOT reserve */
const EXCLUDED_ORDER_STATUSES = new Set([
  "borrador",
  "cancelado",
  "sincronizado",     // fully absorbed by SAG (only if snapshot verified — see SAG-006)
]);

// ── Result types ────────────────────────────────────────────────────────────

export interface PendingOrderReservation {
  reservationId: string;
  orderId: string;
  consecutivo: number;
  customerName: string;
  qtyReserved: number;
  qtyReleased: number;
  qtyConsumed: number;
  /** Net active units: reserved - released - consumed */
  qtyActive: number;
  orderStatus: string;
  syncState: string;
  sagOrderId: string | null;
  createdAt: string;
  /** Talla/color from order lines if applicable */
  variants: string[];
}

export interface OrderReservationSummary {
  reference: string;
  /**
   * Total active units reserved by committed Agentik orders.
   * null = query failed (fail-closed — do NOT treat as 0).
   */
  reservadoAgentikPendiente: number | null;
  /** Individual orders composing the reservation */
  orders: PendingOrderReservation[];
  /** True if reservation query succeeded */
  loaded: boolean;
  /** Error message if query failed */
  error: string | null;
}

// ── Loader ──────────────────────────────────────────────────────────────────

export async function loadOrderReservations(
  organizationId: string,
  reference: string,
): Promise<OrderReservationSummary> {
  const upper = reference.toUpperCase().trim();

  try {
    // 1. Find active reservations for this reference from orders
    const reservations = await (prisma as any).operationalReservation.findMany({
      where: {
        organizationId,
        reference: upper,
        sourceType: "order",
        status: "active",
      },
      select: {
        id: true,
        sourceId: true,
        qtyReserved: true,
        qtyReleased: true,
        qtyConsumed: true,
        createdAt: true,
      },
    });

    if (reservations.length === 0) {
      return {
        reference: upper,
        reservadoAgentikPendiente: 0,
        orders: [],
        loaded: true,
        error: null,
      };
    }

    // 2. Load order details from AgentExecution
    const orderIds = [...new Set(reservations.map((r: any) => r.sourceId))];
    const executions = await (prisma as any).agentExecution.findMany({
      where: {
        id: { in: orderIds },
        tenantId: organizationId,
        module: "comercial",
        operation: "COMERCIAL_ORDER_DRAFT",
      },
      select: {
        id: true,
        metadataJson: true,
      },
    });

    const execMap = new Map<string, any>();
    for (const ex of executions) {
      execMap.set(ex.id, ex.metadataJson);
    }

    // 3. Build results — only committed orders
    const orders: PendingOrderReservation[] = [];
    let totalPending = 0;

    for (const res of reservations) {
      const qtyActive = res.qtyReserved - res.qtyReleased - res.qtyConsumed;
      if (qtyActive <= 0) continue; // Fully released/consumed

      const meta = execMap.get(res.sourceId);
      const orderStatus = meta?.status ?? "desconocido";
      const syncState = meta?.syncState ?? "desconocido";
      const sagOrderId = meta?.sagOrderId ?? null;

      // 04A6B1: Only committed orders reserve inventory
      // borrador does NOT reserve — it's a draft, not a commitment
      if (orderStatus === "borrador") continue;
      if (orderStatus === "cancelado") continue;

      // 04A6B1 / SAG-006: Handoff without snapshot verification
      // syncState=sincronizado + sagOrderId means SAG acknowledged the order,
      // but we haven't verified a post-confirmation inventory snapshot yet.
      // Conservative: keep reservation active (SAG_ACK_WAITING_INVENTORY_REFRESH).
      // Do NOT release here — that would create a gap between SAG ACK and
      // the next inventory snapshot where the reservation would be double-counted.
      // Debt SAG-006: verify post-confirmation snapshot before releasing.

      // Only skip if the order status is truly terminal AND NOT waiting for handoff
      if (EXCLUDED_ORDER_STATUSES.has(orderStatus) && orderStatus !== "sincronizado") continue;

      // For sincronizado orders: keep in local reservation (SAG-006 debt)
      // They will be displayed with syncState indicator so the user sees the handoff state

      // Verify this is a committed status (not just any unknown status)
      if (!COMMITTED_ORDER_STATUSES.has(orderStatus) &&
          orderStatus !== "sincronizado" &&   // SAG_ACK_WAITING — keep
          syncState !== "error_sincronizacion" // reintentable error — keep
      ) {
        continue;
      }

      // Extract variant info from order lines for this reference
      const variants: string[] = [];
      if (meta?.lines) {
        for (const line of meta.lines) {
          if (line.referenceCode?.toUpperCase() === upper && !line.removed) {
            const parts: string[] = [];
            if (line.size) parts.push(line.size);
            if (line.color) parts.push(line.color);
            if (parts.length > 0) variants.push(parts.join("/"));
          }
        }
      }

      orders.push({
        reservationId: res.id,
        orderId: res.sourceId,
        consecutivo: meta?.consecutivo ?? 0,
        customerName: meta?.header?.customerName ?? "\u2014",
        qtyReserved: res.qtyReserved,
        qtyReleased: res.qtyReleased,
        qtyConsumed: res.qtyConsumed,
        qtyActive,
        orderStatus,
        syncState,
        sagOrderId,
        createdAt: res.createdAt?.toISOString?.() ?? new Date().toISOString(),
        variants: [...new Set(variants)],
      });

      totalPending += qtyActive;
    }

    // Sort by most recent first
    orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      reference: upper,
      reservadoAgentikPendiente: totalPending,
      orders,
      loaded: true,
      error: null,
    };
  } catch (err) {
    // 04A6B1 FAIL-CLOSED: null, not 0
    return {
      reference: upper,
      reservadoAgentikPendiente: null,
      orders: [],
      loaded: false,
      error: `Error cargando reservas: ${(err as Error).message}`,
    };
  }
}
