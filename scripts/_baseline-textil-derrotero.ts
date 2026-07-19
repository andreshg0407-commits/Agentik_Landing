/**
 * PHASE 1 — Pre-change baseline for MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01
 *
 * Captures current state of B48 (Nestor) derrotero before any code changes.
 * Uses the EXISTING evaluateVendorAssortment() to show what the UI currently sees.
 */
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import {
  fetchAllVendorPresence,
  fetchSubgruposLookup,
  VENDOR_BODEGA_CONFIGS,
} from "@/lib/comercial/maletas/vendor-sample-presence-engine";

async function main() {
  const sagConfig = loadSagTestEnv();
  const presenceResults = await fetchAllVendorPresence(sagConfig);
  const subgrupoLookup = await fetchSubgruposLookup(sagConfig);

  // Find B48 (Nestor)
  const nestor = presenceResults.find((p) => p.bodegaKaNl === 48);
  if (!nestor) { console.error("B48 not found"); process.exit(1); }

  const presentItems = nestor.items.filter((i) => i.present);
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  PHASE 1 — BASELINE B48 (Nestor)");
  console.log("════════════════════════════════════════════════════════════════\n");

  // Load product enrichment for brand resolution
  const refCodes = presentItems.map((i) => i.reference);
  const products = await prisma.productEntity.findMany({
    where: { sku: { in: refCodes }, organizationId: { not: undefined } },
    select: {
      sku: true,
      productLine: true,
      category: true,
      handlingUnit: true,
      subgrupoId: true,
      subgrupoSag: true,
    },
  });

  const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "5": "AC" };
  const BRAND_MAP: Record<string, string> = {
    "1": "Latin Kids",
    "2": "Castillitos",
    "5": "Importacion",
  };

  const prodMap = new Map(products.map((p) => [p.sku, p]));

  let ltCount = 0, csCount = 0, importCount = 0, otherCount = 0;
  for (const item of presentItems) {
    const prod = prodMap.get(item.reference);
    const line = LINE_MAP[prod?.productLine ?? ""] ?? "OT";
    if (line === "LT") ltCount++;
    else if (line === "CS") csCount++;
    else if (line === "AC") importCount++;
    else otherCount++;
  }

  console.log(`1. Total refs net_qty > 0:       ${presentItems.length}`);
  console.log(`2. Latin Kids:                   ${ltCount}`);
  console.log(`3. Castillitos:                  ${csCount}`);
  console.log(`4. Importacion:                  ${importCount}`);
  console.log(`5. Otros:                        ${otherCount}`);

  // Now simulate the matching to show what the current matcher produces
  // Build refs with subgrupoSag resolved
  interface SimRef {
    reference: string;
    brand: string | null;
    line: string;
    subgrupoSag: string;
    sizeClass: string | null;
    group: string | null;
  }

  const simRefs: SimRef[] = [];
  for (const item of presentItems) {
    const prod = prodMap.get(item.reference);
    const line = LINE_MAP[prod?.productLine ?? ""] ?? "OT";
    const brand = BRAND_MAP[prod?.productLine ?? ""] ?? null;
    const subgrupoName = item.subgrupoId != null
      ? (subgrupoLookup.get(item.subgrupoId) ?? "OTRO")
      : "OTRO";
    simRefs.push({
      reference: item.reference,
      brand,
      line,
      subgrupoSag: subgrupoName,
      sizeClass: prod?.handlingUnit ?? null,
      group: prod?.category ?? null,
    });
  }

  // Current matching logic (reproducing matchRefs exactly as-is)
  function currentMatchTextil(refs: SimRef[], entrySubgroupCode: string | null): SimRef[] {
    return refs.filter((r) => r.subgrupoSag === entrySubgroupCode);
  }
  function currentMatchImport(refs: SimRef[], entrySubgroupCode: string | null): SimRef[] {
    return refs.filter((r) => r.sizeClass !== null && r.sizeClass === entrySubgroupCode);
  }

  // CS Textil catalog entries
  const CS_ENTRIES = [
    { group: "CS_NINA_BEBE", entries: [
      { code: "PIJAMA_CL", name: "Pijama Niña BB CL", target: 3 },
      { code: "PIJAMA_LL", name: "Pijama Niña BB LL", target: 2 },
      { code: "CONJUNTO_CC", name: "Conjunto Niña BB CC", target: 3 },
      { code: "CONJUNTO_CL", name: "Conjunto Niña BB CL", target: 2 },
      { code: "BLUSAS", name: "Blusas", target: 2 },
      { code: "VESTIDO", name: "Vestido", target: 3 },
      { code: "CAMISETA", name: "Camiseta", target: 1 },
      { code: "MAMELUCO", name: "Mameluco", target: 1 },
      { code: "BUZO_CAMIBUSO", name: "Buzo / Camibuso", target: 1 },
    ]},
    { group: "CS_NINO_BEBE", entries: [
      { code: "PIJAMA_CL", name: "Pijama Niño BB CL", target: 3 },
      { code: "PIJAMA_LL", name: "Pijama Niño BB LL", target: 2 },
      { code: "CONJUNTO_CC", name: "Conjunto Niño BB CC", target: 2 },
      { code: "CONJUNTO_CL", name: "Conjunto Niño BB CL", target: 3 },
      { code: "CAMISETA", name: "Camiseta", target: 2 },
      { code: "MAMELUCO", name: "Mameluco", target: 1 },
      { code: "BUZO_CAMIBUSO", name: "Buzo / Camibuso", target: 1 },
      { code: "POLO", name: "Polo", target: 1 },
    ]},
    { group: "CS_NINA_KIDS", entries: [
      { code: "PIJAMA_CL", name: "Pijama Niña Kids CL", target: 3 },
      { code: "PIJAMA_LL", name: "Pijama Niña Kids LL", target: 2 },
      { code: "CONJUNTO_CC", name: "Conjunto Niña Kids CC", target: 2 },
      { code: "CONJUNTO_CL", name: "Conjunto Niña Kids CL", target: 2 },
      { code: "BLUSA", name: "Blusa", target: 2 },
      { code: "VESTIDO", name: "Vestido", target: 3 },
      { code: "CAMISETA", name: "Camiseta", target: 1 },
      { code: "BUZO_CAMIBUSO", name: "Buzo / Camibuso", target: 1 },
    ]},
    { group: "CS_NINO_KIDS", entries: [
      { code: "PIJAMA_CL", name: "Pijama Niño Kids CL", target: 3 },
      { code: "PIJAMA_LL", name: "Pijama Niño Kids LL", target: 2 },
      { code: "CONJUNTO_CC", name: "Conjunto Niño Kids CC", target: 2 },
      { code: "CONJUNTO_CL", name: "Conjunto Niño Kids CL", target: 3 },
      { code: "CAMISETA", name: "Camiseta", target: 2 },
      { code: "BUZO_CAMIBUSO", name: "Buzo / Camibuso", target: 1 },
      { code: "POLO", name: "Polo", target: 1 },
    ]},
  ];

  const LT_ENTRIES = [
    { code: "60_CONJUNTOS", name: "60 Conjuntos", target: 3 },
    { code: "20_CONJUNTOS_PANTALONETA", name: "20 Conjuntos Pantaloneta", target: 5 },
    { code: "80_CONJUNTOS", name: "80 Conjuntos", target: 5 },
    { code: "CONJUNTO_CL_2_8", name: "Conjunto CL 2-8", target: 5 },
    { code: "CONJUNTO_CC_2_8", name: "Conjunto CC 2-8", target: 4 },
    { code: "CONJUNTO_LL_2_8", name: "Conjunto LL 2-8", target: 3 },
    { code: "CONJUNTO_CL_10_16", name: "Conjunto CL 10-16", target: 4 },
    { code: "CONJUNTO_CC_10_16", name: "Conjunto CC 10-16", target: 3 },
    { code: "CONJUNTO_LL_10_16", name: "Conjunto LL 10-16", target: 3 },
    { code: "PIJAMA_CL", name: "Pijama CL", target: 3 },
    { code: "PIJAMA_LL", name: "Pijama LL", target: 3 },
    { code: "PIJAMA_CL_NINA_18_22", name: "Pijama CL Niña 18-22", target: 2 },
    { code: "PIJAMA_CL_NINO_18_22", name: "Pijama CL Niño 18-22", target: 2 },
    { code: "PIJAMA_CC_NINA_18_22", name: "Pijama CC Niña 18-22", target: 2 },
    { code: "PIJAMA_CC_NINO_18_22", name: "Pijama CC Niño 18-22", target: 2 },
  ];

  const IMPORT_ENTRIES = [
    { code: "PEQUENO", name: "Pequeño", target: 10 },
    { code: "MEDIANO", name: "Mediano", target: 10 },
    { code: "GRANDE", name: "Grande", target: 3 },
  ];

  const csRefs = simRefs.filter((r) => r.brand === "Castillitos" && r.line !== "AC");
  const ltRefs = simRefs.filter((r) => r.brand === "Latin Kids" && r.line !== "AC");
  const importRefs = simRefs.filter((r) => r.line === "AC");

  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("  CASTILLITOS TEXTIL — Current matching (subgrupoSag === subgroupCode)");
  console.log("────────────────────────────────────────────────────────────────\n");

  let csTotalMatched = 0, csTotalEntries = 0, csZeroEntries = 0;
  for (const g of CS_ENTRIES) {
    console.log(`  ${g.group}:`);
    for (const e of g.entries) {
      csTotalEntries++;
      const matched = currentMatchTextil(csRefs, e.code);
      csTotalMatched += matched.length;
      if (matched.length === 0) csZeroEntries++;
      const status = matched.length >= e.target ? "OK" : matched.length === 0 ? "ZERO" : "PARTIAL";
      console.log(`    ${e.code.padEnd(20)} Ideal: ${e.target}  Actual: ${matched.length}  [${status}]`);
    }
  }

  console.log(`\n  CS refs total: ${csRefs.length}`);
  console.log(`  CS refs matched: ${csTotalMatched}`);
  console.log(`  CS entries at zero: ${csZeroEntries} / ${csTotalEntries}`);

  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("  LATIN KIDS TEXTIL — Current matching (subgrupoSag === subgroupCode)");
  console.log("────────────────────────────────────────────────────────────────\n");

  let ltTotalMatched = 0, ltTotalEntries = 0, ltZeroEntries = 0;
  for (const e of LT_ENTRIES) {
    ltTotalEntries++;
    const matched = currentMatchTextil(ltRefs, e.code);
    ltTotalMatched += matched.length;
    if (matched.length === 0) ltZeroEntries++;
    const status = matched.length >= e.target ? "OK" : matched.length === 0 ? "ZERO" : "PARTIAL";
    console.log(`  ${e.code.padEnd(30)} Ideal: ${e.target}  Actual: ${matched.length}  [${status}]`);
  }

  console.log(`\n  LT refs total: ${ltRefs.length}`);
  console.log(`  LT refs matched: ${ltTotalMatched}`);
  console.log(`  LT entries at zero: ${ltZeroEntries} / ${ltTotalEntries}`);

  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("  IMPORTACION — Current matching (sizeClass === subgroupCode)");
  console.log("────────────────────────────────────────────────────────────────\n");

  let impTotalMatched = 0;
  for (const e of IMPORT_ENTRIES) {
    const matched = currentMatchImport(importRefs, e.code);
    impTotalMatched += matched.length;
    const status = matched.length >= e.target ? "OK" : matched.length === 0 ? "ZERO" : "PARTIAL";
    console.log(`  ${e.code.padEnd(20)} Ideal: ${e.target}  Actual: ${matched.length}  [${status}]`);
  }

  console.log(`\n  Import refs total: ${importRefs.length}`);
  console.log(`  Import refs matched: ${impTotalMatched}`);

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  BASELINE SUMMARY");
  console.log("════════════════════════════════════════════════════════════════\n");

  console.log(`  B48 total present: ${presentItems.length}`);
  console.log(`  CS:     ${csRefs.length} refs → ${csTotalMatched} matched (${csZeroEntries}/${csTotalEntries} entries at zero)`);
  console.log(`  LT:     ${ltRefs.length} refs → ${ltTotalMatched} matched (${ltZeroEntries}/${ltTotalEntries} entries at zero)`);
  console.log(`  Import: ${importRefs.length} refs → ${impTotalMatched} matched`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
