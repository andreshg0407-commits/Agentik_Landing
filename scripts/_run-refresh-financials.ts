/**
 * scripts/_run-refresh-financials.ts
 *
 * Runs refreshAllCustomerFinancials for the castillitos org,
 * then verifies LTV/L12M for DIANA ALZATE.
 */

import { prisma }                        from "@/lib/prisma";
import { refreshAllCustomerFinancials }  from "@/lib/customer360/service";

const ORG_ID        = "cmmpwstuf000dp5y58kj1daaj";
const CANONICAL_ID  = "cmnjaig7h0kdy7yy5x1ig4w4x";

async function main() {
  console.log("Running refreshAllCustomerFinancials for castillitos...");
  await refreshAllCustomerFinancials(ORG_ID);
  console.log("Done. Checking DIANA ALZATE profile...\n");

  const p = await prisma.customerProfile.findUnique({
    where: { id: CANONICAL_ID },
    select: {
      name:             true,
      nit:              true,
      sagTerceroId:     true,
      ltv:              true,
      totalSalesL12:    true,
      avgMonthlyRevenue: true,
      avgTicket:        true,
      purchasePeriods:  true,
      lastPurchaseAt:   true,
      erpSyncedAt:      true,
    },
  });

  if (!p) { console.log("Profile not found!"); return; }

  console.log("name           :", p.name);
  console.log("nit            :", p.nit);
  console.log("sagTerceroId   :", p.sagTerceroId);
  console.log("ltv            :", p.ltv?.toString() ?? "NULL");
  console.log("totalSalesL12  :", p.totalSalesL12?.toString() ?? "NULL");
  console.log("avgMonthlyRevenue:", p.avgMonthlyRevenue?.toString() ?? "NULL");
  console.log("avgTicket      :", p.avgTicket?.toString() ?? "NULL");
  console.log("purchasePeriods:", p.purchasePeriods);
  console.log("lastPurchaseAt :", p.lastPurchaseAt ?? "NULL");
  console.log("erpSyncedAt    :", p.erpSyncedAt);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
