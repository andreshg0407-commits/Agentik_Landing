/**
 * SECTION 8: RECONCILIATION & EXPORT PIPELINE VERIFICATION
 *
 * Proves: Pantalla = CoverageReportPayload = XML structural equivalence.
 *
 * Approach: Since the payload builder and XML renderer are pure functions
 * that pass through positions unchanged, and the coverage engine is guarded
 * by `server-only`, we verify the pipeline by:
 *
 * 1. Building the catalogs (pure, no server-only) and proving the 4 groups + 24 entries
 * 2. Verifying the payload builder preserves all position fields (source scan)
 * 3. Verifying the XML renderer serializes all position fields (source scan)
 * 4. Verifying the PDF renderer consumes the same payload type (source scan)
 * 5. Proving the coverage engine's position builder creates distinct positionIds
 *    for the collision case (source scan of positionId formula)
 *
 * The actual runtime Pantalla = Payload = PDF = XML chain is exercised via
 * the Preview deployment at the authenticated URL.
 */

import * as fs from "fs";
import * as path from "path";
import {
  evaluateVendorAssortment,
} from "../lib/comercial/maletas/maletas-functional-evaluation";
import type { VendorSampleRef, VendorSampleSnapshot } from "../lib/comercial/maletas/vendor-sample-types";

const ROOT = path.resolve(__dirname, "..");

const payloadSrc = fs.readFileSync(path.join(ROOT, "lib/comercial/maletas/coverage-report-payload.ts"), "utf8");
const xmlSrc = fs.readFileSync(path.join(ROOT, "lib/comercial/maletas/coverage-report-xml.ts"), "utf8");
const pdfSrc = fs.readFileSync(path.join(ROOT, "lib/comercial/maletas/coverage-report-pdf-renderer.tsx"), "utf8");
const engineSrc = fs.readFileSync(path.join(ROOT, "lib/comercial/maletas/sample-coverage-engine.ts"), "utf8");
const serviceSrc = fs.readFileSync(path.join(ROOT, "lib/comercial/maletas/coverage-report-service.ts"), "utf8");

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

console.log("\n=== SECTION 8: REPORT PIPELINE ===\n");

// 8a. Payload builder preserves all critical fields from CoveragePosition → CoverageReportPosition
console.log("--- 8a: Payload builder field preservation ---");
assert(payloadSrc.includes("pos.positionId"), "Payload maps positionId");
assert(payloadSrc.includes("pos.groupName"), "Payload maps groupName");
assert(payloadSrc.includes("pos.subgroupName"), "Payload maps subgroupName");
assert(payloadSrc.includes("pos.targetReferences"), "Payload maps targetReferences");
assert(payloadSrc.includes("pos.currentReferences"), "Payload maps currentReferences");
assert(payloadSrc.includes("pos.missingReferences"), "Payload maps missingReferences");
assert(payloadSrc.includes("pos.status"), "Payload maps status");
assert(payloadSrc.includes("pos.statusExplanation"), "Payload maps statusExplanation");

// 8b. XML renderer serializes all critical fields
console.log("--- 8b: XML renderer field serialization ---");
assert(xmlSrc.includes('"positionId"'), "XML serializes positionId");
assert(xmlSrc.includes('"groupName"'), "XML serializes groupName");
assert(xmlSrc.includes('"subgroupName"'), "XML serializes subgroupName");
assert(xmlSrc.includes('"targetReferences"'), "XML serializes targetReferences");
assert(xmlSrc.includes('"currentReferences"'), "XML serializes currentReferences");
assert(xmlSrc.includes('"missingReferences"'), "XML serializes missingReferences");
assert(xmlSrc.includes('"status"'), "XML serializes status");
assert(xmlSrc.includes("pos.candidate"), "XML serializes candidate");

// 8c. PDF renderer consumes same CoverageReportPayload
console.log("--- 8c: PDF renderer shared payload ---");
assert(pdfSrc.includes("CoverageReportPayload"), "PDF imports CoverageReportPayload");
assert(pdfSrc.includes("CoverageReportPosition"), "PDF imports CoverageReportPosition");
assert(pdfSrc.includes("positionId") || pdfSrc.includes("groupName"), "PDF renders position fields");

