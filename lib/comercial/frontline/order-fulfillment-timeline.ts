/**
 * lib/comercial/frontline/order-fulfillment-timeline.ts
 *
 * AGENTIK-SELLER-APP-V1-01 — Section N/O/P
 *
 * Canonical order fulfillment read model.
 * Designed from day one even if downstream integrations are not yet certified.
 *
 * Current certified data:
 *   - PENDIENTE    → order submitted, awaiting SAG confirmation
 *   - CONFIRMADO   → confirmed by operations
 *   - DESPACHADO   → dispatched to customer
 *   - FACTURADO    → converted to invoice (FE/FD)
 *   - CANCELADO    → cancelled
 *
 * NOT certified yet (return NOT_AVAILABLE):
 *   - Invoice number / date (no field in schema)
 *   - Carrier / tracking number (no field in schema)
 *   - Delivery confirmation (no field in schema)
 *
 * Rule: do NOT display a fake completed stage.
 * Return NOT_AVAILABLE for missing integrations.
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { OrderFulfillmentTimeline, FulfillmentStageStatus } from "./seller-app-types";
import type { FrontlineProvenance } from "./frontline-types";

const db = prisma as any;

// ── Status → fulfillment stage mapping ──────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  PENDIENTE: 0,
  CONFIRMADO: 1,
  DESPACHADO: 2,
  FACTURADO: 3,
  CANCELADO: -1,
};

function invoiceStageFromStatus(status: string): FulfillmentStageStatus {
  const rank = STATUS_ORDER[status] ?? -1;
  if (rank >= 3) return "COMPLETED"; // FACTURADO
  if (rank >= 2) return "IN_PROGRESS"; // DESPACHADO implies invoicing may be happening
  return "NOT_STARTED";
}

function shipmentStageFromStatus(status: string): FulfillmentStageStatus {
  const rank = STATUS_ORDER[status] ?? -1;
  if (rank >= 2) return "COMPLETED"; // DESPACHADO or FACTURADO
  if (rank >= 1) return "NOT_STARTED"; // CONFIRMADO — not yet dispatched
  return "NOT_STARTED";
}

// ── Build fulfillment timeline ──────────────────────────────────────────────

/**
 * Build the canonical fulfillment timeline for a single order.
 *
 * Truthful: only shows stages backed by certified data.
 * NOT_AVAILABLE for stages without a data source.
 */
export async function getOrderFulfillmentTimeline(
  orgId: string,
  orderId: string,
): Promise<OrderFulfillmentTimeline | null> {
  const now = new Date().toISOString();
  const provenance: FrontlineProvenance = {
    source: "CustomerOrderRecord (SAG PD)",
    asOf: now,
    limitations: [
      "Invoice number/date: NOT_AVAILABLE — no field in current schema",
      "Carrier/tracking: NOT_AVAILABLE — no shipping integration",
      "Delivery confirmation: NOT_AVAILABLE — no delivery integration",
    ],
  };

  const order = await db.customerOrderRecord.findFirst({
    where: { id: orderId, organizationId: orgId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      orderDate: true,
      syncedAt: true,
    },
  });

  if (!order) return null;

  const status = order.status as string;
  const isCancelled = status === "CANCELADO";

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: status,

    submittedAt: order.orderDate?.toISOString() ?? null,

    invoice: {
      status: isCancelled ? "NOT_STARTED" : invoiceStageFromStatus(status),
      invoiceNumber: null,  // NOT_AVAILABLE — no field in schema
      invoicedAt: null,     // NOT_AVAILABLE — no field in schema
    },

    shipment: {
      status: isCancelled
        ? "NOT_STARTED"
        : shipmentStageFromStatus(status),
      carrier: null,          // NOT_AVAILABLE — no shipping integration
      trackingNumber: null,   // NOT_AVAILABLE — no shipping integration
      shippedAt: null,        // NOT_AVAILABLE — no shipping integration
    },

    delivery: {
      status: "NOT_AVAILABLE", // No delivery integration
      deliveredAt: null,
    },

    sync: {
      status: order.syncedAt ? "SYNCED" : "PENDING",
      lastAttempt: order.syncedAt?.toISOString() ?? null,
      error: null,
    },

    provenance,
  };
}

