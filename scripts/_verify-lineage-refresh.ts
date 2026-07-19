/**
 * scripts/_verify-lineage-refresh.ts
 * Verify that runtimeLineage.primarySagSource is populated for ventas_dia_fuente1.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("no org"); process.exit(1); }

  // Check ventas KPI sources
  const ventasSources = await prisma.operationalKpiSource.findMany({
    where: {
      organizationId: org.id,
      kpiKey: "ventas_dia_fuente1",
    },
    select: { kpiKey: true, sourceName: true, validationStatus: true, runtimeLineage: true },
  });

  console.log(`\nventas_dia_fuente1 (${ventasSources.length} sources):`);
  for (const s of ventasSources) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineage = s.runtimeLineage as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primary = lineage?.primarySagSource as any;
    if (primary && !primary.unresolved) {
      console.log(`  ✅ ${s.sourceName}`);
      console.log(`     primarySagSource: ${primary.code} — ${primary.sourceName}`);
      console.log(`     rowCount: ${primary.rowCount.toLocaleString()} | confidence: ${primary.confidence}% | fuente: ${primary.fuente}`);
    } else if (primary?.unresolved) {
      console.log(`  ⚠  ${s.sourceName} — UNRESOLVED: ${primary.unresolvedReason}`);
    } else {
      console.log(`  ❌ ${s.sourceName} — no lineage`);
    }
  }

  // Check cobros
  const cobrosSources = await prisma.operationalKpiSource.findMany({
    where: {
      organizationId: org.id,
      kpiKey: { in: ["recaudos_dia", "recaudos_dia_tesoreria"] },
    },
    select: { kpiKey: true, sourceName: true, runtimeLineage: true },
  });
  console.log(`\nCobros sources (${cobrosSources.length}):`);
  for (const s of cobrosSources) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primary = (s.runtimeLineage as any)?.primarySagSource as any;
    if (primary && !primary.unresolved) {
      console.log(`  ✅ [${s.kpiKey}] ${s.sourceName} → ${primary.code} — ${primary.sourceName}`);
    } else {
      console.log(`  - [${s.kpiKey}] ${s.sourceName} → ${primary?.unresolved ? "unresolved" : "no lineage"}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