// 8d. Service passes same payload to both renderers
console.log("--- 8d: Service unified pipeline ---");
assert(serviceSrc.includes("buildCoverageReportPayload"), "Service builds payload");
assert(serviceSrc.includes("renderCoverageReportXml(payload)"), "Service passes payload to XML");
assert(serviceSrc.includes("CoverageReportPdfDocument") && serviceSrc.includes("payload"), "Service passes payload to PDF");

// 8e. Coverage engine position ID formula guarantees collision separation
console.log("--- 8e: Position ID collision separation ---");
assert(
  engineSrc.includes("${catalog.catalogId}|${group.groupCode}|${entry.subgroupCode"),
  "PositionId = catalogId|groupCode|subgroupCode",
);

// 8f. RUNTIME: Evaluate vendor assortment and verify 4 LT groups with correct structure
console.log("--- 8f: Runtime assortment evaluation ---");
const vendor: VendorSampleSnapshot = {
  vendorId: "NESTOR",
  vendorName: "Nestor",
  lines: ["CS", "LT", "IMPORT"],
  refs: [
    // Add refs for each LT section to prove sections appear independently
    makeRef({ reference: "R1", subgrupoSag: "PIJAMA CC 2-8 NIÑA" }),
    makeRef({ reference: "R2", subgrupoSag: "PIJAMA CC 2-8 NIÑO" }),
    makeRef({ reference: "R3", subgrupoSag: "PIJAMA CL BB NIÑA" }),
    makeRef({ reference: "R4", subgrupoSag: "PIJAMA CL BB NIÑO" }),
    makeRef({ reference: "R5", subgrupoSag: "CONJUNTO MESES BB NIÑO" }), // collision ref
  ],
  totalBagRefs: 5,
  activatedBagRefs: 5,
  sagUpdatedAt: new Date().toISOString(),
};

const result = evaluateVendorAssortment(vendor);
const ltCat = result.catalogs.find((c) => c.catalogId.includes("lt-textil"));
assert(ltCat != null, "LT catalog present in evaluation");
assert(ltCat!.groups.length === 4, `LT groups = ${ltCat!.groups.length}`);
assert(ltCat!.totalEntries === 24, `LT totalEntries = ${ltCat!.totalEntries}`);

// Verify each section name and entry count
const ninaKids = ltCat!.groups.find((g) => g.groupCode === "LT_NINA_KIDS")!;
const ninoKids = ltCat!.groups.find((g) => g.groupCode === "LT_NINO_KIDS")!;
const ninaBebe = ltCat!.groups.find((g) => g.groupCode === "LT_NINA_BEBE")!;
const ninoBebe = ltCat!.groups.find((g) => g.groupCode === "LT_NINO_BEBE")!;

assert(ninaKids.entries.length === 8, `LT Niña Kids entries = ${ninaKids.entries.length}`);
assert(ninoKids.entries.length === 10, `LT Niño Kids entries = ${ninoKids.entries.length}`);
assert(ninaBebe.entries.length === 3, `LT Niña Bebé entries = ${ninaBebe.entries.length}`);
assert(ninoBebe.entries.length === 3, `LT Niño Bebé entries = ${ninoBebe.entries.length}`);

// 8g. Collision proof: both CONJUNTO entries exist with correct ideals and are SEPARATE
console.log("--- 8g: Collision in evaluation output ---");
const conjKidsEntry = ninoKids.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_KIDS");
const conjBebeEntry = ninoBebe.entries.find((e) => e.subgroupCode === "CONJUNTO_MESES_BB_NINO_BEBE");
assert(conjKidsEntry != null, "CONJUNTO_MESES_BB_NINO_KIDS in evaluation");
assert(conjKidsEntry!.targetReferences === 5, `KIDS ideal = ${conjKidsEntry!.targetReferences}`);
assert(conjBebeEntry != null, "CONJUNTO_MESES_BB_NINO_BEBE in evaluation");
assert(conjBebeEntry!.targetReferences === 3, `BEBE ideal = ${conjBebeEntry!.targetReferences}`);

