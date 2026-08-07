/**
 * lib/comercial/frontline/customer-purchase-intelligence.ts
 *
 * AGENTIK-COMMERCIAL-FRONTLINE-CORE-01 — Phase 2
 *
 * Canonical customer purchase intelligence adapter.
 * Single shared authority for: Clientes, Pedidos, Vendedores, Seller App, Copilot.
 *
 * Sales authority: CustomerOrderLine (product-level) + CustomerOrderRecord (header).
 * Source: SAG MOVIMIENTOS_ITEMS via sag-order-lines-sync.ts
 *
 * No SaleRecord (SaleRecord.productCode is NULL on 129k rows).
 * No vw_agentik_ventas (aggregated view, not product-level).
 * No calculation in React.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  CustomerPurchaseHistoryResult,
  CustomerPurchaseHistoryItem,
  CustomerTopProductsResult,
  CustomerTopProduct,
  TopProductRanking,
  FrontlineProvenance,
} from "./frontline-types";

const db = prisma as any;

// ── Sales authority certification ───────────────────────────────────────────
//
// Source: CustomerOrderLine + CustomerOrderRecord
// Join: CustomerOrderLine.orderId → CustomerOrderRecord.id
// Customer link: CustomerOrderRecord.customerNit = CustomerProfile.nit
// Date: CustomerOrderRecord.orderDate
// Status filter: FACTURADO (invoiced) for confirmed sales
// Product: CustomerOrderLine.referenceCode + articleName
// Quantity: CustomerOrderLine.quantity (Decimal)
// Value: CustomerOrderLine.unitValue (Decimal)
// Seller: CustomerOrderRecord.sellerName
//
// Historical coverage: SAG MOVIMIENTOS from 2020+
// No overlap/missing date issues — single source (SAG PD orders).

// ── Purchase history ────────────────────────────────────────────────────────

export async function getCustomerPurchaseHistory(
  orgId: string,
  customerId: string,
  options?: {
    fromDate?: string;  // ISO
    toDate?: string;    // ISO
    limit?: number;
    statuses?: string[]; // default: ["FACTURADO"]
  },
): Promise<CustomerPurchaseHistoryResult> {
  const now = new Date().toISOString();
  const provenance: FrontlineProvenance = {
    source: "CustomerOrderLine + CustomerOrderRecord (SAG PD)",
    asOf: now,
  };

  // Resolve customer sagTerceroId — this is the join key to CustomerOrderRecord.customerNit
  // (CustomerOrderRecord.customerNit stores ka_nl_tercero as string, not the real NIT)
  const profile = await db.customerProfile.findFirst({
    where: { id: customerId, organizationId: orgId },
    select: { nit: true, nitNormalized: true, sagTerceroId: true },
  });

  const customerNitKey = profile?.sagTerceroId != null
    ? String(profile.sagTerceroId)
    : profile?.nit;

  if (!customerNitKey) {
    return {
      customerId,
      items: [],
      totalOrders: 0,
      totalUnits: 0,
      totalValue: 0,
      provenance: { ...provenance, limitations: ["Customer has no sagTerceroId or NIT — cannot link to orders"] },
    };
  }

  // Build date filters
  const dateFilter: Record<string, unknown> = {};
  if (options?.fromDate) dateFilter.gte = new Date(options.fromDate);
  if (options?.toDate) dateFilter.lte = new Date(options.toDate);

  const statusFilter = options?.statuses ?? ["FACTURADO"];
  const limit = options?.limit ?? 200;

  // Query order lines via parent order's customerNit
  const orders = await db.customerOrderRecord.findMany({
    where: {
      organizationId: orgId,
      customerNit: customerNitKey,
      status: { in: statusFilter },
      ...(Object.keys(dateFilter).length > 0 ? { orderDate: dateFilter } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      orderDate: true,
      status: true,
      lines: {
        select: {
          referenceCode: true,
          articleName: true,
          quantity: true,
          unitValue: true,
        },
      },
    },
    orderBy: { orderDate: "desc" },
    take: limit,
  });

  const items: CustomerPurchaseHistoryItem[] = [];
  let totalUnits = 0;
  let totalValue = 0;

  for (const order of orders) {
    for (const line of order.lines) {
      const qty = Number(line.quantity ?? 0);
      const uv = Number(line.unitValue ?? 0);
      const lv = qty * uv;
      items.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate?.toISOString() ?? now,
        referenceCode: line.referenceCode,
        description: line.articleName ?? "",
        quantity: qty,
        unitValue: uv,
        lineValue: lv,
        status: order.status,
      });
      totalUnits += qty;
      totalValue += lv;
    }
  }

  return {
    customerId,
    items,
    totalOrders: orders.length,
    totalUnits,
    totalValue,
    provenance,
  };
}

// ── Top products ────────────────────────────────────────────────────────────

export async function getCustomerTopProducts(
  orgId: string,
  customerId: string,
  options?: {
    ranking?: TopProductRanking; // default: UNITS
    limit?: number;             // default: 10
    fromDate?: string;          // ISO — default: 12 months ago
    toDate?: string;            // ISO
    statuses?: string[];        // default: ["FACTURADO"]
  },
): Promise<CustomerTopProductsResult> {
  const ranking = options?.ranking ?? "UNITS";
  const limit = options?.limit ?? 10;
  const now = new Date();
  const fromDate = options?.fromDate ?? new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();

  // Get full history within range
  const history = await getCustomerPurchaseHistory(orgId, customerId, {
    fromDate,
    toDate: options?.toDate,
    limit: 5000, // high limit to get all lines for aggregation
    statuses: options?.statuses,
  });

  // Aggregate by referenceCode
  const agg = new Map<string, {
    referenceCode: string;
    description: string;
    totalUnits: number;
    totalSalesValue: number;
    orderIds: Set<string>;
    lastPurchaseDate: string | null;
  }>();

  for (const item of history.items) {
    const existing = agg.get(item.referenceCode);
    if (existing) {
      existing.totalUnits += item.quantity;
      existing.totalSalesValue += item.lineValue;
      existing.orderIds.add(item.orderId);
      if (!existing.lastPurchaseDate || item.orderDate > existing.lastPurchaseDate) {
        existing.lastPurchaseDate = item.orderDate;
      }
    } else {
      agg.set(item.referenceCode, {
        referenceCode: item.referenceCode,
        description: item.description,
        totalUnits: item.quantity,
        totalSalesValue: item.lineValue,
        orderIds: new Set([item.orderId]),
        lastPurchaseDate: item.orderDate,
      });
    }
  }

  // Sort by ranking
  const sorted = [...agg.values()]
    .sort((a, b) =>
      ranking === "UNITS"
        ? b.totalUnits - a.totalUnits
        : b.totalSalesValue - a.totalSalesValue
    )
    .slice(0, limit);

  const products: CustomerTopProduct[] = sorted.map(p => ({
    referenceCode: p.referenceCode,
    description: p.description,
    totalUnits: p.totalUnits,
    totalSalesValue: p.totalSalesValue,
    purchaseCount: p.orderIds.size,
    lastPurchaseDate: p.lastPurchaseDate,
  }));

  return {
    customerId,
    ranking,
    products,
    provenance: history.provenance,
  };
}
