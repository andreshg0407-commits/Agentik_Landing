/**
 * lib/customer360/scoring-service.ts
 *
 * Shared scoring execution logic — used by both:
 *   - POST /api/orgs/[orgSlug]/customer-360/score  (manual trigger via UI)
 *   - Connector sync post-hooks (automatic fire-and-forget after CRM sync)
 *
 * Always available:
 *   - With ANTHROPIC_API_KEY: Claude claude-sonnet-4-6 AI scoring
 *   - Without: deterministic instant fallback
 */

import { prisma }           from "@/lib/prisma";
import { Prisma }           from "@prisma/client";
import { scoreAllCustomers } from "@/lib/ai/commercial-intelligence";
import type { CustomerRiskInput } from "@/lib/ai/commercial-intelligence";

export interface ScoringRunResult {
  scored: number;
  source: "ai" | "deterministic";
  ms: number;
}

/**
 * Run customer risk scoring for an entire org (or a single customer by slug).
 *
 * Loads all ACTIVE CustomerProfiles, queries CRMActivity and SaleRecord for
 * scoring inputs, calls scoreAllCustomers(), then writes results back.
 *
 * Safe to call fire-and-forget — errors are caught internally.
 */
export async function runScoringForOrg(
  orgId: string,
  opts: { slug?: string } = {},
): Promise<ScoringRunResult> {
  const t0 = Date.now();
  const db = prisma as any;

  // Load profiles to score
  const where: Record<string, unknown> = { organizationId: orgId, status: "ACTIVE" };
  if (opts.slug) where.slug = opts.slug;

  const profiles = await db.customerProfile.findMany({
    where,
    select: {
      id: true, slug: true, name: true,
      ltv: true, lastPurchaseAt: true,
      totalReceivable: true, overdueReceivable: true, maxDpd: true,
      purchasePeriods: true, totalSalesL12: true,
      _count: { select: { crmOpportunities: { where: { status: "OPEN" } } } },
    },
    take: 1000,
  });

  if (profiles.length === 0) {
    return { scored: 0, source: "deterministic", ms: Date.now() - t0 };
  }

  // Query last activity date per customer
  type ActivityRow = { customerId: string; last_activity: Date | null };
  const activityRows: ActivityRow[] = await prisma.$queryRaw`
    SELECT "customerId", MAX("occurredAt") AS last_activity
    FROM "CRMActivity"
    WHERE "organizationId" = ${orgId}
      AND "customerId" IS NOT NULL
    GROUP BY "customerId"
  `;
  const activityMap = new Map(activityRows.map(r => [r.customerId, r.last_activity]));

  // Load NITs for all profiles in one pass
  const nitRows: Array<{ id: string; nit: string | null }> = await prisma.$queryRaw(
    Prisma.sql`
      SELECT id, nit FROM "CustomerProfile"
      WHERE "organizationId" = ${orgId}
        AND id = ANY(${profiles.map((p: any) => p.id)})
    `
  );
  const nitMap = new Map<string, string>();
  nitRows.forEach(r => { if (r.nit) nitMap.set(r.id, r.nit); });

  // Load L3 sales totals for all NITs in one query
  type SalesRow = { customer_nit: string; total_l3: number };
  const salesL3Rows: SalesRow[] = await prisma.$queryRaw`
    SELECT "customerNit" AS customer_nit, SUM("amount")::float8 AS total_l3
    FROM "SaleRecord"
    WHERE "organizationId" = ${orgId}
      AND "saleDate" >= NOW() - INTERVAL '3 months'
      AND "customerNit" IS NOT NULL
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    GROUP BY "customerNit"
  `;
  const salesL3Map = new Map(salesL3Rows.map(r => [r.customer_nit, r.total_l3]));

  // Build scoring inputs
  const inputs: CustomerRiskInput[] = profiles.map((p: any) => {
    const nit = nitMap.get(p.id);
    return {
      organizationId:    orgId,
      customerId:        p.id,
      customerName:      p.name,
      ltv:               Number(p.ltv ?? 0),
      lastPurchaseAt:    p.lastPurchaseAt ? new Date(p.lastPurchaseAt) : null,
      totalReceivable:   Number(p.totalReceivable ?? 0),
      overdueReceivable: Number(p.overdueReceivable ?? 0),
      maxDpd:            Number(p.maxDpd ?? 0),
      purchasePeriods:   Number(p.purchasePeriods ?? 0),
      totalSalesL12:     Number(p.totalSalesL12 ?? 0),
      totalSalesL3:      nit ? (salesL3Map.get(nit) ?? 0) : 0,
      openOpportunities: p._count?.crmOpportunities ?? 0,
      lastActivityAt:    activityMap.get(p.id) ?? null,
    };
  });

  // Run scoring
  const results = await scoreAllCustomers(orgId, inputs);

  // Write results back to CustomerProfile
  const CHUNK = 50;
  for (let i = 0; i < results.length; i += CHUNK) {
    const chunk = results.slice(i, i + CHUNK);
    await Promise.all(chunk.map(r =>
      db.customerProfile.update({
        where: { id: r.customerId },
        data: {
          riskScore:      r.riskScore,
          healthScore:    r.healthScore,
          churnRisk:      r.churnRisk,
          nextBestAction: r.nextBestAction,
          aiSummary:      r.aiSummary,
          scoredAt:       new Date(),
          updatedAt:      new Date(),
        },
      }).catch((e: Error) =>
        console.error("[scoring-service] update error for", r.customerId, e.message)
      ),
    ));
  }

  const source = process.env.ANTHROPIC_API_KEY ? "ai" : "deterministic";
  return { scored: results.length, source, ms: Date.now() - t0 };
}
