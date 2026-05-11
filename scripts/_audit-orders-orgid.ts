/**
 * _audit-orders-orgid.ts — audit CustomerOrderRecord organizationId distribution
 */
import { prisma } from "@/lib/prisma";

const EXPECTED_ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const db = prisma as any;

  // 1. GroupBy organizationId
  const byOrg = await db.customerOrderRecord.groupBy({
    by: ["organizationId"],
    _count: { _all: true },
    _max:   { orderDate: true },
  });

  process.stdout.write("\n=== CustomerOrderRecord by organizationId ===\n");
  for (const row of byOrg) {
    const match = row.organizationId === EXPECTED_ORG_ID ? " ← EXPECTED" : " ← DIFFERENT";
    process.stdout.write(
      `  orgId: ${row.organizationId}${match}\n` +
      `  count: ${row._count._all}\n` +
      `  max orderDate: ${row._max.orderDate?.toISOString().slice(0,10) ?? "null"}\n\n`
    );
  }

  // 2. Sample 3 raw rows to inspect all fields
  process.stdout.write("=== 3 sample rows (all fields relevant) ===\n");
  const sample = await db.customerOrderRecord.findMany({
    take:    3,
    orderBy: { orderDate: "desc" },
    select:  { id: true, organizationId: true, orderDate: true, sourceCode: true, status: true, amount: true },
  });
  for (const r of sample) {
    process.stdout.write(
      `  id=${r.id} org=${r.organizationId} date=${r.orderDate?.toISOString().slice(0,10)} src=${r.sourceCode} status=${r.status} amt=${r.amount}\n`
    );
  }

  // 3. getLatestOrderDate with the expected orgId
  process.stdout.write(`\n=== getLatestOrderDate("${EXPECTED_ORG_ID}") ===\n`);
  const latest = await db.customerOrderRecord.findFirst({
    where:   { organizationId: EXPECTED_ORG_ID },
    orderBy: { orderDate: "desc" },
    select:  { orderDate: true, organizationId: true },
  });
  process.stdout.write(`  result: ${JSON.stringify(latest)}\n`);

  // 4. Total count for expected org
  const count = await db.customerOrderRecord.count({ where: { organizationId: EXPECTED_ORG_ID } });
  process.stdout.write(`  count for expected org: ${count}\n`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
