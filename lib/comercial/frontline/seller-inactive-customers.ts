/**
 * lib/comercial/frontline/seller-inactive-customers.ts
 *
 * AGENTIK-SELLER-APP-V1-01 — Section I/J
 *
 * Deterministic seller intelligence: customers inactive >90 days.
 *
 * Business condition:
 *   customer belongs to current seller
 *   AND lastPurchaseDate is older than 90 days (or never purchased)
 *
 * Uses calendar/date semantics consistently.
 * No calculation in React.
 *
 * Reuses Frontline Core adapters:
 *   - customer-purchase-intelligence.ts → getCustomerPurchaseHistory, getCustomerTopProducts
 *   - customer-commercial-context.ts    → getCustomerReceivables
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCustomerTopProducts } from "./customer-purchase-intelligence";
import { getCustomerReceivables } from "./customer-commercial-context";
import type {
  InactiveCustomerItem,
  InactiveCustomerResult,
  InactiveCustomerClassification,
} from "./seller-app-types";
import type { FrontlineProvenance } from "./frontline-types";

const db = prisma as any;

// ── Core query ──────────────────────────────────────────────────────────────

/**
 * Get all customers assigned to a seller that haven't purchased in >N days.
 *
 * Classification:
 *   INACTIVE_90D        — last purchase > inactiveDays ago
 *   NO_PURCHASE_HISTORY — customer has never purchased (no orders at all)
 *
 * Returns items with full evidence: receivables, top products, last purchase.
 */
export async function getSellerInactiveCustomers(
  orgId: string,
  sellerId: string,
  options?: { inactiveDays?: number },
): Promise<InactiveCustomerResult> {
  const inactiveDays = options?.inactiveDays ?? 90;
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

  const provenance: FrontlineProvenance = {
    source: "seller-inactive-customers (CustomerProfile + CustomerOrderRecord)",
    asOf: now.toISOString(),
  };

  // Step 1: Load all customers assigned to this seller
  const customers = await db.customerProfile.findMany({
    where: {
      organizationId: orgId,
      sellerSlug: sellerId,
    },
    select: {
      id: true,
      name: true,
      legalName: true,
      sagTerceroId: true,
      nit: true,
    },
  });

  if (customers.length === 0) {
    return { items: [], totalCount: 0, provenance };
  }

  // Step 2: For each customer, find last purchase date from CustomerOrderRecord
  // Batch: get all customerNit keys
  const customerMap = new Map<string, {
    id: string;
    name: string;
    sagTerceroId: number | null;
    nit: string | null;
  }>();

  const nitKeys: string[] = [];
  for (const c of customers) {
    const nitKey = c.sagTerceroId != null ? String(c.sagTerceroId) : c.nit;
    if (nitKey) {
      customerMap.set(nitKey, {
        id: c.id,
        name: c.legalName ?? c.name ?? "",
        sagTerceroId: c.sagTerceroId,
        nit: c.nit,
      });
      nitKeys.push(nitKey);
    } else {
      // Customer without NIT key — classify as NO_PURCHASE_HISTORY
      customerMap.set(`__no_nit_${c.id}`, {
        id: c.id,
        name: c.legalName ?? c.name ?? "",
        sagTerceroId: null,
        nit: null,
      });
    }
  }

  // Step 3: Get last order date per customerNit
  const lastOrders = nitKeys.length > 0
    ? await db.customerOrderRecord.groupBy({
        by: ["customerNit"],
        where: {
          organizationId: orgId,
          customerNit: { in: nitKeys },
          status: "FACTURADO",
        },
        _max: { orderDate: true },
      })
    : [];

  const lastOrderMap = new Map<string, Date>();
  for (const row of lastOrders) {
    if (row._max.orderDate) {
      lastOrderMap.set(row.customerNit, row._max.orderDate);
    }
  }

  // Step 4: Classify and build items
  const items: InactiveCustomerItem[] = [];

  for (const [key, customer] of customerMap.entries()) {
    const nitKey = key.startsWith("__no_nit_") ? null : key;
    const lastOrderDate = nitKey ? lastOrderMap.get(nitKey) ?? null : null;

    let classification: InactiveCustomerClassification;
    let daysSinceLastPurchase: number | null = null;
    let lastPurchaseDateStr: string | null = null;

    if (lastOrderDate === null) {
      // Never purchased
      classification = "NO_PURCHASE_HISTORY";
    } else if (lastOrderDate < cutoffDate) {
      // Inactive — last purchase before cutoff
      classification = "INACTIVE_90D";
      daysSinceLastPurchase = Math.floor(
        (now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      lastPurchaseDateStr = lastOrderDate.toISOString();
    } else {
      // Active — skip
      continue;
    }

    items.push({
      customerId: customer.id,
      customerName: customer.name,
      sellerId,
      classification,
      lastPurchaseDate: lastPurchaseDateStr,
      daysSinceLastPurchase,
      receivables: null, // enriched lazily below
      purchaseSummary: { totalOrdersL12: 0, topProducts: [] },
      asOf: now.toISOString(),
      provenance,
    });
  }

  // Build customerId → sagTerceroId lookup for canonical AR path
  const sagIdByCustomerId = new Map<string, number>();
  for (const customer of customerMap.values()) {
    if (customer.sagTerceroId != null) {
      sagIdByCustomerId.set(customer.id, customer.sagTerceroId);
    }
  }

  // Step 5: Enrich top items with receivables and purchase summary (max 20)
  const enrichLimit = Math.min(items.length, 20);
  const enrichPromises = items.slice(0, enrichLimit).map(async (item) => {
    const [recv, topProducts] = await Promise.all([
      getCustomerReceivables(orgId, item.customerId, sagIdByCustomerId.get(item.customerId) ?? null),
      getCustomerTopProducts(orgId, item.customerId, { ranking: "UNITS", limit: 3 }),
    ]);

    if (recv) {
      item.receivables = {
        total: recv.totalReceivable,
        overdue: recv.overdueAmount,
        maxDaysOverdue: recv.maxDaysOverdue,
      };
    }

    item.purchaseSummary = {
      totalOrdersL12: 0, // already inactive, so L12 is likely 0
      topProducts: topProducts.products.map(p => ({
        referenceCode: p.referenceCode,
        description: p.description,
        totalUnits: p.totalUnits,
      })),
    };
  });

  await Promise.all(enrichPromises);

  // Sort: INACTIVE_90D first (by days desc), then NO_PURCHASE_HISTORY
  items.sort((a, b) => {
    if (a.classification !== b.classification) {
      return a.classification === "INACTIVE_90D" ? -1 : 1;
    }
    return (b.daysSinceLastPurchase ?? Infinity) - (a.daysSinceLastPurchase ?? Infinity);
  });

  return {
    items,
    totalCount: items.length,
    provenance,
  };
}
