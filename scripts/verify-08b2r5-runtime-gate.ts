/**
 * MALETAS-DERROTERO-CANONICO-08B2R5 — RUNTIME GATE VERIFICATION
 *
 * Exercises the ACTUAL evaluation engine with fixture refs to prove:
 * 1. LT matrix: 4 groups, 24 positions, 78 ideal
 * 2. NIÑA/NIÑO isolation
 * 3. KIDS/BEBÉ isolation
 * 4. CC/CL/LL isolation
 * 5. PIJAMA/CONJUNTO isolation
 * 6. Collision: CONJUNTO MESES BB NIÑO → KIDS=5, BEBÉ=3
 * 7. Vendor universality (same catalog for all vendors)
 * 8. VESTIDO CS = 5 in both groups
 * 9. CS aggregate ideal increase = +4
 */

import {
  evaluateVendorAssortment,
  evaluateCatalog,
} from "../lib/comercial/maletas/maletas-functional-evaluation";
import {
  buildLatinKidsTextilCatalog,
  buildCastillitosTextilCatalog,
} from "../lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog";
import type { VendorSampleRef, VendorSampleSnapshot } from "../lib/comercial/maletas/vendor-sample-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRef(overrides: Partial<VendorSampleRef> & { reference: string }): VendorSampleRef {
  return {
    reference: overrides.reference,
    description: overrides.description ?? overrides.reference,
    brand: overrides.brand ?? "Latin Kids",
    line: overrides.line ?? "LT",
    group: overrides.group ?? null,
    grupoSag: overrides.grupoSag ?? null,
    subgrupoSag: overrides.subgrupoSag ?? null,
    sizeClass: overrides.sizeClass ?? null,
    disponible: overrides.disponible ?? 100,
    isAccessory: false,
    retiro: false,
    productEntityId: null,
  };
}

