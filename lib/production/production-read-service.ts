/**
 * production-read-service.ts
 *
 * PRODUCTION-SYNC-01A — Read services for production order data.
 * Used by Informes Ejecutivos and other modules to query synced OP data.
 *
 * All functions are read-only against Prisma.
 */

import { prisma } from "@/lib/prisma";

const db = prisma as any;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProductionOrderSummary {
  totalOrders: number;
  openOrders: number;
  closedOrders: number;
  totalLines: number;
  totalQuantityOrdered: number;
  uniqueReferences: number;
  dateRange: { earliest: Date | null; latest: Date | null };
}

export interface ProductionByReference {
  referenceCode: string;
  productName: string | null;
  totalQuantityOrdered: number;
  orderCount: number;
  sizes: string[];
  colors: string[];
  hasOpenOrders: boolean;
}

// ── Services ──────────────────────────────────────────────────────────────────

/**
 * Get recent production orders with their lines.
 * Default: last 30 days, max 100 orders.
 */
export async function getRecentProductionOrders(
  organizationId: string,
  options?: { days?: number; limit?: number },
): Promise<any[]> {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 100;
  const since = new Date();
  since.setDate(since.getDate() - days);

  return db.productionOrder.findMany({
    where: {
      organizationId,
      documentDate: { gte: since },
    },
    include: { lines: true },
    orderBy: { documentDate: "desc" },
    take: limit,
  });
}

/**
 * Get all production orders for a specific reference code.
 */
export async function getProductionByReference(
  organizationId: string,
  referenceCode: string,
): Promise<any[]> {
  return db.productionOrder.findMany({
    where: {
      organizationId,
      lines: {
        some: { referenceCode },
      },
    },
    include: { lines: { where: { referenceCode } } },
    orderBy: { documentDate: "desc" },
  });
}

/**
 * Get only OPEN production orders for a specific reference code.
 * This is the closest we can say to "has active production".
 */
export async function getOpenProductionByReference(
  organizationId: string,
  referenceCode: string,
): Promise<any[]> {
  return db.productionOrder.findMany({
    where: {
      organizationId,
      status: "open",
      lines: {
        some: { referenceCode },
      },
    },
    include: { lines: { where: { referenceCode } } },
    orderBy: { documentDate: "desc" },
  });
}

/**
 * Aggregate production summary for the organization.
 */
export async function getProductionSummary(
  organizationId: string,
): Promise<ProductionOrderSummary> {
  const [orderCounts, lineSummary, dateRange] = await Promise.all([
    // Order counts by status
    db.productionOrder.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: true,
    }),
    // Line aggregates
    db.productionOrderLine.aggregate({
      where: { organizationId },
      _count: true,
      _sum: { quantityOrdered: true },
    }),
    // Date range
    Promise.all([
      db.productionOrder.findFirst({
        where: { organizationId },
        orderBy: { documentDate: "asc" },
        select: { documentDate: true },
      }),
      db.productionOrder.findFirst({
        where: { organizationId },
        orderBy: { documentDate: "desc" },
        select: { documentDate: true },
      }),
    ]),
  ]);

  // Count unique references
  const uniqueRefs = await db.productionOrderLine.findMany({
    where: { organizationId },
    distinct: ["referenceCode"],
    select: { referenceCode: true },
  });

  let total = 0;
  let open = 0;
  let closed = 0;
  for (const g of orderCounts) {
    total += g._count;
    if (g.status === "open") open = g._count;
    if (g.status === "closed") closed = g._count;
  }

  return {
    totalOrders: total,
    openOrders: open,
    closedOrders: closed,
    totalLines: lineSummary._count ?? 0,
    totalQuantityOrdered: lineSummary._sum?.quantityOrdered ?? 0,
    uniqueReferences: uniqueRefs.length,
    dateRange: {
      earliest: dateRange[0]?.documentDate ?? null,
      latest: dateRange[1]?.documentDate ?? null,
    },
  };
}

/**
 * Get production summary grouped by reference code.
 * Useful for cross-referencing with agotados / stock critico.
 */
export async function getProductionByReferenceSummary(
  organizationId: string,
  options?: { onlyOpen?: boolean; limit?: number },
): Promise<ProductionByReference[]> {
  const onlyOpen = options?.onlyOpen ?? false;
  const limit = options?.limit ?? 200;

  const whereOrder = onlyOpen
    ? { organizationId, status: "open" }
    : { organizationId };

  // Get all lines with their order status
  const lines = await db.productionOrderLine.findMany({
    where: {
      organizationId,
      productionOrder: whereOrder,
    },
    select: {
      referenceCode: true,
      productName: true,
      size: true,
      color: true,
      quantityOrdered: true,
      productionOrder: { select: { status: true, id: true } },
    },
  });

  // Group by reference
  const byRef = new Map<string, {
    productName: string | null;
    totalQty: number;
    orderIds: Set<string>;
    sizes: Set<string>;
    colors: Set<string>;
    hasOpen: boolean;
  }>();

  for (const line of lines) {
    const ref = line.referenceCode;
    if (!byRef.has(ref)) {
      byRef.set(ref, {
        productName: line.productName,
        totalQty: 0,
        orderIds: new Set(),
        sizes: new Set(),
        colors: new Set(),
        hasOpen: false,
      });
    }
    const entry = byRef.get(ref)!;
    entry.totalQty += line.quantityOrdered ?? 0;
    entry.orderIds.add(line.productionOrder.id);
    if (line.size) entry.sizes.add(line.size);
    if (line.color) entry.colors.add(line.color);
    if (line.productionOrder.status === "open") entry.hasOpen = true;
  }

  // Convert to array and sort by quantity desc
  const result: ProductionByReference[] = [];
  for (const [ref, data] of byRef) {
    result.push({
      referenceCode: ref,
      productName: data.productName,
      totalQuantityOrdered: data.totalQty,
      orderCount: data.orderIds.size,
      sizes: Array.from(data.sizes).sort(),
      colors: Array.from(data.colors).sort(),
      hasOpenOrders: data.hasOpen,
    });
  }

  result.sort((a, b) => b.totalQuantityOrdered - a.totalQuantityOrdered);
  return result.slice(0, limit);
}
