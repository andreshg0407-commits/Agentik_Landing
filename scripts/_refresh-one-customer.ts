/**
 * Targeted financial refresh for a single customer by sagTerceroId.
 * Used to validate the SaleRecord → sagTerceroId join fix.
 */

import { prisma }   from "@/lib/prisma";
import { Prisma }   from "@prisma/client";

const ORG_ID       = "cmmpwstuf000dp5y58kj1daaj";
const SAG_ID       = 526;      // DIANA ALZATE
const CANONICAL_ID = "cmnjaig7h0kdy7yy5x1ig4w4x";

function toNumber(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

async function main() {
  const saleNitKey = String(SAG_ID); // "526" — what SaleRecord.customerNit actually stores

  console.log(`Refreshing financials for sagTerceroId=${SAG_ID} (key="${saleNitKey}")...`);

  const [agg] = await prisma.$queryRaw<Array<{
    ltv: number;
    total_l12: number;
    avg_monthly: number | null;
    avg_ticket: number | null;
    last_purchase: string | null;
    periods: string;
  }>>(Prisma.sql`
    SELECT
      SUM("amount")::float8                                               AS ltv,
      SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
               THEN "amount" ELSE 0 END)::float8                        AS total_l12,
      (
        SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
                 THEN "amount" ELSE 0 END)::float8
        / NULLIF(COUNT(DISTINCT CASE
            WHEN "saleDate" >= NOW() - INTERVAL '12 months'
            THEN "periodoAoMes" END), 0)
      )                                                                  AS avg_monthly,
      CASE WHEN SUM("txCount") > 0
           THEN (SUM("amount") / SUM("txCount"))::float8
           ELSE NULL END                                                 AS avg_ticket,
      TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')                            AS last_purchase,
      CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)                      AS periods
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${saleNitKey}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
  `);

  console.log("\nRaw aggregation from SaleRecord:");
  console.log("  ltv          :", agg?.ltv ?? "NULL");
  console.log("  total_l12    :", agg?.total_l12 ?? "NULL");
  console.log("  avg_monthly  :", agg?.avg_monthly ?? "NULL");
  console.log("  avg_ticket   :", agg?.avg_ticket ?? "NULL");
  console.log("  last_purchase:", agg?.last_purchase ?? "NULL");
  console.log("  periods      :", agg?.periods ?? "NULL");

  if (!agg || agg.ltv == null) {
    console.log("\nNo SaleRecord rows found for this sagTerceroId. Aborting update.");
    return;
  }

  // Apply the update
  const db = prisma as any;
  await db.customerProfile.update({
    where: { id: CANONICAL_ID },
    data: {
      ltv:               toNumber(agg.ltv),
      totalSalesL12:     toNumber(agg.total_l12),
      avgMonthlyRevenue: agg.avg_monthly != null ? toNumber(agg.avg_monthly) : null,
      avgTicket:         agg.avg_ticket  != null ? toNumber(agg.avg_ticket)  : null,
      lastPurchaseAt:    agg.last_purchase ? new Date(agg.last_purchase) : undefined,
      purchasePeriods:   Number(agg.periods ?? 0),
      erpSyncedAt:       new Date(),
    },
  });

  console.log("\nProfile updated. Verifying...");

  const p = await db.customerProfile.findUnique({
    where: { id: CANONICAL_ID },
    select: { name: true, ltv: true, totalSalesL12: true, lastPurchaseAt: true, purchasePeriods: true },
  });

  console.log("\nFinal profile:");
  console.log("  name          :", p.name);
  console.log("  ltv           :", p.ltv?.toString() ?? "NULL");
  console.log("  totalSalesL12 :", p.totalSalesL12?.toString() ?? "NULL");
  console.log("  lastPurchaseAt:", p.lastPurchaseAt ?? "NULL");
  console.log("  purchasePeriods:", p.purchasePeriods);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
