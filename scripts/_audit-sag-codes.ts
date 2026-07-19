/**
 * scripts/_audit-sag-codes.ts
 * Quick audit of actual SAG comprobanteCode values in castillitos DB.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("no org"); process.exit(1); }

  // SaleRecord codes
  const codes = await prisma.saleRecord.groupBy({
    by: ["comprobanteCode", "sagSourceType"],
    where: { organizationId: org.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });
  console.log("SaleRecord codes:");
  for (const c of codes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`  code=${JSON.stringify(c.comprobanteCode)} type=${JSON.stringify(c.sagSourceType)} rows=${(c._count as any).id}`);
  }

  // CollectionRecord
  const collCodes = await prisma.collectionRecord.groupBy({
    by: ["comprobanteCode"],
    where: { organizationId: org.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count: { id: true } as any,
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  console.log("\nCollectionRecord codes:");
  for (const c of collCodes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`  code=${JSON.stringify(c.comprobanteCode)} rows=${(c._count as any).id}`);
  }

  // SalesImportBatch
  const batches = await prisma.salesImportBatch.count({ where: { organizationId: org.id } });
  const batchSum = await prisma.salesImportBatch.aggregate({ where: { organizationId: org.id }, _sum: { rowCount: true } });
  console.log(`\nSalesImportBatch: ${batches} batches, total rows ~${batchSum._sum.rowCount}`);

  // OperationalKpiSource sample
  const sources = await prisma.operationalKpiSource.findMany({
    where: { organizationId: org.id },
    select: { sourceName: true, moduleName: true, provider: true, validationStatus: true, runtimeLineage: true },
    take: 8,
  });
  console.log("\nOperationalKpiSource sample:");
  for (const s of sources) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineage = s.runtimeLineage as any;
    console.log(`  sourceName=${JSON.stringify(s.sourceName)} moduleName=${JSON.stringify(s.moduleName)} hasPrimary=${!!(lineage?.primarySagSource)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
