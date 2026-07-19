/**
 * AUDIT: IM line classification — textile vs accessory pipeline
 *
 * For each of the 44 refs with CommercialCoverageSnapshot.line = "IM":
 * - ProductEntity master data (productLine, lineaSag, grupoSag, subgrupoSag)
 * - CommercialCoverageSnapshot data (line, bodega, disponible)
 * - ProductInventoryLevel per bodega (01, 04, 14, 15, 26, 27)
 * - Determines correct pipeline based on SAG master data
 */

import { prisma } from "../lib/prisma";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

// Mandatory test cases from user's screenshot
const MANDATORY_REFS = [
  "C7-7707", "C7-11967-4", "C6-PC737-1", "C7-H168331", "C7-6666-52",
  "C4-968-6278", "79-2-4", "C5-K004", "C7-PQ100", "C5-918",
];

async function run() {
  console.log("=== AUDIT: IM CLASSIFICATION & PROVENANCE ===\n");

  // ── 1. Get all 44 IM refs from CommercialCoverageSnapshot ─────────────
  const imSnapRows = await (prisma as any).commercialCoverageSnapshot.findMany({
    where: {
      organizationId: ORG_ID,
      line: "IM",
    },
    orderBy: { snapshotAt: "desc" },
    distinct: ["refCode"],
    select: {
      refCode: true,
      description: true,
      line: true,
      disponible: true,
      pendingOrdersQty: true,
      snapshotAt: true,
      subgrupoSag: true,
    },
  });

  const imRefs = imSnapRows.map((r: any) => r.refCode as string);
  console.log(`CommercialCoverageSnapshot refs with line="IM": ${imRefs.length}\n`);

  // ── 2. Get ProductEntity master data for these refs ───────────────────
  const productEntities = await (prisma as any).productEntity.findMany({
    where: {
      organizationId: ORG_ID,
      sku: { in: imRefs },
    },
    select: {
      sku: true,
      name: true,
      productLine: true,
      lineaId: true,
      lineaSag: true,
      grupoId: true,
      grupoSag: true,
      subgrupoId: true,
      subgrupoSag: true,
      handlingUnit: true,
      id: true,
    },
  });

  const peMap = new Map<string, any>();
  for (const pe of productEntities) {
    if (pe.sku) peMap.set(pe.sku, pe);
  }

  // ── 3. Get PIL data per bodega for these refs ─────────────────────────
  const pilRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT pe.sku, pil."externalRef" as bodega, SUM(pil.quantity)::int as qty
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe.id = pil."productId" AND pe."organizationId" = pil."organizationId"
    WHERE pe."organizationId" = $1
      AND pe.sku = ANY($2)
      AND pil."externalRef" IN ('01', '04', '14', '15', '26', '27')
    GROUP BY pe.sku, pil."externalRef"
    ORDER BY pe.sku, pil."externalRef"
  `, ORG_ID, imRefs);

  // Build PIL map: sku → { bodega → qty }
  const pilMap = new Map<string, Map<string, number>>();
  for (const r of pilRows) {
    if (!pilMap.has(r.sku)) pilMap.set(r.sku, new Map());
    pilMap.get(r.sku)!.set(r.bodega, r.qty);
  }

  // ── 4. Full audit output ──────────────────────────────────────────────
  console.log("=" .repeat(120));
  console.log("FULL AUDIT — 44 IM REFERENCES");
  console.log("=".repeat(120));

  const results: any[] = [];

  for (const snap of imSnapRows) {
    const ref = snap.refCode;
    const pe = peMap.get(ref);
    const pil = pilMap.get(ref) ?? new Map<string, number>();

    const b01 = pil.get("01") ?? 0;
    const b04 = pil.get("04") ?? 0;
    const b14 = pil.get("14") ?? 0;
    const b15 = pil.get("15") ?? 0;
    const b26 = pil.get("26") ?? 0;
    const b27 = pil.get("27") ?? 0;
    const totalTextil = b01 + b04 + b14 + b15;
    const totalImport = b26 + b27;

    const ccsDisponible = snap.disponible;
    const ccsPending = snap.pendingOrdersQty ?? 0;

    // Determine correct pipeline based on ProductEntity.productLine
    const peProductLine = pe?.productLine ?? "N/A";
    const currentPipeline = "TEXTILE (CCS)"; // All 44 enter via CommercialCoverageSnapshot
    let correctPipeline: string;
    if (peProductLine === "5") {
      correctPipeline = "ACCESSORY (PIL 26/27)";
    } else if (peProductLine === "N/A") {
      correctPipeline = "UNKNOWN (no ProductEntity)";
    } else {
      correctPipeline = `TEXTILE (productLine=${peProductLine})`;
    }

    const isMisclassified = peProductLine === "5";

    results.push({
      ref,
      description: snap.description,
      peProductLine,
      peLineaId: pe?.lineaId ?? null,
      peLineaSag: pe?.lineaSag ?? null,
      peGrupoId: pe?.grupoId ?? null,
      peGrupoSag: pe?.grupoSag ?? null,
      peSubgrupoId: pe?.subgrupoId ?? null,
      peSubgrupoSag: pe?.subgrupoSag ?? null,
      ccsLine: snap.line,
      ccsSubgrupoSag: snap.subgrupoSag,
      ccsDisponible,
      ccsPending,
      b01, b04, b14, b15, b26, b27,
      totalTextil, totalImport,
      currentPipeline,
      correctPipeline,
      isMisclassified,
      hasProductEntity: !!pe,
    });
  }

  // Print detailed table
  for (const r of results) {
    const flag = r.isMisclassified ? " *** MISCLASSIFIED ***" : "";
    console.log(`\n--- ${r.ref} ${flag}`);
    console.log(`  Descripcion:          ${r.description}`);
    console.log(`  ProductEntity found:  ${r.hasProductEntity}`);
    console.log(`  PE.productLine:       ${r.peProductLine}`);
    console.log(`  PE.lineaId:           ${r.peLineaId}`);
    console.log(`  PE.lineaSag:          ${r.peLineaSag}`);
    console.log(`  PE.grupoId:           ${r.peGrupoId}`);
    console.log(`  PE.grupoSag:          ${r.peGrupoSag}`);
    console.log(`  PE.subgrupoId:        ${r.peSubgrupoId}`);
    console.log(`  PE.subgrupoSag:       ${r.peSubgrupoSag}`);
    console.log(`  CCS.line:             ${r.ccsLine}`);
    console.log(`  CCS.subgrupoSag:      ${r.ccsSubgrupoSag}`);
    console.log(`  CCS.disponible:       ${r.ccsDisponible}`);
    console.log(`  CCS.pending:          ${r.ccsPending}`);
    console.log(`  PIL B01:              ${r.b01}`);
    console.log(`  PIL B04:              ${r.b04}`);
    console.log(`  PIL B14:              ${r.b14}`);
    console.log(`  PIL B15:              ${r.b15}`);
    console.log(`  PIL B26:              ${r.b26}`);
    console.log(`  PIL B27:              ${r.b27}`);
    console.log(`  Total textil (01/04/14/15): ${r.totalTextil}`);
    console.log(`  Total import (26/27):       ${r.totalImport}`);
    console.log(`  Pipeline actual:      ${r.currentPipeline}`);
    console.log(`  Pipeline correcto:    ${r.correctPipeline}`);
  }

  // ── 5. Mandatory test cases comparison ────────────────────────────────
  console.log(`\n${"=".repeat(120)}`);
  console.log("MANDATORY TEST CASES — DIRECT COMPARISON");
  console.log("=".repeat(120));

  console.log(`\n${"Referencia".padEnd(16)} | ${"Stock textil".padStart(14)} | ${"Stock import".padStart(13)} | ${"CCS disp".padStart(10)} | ${"Fuente correcta".padEnd(28)} | PE.productLine`);
  console.log("-".repeat(16) + "-+-" + "-".repeat(14) + "-+-" + "-".repeat(13) + "-+-" + "-".repeat(10) + "-+-" + "-".repeat(28) + "-+-" + "-".repeat(14));

  for (const mandRef of MANDATORY_REFS) {
    const r = results.find(x => x.ref === mandRef);
    if (r) {
      console.log(
        `${r.ref.padEnd(16)} | ${String(r.totalTextil).padStart(14)} | ${String(r.totalImport).padStart(13)} | ${String(r.ccsDisponible).padStart(10)} | ${r.correctPipeline.padEnd(28)} | ${r.peProductLine}`
      );
    } else {
      console.log(`${mandRef.padEnd(16)} | *** NOT FOUND in IM snapshot ***`);
    }
  }

  // ── 6. Classification summary ─────────────────────────────────────────
  console.log(`\n${"=".repeat(120)}`);
  console.log("CLASSIFICATION SUMMARY");
  console.log("=".repeat(120));

  const misclassified = results.filter(r => r.isMisclassified);
  const noProductEntity = results.filter(r => !r.hasProductEntity);
  const correctlyTextile = results.filter(r => r.hasProductEntity && !r.isMisclassified);

  console.log(`\n  Total IM refs in CCS:               ${results.length}`);
  console.log(`  With ProductEntity:                  ${results.length - noProductEntity.length}`);
  console.log(`  Without ProductEntity:               ${noProductEntity.length}`);
  console.log(`  PE.productLine = "5" (ACCESSORY):    ${misclassified.length}`);
  console.log(`  PE.productLine != "5" (TEXTILE):     ${correctlyTextile.length}`);

  // productLine distribution
  const plDist: Record<string, number> = {};
  for (const r of results) {
    const pl = r.peProductLine;
    plDist[pl] = (plDist[pl] ?? 0) + 1;
  }
  console.log(`\n  ProductLine distribution:`);
  for (const [pl, count] of Object.entries(plDist).sort((a, b) => b[1] - a[1])) {
    console.log(`    productLine="${pl}": ${count} refs`);
  }

  // grupoSag distribution
  const grupoDist: Record<string, number> = {};
  for (const r of results) {
    const g = r.peGrupoSag ?? "N/A";
    grupoDist[g] = (grupoDist[g] ?? 0) + 1;
  }
  console.log(`\n  GrupoSag distribution:`);
  for (const [g, count] of Object.entries(grupoDist).sort((a, b) => b[1] - a[1])) {
    console.log(`    "${g}": ${count} refs`);
  }

  // Stock location analysis
  let hasTextilStock = 0, hasImportStock = 0, hasBothStock = 0, hasNoStock = 0;
  for (const r of results) {
    const t = r.totalTextil > 0;
    const i = r.totalImport > 0;
    if (t && i) hasBothStock++;
    else if (t) hasTextilStock++;
    else if (i) hasImportStock++;
    else hasNoStock++;
  }
  console.log(`\n  Stock location analysis (PIL):`);
  console.log(`    Only in textil bodegas (01/04/14/15):  ${hasTextilStock}`);
  console.log(`    Only in import bodegas (26/27):        ${hasImportStock}`);
  console.log(`    In both bodega families:               ${hasBothStock}`);
  console.log(`    No PIL stock anywhere:                 ${hasNoStock}`);

  // CCS disponible vs PIL comparison for misclassified
  if (misclassified.length > 0) {
    console.log(`\n${"=".repeat(120)}`);
    console.log(`MISCLASSIFIED REFS (PE.productLine="5" but entering via textile pipeline)`);
    console.log("=".repeat(120));
    console.log(`\n${"Referencia".padEnd(16)} | ${"CCS disp".padStart(10)} | ${"PIL textil".padStart(12)} | ${"PIL import".padStart(12)} | ${"GrupoSag".padEnd(20)} | ${"SubgrupoSag".padEnd(20)}`);
    console.log("-".repeat(16) + "-+-" + "-".repeat(10) + "-+-" + "-".repeat(12) + "-+-" + "-".repeat(12) + "-+-" + "-".repeat(20) + "-+-" + "-".repeat(20));
    for (const r of misclassified) {
      console.log(
        `${r.ref.padEnd(16)} | ${String(r.ccsDisponible).padStart(10)} | ${String(r.totalTextil).padStart(12)} | ${String(r.totalImport).padStart(12)} | ${(r.peGrupoSag ?? "N/A").padEnd(20)} | ${(r.peSubgrupoSag ?? "N/A").padEnd(20)}`
      );
    }
  }

  // ── 7. CONCLUSION ─────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(120)}`);
  console.log("CONCLUSION");
  console.log("=".repeat(120));

  if (misclassified.length === results.length && noProductEntity.length === 0) {
    console.log("\n  VERDICT: ALL 44 IM refs are ACCESSORIES (PE.productLine=5).");
    console.log("  They should use the ACCESSORY pipeline (PIL bodegas 26/27).");
    console.log("  The CCS textile pipeline is reading the WRONG bodegas for these refs.");
  } else if (misclassified.length === 0) {
    console.log("\n  VERDICT: ALL 44 IM refs are TEXTILES.");
    console.log("  They correctly use the textile pipeline (CCS bodegas 01/04/14/15).");
  } else {
    console.log(`\n  VERDICT: MIXED GROUP.`);
    console.log(`  ${misclassified.length} refs are accessories (PE.productLine=5) — wrong pipeline.`);
    console.log(`  ${correctlyTextile.length} refs are textiles — correct pipeline.`);
    console.log(`  ${noProductEntity.length} refs have no ProductEntity — classification unclear.`);
  }

  console.log("\n=== AUDIT COMPLETE ===\n");
  process.exit(0);
}

run();
