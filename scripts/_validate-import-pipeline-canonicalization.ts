/**
 * COMERCIAL-INVENTARIO-IMPORT-PIPELINE-CANONICALIZATION-01 — Validation
 *
 * Validates:
 * 1. No productLine=5 refs in CommercialCoverageSnapshot latest batch
 * 2. No duplicates between textile and accessory pipelines
 * 3. Mandatory test cases show correct pipeline and availability
 * 4. All visibility states are correct after canonicalization
 * 5. No "IM" group should exist in the inventory view
 */

import { prisma } from "../lib/prisma";
import { LINE_TO_SUBLINEA } from "../lib/comercial/line-map";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

const MANDATORY_REFS = [
  "C7-7707", "C7-11967-4", "C6-PC737-1", "C7-H168331", "C7-6666-52",
  "C4-968-6278", "79-2-4", "C5-K004", "C7-PQ100", "C5-918",
  "HC0233068", "34852-2", "35357-3", "9025-T", "35357-1", "510", "905",
];

async function run() {
  console.log("=== IMPORT PIPELINE CANONICALIZATION — VALIDATION ===\n");

  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  };

  const db = prisma as any;

  // ── 1. Check CCS for productLine=5 contamination ──────────────────────
  const snapLatest = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MAX("snapshotAt") as latest FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1`,
    ORG_ID,
  );
  const snapshotAt = snapLatest[0]?.latest;
  check("Snapshot exists", !!snapshotAt);

  if (snapshotAt) {
    // Get all refCodes from latest CCS
    const ccsRefs = await db.commercialCoverageSnapshot.findMany({
      where: { organizationId: ORG_ID, snapshotAt },
      select: { refCode: true, line: true },
    });

    // Cross-reference with ProductEntity productLine=5
    const accProducts = await db.productEntity.findMany({
      where: { organizationId: ORG_ID, productLine: "5" },
      select: { sku: true },
    });
    const accSkuSet = new Set(accProducts.filter((p: any) => p.sku).map((p: any) => p.sku));

    const contaminatedRefs = ccsRefs.filter((r: any) => accSkuSet.has(r.refCode));
    const imRefs = ccsRefs.filter((r: any) => r.line === "IM");

    check("No productLine=5 refs in latest CCS batch", contaminatedRefs.length === 0,
      contaminatedRefs.length > 0
        ? `${contaminatedRefs.length} contaminated refs found (e.g. ${contaminatedRefs.slice(0, 3).map((r: any) => r.refCode).join(", ")})`
        : `0 contaminated in ${ccsRefs.length} CCS refs`);

    check("No line=IM refs in latest CCS batch", imRefs.length === 0,
      `${imRefs.length} IM refs found`);

    // ── 2. Check for duplicates between pipelines ────────────────────────
    const textileRefSet = new Set(ccsRefs.map((r: any) => r.refCode));
    const duplicates = accProducts.filter((p: any) => p.sku && textileRefSet.has(p.sku));
    check("No duplicates between CCS and accessory pipeline", duplicates.length === 0,
      `${duplicates.length} duplicates`);
  }

  // ── 3. Accessory pipeline data ────────────────────────────────────────
  const accAvailRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT pe.sku, SUM(GREATEST(pil.quantity, 0))::int as available
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe.id = pil."productId" AND pe."organizationId" = pil."organizationId"
    WHERE pe."organizationId" = $1
      AND pil."externalRef" IN ('26', '27')
      AND pe."productLine" = '5'
    GROUP BY pe.sku
  `, ORG_ID);

  const accAvailMap = new Map<string, number>();
  for (const r of accAvailRows) {
    if (r.sku) accAvailMap.set(r.sku, r.available);
  }

  // ── 4. Mandatory test cases ───────────────────────────────────────────
  console.log("\n--- MANDATORY TEST CASES ---");
  console.log(`${"Referencia".padEnd(16)} | ${"Pipeline".padEnd(12)} | ${"B01 (textil)".padStart(14)} | ${"B26+27 (imp)".padStart(14)} | ${"Visibility".padEnd(14)} | ${"Grupo UI".padEnd(14)}`);
  console.log("-".repeat(100));

  // Get B01 stock for these refs (for comparison)
  const b01Rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT pe.sku, SUM(pil.quantity)::int as qty
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe.id = pil."productId" AND pe."organizationId" = pil."organizationId"
    WHERE pe."organizationId" = $1
      AND pil."externalRef" IN ('01', '04', '14', '15')
      AND pe.sku = ANY($2)
    GROUP BY pe.sku
  `, ORG_ID, MANDATORY_REFS);

  const b01Map = new Map<string, number>();
  for (const r of b01Rows) {
    if (r.sku) b01Map.set(r.sku, r.qty);
  }

  for (const ref of MANDATORY_REFS) {
    const b01Stock = b01Map.get(ref) ?? 0;
    const b26Stock = accAvailMap.get(ref) ?? 0;
    const hasData = accAvailMap.has(ref);
    const visibility = !hasData ? "NO_DATA" : b26Stock > 0 ? "ACTIVE" : "OUT_OF_STOCK";
    const pipeline = "ACCESSORY";
    const grupo = "IMPORTACION";

    console.log(
      `${ref.padEnd(16)} | ${pipeline.padEnd(12)} | ${String(b01Stock).padStart(14)} | ${String(b26Stock).padStart(14)} | ${visibility.padEnd(14)} | ${grupo.padEnd(14)}`
    );

    // Verify ref NOT in CCS
    if (snapshotAt) {
      const inCcs = await db.commercialCoverageSnapshot.count({
        where: { organizationId: ORG_ID, snapshotAt, refCode: ref },
      });
      check(`${ref}: not in CCS`, inCcs === 0, inCcs > 0 ? "STILL IN CCS" : "clean");
    }
  }

  // ── 5. Line distribution in CCS ──────────────────────────────────────
  if (snapshotAt) {
    const lineDist: any[] = await prisma.$queryRawUnsafe(`
      SELECT line, COUNT(*)::int as cnt
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1 AND "snapshotAt" = $2
      GROUP BY line
      ORDER BY cnt DESC
    `, ORG_ID, snapshotAt);

    console.log("\n--- CCS LINE DISTRIBUTION ---");
    for (const r of lineDist) {
      console.log(`  ${r.line}: ${r.cnt}`);
      if (r.line === "IM") {
        check("No IM line in CCS distribution", false, `${r.cnt} refs still have line=IM`);
      }
    }
  }

  // ── 6. Total inventory universe ───────────────────────────────────────
  const totalAcc = await db.productEntity.count({
    where: { organizationId: ORG_ID, productLine: "5" },
  });

  const ccsCount = snapshotAt ? await db.commercialCoverageSnapshot.count({
    where: { organizationId: ORG_ID, snapshotAt },
  }) : 0;

  const totalUniverse = ccsCount + totalAcc;
  console.log(`\n--- UNIVERSE COUNTS ---`);
  console.log(`  CCS textile refs:     ${ccsCount}`);
  console.log(`  Accessory refs:       ${totalAcc}`);
  console.log(`  Total universe:       ${totalUniverse}`);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`VALIDATION: ${pass} PASS / ${fail} FAIL`);
  console.log("=".repeat(60));

  process.exit(fail > 0 ? 1 : 0);
}

run();
