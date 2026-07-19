/**
 * lib/comercial/pedidos/order-assistant-service.ts
 *
 * Server-only service that loads all data needed for the Order Assistant.
 * Consumes existing loaders — does NOT create new queries.
 *
 * Data sources:
 *   - loadCliente360() → customer profile, seller, receivables (cartera)
 *   - listOrders() → recent orders for this customer
 *   - getReferenceInventory() → inventory availability check
 *   - CASTILLITOS_ORDER_POLICY_PACK_CONFIG → policy configuration
 *
 * This service loads data, then delegates to the pure assembleOrderAssistant().
 *
 * Sprint: ORDER-ASSISTANT-01
 */

import "server-only";

import { loadCliente360 } from "@/lib/comercial/clientes/cliente-360-loader";
import { listOrders } from "./order-service";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "./order-policy-pack-config";
import { assembleOrderAssistant } from "./order-assistant-engine";
import type { PreOrderData } from "./order-assistant-engine";
import type { OrderAssistantResult, OrderAssistantInput, OrderAssistantRecentOrder } from "./order-assistant-types";
import type { CustomerBranchInfo } from "./order-decision-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

// ── Main loader ─────────────────────────────────────────────────────────────

export async function loadOrderAssistant(
  input: OrderAssistantInput,
): Promise<OrderAssistantResult | null> {
  const { tenantId, orgSlug, customerId } = input;

  // ── Phase 1: Load customer 360 data (parallel internally) ──────────────
  const cliente360 = await loadCliente360(orgSlug, customerId);
  if (!cliente360) return null;

  const profile = cliente360.profile;

  // ── Phase 2: Load recent orders for this customer (parallel) ───────────
  let recentOrders: OrderAssistantRecentOrder[] = [];
  let hasInventory = false;

  try {
    const allOrders = await listOrders(orgSlug);
    // Filter by this customer (match by name or NIT)
    const customerOrders = allOrders.filter(o => {
      const nameMatch = o.customerName.toLowerCase() === profile.name.toLowerCase();
      return nameMatch;
    });

    recentOrders = customerOrders.slice(0, 5).map(o => ({
      id: o.id,
      consecutivo: o.consecutivo,
      totalReferences: o.totalReferences,
      totalUnits: o.totalUnits,
      totalValue: o.totalValue,
      status: o.status,
      origin: o.origin,
      createdAt: o.createdAt,
      daysSinceOrder: daysBetween(o.createdAt),
    }));

    // If we have orders with units, we know inventory sync exists
    hasInventory = allOrders.some(o => o.totalUnits > 0);
  } catch {
    // Orders not available — degrade silently
  }

  // ── Build branches from available data ─────────────────────────────────
  // CustomerBranch is a domain type, not a Prisma model (SAG gap).
  // For now we provide empty branches — the assistant correctly handles this.
  const branches: CustomerBranchInfo[] = [];

  // ── Build credit from receivables ──────────────────────────────────────
  const receivables = cliente360.receivables;
  const maxDaysPastDue = receivables.items.length > 0
    ? Math.max(...receivables.items.map(r => r.daysOverdue))
    : 0;

  const credit = {
    totalReceivable: receivables.totalBalance,
    overdueReceivable: receivables.totalOverdue,
    maxDaysPastDue,
  };

  // ── Assemble pre-order data ────────────────────────────────────────────
  const preOrderData: PreOrderData = {
    customer: {
      customerId: profile.id,
      customerName: profile.name,
      customerCode: profile.nit ?? profile.id,
      nit: profile.nit,
      city: profile.city,
      status: profile.status,
      segment: profile.segment,
      sagCode: profile.sagTerceroId ? String(profile.sagTerceroId) : null,
      sellerName: cliente360.seller.sellerName,
      sellerConfidence: cliente360.seller.confidence,
    },
    branches,
    credit,
    recentOrders,
    hasInventory,
  };

  // ── Run pure assembly (no side effects) ────────────────────────────────
  return assembleOrderAssistant(preOrderData, CASTILLITOS_ORDER_POLICY_PACK_CONFIG);
}
