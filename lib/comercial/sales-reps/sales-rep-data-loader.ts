/**
 * lib/comercial/sales-reps/sales-rep-data-loader.ts
 *
 * Data loader that constructs SalesRepDailyState inputs from Prisma data
 * for the SalesRep Decision Engine.
 *
 * Data sources:
 *   - CustomerProfile (by sellerSlug → assigned customers)
 *   - CustomerReceivable (by customerNit → receivables per customer)
 *   - CustomerOrderRecord (by customerNit → order history)
 *   - VendorBagItem (maleta items for the seller's bag)
 *   - ProductInventoryLevel (available inventory for bag items)
 *   - ProductEntity (product details for bag items)
 *
 * Sprint: COMMERCIAL-DATA-CONNECTIVITY-01
 */

import { prisma } from "@/lib/prisma";
import type {
  SalesRepPolicyContext,
  CustomerInput,
  MalletItemInput,
  OrderInput,
  MalletStateInput,
  SalesRepProfile,
  OrderFulfillmentBlocker,
} from "./sales-rep-decision-types";

const db = prisma as any;

// ── SalesRep profile loader ────────────────────────────────────────────────

export interface SalesRepLoaderResult {
  context: SalesRepPolicyContext;
  profile: SalesRepProfile;
  customers: CustomerInput[];
  malletItems: MalletItemInput[];
  orders: OrderInput[];
  malletState: MalletStateInput | null;
}

/**
 * Load all data needed to run the SalesRep Decision Engine for a single seller.
 *
 * @param orgId - Organization ID
 * @param sellerSlug - The seller's slug (from CustomerProfile.sellerSlug)
 */
export async function loadSalesRepData(
  orgId: string,
  sellerSlug: string,
): Promise<SalesRepLoaderResult> {
  // 1. Find the seller profile from CustomerProfile (sellers are tracked by sellerSlug)
  const sellerProfiles = await db.customerProfile.findMany({
    where: { organizationId: orgId, sellerSlug },
    select: {
      id: true,
      name: true,
      nit: true,
      sellerName: true,
      sellerSlug: true,
    },
    take: 1,
  });

  const sellerName = sellerProfiles[0]?.sellerName ?? sellerSlug;

  const profile: SalesRepProfile = {
    salesRepId: sellerSlug,
    salesRepName: sellerName,
    zone: null, // SAG ZONA not yet mapped to seller — documented gap
    active: true,
  };

  const context: SalesRepPolicyContext = {
    tenantId: orgId,
    salesRepId: sellerSlug,
    salesRepName: sellerName,
  };

  // 2. Load assigned customers (all customers with this sellerSlug)
  const customers = await loadCustomers(orgId, sellerSlug);

  // 3. Load mallet items (VendorBagItem for this seller)
  const malletItems = await loadMalletItems(orgId, sellerSlug);

  // 4. Load orders (CustomerOrderRecord for assigned customers)
  const customerNits = customers
    .map(c => c.customerId)
    .filter(Boolean);
  const orders = await loadOrders(orgId, customerNits);

  // 5. Build mallet state summary
  const malletState = await loadMalletState(orgId, sellerSlug);

  return { context, profile, customers, malletItems, orders, malletState };
}

// ── Customer loader ─────────────────────────────────────────────────────────

async function loadCustomers(
  orgId: string,
  sellerSlug: string,
): Promise<CustomerInput[]> {
  const profiles = await db.customerProfile.findMany({
    where: { organizationId: orgId, sellerSlug },
    select: {
      id: true,
      name: true,
      nit: true,
      lastPurchaseAt: true,
      totalReceivable: true,
      overdueReceivable: true,
      maxDpd: true,
    },
  });

  const results: CustomerInput[] = [];

  for (const p of profiles) {
    // Get receivable details for this customer
    const receivableData = await loadCustomerReceivables(orgId, p.nit);

    // Count orders for this customer
    const orderCount = p.nit
      ? await db.customerOrderRecord.count({
          where: { organizationId: orgId, customerNit: p.nit },
        }).catch(() => 0)
      : 0;

    // Lifetime sales from SaleRecord (header level — productCode is null)
    const salesAgg = p.nit
      ? await db.saleRecord.aggregate({
          where: { organizationId: orgId, customerNit: p.nit },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: null } }))
      : { _sum: { amount: null } };

    results.push({
      customerId: p.nit ?? p.id,
      customerName: p.name ?? "SIN NOMBRE",
      assignedSalesRepId: sellerSlug,
      lastPurchaseAt: p.lastPurchaseAt?.toISOString() ?? null,
      purchaseCount: orderCount,
      lifetimeSales: salesAgg._sum.amount != null ? Number(salesAgg._sum.amount) : null,
      receivables: receivableData,
    });
  }

  return results;
}

async function loadCustomerReceivables(
  orgId: string,
  nit: string | null,
): Promise<CustomerInput["receivables"]> {
  if (!nit) return null;

  try {
    const receivables = await db.customerReceivable.findMany({
      where: {
        organizationId: orgId,
        customerNit: nit,
        status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      },
      select: {
        balanceDue: true,
        daysOverdue: true,
        invoiceNumber: true,
        originalAmount: true,
      },
    });

    if (receivables.length === 0) return null;

    let totalBalance = 0;
    let overdueBalance = 0;
    let maxDaysPastDue = 0;
    let oldestOverdueDocument: string | null = null;
    let oldestOverdueAmount = 0;
    let overdueDocumentCount = 0;

    for (const r of receivables) {
      const bal = Number(r.balanceDue) || 0;
      const dpd = Number(r.daysOverdue) || 0;
      totalBalance += bal;
      if (dpd > 0) {
        overdueBalance += bal;
        overdueDocumentCount++;
        if (dpd > maxDaysPastDue) {
          maxDaysPastDue = dpd;
          oldestOverdueDocument = r.invoiceNumber ?? null;
          oldestOverdueAmount = Number(r.originalAmount) || 0;
        }
      }
    }

    return {
      totalBalance,
      overdueBalance,
      maxDaysPastDue,
      oldestOverdueDocument,
      oldestOverdueAmount,
      overdueDocumentCount,
      dataStatus: "AVAILABLE" as const,
    };
  } catch {
    return null;
  }
}

