/**
 * scripts/_verify-sales-identity.ts
 *
 * Fase 1 — Sales Identity Verification for DIANA ALZATE
 * Read-only queries to diagnose why LTV/L12M show empty.
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const CANONICAL_ID  = "cmnjaig7h0kdy7yy5x1ig4w4x";
  const NIT           = "901383501";

  console.log("=".repeat(60));
  console.log("Fase 1 — Sales Identity Verification");
  console.log("=".repeat(60));

  // 1. SaleRecord count for this NIT
  const saleCount = await prisma.saleRecord.count({
    where: { customerNit: NIT },
  });
  const saleAgg = await prisma.saleRecord.aggregate({
    where: { customerNit: NIT },
    _sum:  { amount: true },
    _min:  { saleDate: true },
    _max:  { saleDate: true },
  });
  console.log("\n[1] SaleRecord for NIT", NIT);
  console.log("    count  :", saleCount);
  console.log("    sum    :", saleAgg._sum.amount?.toString() ?? "null");
  console.log("    minDate:", saleAgg._min.saleDate ?? "null");
  console.log("    maxDate:", saleAgg._max.saleDate ?? "null");

  // Also check customerName variants
  const nameVariants = await prisma.saleRecord.groupBy({
    by: ["customerName"],
    where: { customerNit: NIT },
    _count: { id: true },
    _sum:   { amount: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });
  console.log("\n    Top customerName variants:");
  if (nameVariants.length === 0) {
    console.log("    (none — customerNit matches zero rows)");
  }
  for (const v of nameVariants) {
    console.log(`    "${v.customerName}" → ${v._count.id} rows, sum=${v._sum.amount?.toString()}`);
  }

  // 2. CustomerProfile fields
  const profile = await prisma.customerProfile.findUnique({
    where: { id: CANONICAL_ID },
    select: {
      id:              true,
      nit:             true,
      nitNormalized:   true,
      sagTerceroId:    true,
      identityStatus:  true,
      ltv:             true,
      totalSalesL12:   true,
      erpSyncedAt:     true,
      name:            true,
    },
  });
  console.log("\n[2] CustomerProfile id=", CANONICAL_ID);
  if (!profile) {
    console.log("    NOT FOUND");
  } else {
    console.log("    name          :", profile.name);
    console.log("    nit           :", profile.nit ?? "NULL");
    console.log("    nitNormalized :", profile.nitNormalized ?? "NULL");
    console.log("    sagTerceroId  :", profile.sagTerceroId ?? "NULL");
    console.log("    identityStatus:", profile.identityStatus);
    console.log("    ltv           :", profile.ltv?.toString() ?? "NULL");
    console.log("    totalSalesL12 :", profile.totalSalesL12?.toString() ?? "NULL");
    console.log("    erpSyncedAt   :", profile.erpSyncedAt ?? "NULL");
  }

  // 3. Check if there are SaleRecords with a different NIT format
  const nitVariants = await prisma.saleRecord.findMany({
    where: {
      customerName: { contains: "DIANA", mode: "insensitive" },
    },
    select: { customerNit: true, customerName: true, amount: true, saleDate: true },
    distinct: ["customerNit"],
    take: 10,
  });
  console.log("\n[3] SaleRecord NIT variants for customerName LIKE 'DIANA':");
  if (nitVariants.length === 0) {
    console.log("    (none found)");
  }
  for (const r of nitVariants) {
    console.log(`    nit="${r.customerNit}" name="${r.customerName}"`);
  }

  // 4. Org-wide SaleRecord count for sanity
  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  const totalSales = await prisma.saleRecord.count({
    where: { organizationId: orgId },
  });
  console.log("\n[4] Total SaleRecord rows for castillitos org:", totalSales);

  console.log("\n" + "=".repeat(60));
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
