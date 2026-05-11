import { prisma } from "@/lib/prisma";

async function main() {
  const db = prisma as any;

  // All orgs
  const orgs = await db.organization.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  process.stdout.write("\n=== Organizations ===\n");
  for (const o of orgs) {
    process.stdout.write(`  slug=${o.slug.padEnd(30)} id=${o.id}  name=${o.name}\n`);
  }

  // CustomerOrderRecord counts per org (join with org name)
  const orderCounts = await db.customerOrderRecord.groupBy({
    by:      ["organizationId"],
    _count:  { _all: true },
    _max:    { orderDate: true },
  });
  process.stdout.write("\n=== CustomerOrderRecord counts per org ===\n");
  for (const row of orderCounts) {
    const org = orgs.find((o: any) => o.id === row.organizationId);
    process.stdout.write(
      `  orgId=${row.organizationId}  slug=${org?.slug ?? "UNKNOWN"}  count=${row._count._all}  maxDate=${row._max.orderDate?.toISOString().slice(0,10) ?? "null"}\n`
    );
  }

  // Which connectors exist and what orgId they belong to
  const connectors = await db.connector.findMany({
    select: { id: true, source: true, organizationId: true, name: true },
    where:  { source: "sag_pya_soap" },
  });
  process.stdout.write("\n=== sag_pya_soap connectors ===\n");
  for (const c of connectors) {
    const org = orgs.find((o: any) => o.id === c.organizationId);
    process.stdout.write(`  id=${c.id}  org=${c.organizationId}  slug=${org?.slug ?? "UNKNOWN"}  name=${c.name}\n`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
