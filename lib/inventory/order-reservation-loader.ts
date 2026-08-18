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
 * server-only — uses Prisma.
 *
 * Sprint: INVENTORY-DRAWER-ORDER-RESERVATION-04A6B
 */

import "server-only";

import { prisma } from "@/lib/prisma";

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
  /** Total active units reserved by Agentik orders not yet absorbed by SAG */
  reservadoAgentikPendiente: number;
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

    // 3. Build results
    const orders: PendingOrderReservation[] = [];
    let totalPending = 0;

    for (const res of reservations) {
      const qtyActive = res.qtyReserved - res.qtyReleased - res.qtyConsumed;
      if (qtyActive <= 0) continue; // Fully released/consumed

      const meta = execMap.get(res.sourceId);
      const orderStatus = meta?.status ?? "desconocido";
      const syncState = meta?.syncState ?? "desconocido";
      const sagOrderId = meta?.sagOrderId ?? null;

      // Skip orders that are already synced (SAG has absorbed the reservation)
      if (syncState === "sincronizado" && sagOrderId) continue;

      // Skip cancelled orders (reservation should have been released)
      if (orderStatus === "cancelado") continue;

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
        customerName: meta?.header?.customerName ?? "—",
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
    return {
      reference: upper,
      reservadoAgentikPendiente: 0,
      orders: [],
      loaded: false,
      error: `Error cargando reservas: ${(err as Error).message}`,
    };
  }
}