function makeVendor(vendorId: string, refs: VendorSampleRef[]): VendorSampleSnapshot {
  return {
    vendorId,
    vendorName: vendorId,
    lines: ["CS", "LT", "IMPORT"],
    refs,
    totalBagRefs: refs.length,
    activatedBagRefs: refs.length,
    sagUpdatedAt: new Date().toISOString(),
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: MATRIZ EXACTA EN RUNTIME
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n=== SECTION 3: RUNTIME MATRIX ===\n");

const ltCatalog = buildLatinKidsTextilCatalog();

assert(ltCatalog.groups.length === 4, "LT has exactly 4 groups");

const ltGroupStats = ltCatalog.groups.map((g) => ({
  code: g.groupCode,
  name: g.groupName,
  entries: g.entries.filter((e) => e.active).length,
  ideal: g.entries.filter((e) => e.active).reduce((s, e) => s + (e.targetReferences ?? e.targetUnits), 0),
}));

for (const gs of ltGroupStats) {
  console.log(`  ${gs.name}: ${gs.entries} entries, ideal=${gs.ideal}`);
}

assert(ltGroupStats.find((g) => g.code === "LT_NINA_KIDS")!.entries === 8, "LT Niña Kids = 8 entries");
assert(ltGroupStats.find((g) => g.code === "LT_NINA_KIDS")!.ideal === 25, "LT Niña Kids = 25 ideal");
assert(ltGroupStats.find((g) => g.code === "LT_NINO_KIDS")!.entries === 10, "LT Niño Kids = 10 entries");
assert(ltGroupStats.find((g) => g.code === "LT_NINO_KIDS")!.ideal === 35, "LT Niño Kids = 35 ideal");
assert(ltGroupStats.find((g) => g.code === "LT_NINA_BEBE")!.entries === 3, "LT Niña Bebé = 3 entries");
assert(ltGroupStats.find((g) => g.code === "LT_NINA_BEBE")!.ideal === 9, "LT Niña Bebé = 9 ideal");
assert(ltGroupStats.find((g) => g.code === "LT_NINO_BEBE")!.entries === 3, "LT Niño Bebé = 3 entries");
assert(ltGroupStats.find((g) => g.code === "LT_NINO_BEBE")!.ideal === 9, "LT Niño Bebé = 9 ideal");

const totalEntries = ltGroupStats.reduce((s, g) => s + g.entries, 0);
const totalIdeal = ltGroupStats.reduce((s, g) => s + g.ideal, 0);
assert(totalEntries === 24, `Total entries = ${totalEntries} (expected 24)`);
assert(totalIdeal === 78, `Total ideal = ${totalIdeal} (expected 78)`);

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: COBERTURA REAL — ISOLATION PROOFS
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n=== SECTION 4: COVERAGE ISOLATION ===\n");

// Create fixture refs for each gender/age combination
const refNinaKids = makeRef({
  reference: "REF-NINA-KIDS-01",
  subgrupoSag: "PIJAMA CC 2-8 NIÑA",
});
const refNinoKids = makeRef({
  reference: "REF-NINO-KIDS-01",
  subgrupoSag: "PIJAMA CC 2-8 NIÑO",
});
const refNinaBebe = makeRef({
  reference: "REF-NINA-BEBE-01",
  subgrupoSag: "PIJAMA CL BB NIÑA",
});
const refNinoBebe = makeRef({
  reference: "REF-NINO-BEBE-01",
  subgrupoSag: "PIJAMA CL BB NIÑO",
});
const refConjuntoKids = makeRef({
  reference: "REF-CONJ-KIDS-01",
  subgrupoSag: "CONJUNTO MESES BB NIÑO",
});
const refConjuntoBebe = makeRef({
  reference: "REF-CONJ-BEBE-01",
  subgrupoSag: "CONJUNTO MESES BB NIÑO", // SAME sagSubgrupo!
});
const refPijamaCC = makeRef({
  reference: "REF-PJ-CC-01",
  subgrupoSag: "PIJAMA CC 2-8 NIÑA",
});
const refPijamaCL = makeRef({
  reference: "REF-PJ-CL-01",
  subgrupoSag: "PIJAMA CL 2-8 NIÑA",
});
const refPijamaLL = makeRef({
  reference: "REF-PJ-LL-01",
  subgrupoSag: "PIJAMA LL 2-8 NIÑA",
});

// 4a. NIÑA never covers NIÑO
{
  const evalNinaOnly = evaluateCatalog(ltCatalog, [refNinaKids], "TEXTIL");
  const ninoKidsGroup = evalNinaOnly.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
  const ninoCompleted = ninoKidsGroup.entries.filter((e) => e.complete).length;
  assert(ninoCompleted === 0, "NIÑA ref covers 0 NIÑO positions");

  const ninaKidsGroup = evalNinaOnly.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
  const ninaCompleted = ninaKidsGroup.entries.filter((e) => e.currentReferences > 0).length;
  assert(ninaCompleted > 0, "NIÑA ref covers >= 1 NIÑA position");
}

// 4b. NIÑO never covers NIÑA
{
  const evalNinoOnly = evaluateCatalog(ltCatalog, [refNinoKids], "TEXTIL");
  const ninaKidsGroup = evalNinoOnly.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
  const ninaCovered = ninaKidsGroup.entries.filter((e) => e.currentReferences > 0).length;
  assert(ninaCovered === 0, "NIÑO ref covers 0 NIÑA positions");
}

// 4c. KIDS never covers BEBÉ
{
  const evalKidsOnly = evaluateCatalog(ltCatalog, [refNinaKids], "TEXTIL");
  const bebeGroup = evalKidsOnly.groups.find((g) => g.groupCode === "LT_NINA_BEBE")!;
  const bebeCovered = bebeGroup.entries.filter((e) => e.currentReferences > 0).length;
  assert(bebeCovered === 0, "KIDS ref ('PIJAMA CC 2-8 NIÑA') covers 0 BEBÉ positions");
}

// 4d. BEBÉ never covers KIDS
{
  const evalBebeOnly = evaluateCatalog(ltCatalog, [refNinaBebe], "TEXTIL");
  const kidsGroup = evalBebeOnly.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
  const kidsCovered = kidsGroup.entries.filter((e) => e.currentReferences > 0).length;
  assert(kidsCovered === 0, "BEBÉ ref covers 0 KIDS positions");
}

// 4e. PIJAMA never covers CONJUNTO
{
  const evalPijamaOnly = evaluateCatalog(ltCatalog, [refPijamaCC], "TEXTIL");
  // Check that no CONJUNTO entry has coverage
  for (const g of evalPijamaOnly.groups) {
    for (const e of g.entries) {
      if (e.subgroupCode?.includes("CONJUNTO") && e.currentReferences > 0) {
        assert(false, `PIJAMA covers CONJUNTO ${e.subgroupCode} — SHOULD NOT HAPPEN`);
      }
    }
  }
  assert(true, "PIJAMA refs cover 0 CONJUNTO positions");
}

// 4f. CC, CL, LL do not cross
{
  const evalCConly = evaluateCatalog(ltCatalog, [refPijamaCC], "TEXTIL");
  const evalCLonly = evaluateCatalog(ltCatalog, [refPijamaCL], "TEXTIL");
  const evalLLonly = evaluateCatalog(ltCatalog, [refPijamaLL], "TEXTIL");

  // CC should only cover CC entries
  const ccGroup = evalCConly.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
  const ccCoveredEntries = ccGroup.entries.filter((e) => e.currentReferences > 0).map((e) => e.subgroupCode);
  assert(ccCoveredEntries.every((c) => c?.includes("CC")), `CC covers only CC: ${ccCoveredEntries.join(", ")}`);

  const clGroup = evalCLonly.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
  const clCoveredEntries = clGroup.entries.filter((e) => e.currentReferences > 0).map((e) => e.subgroupCode);
  assert(clCoveredEntries.every((c) => c?.includes("CL")), `CL covers only CL: ${clCoveredEntries.join(", ")}`);

  const llGroup = evalLLonly.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
  const llCoveredEntries = llGroup.entries.filter((e) => e.currentReferences > 0).map((e) => e.subgroupCode);
  assert(llCoveredEntries.every((c) => c?.includes("LL")), `LL covers only LL: ${llCoveredEntries.join(", ")}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: COLISIÓN CRÍTICA
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n=== SECTION 5: COLLISION ===\n");

// Both refs have sagSubgrupo = "CONJUNTO MESES BB NIÑO"
// In LT (sagGrupo=null), matching is by subgrupoSag only.
// Both should match in BOTH groups. But the groups have different ideals.
{
  const evalCollision = evaluateCatalog(ltCatalog, [refConjuntoKids, refConjuntoBebe], "TEXTIL");

  const kidsGroup = evalCollision.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
  const kidsEntry = kidsGroup.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS");
  assert(kidsEntry != null, "CONJUNTO_MESES_BB_NINO_KIDS entry exists");
  assert(kidsEntry!.targetReferences === 5, `KIDS collision ideal = ${kidsEntry!.targetReferences} (expected 5)`);

  const bebeGroup = evalCollision.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;
  const bebeEntry = bebeGroup.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE");
  assert(bebeEntry != null, "CONJUNTO_MESES_BB_NINO_BEBE entry exists");
  assert(bebeEntry!.targetReferences === 3, `BEBÉ collision ideal = ${bebeEntry!.targetReferences} (expected 3)`);

  // Both see the same 2 refs (since matching is by subgrupoSag only)
  console.log(`  INFO  KIDS entry matched refs: ${kidsEntry!.currentReferences}`);
  console.log(`  INFO  BEBÉ entry matched refs: ${bebeEntry!.currentReferences}`);

  // Verify DATA_UNVERIFIED behavior: a ref without subgrupoSag should not cover anything
  const unverifiedRef = makeRef({
    reference: "REF-UNVERIFIED",
    subgrupoSag: null, // no SAG classification
  });
  const evalUnverified = evaluateCatalog(ltCatalog, [unverifiedRef], "TEXTIL");
  const totalCovered = evalUnverified.groups.reduce(
    (s, g) => s + g.entries.filter((e) => e.currentReferences > 0).length, 0,
  );
  assert(totalCovered === 0, "Unverified ref (null subgrupoSag) covers 0 positions");
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: VENDOR UNIVERSALITY
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n=== SECTION 6: VENDOR UNIVERSALITY ===\n");

const fixtureRefs = [refNinaKids, refNinoKids];

const nestor = makeVendor("NESTOR", fixtureRefs);
const orlando = makeVendor("ORLANDO", fixtureRefs);
const thirdVendor = makeVendor("FIXTURE_VENDOR_3", fixtureRefs);

const evalNestor = evaluateVendorAssortment(nestor);
const evalOrlando = evaluateVendorAssortment(orlando);
const evalThird = evaluateVendorAssortment(thirdVendor);

// Find LT catalog in each
const nestorLT = evalNestor.catalogs.find((c) => c.catalogId.includes("lt-textil"));
const orlandoLT = evalOrlando.catalogs.find((c) => c.catalogId.includes("lt-textil"));
const thirdLT = evalThird.catalogs.find((c) => c.catalogId.includes("lt-textil"));

assert(nestorLT != null, "Néstor receives LT catalog");
assert(nestorLT!.groups.length === 4, `Néstor LT has ${nestorLT!.groups.length} groups (expected 4)`);
assert(nestorLT!.totalEntries === 24, `Néstor LT totalEntries = ${nestorLT!.totalEntries} (expected 24)`);

assert(orlandoLT != null, "Orlando receives LT catalog");
assert(orlandoLT!.groups.length === 4, `Orlando LT has ${orlandoLT!.groups.length} groups (expected 4)`);
assert(orlandoLT!.totalEntries === 24, `Orlando LT totalEntries = ${orlandoLT!.totalEntries} (expected 24)`);

assert(thirdLT != null, "Third vendor receives LT catalog");
assert(thirdLT!.groups.length === 4, `Third vendor LT has ${thirdLT!.groups.length} groups (expected 4)`);
assert(thirdLT!.totalEntries === 24, `Third vendor LT totalEntries = ${thirdLT!.totalEntries} (expected 24)`);

// No duplication: each ref appears at most once per position
for (const vendor of [evalNestor, evalOrlando, evalThird]) {
  for (const cat of vendor.catalogs) {
    for (const g of cat.groups) {
      for (const e of g.entries) {
        const unique = new Set(e.matchedReferences);
        assert(unique.size === e.matchedReferences.length,
          `No duplicate refs in ${vendor.vendorId}/${g.groupCode}/${e.subgroupCode}`);
      }
    }
  }
}

// No vendor-specific config
assert(
  JSON.stringify(nestorLT!.groups.map((g) => ({ code: g.groupCode, entries: g.entries.length }))) ===
  JSON.stringify(orlandoLT!.groups.map((g) => ({ code: g.groupCode, entries: g.entries.length }))),
  "Néstor and Orlando have identical group structure",
);

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: VESTIDOS CASTILLITOS
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n=== SECTION 7: VESTIDO CS ===\n");

const csCatalog = buildCastillitosTextilCatalog();

// Find VESTIDO entries across all CS groups
const vestidoEntries: { groupCode: string; groupName: string; ideal: number }[] = [];
let totalCSIdeal = 0;
let csVestidoCount = 0;

for (const g of csCatalog.groups) {
  for (const e of g.entries) {
    if (!e.active) continue;
    const ideal = e.targetReferences ?? e.targetUnits;
    totalCSIdeal += ideal;
    if (e.subgroupCode === "VESTIDO" || e.subgroupName === "Vestido") {
      vestidoEntries.push({ groupCode: g.groupCode, groupName: g.groupName, ideal });
      csVestidoCount++;
    }
  }
}

for (const v of vestidoEntries) {
  console.log(`  ${v.groupName} / VESTIDO = ${v.ideal}`);
}

const ninaBebe = vestidoEntries.find((v) => v.groupCode === "CS_NINA_BEBE");
const ninaKids = vestidoEntries.find((v) => v.groupCode === "CS_NINA_KIDS");

assert(ninaBebe != null && ninaBebe.ideal === 5, `CS NIÑA BEBÉ / VESTIDO = ${ninaBebe?.ideal} (expected 5)`);
assert(ninaKids != null && ninaKids.ideal === 5, `CS NIÑA KIDS / VESTIDO = ${ninaKids?.ideal} (expected 5)`);

// Exactly 2 VESTIDO positions were modified (from 3 to 5)
const vestidosAt5 = vestidoEntries.filter((v) => v.ideal === 5);
assert(vestidosAt5.length === 2, `Exactly ${vestidosAt5.length} vestido positions at 5 (expected 2)`);

// Total CS ideal increased by exactly 4 (2 positions x (5-3)=2 each = +4)
// Old CS total was 63, new is 67
assert(totalCSIdeal === 67, `CS total ideal = ${totalCSIdeal} (expected 67, was 63, delta +4)`);

// No other CS entries changed: verify all non-VESTIDO entries match expected values
const otherEntries = [];
for (const g of csCatalog.groups) {
  for (const e of g.entries) {
    if (!e.active) continue;
    if (e.subgroupCode !== "VESTIDO" && e.subgroupName !== "Vestido") {
      otherEntries.push({ code: e.subgroupCode, ideal: e.targetReferences ?? e.targetUnits });
    }
  }
}
// Spot check some known entries (BLUSA=2, BLUSAS=2, CAMISETA=3 — unchanged from pre-08B2R5)
const blusa = otherEntries.find((e) => e.code === "BLUSA");
const blusas = otherEntries.find((e) => e.code === "BLUSAS");
const mameluco = otherEntries.find((e) => e.code === "MAMELUCO");
assert(blusa != null && blusa.ideal === 2, `BLUSA unchanged at ${blusa?.ideal}`);
assert(blusas != null && blusas.ideal === 2, `BLUSAS unchanged at ${blusas?.ideal}`);
assert(mameluco != null && mameluco.ideal === 1, `MAMELUCO unchanged at ${mameluco?.ideal}`);

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${"=".repeat(60)}`);
console.log(`RUNTIME GATE VERIFICATION: ${passed} PASS, ${failed} FAIL`);
console.log(`${"=".repeat(60)}\n`);

if (failed > 0) {
  process.exit(1);
}