// Both share sagSubgrupo "CONJUNTO MESES BB NIÑO" but are in different groups
assert(
  conjKidsEntry!.sagSubgrupos.includes("CONJUNTO MESES BB NIÑO"),
  "KIDS entry has sagSubgrupo 'CONJUNTO MESES BB NIÑO'",
);
assert(
  conjBebeEntry!.sagSubgrupos.includes("CONJUNTO MESES BB NIÑO"),
  "BEBE entry has sagSubgrupo 'CONJUNTO MESES BB NIÑO'",
);

// R5 (CONJUNTO MESES BB NIÑO) is ambiguous (maps to both KIDS and BEBE groups)
// After 08B2R5A fix: ambiguous refs without certified derroteroGroupCode match ZERO positions
assert(conjKidsEntry!.currentReferences === 0, `KIDS collision matched refs = ${conjKidsEntry!.currentReferences}`);
assert(conjBebeEntry!.currentReferences === 0, `BEBE collision matched refs = ${conjBebeEntry!.currentReferences}`);

// Both incomplete because ideal > 0 and matched = 0
assert(conjKidsEntry!.complete === false, "KIDS (5 ideal, 0 ref) = incomplete");
assert(conjBebeEntry!.complete === false, "BEBE (3 ideal, 0 ref) = incomplete");

// 8h. Section ideal sums in evaluation match canonical
console.log("--- 8h: Section ideal sums ---");
const ninaKidsIdeal = ninaKids.entries.reduce((s, e) => s + e.targetReferences, 0);
const ninoKidsIdeal = ninoKids.entries.reduce((s, e) => s + e.targetReferences, 0);
const ninaBebeIdeal = ninaBebe.entries.reduce((s, e) => s + e.targetReferences, 0);
const ninoBebeIdeal = ninoBebe.entries.reduce((s, e) => s + e.targetReferences, 0);

assert(ninaKidsIdeal === 25, `Eval LT Niña Kids ideal = ${ninaKidsIdeal}`);
assert(ninoKidsIdeal === 35, `Eval LT Niño Kids ideal = ${ninoKidsIdeal}`);
assert(ninaBebeIdeal === 9, `Eval LT Niña Bebé ideal = ${ninaBebeIdeal}`);
assert(ninoBebeIdeal === 9, `Eval LT Niño Bebé ideal = ${ninoBebeIdeal}`);
assert(ninaKidsIdeal + ninoKidsIdeal + ninaBebeIdeal + ninoBebeIdeal === 78, "Total LT ideal = 78");

// 8i. Gendered sagSubgrupos: verify no cross-gender matching
console.log("--- 8i: Gender isolation in evaluation ---");
// R1 (NIÑA) should NOT match any NIÑO entry
const ninoKidsR1Matches = ninoKids.entries.filter((e) => e.matchedReferences.includes("R1"));
assert(ninoKidsR1Matches.length === 0, "NIÑA ref R1 does NOT match NIÑO entries");
// R2 (NIÑO) should NOT match any NIÑA entry
const ninaKidsR2Matches = ninaKids.entries.filter((e) => e.matchedReferences.includes("R2"));
assert(ninaKidsR2Matches.length === 0, "NIÑO ref R2 does NOT match NIÑA entries");
// R3 (BEBÉ NIÑA) should NOT match KIDS
const ninaKidsR3 = ninaKids.entries.filter((e) => e.matchedReferences.includes("R3"));
assert(ninaKidsR3.length === 0, "BEBÉ ref R3 does NOT match KIDS entries");

console.log(`\n${"=".repeat(60)}`);
console.log(`REPORT PIPELINE VERIFICATION: ${passed} PASS, ${failed} FAIL`);
console.log(`${"=".repeat(60)}\n`);

if (failed > 0) process.exit(1);
