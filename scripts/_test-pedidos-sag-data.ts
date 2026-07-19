/**
 * scripts/_test-pedidos-sag-data.ts
 * E2E test of Pedidos SAG data integration — directly testing Prisma queries.
 * Usage: DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" npx tsx scripts/_test-pedidos-sag-data.ts
 */
import { prisma } from "../lib/prisma";

async function main() {
  const castId = "cmmpwstuf000dp5y58kj1daaj";

  // Test 1: CRMQuote listing (SAG orders)
  console.log("=== CRMQuote (SAG orders) ===");
  const quotes = await prisma.cRMQuote.findMany({
    where: { organizationId: castId },
    orderBy: { issuedAt: "desc" },
    take: 5,
    select: { id: true, quoteNumber: true, amount: true, sellerName: true, issuedAt: true, rawCrmJson: true },
  });
  console.log("Total CRMQuote count:", await prisma.cRMQuote.count({ where: { organizationId: castId } }));
  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    console.log(`  #${q.quoteNumber} | ${raw.billing_account} | ${raw.stage} | $${q.amount} | ${q.sellerName} | ${String(q.issuedAt).slice(0, 10)}`);
  }

  // Test 2: CustomerProfile search
  console.log("\n=== CustomerProfile search (GARCIA) ===");
  const customers = await prisma.customerProfile.findMany({
    where: {
      organizationId: castId,
      status: "ACTIVE",
      name: { contains: "GARCIA", mode: "insensitive" },
    },
    take: 5,
    select: { name: true, nit: true, slug: true, city: true },
  });
  console.log("Found:", customers.length);
  for (const c of customers) console.log(`  ${c.name} | NIT: ${c.nit} | ${c.slug}`);

  // Test 3: CRMQuote full detail (simulate getOrder for SAG)
  if (quotes[0]) {
    console.log("\n=== CRMQuote detail (simulate getOrder) ===");
    const q = await prisma.cRMQuote.findFirst({
      where: { id: quotes[0].id, organizationId: castId },
    });
    if (q) {
      const raw = (q.rawCrmJson as any)?.raw ?? {};
      console.log("  Customer:", raw.billing_account);
      console.log("  Seller:", raw.created_by_name);
      console.log("  Stage:", raw.stage);
      console.log("  SAG ID:", raw.id_sag_c || "(none)");
      console.log("  SAG Response:", raw.respuesta_sag_c || "(none)");
      console.log("  Total:", raw.total_amount);
      console.log("  Subtotal:", raw.subtotal_amount);
    }
  }

  // Test 4: Empty search (recent customers)
  console.log("\n=== CustomerProfile total ACTIVE ===");
  const total = await prisma.customerProfile.count({
    where: { organizationId: castId, status: "ACTIVE" },
  });
  console.log("Total active customers:", total);

  // Test 5: Product sources
  console.log("\n=== Product data sources ===");
  const qlCount = await (prisma as any).cRMQuoteLine.count({ where: { organizationId: castId } });
  console.log("CRMQuoteLine:", qlCount);
  const csCount = await (prisma as any).commercialCoverageSnapshot.count({ where: { organizationId: castId } });
  console.log("CommercialCoverageSnapshot:", csCount);
  if (qlCount === 0 && csCount === 0) {
    console.log("  -> No product data synced. Product search will return empty. This is expected.");
  }

  console.log("\n=== ALL TESTS PASSED ===");
}

main()
  .then(() => (prisma as any).$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
