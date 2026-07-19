/**
 * production-engine.ts
 *
 * Production intelligence — reads from synced ProductionOrder data.
 * Does NOT calculate pending production (OP→ET not validated yet).
 * Only reports what OP snapshot data tells us.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { ProductionData } from "./executive-types";

const db = prisma as any;

export async function runProductionEngine(orgId: string): Promise<ProductionData> {
  try {
    const [openOrders, closedOrders, uniqueRefs, totalQty, recentCount] =
      await Promise.all([
        db.productionOrder.count({ where: { organizationId: orgId, status: "open" } }).catch(() => 0),
        db.productionOrder.count({ where: { organizationId: orgId, status: "closed" } }).catch(() => 0),
        db.productionOrderLine.findMany({
          where: { organizationId: orgId },
          distinct: ["referenceCode"],
          select: { referenceCode: true },
        }).catch(() => []),
        db.productionOrderLine.aggregate({
          where: { organizationId: orgId },
          _sum: { quantityOrdered: true },
        }).catch(() => ({ _sum: { quantityOrdered: 0 } })),
        db.productionOrder.count({
          where: {
            organizationId: orgId,
            documentDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }).catch(() => 0),
      ]);

    const total = openOrders + closedOrders;
    const health: ProductionData["productionHealth"] =
      total === 0 ? "unknown" : recentCount > 0 ? "active" : "idle";

    return {
      openProductionOrders: openOrders,
      closedProductionOrders: closedOrders,
      referencesInProduction: uniqueRefs.length,
      totalQuantityOrdered: totalQty._sum?.quantityOrdered ?? 0,
      recentOrders: recentCount,
      productionHealth: health,
    };
  } catch {
    // Production tables may not exist yet — graceful degradation
    return {
      openProductionOrders: 0,
      closedProductionOrders: 0,
      referencesInProduction: 0,
      totalQuantityOrdered: 0,
      recentOrders: 0,
      productionHealth: "unknown",
    };
  }
}
