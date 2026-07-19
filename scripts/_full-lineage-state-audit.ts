/**
 * scripts/_full-lineage-state-audit.ts
 * Full state audit: every OperationalKpiSource row for castillitos with lineage state.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("no org"); process.exit(1); }

  const rows = await prisma.operationalKpiSource.findMany({
    where:   { organizationId: org.id },
    orderBy: { kpiKey: "asc" },
    select: {
      id: true, kpiKey: true, sourceName: true, moduleName: true,
      validationStatus: true, sourceOrigin: true, runtimeRowCount: true,
      runtimeLineage: true,
    },
  });

  console.log(`\nTotal OperationalKpiSource rows: ${rows.length}`);
  console.log("\nLineage state per row:\n");

  let hasLineage = 0;
  let noLineage  = 0;

  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineage  = r.runtimeLineage as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primary  = lineage?.primarySagSource as any;
    const state    = !lineage
      ? "NULL"
      : primary && !primary.unresolved
        ? `✅ ${primary.code} — ${primary.sourceName}`
        : primary?.unresolved
          ? `⚠  UNRESOLVED: ${primary.unresolvedReason?.slice(0, 60)}`
          : "lineage exists but no primarySagSource";

    if (lineage) hasLineage++; else noLineage++;

    console.log(`  [${r.kpiKey.slice(0, 28).padEnd(28)}] ${r.sourceName.slice(0, 35).padEnd(35)} | rows=${String(r.runtimeRowCount ?? 0).padStart(7)} | origin=${r.sourceOrigin ?? "null"} | ${state}`);
  }

  console.log(`\nSummary: ${hasLineage} with lineage, ${noLineage} without lineage`);

  // Distinct sourceOrigin values
  const origins = await prisma.operationalKpiSource.groupBy({
    by:    ["sourceOrigin"],
    where: { organizationId: org.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _count: { id: true } as any,
  });
  console.log("\nDistinct sourceOrigin values:");
  for (const o of origins) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`  ${JSON.stringify(o.sourceOrigin)} → ${(o._count as any).id} rows`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
