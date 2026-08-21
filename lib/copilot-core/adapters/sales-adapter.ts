/**
 * lib/copilot-core/adapters/sales-adapter.ts
 *
 * Copilot Core — Sales Performance Adapter
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Produces aggregated org-wide sales performance.
 * Uses Prisma aggregation on CustomerOrderRecord for org-level totals.
 * PROHIBITED: NIT, individual seller details, customer names.
 * Returns ONLY: aggregated KPIs (totalOrders, totalValue, avgTicket).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { CopilotAdapter, CopilotAdapterContext, CopilotAdapterResult } from "../copilot-core-gateway";
import type { FactRef } from "../copilot-core-types";

export interface SalesPerformanceDto {
  readonly totalOrders: number;
  readonly totalValue: number;
  readonly avgTicket: number;
  readonly totalSellers: number;
  readonly totalCustomers: number;
  readonly asOf: string;
}

export const salesAdapter: CopilotAdapter = {
  capabilityId: "commercial.sales.performance.read",

  async execute(ctx: CopilotAdapterContext): Promise<CopilotAdapterResult> {
    const orgId = ctx.envelope.organizationId;

    // Org-wide aggregation — no individual records
    const [orderAgg, sellerCount, customerCount] = await Promise.all([
      prisma.customerOrderRecord.aggregate({
        where: { organizationId: orgId },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.customerOrderRecord.groupBy({
        by: ["sellerName"],
        where: { organizationId: orgId },
      }),
      prisma.customerOrderRecord.groupBy({
        by: ["customerNit"],
        where: { organizationId: orgId },
      }),
    ]);

    const totalOrders = orderAgg._count ?? 0;
    const totalValue = Number(orderAgg._sum?.amount ?? 0);
    const avgTicket = totalOrders > 0 ? totalValue / totalOrders : 0;

    const dto: SalesPerformanceDto = {
      totalOrders,
      totalValue: Math.round(totalValue),
      avgTicket: Math.round(avgTicket),
      totalSellers: sellerCount.length,
      totalCustomers: customerCount.length,
      asOf: new Date().toISOString(),
    };

    const facts: FactRef[] = [
      {
        source: "customer_order_record",
        sourceRecordId: orgId,
        sourceUpdatedAt: new Date().toISOString(),
        organizationId: orgId,
        confidence: 0.95,
        truthState: "VERIFIED",
      },
    ];

    return {
      data: dto,
      facts,
      truthState: "VERIFIED",
      redactedFields: ["sellerName", "sellerCode", "customerNit", "customerName"],
    };
  },
};
