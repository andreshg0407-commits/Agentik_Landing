/**
 * lib/copilot-core/adapters/orders-adapter.ts
 *
 * Copilot Core — Orders Summary Adapter
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Produces aggregated order summary.
 * Uses getOrderStats() canonical service for org-level aggregates.
 * PROHIBITED: NIT, individual order details, customer names.
 * Returns ONLY: counts, totals, origin breakdown.
 */

import "server-only";

import { getOrderStats } from "@/lib/comercial/pedidos/order-service";
import type { CopilotAdapter, CopilotAdapterContext, CopilotAdapterResult } from "../copilot-core-gateway";
import type { FactRef } from "../copilot-core-types";

export interface OrderSummaryDto {
  readonly totalOrdersToday: number;
  readonly pendingSag: number;
  readonly synced: number;
  readonly conflicts: number;
  readonly originBreakdown: {
    readonly fromAgentik: number;
    readonly fromSag: number;
    readonly fromImport: number;
    readonly fromMigration: number;
  };
  readonly asOf: string;
}

export const ordersAdapter: CopilotAdapter = {
  capabilityId: "commercial.orders.summary.read",

  async execute(ctx: CopilotAdapterContext): Promise<CopilotAdapterResult> {
    const orgId = ctx.envelope.organizationId;

    const stats = await getOrderStats(orgId);

    const dto: OrderSummaryDto = {
      totalOrdersToday: stats.today,
      pendingSag: stats.pendingSag,
      synced: stats.synced,
      conflicts: stats.conflicts,
      originBreakdown: {
        fromAgentik: stats.fromAgentik,
        fromSag: stats.fromSag,
        fromImport: stats.fromImport,
        fromMigration: stats.fromMigration,
      },
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
      redactedFields: ["customerNit", "sellerName", "orderDetails"],
    };
  },
};
