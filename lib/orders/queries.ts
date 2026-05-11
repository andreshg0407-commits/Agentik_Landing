/**
 * lib/orders/queries.ts
 *
 * Query helpers for the CustomerOrderRecord pipeline (SAG PD — Pedidos Cliente).
 *
 * PD orders are EXCLUDED from SaleRecord (financial layer):
 *   - familiaDocumento: "PEDIDO" — not an invoice
 *   - efectoFinanciero: "SIN_IMPACTO_DASHBOARD"
 *   - participaEnVentas: false
 *
 * These helpers feed B1 "Pedidos del día" in the executive dashboard.
 */

import { prisma } from "@/lib/prisma";

export interface DailyOrderKpis {
  /** Total number of PD orders on the operational date */
  count: number;
  /** Sum of order amounts on the operational date (COP) */
  totalAmount: number;
  /** ISO date string of the latest order date available, or null if no orders exist */
  latestOrderDate: string | null;
}

/**
 * Returns order KPIs for a given operational date (UTC midnight).
 * Uses CustomerOrderRecord — never SaleRecord.
 *
 * @param orgId   - organizationId scope
 * @param dayStart - UTC midnight of the target date (inclusive)
 * @param dayEnd   - UTC midnight of the next day (exclusive)
 */
export async function getDailyOrderKpis(
  orgId:    string,
  dayStart: Date,
  dayEnd:   Date
): Promise<DailyOrderKpis> {
  const db = prisma as any;

  const [agg, latest] = await Promise.all([
    db.customerOrderRecord.aggregate({
      where: {
        organizationId: orgId,
        orderDate: { gte: dayStart, lt: dayEnd },
      },
      _count: { _all: true },
      _sum:   { amount: true },
    }),
    db.customerOrderRecord.findFirst({
      where:   { organizationId: orgId },
      orderBy: { orderDate: "desc" },
      select:  { orderDate: true },
    }),
  ]);

  return {
    count:           agg._count._all ?? 0,
    totalAmount:     Number(agg._sum.amount ?? 0),
    latestOrderDate: latest?.orderDate
      ? (latest.orderDate as Date).toISOString().slice(0, 10)
      : null,
  };
}

/**
 * Returns the latest orderDate available for the org, or null if no orders.
 * Used to resolve the operational date for B1 when SAG data lags behind wall-clock.
 */
export async function getLatestOrderDate(orgId: string): Promise<Date | null> {
  const db = prisma as any;
  const row = await db.customerOrderRecord.findFirst({
    where:   { organizationId: orgId },
    orderBy: { orderDate: "desc" },
    select:  { orderDate: true },
  }).catch(() => null);
  return row?.orderDate ?? null;
}
