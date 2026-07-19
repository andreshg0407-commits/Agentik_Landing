/**
 * PHASE 7-8 — Post-change diagnostic + traceability
 * MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01
 *
 * Uses the UPDATED matching logic to verify corrections.
 * Includes full traceability for 3 LT + 3 CS + 3 Import cases.
 */
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import {
  fetchAllVendorPresence,
  fetchSubgruposLookup,
  fetchSubgrupoToGrupoLookup,
} from "@/lib/comercial/maletas/vendor-sample-presence-engine";
import type { MalletAssortmentEntry, MalletAssortmentGroup } from "@/lib/comercial/maletas/assortment-catalog/mallet-assortment-types";
import {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
} from "@/lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog";

interface SimRef {
  reference: string;
  brand: string | null;
  line: string;
  subgrupoSag: string;
  grupoSag: string | null;
  sizeClass: string | null;
}

// Replicate the NEW matchRefs logic exactly
function newMatchRefs(
  refs: SimRef[],
  group: MalletAssortmentGroup,
  entry: MalletAssortmentEntry,
  world: string,
): SimRef[] {
  if (world === "IMPORTACION") {
    return refs.filter((r) => r.sizeClass !== null && r.sizeClass === entry.subgroupCode);
  }
  if (entry.sagSubgrupo == null) return [];
  const sagValues = Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo : [entry.sagSubgrupo];

  if (group.sagGrupo != null) {
    return refs.filter((r) => r.grupoSag === group.sagGrupo && sagValues.includes(r.subgrupoSag));
  }
  return refs.filter((r) => sagValues.includes(r.subgrupoSag));
}