// ── Mallet items loader ─────────────────────────────────────────────────────

async function loadMalletItems(
  orgId: string,
  sellerSlug: string,
): Promise<MalletItemInput[]> {
  try {
    // VendorBagItem links products to seller bags
    const bagItems = await db.vendorBagItem.findMany({
      where: {
        bag: { organizationId: orgId, sellerSlug },
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        product: {
          select: {
            id: true,
            externalId: true,
            name: true,
            productLine: true,
            productGroup: true,
            subgrupoSag: true,
          },
        },
      },
    });

    if (bagItems.length === 0) return [];

    // Get inventory for these products
    const productIds = bagItems.map((bi: any) => bi.productId).filter(Boolean);
    const inventoryLevels = await db.productInventoryLevel.findMany({
      where: {
        organizationId: orgId,
        productId: { in: productIds },
      },
      select: { productId: true, quantity: true },
    });

    const inventoryMap = new Map<string, number>();
    for (const lvl of inventoryLevels) {
      const qty = Number(lvl.quantity ?? 0);
      if (qty > 0) {
        inventoryMap.set(lvl.productId, (inventoryMap.get(lvl.productId) ?? 0) + qty);
      }
    }

    return bagItems.map((bi: any) => ({
      reference: bi.product?.externalId ?? bi.productId,
      productName: bi.product?.name ?? "—",
      photoUrl: null, // SAG does not provide photo URLs
      currentMalletUnits: Number(bi.quantity ?? 0),
      availableInventory: inventoryMap.get(bi.productId) ?? 0,
      groupCode: bi.product?.productGroup ?? null,
      subgroupCode: bi.product?.subgrupoSag ?? null,
      sizeClass: null, // Not available at bag item level
      line: bi.product?.productLine ?? "—",
    }));
  } catch {
    return [];
  }
}

// ── Orders loader ───────────────────────────────────────────────────────────

async function loadOrders(
  orgId: string,
  customerNits: string[],
): Promise<OrderInput[]> {
  if (customerNits.length === 0) return [];

  try {
    const orders = await db.customerOrderRecord.findMany({
      where: {
        organizationId: orgId,
        customerNit: { in: customerNits },
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        orderDate: true,
        amount: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { orderDate: "desc" },
      take: 100, // Limit to most recent orders
    });

    return orders.map((o: any) => ({
      orderId: o.id,
      customer: o.customerName ?? "—",
      branch: null, // SAG PD orders don't have branch info
      createdAt: o.orderDate?.toISOString() ?? new Date().toISOString(),
      requestedUnits: 0, // Line-level data not available (P0-002 gap)
      fulfilledUnits: 0,
      invoicedUnits: 0,
      dispatchedUnits: 0,
      deliveredUnits: 0,
      status: o.status ?? "UNKNOWN",
      blockers: [] as OrderFulfillmentBlocker[],
      lastSyncAt: o.updatedAt?.toISOString() ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Mallet state loader ─────────────────────────────────────────────────────

async function loadMalletState(
  orgId: string,
  sellerSlug: string,
): Promise<MalletStateInput | null> {
  try {
    const bag = await db.vendorBag.findFirst({
      where: { organizationId: orgId, sellerSlug },
      select: {
        id: true,
        _count: { select: { items: true } },
      },
    });

    if (!bag) return null;

    const totalItems = bag._count.items;

    // Get item-level details for completeness check
    const items = await db.vendorBagItem.findMany({
      where: { bagId: bag.id },
      select: { productId: true, quantity: true },
    });

    const productIds = items.map((i: any) => i.productId).filter(Boolean);
    const inventoryLevels = productIds.length > 0
      ? await db.productInventoryLevel.findMany({
          where: {
            organizationId: orgId,
            productId: { in: productIds },
          },
          select: { productId: true, quantity: true },
        })
      : [];

    const inventoryMap = new Map<string, number>();
    for (const lvl of inventoryLevels) {
      const qty = Number(lvl.quantity ?? 0);
      if (qty > 0) {
        inventoryMap.set(lvl.productId, (inventoryMap.get(lvl.productId) ?? 0) + qty);
      }
    }

    let missingEntries = 0;
    for (const item of items) {
      const inv = inventoryMap.get(item.productId) ?? 0;
      if (inv <= 0) missingEntries++;
    }

    return {
      malletId: bag.id,
      completionPercentage: totalItems > 0 ? Math.round(((totalItems - missingEntries) / totalItems) * 100) : 0,
      completeGroups: 0, // Group-level analysis not available without rule definitions
      totalGroups: 0,
      missingEntries,
      excessEntries: 0,
      unresolvedItems: missingEntries,
    };
  } catch {
    return null;
  }
}

// ── List all sellers for batch processing ───────────────────────────────────

/**
 * Get all distinct seller slugs in the organization.
 * Used to iterate and load data for each seller.
 */
export async function listSellerSlugs(orgId: string): Promise<string[]> {
  try {
    const profiles = await db.customerProfile.findMany({
      where: {
        organizationId: orgId,
        sellerSlug: { not: null },
      },
      select: { sellerSlug: true },
      distinct: ["sellerSlug"],
    });
    return profiles
      .map((p: any) => p.sellerSlug as string)
      .filter(Boolean);
  } catch {
    return [];
  }
}
