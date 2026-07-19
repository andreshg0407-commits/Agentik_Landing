/**
 * PHASE 9 — Validate UI data by calling loadVendorSampleData directly
 * This produces the exact same data the UI page.tsx renders.
 * MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01
 */
import { loadVendorSampleData } from "@/lib/comercial/maletas/vendor-sample-loader";
import { prisma } from "@/lib/prisma";

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "castillitos" },
  });

  console.log("[PHASE 9] Loading vendor sample data via loadVendorSampleData()...\n");

  const data = await loadVendorSampleData(org.id);

  // Find Nestor (B48)
  const nestor = data.vendors.find((v) => v.vendorName === "Nestor");
  if (!nestor) {
    console.error("Nestor not found in vendors");
    process.exit(1);
  }

  console.log(`Vendor: ${nestor.vendorName} (${nestor.vendorId})`);
  console.log(`Active: ${nestor.isActive}`);
  console.log(`Total refs: ${nestor.refs.length}`);
  console.log(`Source: ${data.source}`);

  // Check grupoSag is populated
  const refsWithGrupo = nestor.refs.filter((r) => r.grupoSag != null);
  const refsWithoutGrupo = nestor.refs.filter((r) => r.grupoSag == null);
  console.log(`\nRefs with grupoSag: ${refsWithGrupo.length}`);
  console.log(`Refs without grupoSag: ${refsWithoutGrupo.length}`);

  // Sample grupoSag values
  const grupoCounts = new Map<string, number>();
  for (const r of nestor.refs) {
    const k = r.grupoSag ?? "(null)";
    grupoCounts.set(k, (grupoCounts.get(k) ?? 0) + 1);
  }
  console.log("\ngrupoSag distribution:");
  for (const [k, v] of [...grupoCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)} → ${v} refs`);
  }

  // Assortment evaluations
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  ASSORTMENT EVALUATIONS (what the UI shows)");
  console.log("════════════════════════════════════════════════════════════════\n");

  const nestorEval = data.assortmentEvaluations.find((e) => e.vendorId === nestor.vendorId);
  if (!nestorEval) {
    console.error("No assortment evaluation for Nestor");
    process.exit(1);
  }

  for (const catalog of nestorEval.catalogs) {
    console.log(`\n  ── ${catalog.catalogName} (${catalog.brand ?? "all"}) ──`);
    console.log(`  Overall completion: ${catalog.overallCompletion}%`);
    console.log(`  Complete: ${catalog.totalComplete}  Missing: ${catalog.totalMissing}  Excess: ${catalog.totalExcess}`);

    for (const group of catalog.groups) {
      console.log(`\n  ${group.groupName} (${group.groupCode}):`);
      for (const entry of group.entries) {
        const status = entry.currentUnits === 0 ? "ZERO"
          : entry.complete ? "OK"
          : "PARTIAL";
        console.log(`    ${(entry.subgroupCode ?? "").padEnd(30)} Ideal: ${entry.targetUnits}  Actual: ${entry.currentUnits}  Delta: ${entry.delta >= 0 ? "+" : ""}${entry.delta}  [${status}]`);
      }
    }
  }

  // Verify no double counting
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  DOUBLE-COUNTING CHECK");
  console.log("════════════════════════════════════════════════════════════════\n");

  const csEval = nestorEval.catalogs.find((c) => c.brand === "Castillitos");
  if (csEval) {
    const allMatchedRefs = new Set<string>();
    let duplicates = 0;
    for (const group of csEval.groups) {
      for (const entry of group.entries) {
        for (const ref of entry.matchedReferences) {
          if (allMatchedRefs.has(ref)) {
            duplicates++;
            console.log(`  DUPLICATE: ${ref} in ${group.groupCode}/${entry.subgroupCode}`);
          }
          allMatchedRefs.add(ref);
        }
      }
    }
    console.log(`  CS total unique matched refs: ${allMatchedRefs.size}`);
    console.log(`  CS duplicates across entries: ${duplicates}`);
    if (duplicates === 0) console.log("  ✓ No double counting in Castillitos");
  }

  const ltEval = nestorEval.catalogs.find((c) => c.brand === "Latin Kids");
  if (ltEval) {
    const allMatchedRefs = new Set<string>();
    let duplicates = 0;
    for (const group of ltEval.groups) {
      for (const entry of group.entries) {
        for (const ref of entry.matchedReferences) {
          if (allMatchedRefs.has(ref)) {
            duplicates++;
            console.log(`  DUPLICATE: ${ref} in ${group.groupCode}/${entry.subgroupCode}`);
          }
          allMatchedRefs.add(ref);
        }
      }
    }
    console.log(`  LT total unique matched refs: ${allMatchedRefs.size}`);
    console.log(`  LT duplicates across entries: ${duplicates}`);
    if (duplicates === 0) console.log("  ✓ No double counting in Latin Kids");
  }

  // Import regression
  const impEval = nestorEval.catalogs.find((c) => c.commercialWorld === "IMPORTACION");
  if (impEval) {
    console.log("\n  Import regression:");
    for (const group of impEval.groups) {
      for (const entry of group.entries) {
        console.log(`    ${(entry.subgroupCode ?? "").padEnd(15)} Before: ${entry.subgroupCode === "PEQUENO" ? 55 : entry.subgroupCode === "MEDIANO" ? 48 : 0}  After: ${entry.currentUnits}  ${entry.currentUnits === (entry.subgroupCode === "PEQUENO" ? 55 : entry.subgroupCode === "MEDIANO" ? 48 : 0) ? "✓ MATCH" : "✗ REGRESSION"}`);
      }
    }
  }

  // Verify net_qty = 0 exclusion
  const zeroQtyRefs = nestor.refs.filter((r) => !r.present);
  console.log(`\n  Refs with present=false (net_qty=0): ${zeroQtyRefs.length}`);
  if (zeroQtyRefs.length === 0) console.log("  ✓ All refs have net_qty > 0 (present=true)");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
