/**
 * scripts/refresh-runtime-lineage.ts
 *
 * One-shot CLI: refresh runtimeLineage (with primarySagSource) on ALL
 * OperationalKpiSource rows for the target org.
 *
 * Usage:
 *   npx tsx scripts/refresh-runtime-lineage.ts [orgSlug]
 *
 * Default org: castillitos
 *
 * Safe to re-run. Only updates runtimeLineage field.
 * Never changes validationStatus, sourceName, or any certified fields.
 *
 * Sprint: AGENTIK-SAG-LINEAGE-RESOLUTION-02
 */

import { prisma }                from "@/lib/prisma";
import { refreshRuntimeLineage } from "@/lib/operational-map/runtime/runtime-lineage-refresher";
import { resolvePrimarySagSourceCode } from "@/lib/operational-map/runtime/runtime-source-resolution";

const orgSlug = process.argv[2] ?? "castillitos";

async function main() {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  AGENTIK Runtime Lineage Refresh`);
  console.log(`  Org: ${orgSlug}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const org = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`❌  Organization not found: ${orgSlug}`);
    process.exit(1);
  }
  console.log(`  Organization: ${org.name} (${org.id})\n`);

  // ── Pre-flight: show what primary codes would resolve to
  console.log(`  Pre-flight: SAG primary source resolution`);
  const saleRes = await resolvePrimarySagSourceCode(org.id, "SaleRecord");
  const collRes = await resolvePrimarySagSourceCode(org.id, "CollectionRecord");

  if ("unresolved" in saleRes) {
    console.log(`  SaleRecord       → ⚠  ${saleRes.unresolvedReason}`);
  } else {
    console.log(`  SaleRecord       → ✅ ${saleRes.code} — ${saleRes.sourceName} (${saleRes.rowCount.toLocaleString()} filas, conf: ${saleRes.confidence}%)`);
  }
  if ("unresolved" in collRes) {
    console.log(`  CollectionRecord → ⚠  ${collRes.unresolvedReason}`);
  } else {
    console.log(`  CollectionRecord → ✅ ${collRes.code} — ${collRes.sourceName} (${collRes.rowCount.toLocaleString()} filas, conf: ${collRes.confidence}%)`);
  }
  console.log("");

  // ── Run refresh
  console.log(`  Running refreshRuntimeLineage...`);
  const report = await refreshRuntimeLineage(org.id);

  console.log(`\n  Results:`);
  console.log(`    Models processed : ${report.modelsProcessed.join(", ") || "(none)"}`);
  console.log(`    Rows updated     : ${report.rowsUpdated}`);
  console.log(`    Rows skipped     : ${report.rowsSkipped}`);
  console.log(`    Errors           : ${report.errors}`);
  console.log(`\n  Detail:`);
  for (const d of report.details) {
    const icon = d.action === "updated" ? "✅" : d.action === "skipped" ? "⏭ " : "❌";
    console.log(`    ${icon}  ${d.model.padEnd(28)} ${d.action.padEnd(8)} ${d.reason ?? ""}`);
  }

  if (report.errors > 0) {
    console.log(`\n  ❌  ${report.errors} error(s) — check output above.`);
    process.exit(1);
  }

  console.log(`\n  ✅  Done. Lineage refreshed for ${report.rowsUpdated} rows.`);
  console.log(`     KPI sources now have primarySagSource populated.\n`);
}

main()
  .catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
