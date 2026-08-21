/**
 * lib/copilot-core/adapters/customers-adapter.ts
 *
 * Copilot Core — Customer Summary Adapter
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Produces aggregated customer summary.
 * PROHIBITED: NIT, email, phone, credit limit, address,
 * individual customer records, individual names, any identifier.
 * Returns ONLY: counts, segments, aggregated totals.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { CopilotAdapter, CopilotAdapterContext, CopilotAdapterResult } from "../copilot-core-gateway";
import type { FactRef } from "../copilot-core-types";

export interface CustomerSummaryDto {
  readonly totalCustomers: number;
  readonly activeCustomers: number;
  readonly inactiveCustomers: number;
  readonly sourceBreakdown: {
    readonly source: string;
    readonly count: number;
  }[];
  readonly asOf: string;
}

export const customersAdapter: CopilotAdapter = {
  capabilityId: "commercial.customers.summary.read",

  async execute(ctx: CopilotAdapterContext): Promise<CopilotAdapterResult> {
    const orgId = ctx.envelope.organizationId;

    // Aggregated counts only — no individual records
    const [totalCustomers, activeCustomers] = await Promise.all([
      prisma.customerProfile.count({
        where: { organizationId: orgId },
      }),
      prisma.customerProfile.count({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
        },
      }),
    ]);

    const inactiveCustomers = totalCustomers - activeCustomers;

    const dto: CustomerSummaryDto = {
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      sourceBreakdown: [],
      asOf: new Date().toISOString(),
    };

    const facts: FactRef[] = [
      {
        source: "customer_profile",
        sourceRecordId: orgId,
        sourceUpdatedAt: new Date().toISOString(),
        organizationId: orgId,
        confidence: 0.9,
        truthState: "PARTIAL",
      },
    ];

    return {
      data: dto,
      facts,
      truthState: "PARTIAL",
      redactedFields: ["nit", "email", "phone", "address", "creditLimit", "customerName"],
    };
  },
};