// ── Strict fulfillment stage derivation (AGENTIK-SELLER-APP-UI-03-P0) ─────
//
// Exported for server components that already hold order data.
// Only returns COMPLETED when canonical SAG status explicitly certifies:
//   FACTURADO  → invoice COMPLETED (literal "invoiced")
//   DESPACHADO → shipment COMPLETED (literal "dispatched")
//   PENDIENTE / CONFIRMADO → pre-dispatch, pre-invoice: NOT_STARTED
//   Unknown / CANCELADO → NOT_AVAILABLE (cannot determine)
//   Delivery → always NOT_AVAILABLE (no integration)
//
// Rule: absence of invoice evidence ≠ confirmed no invoice.
//       Do NOT default unknown to NOT_STARTED.

export function deriveStrictFulfillmentStages(sagStatus: string): {
  invoice: FulfillmentStageStatus;
  shipment: FulfillmentStageStatus;
  delivery: FulfillmentStageStatus;
} {
  switch (sagStatus) {
    case "FACTURADO":
      // SAG explicitly certifies: invoiced. Shipment not independently certified.
      return { invoice: "COMPLETED", shipment: "NOT_AVAILABLE", delivery: "NOT_AVAILABLE" };
    case "DESPACHADO":
      // SAG explicitly certifies: dispatched. Invoice status unknown.
      return { invoice: "NOT_AVAILABLE", shipment: "COMPLETED", delivery: "NOT_AVAILABLE" };
    case "PENDIENTE":
    case "CONFIRMADO":
      // SAG lifecycle: pre-dispatch, pre-invoice. Canonically not invoiced/shipped.
      return { invoice: "NOT_STARTED", shipment: "NOT_STARTED", delivery: "NOT_AVAILABLE" };
    default:
      // CANCELADO, unknown, or unmapped — cannot determine.
      return { invoice: "NOT_AVAILABLE", shipment: "NOT_AVAILABLE", delivery: "NOT_AVAILABLE" };
  }
}

// ── Batch: seller's recent orders with timelines ────────────────────────────

/**
 * Get fulfillment timelines for a seller's recent orders.
 * For list views — lightweight, no joins beyond order header.
 */
export async function getSellerOrderTimelines(
  orgId: string,
  sellerId: string | null,
  options?: { limit?: number; status?: string },
): Promise<OrderFulfillmentTimeline[]> {
  const now = new Date().toISOString();
  const provenance: FrontlineProvenance = {
    source: "CustomerOrderRecord (SAG PD)",
    asOf: now,
  };

  const sellerFilter = sellerId
    ? { sellerName: { contains: sellerId, mode: "insensitive" as const } }
    : {};

  const statusFilter = options?.status ? { status: options.status } : {};

  const orders = await db.customerOrderRecord.findMany({
    where: {
      organizationId: orgId,
      ...sellerFilter,
      ...statusFilter,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      orderDate: true,
      syncedAt: true,
    },
    orderBy: { orderDate: "desc" },
    take: options?.limit ?? 20,
  });

  return orders.map((order: any) => {
    const status = order.status as string;
    const isCancelled = status === "CANCELADO";

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: status,
      submittedAt: order.orderDate?.toISOString() ?? null,
      invoice: {
        status: isCancelled ? "NOT_STARTED" : invoiceStageFromStatus(status),
        invoiceNumber: null,
        invoicedAt: null,
      },
      shipment: {
        status: isCancelled ? "NOT_STARTED" : shipmentStageFromStatus(status),
        carrier: null,
        trackingNumber: null,
        shippedAt: null,
      },
      delivery: {
        status: "NOT_AVAILABLE" as const,
        deliveredAt: null,
      },
      sync: {
        status: order.syncedAt ? "SYNCED" as const : "PENDING" as const,
        lastAttempt: order.syncedAt?.toISOString() ?? null,
        error: null,
      },
      provenance,
    };
  });
}