async function main() {
  const sagConfig = loadSagTestEnv();
  const presenceResults = await fetchAllVendorPresence(sagConfig);
  const subgrupoLookup = await fetchSubgruposLookup(sagConfig);
  const grupoLookup = await fetchSubgrupoToGrupoLookup(sagConfig);

  const nestor = presenceResults.find((p) => p.bodegaKaNl === 48);
  if (!nestor) { console.error("B48 not found"); process.exit(1); }

  const presentItems = nestor.items.filter((i) => i.present);
  const refCodes = presentItems.map((i) => i.reference);
  const products = await prisma.productEntity.findMany({
    where: { sku: { in: refCodes } },
    select: { sku: true, productLine: true, handlingUnit: true, subgrupoId: true },
  });

  const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "5": "AC" };
  const BRAND_MAP: Record<string, string> = { "1": "Latin Kids", "2": "Castillitos", "5": "Importacion" };
  const prodMap = new Map(products.map((p) => [p.sku, p]));

  const simRefs: SimRef[] = [];
  for (const item of presentItems) {
    const prod = prodMap.get(item.reference);
    const line = LINE_MAP[prod?.productLine ?? ""] ?? "OT";
    const brand = BRAND_MAP[prod?.productLine ?? ""] ?? null;
    const subgrupoName = item.subgrupoId != null
      ? (subgrupoLookup.get(item.subgrupoId) ?? "OTRO")
      : "OTRO";
    const grupoSag = item.subgrupoId != null
      ? (grupoLookup.get(item.subgrupoId) ?? null)
      : null;
    simRefs.push({
      reference: item.reference,
      brand,
      line,
      subgrupoSag: subgrupoName,
      grupoSag,
      sizeClass: prod?.handlingUnit ?? null,
    });
  }

  const csRefs = simRefs.filter((r) => r.brand === "Castillitos" && r.line !== "AC");
  const ltRefs = simRefs.filter((r) => r.brand === "Latin Kids" && r.line !== "AC");
  const importRefs = simRefs.filter((r) => r.line === "AC");

  const csCatalog = buildCastillitosTextilCatalog();
  const ltCatalog = buildLatinKidsTextilCatalog();
  const importCatalog = buildImportAccesoriosCatalog();

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  PHASE 7 — POST-CHANGE DIAGNOSTIC");
  console.log("════════════════════════════════════════════════════════════════\n");

  // ── CS evaluation ─────────────────────────────────────────────────
  console.log("  CASTILLITOS TEXTIL — New matching (grupoSag + sagSubgrupo)\n");

  let csTotalMatched = 0, csTotalEntries = 0, csZeroEntries = 0;
  const csMatchedRefs = new Set<string>();
  for (const group of csCatalog.groups) {
    console.log(`  ${group.groupCode} (sagGrupo: "${group.sagGrupo}"):`);
    for (const entry of group.entries) {
      if (!entry.active) continue;
      csTotalEntries++;
      const matched = newMatchRefs(csRefs, group, entry, "TEXTIL");
      csTotalMatched += matched.length;
      matched.forEach((m) => csMatchedRefs.add(m.reference));
      if (matched.length === 0) csZeroEntries++;
      const sagLabel = entry.sagSubgrupo
        ? (Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo.join(" | ") : entry.sagSubgrupo)
        : "(null)";
      const status = entry.sagSubgrupo == null
        ? "RETAINED"
        : matched.length >= entry.targetUnits
        ? "OK"
        : matched.length === 0
        ? "ZERO"
        : "PARTIAL";
      console.log(`    ${(entry.subgroupCode ?? "").padEnd(20)} Ideal: ${entry.targetUnits}  Actual: ${matched.length}  sagSubgrupo: ${sagLabel}  [${status}]`);
    }
  }
  const csUnmatched = csRefs.filter((r) => !csMatchedRefs.has(r.reference));

  console.log(`\n  CS refs total: ${csRefs.length}`);
  console.log(`  CS refs matched: ${csMatchedRefs.size} (unique)`);
  console.log(`  CS refs unmatched: ${csUnmatched.length}`);
  console.log(`  CS entries at zero: ${csZeroEntries} / ${csTotalEntries}`);

  if (csUnmatched.length > 0) {
    console.log(`\n  UNMATCHED CS refs (first 15):`);
    const byGrupo = new Map<string, SimRef[]>();
    for (const r of csUnmatched) {
      const k = r.grupoSag ?? "(null)";
      if (!byGrupo.has(k)) byGrupo.set(k, []);
      byGrupo.get(k)!.push(r);
    }
    for (const [g, refs] of byGrupo) {
      const bySub = new Map<string, number>();
      for (const r of refs) {
        bySub.set(r.subgrupoSag, (bySub.get(r.subgrupoSag) ?? 0) + 1);
      }
      for (const [sub, cnt] of bySub) {
        console.log(`    grupoSag: "${g}"  subgrupoSag: "${sub}"  count: ${cnt}`);
      }
    }
  }

  // ── LT evaluation ─────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("  LATIN KIDS TEXTIL — New matching (sagSubgrupo only)\n");

  let ltTotalMatched = 0, ltTotalEntries = 0, ltZeroEntries = 0;
  const ltMatchedRefs = new Set<string>();
  for (const group of ltCatalog.groups) {
    for (const entry of group.entries) {
      if (!entry.active) continue;
      ltTotalEntries++;
      const matched = newMatchRefs(ltRefs, group, entry, "TEXTIL");
      ltTotalMatched += matched.length;
      matched.forEach((m) => ltMatchedRefs.add(m.reference));
      if (matched.length === 0) ltZeroEntries++;
      const sagLabel = entry.sagSubgrupo
        ? (Array.isArray(entry.sagSubgrupo) ? entry.sagSubgrupo.join(" | ") : entry.sagSubgrupo)
        : "(null)";
      const status = entry.sagSubgrupo == null
        ? "RETAINED"
        : matched.length >= entry.targetUnits
        ? "OK"
        : matched.length === 0
        ? "ZERO"
        : "PARTIAL";
      console.log(`  ${(entry.subgroupCode ?? "").padEnd(30)} Ideal: ${entry.targetUnits}  Actual: ${matched.length}  sagSubgrupo: ${sagLabel}  [${status}]`);
    }
  }
  const ltUnmatched = ltRefs.filter((r) => !ltMatchedRefs.has(r.reference));

  console.log(`\n  LT refs total: ${ltRefs.length}`);
  console.log(`  LT refs matched: ${ltMatchedRefs.size} (unique)`);
  console.log(`  LT refs unmatched: ${ltUnmatched.length}`);
  console.log(`  LT entries at zero: ${ltZeroEntries} / ${ltTotalEntries}`);

  if (ltUnmatched.length > 0) {
    console.log(`\n  UNMATCHED LT refs by subgrupoSag:`);
    const bySub = new Map<string, number>();
    for (const r of ltUnmatched) { bySub.set(r.subgrupoSag, (bySub.get(r.subgrupoSag) ?? 0) + 1); }
    for (const [sub, cnt] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    "${sub}"  → ${cnt} refs`);
    }
  }

  // ── Import evaluation ─────────────────────────────────────────────
  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("  IMPORTACION — Regression guard (unchanged logic)\n");

  let impTotalMatched = 0;
  for (const group of importCatalog.groups) {
    for (const entry of group.entries) {
      const matched = newMatchRefs(importRefs, group, entry, "IMPORTACION");
      impTotalMatched += matched.length;
      console.log(`  ${(entry.subgroupCode ?? "").padEnd(20)} Ideal: ${entry.targetUnits}  Actual: ${matched.length}`);
    }
  }
  console.log(`\n  Import refs total: ${importRefs.length}`);
  console.log(`  Import refs matched: ${impTotalMatched}`);

  // ── PHASE 8 — TRACEABILITY ────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  PHASE 8 — TRACEABILITY");
  console.log("════════════════════════════════════════════════════════════════");

  function traceCase(
    label: string,
    refs: SimRef[],
    group: MalletAssortmentGroup,
    entry: MalletAssortmentEntry,
    world: string,
  ) {
    console.log(`\n  ── ${label} ──`);
    console.log(`  Catalog group: ${group.groupCode} (sagGrupo: ${group.sagGrupo ?? "null"})`);
    console.log(`  Catalog entry: ${entry.subgroupCode} (sagSubgrupo: ${JSON.stringify(entry.sagSubgrupo)})`);
    console.log(`  World: ${world}`);

    const matched = newMatchRefs(refs, group, entry, world);
    console.log(`  Matched refs: ${matched.length}`);
    for (const m of matched.slice(0, 5)) {
      console.log(`    SAG ref: ${m.reference}  grupoSag: "${m.grupoSag}"  subgrupoSag: "${m.subgrupoSag}"  sizeClass: ${m.sizeClass}`);
    }
    if (matched.length > 5) console.log(`    ... and ${matched.length - 5} more`);
    console.log(`  → matcher result: ${matched.length} refs`);
    console.log(`  → derrotero: Ideal=${entry.targetUnits}  Actual=${matched.length}  Delta=${matched.length - entry.targetUnits}`);
    console.log(`  → UI: entry shows Actual=${matched.length}`);
  }

  // LT cases
  const ltGroup = ltCatalog.groups[0];
  const ltPijamaCl = ltGroup.entries.find((e) => e.subgroupCode === "PIJAMA_CL")!;
  const ltPijamaLl = ltGroup.entries.find((e) => e.subgroupCode === "PIJAMA_LL")!;
  const ltConjunto = ltGroup.entries.find((e) => e.subgroupCode === "60_CONJUNTOS")!;

  traceCase("LT Case 1: PIJAMA_CL (confirmed array mapping)", ltRefs, ltGroup, ltPijamaCl, "TEXTIL");
  traceCase("LT Case 2: PIJAMA_LL (confirmed array mapping)", ltRefs, ltGroup, ltPijamaLl, "TEXTIL");
  traceCase("LT Case 3: 60_CONJUNTOS (retained — sagSubgrupo null)", ltRefs, ltGroup, ltConjunto, "TEXTIL");

  // CS cases — from different groups, including same-name subgrupo in different groups
  const csNinaBebe = csCatalog.groups.find((g) => g.groupCode === "CS_NINA_BEBE")!;
  const csNinoBebe = csCatalog.groups.find((g) => g.groupCode === "CS_NINO_BEBE")!;
  const csNinoKids = csCatalog.groups.find((g) => g.groupCode === "CS_NINO_KIDS")!;

  const csNinaBebePijamaCl = csNinaBebe.entries.find((e) => e.subgroupCode === "PIJAMA_CL")!;
  const csNinoBebeCamiseta = csNinoBebe.entries.find((e) => e.subgroupCode === "CAMISETA")!;
  const csNinoKidsCamiseta = csNinoKids.entries.find((e) => e.subgroupCode === "CAMISETA")!;

  traceCase("CS Case 1: CS_NINA_BEBE / PIJAMA_CL (grupo+subgrupo)", csRefs, csNinaBebe, csNinaBebePijamaCl, "TEXTIL");
  traceCase("CS Case 2: CS_NINO_BEBE / CAMISETA (same subgrupo, different grupo)", csRefs, csNinoBebe, csNinoBebeCamiseta, "TEXTIL");
  traceCase("CS Case 3: CS_NINO_KIDS / CAMISETA (same subgrupo, different grupo)", csRefs, csNinoKids, csNinoKidsCamiseta, "TEXTIL");

  // Import cases
  const impGroup = importCatalog.groups[0];
  const impPequeno = impGroup.entries.find((e) => e.subgroupCode === "PEQUENO")!;
  const impMediano = impGroup.entries.find((e) => e.subgroupCode === "MEDIANO")!;
  const impGrande = impGroup.entries.find((e) => e.subgroupCode === "GRANDE")!;

  traceCase("Import Case 1: PEQUENO", importRefs, impGroup, impPequeno, "IMPORTACION");
  traceCase("Import Case 2: MEDIANO", importRefs, impGroup, impMediano, "IMPORTACION");
  traceCase("Import Case 3: GRANDE", importRefs, impGroup, impGrande, "IMPORTACION");

  // ── SUMMARY ────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  BEFORE / AFTER COMPARISON");
  console.log("════════════════════════════════════════════════════════════════\n");

  console.log("  Brand         Before (matched)  After (matched)   Before (zero entries)  After (zero entries)");
  console.log("  ─────────────────────────────────────────────────────────────────────────────────────────────");
  console.log(`  CS            73 (double-counted) ${csTotalMatched.toString().padStart(4)}              22/32                  ${csZeroEntries}/${csTotalEntries}`);
  console.log(`  LT            0                   ${ltTotalMatched.toString().padStart(4)}              15/15                  ${ltZeroEntries}/${ltTotalEntries}`);
  console.log(`  Import        103                 ${impTotalMatched.toString().padStart(4)}              0/3 (GRANDE=0)         (unchanged)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
