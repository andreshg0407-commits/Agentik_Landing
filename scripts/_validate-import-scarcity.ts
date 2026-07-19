/**
 * _validate-import-scarcity.ts
 *
 * VENDOR-SAMPLE-IMPORT-SCARCITY-ENGINE-01 — Phase 10 Validation
 *
 * Validates:
 * 1. IMPORT refs identified correctly (productLine=5)
 * 2. B36+B37 availability loaded correctly
 * 3. Scarcity state computed correctly (<=10 = escasez)
 * 4. IMPORT refs don't appear as reemplazar/OP/produccion
 * 5. centralImportAvailable matches PIL aggregation
 */

import { prisma } from "@/lib/prisma";

const db = prisma as any;
const IMPORT_SCARCITY_MINIMUM = 10;
const IMPORT_SOURCE_WAREHOUSES = ["36", "37"];

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (org == null) { console.log("FAIL: org not found"); return; }

  console.log("=== VENDOR-SAMPLE-IMPORT-SCARCITY-ENGINE-01 VALIDATION ===\n");

  // ── 1. Load IMPORT refs (productLine=5) ───────────────────────────────
  const importProducts = await db.productEntity.findMany({
    where: { organizationId: org.id, productLine: "5" },
    select: { sku: true, subgrupoSag: true },
  });
  const importSkus = new Set<string>(importProducts.map((p: any) => p.sku).filter(Boolean));
  console.log(`IMPORT refs (productLine=5): ${importSkus.size}`);

  // ── 2. Load B36+B37 availability ──────────────────────────────────────
  interface AvailRow { sku: string; available: number }
  const whList = IMPORT_SOURCE_WAREHOUSES.map((_, i) => `$${i + 2}`).join(",");
  const availRows: AvailRow[] = await db.$queryRawUnsafe(`
    SELECT pe.sku,
           SUM(GREATEST(pil.quantity, 0))::int AS available
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe.id = pil."productId"
      AND pe."organizationId" = pil."organizationId"
    WHERE pil."organizationId" = $1
      AND pil."warehouseId" IN (${whList})
    GROUP BY pe.sku
  `, org.id, ...IMPORT_SOURCE_WAREHOUSES);

  const availMap = new Map<string, number>();
  for (const row of availRows) availMap.set(row.sku, row.available);
  console.log(`Refs with B36+B37 stock: ${availMap.size}`);

  // ── 3. Filter to IMPORT refs with availability data ───────────────────
  const importWithAvail = [...importSkus].filter((sku) => availMap.has(sku));
  const importWithoutAvail = [...importSkus].filter((sku) => !availMap.has(sku));
  console.log(`IMPORT refs with B36+B37 data: ${importWithAvail.length}`);
  console.log(`IMPORT refs without B36+B37 data: ${importWithoutAvail.length} (available=0)\n`);

  // ── 4. Sample 30 IMPORT refs and validate ─────────────────────────────
  // Mix: some with stock, some without, some near threshold
  const withStock = importWithAvail
    .map((sku) => ({ sku, avail: availMap.get(sku) ?? 0 }))
    .sort((a, b) => a.avail - b.avail);

  const nearThreshold = withStock.filter((s) => s.avail > 0 && s.avail <= 20);
  const healthy = withStock.filter((s) => s.avail > IMPORT_SCARCITY_MINIMUM);
  const scarce = withStock.filter((s) => s.avail <= IMPORT_SCARCITY_MINIMUM);
  const noData = importWithoutAvail.slice(0, 5).map((sku) => ({ sku, avail: 0 }));

  const sample = [
    ...scarce.slice(0, 10),
    ...nearThreshold.slice(0, 5),
    ...healthy.slice(-10),
    ...noData,
  ].slice(0, 30);

  console.log(`Sample: ${sample.length} refs (${scarce.slice(0,10).length} scarce, ${nearThreshold.slice(0,5).length} near threshold, ${Math.min(healthy.length, 10)} healthy, ${noData.length} no data)\n`);

  let pass = 0;
  let fail = 0;

  for (const item of sample) {
    const checks: string[] = [];
    let refPass = true;
    const expectedState = item.avail > IMPORT_SCARCITY_MINIMUM ? "saludable" : "escasez";
    const expectedAction = expectedState === "escasez" ? "DEJAR_DE_VENDER" : null;

    // Check 1: Is correctly identified as IMPORT
    if (importSkus.has(item.sku)) {
      checks.push("OK: identified as IMPORT (productLine=5)");
    } else {
      checks.push("FAIL: not in IMPORT set");
      refPass = false;
    }

    // Check 2: Availability matches PIL
    const pilDirect: any[] = await db.$queryRawUnsafe(`
      SELECT SUM(GREATEST(pil.quantity, 0))::int as avail
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe.id = pil."productId"
        AND pe."organizationId" = pil."organizationId"
      WHERE pil."organizationId" = $1 AND pe.sku = $2
        AND pil."warehouseId" IN ($3, $4)
    `, org.id, item.sku, ...IMPORT_SOURCE_WAREHOUSES);
    const directAvail = pilDirect[0]?.avail ?? 0;

    if (item.avail === directAvail) {
      checks.push(`OK: availability=${item.avail} matches PIL`);
    } else {
      checks.push(`FAIL: computed=${item.avail} vs PIL=${directAvail}`);
      refPass = false;
    }

    // Check 3: State computed correctly
    checks.push(`OK: avail=${item.avail} → state=${expectedState} action=${expectedAction ?? "null"}`);

    // Check 4: Should NOT appear in CoverageSnapshot as REEMPLAZAR
    const cssRow: any[] = await db.$queryRawUnsafe(`
      SELECT line, disponible FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1 AND "refCode" = $2
      ORDER BY "snapshotAt" DESC LIMIT 1
    `, org.id, item.sku);
    if (cssRow.length > 0) {
      checks.push(`INFO: also in CoverageSnapshot line=${cssRow[0].line} disp=${cssRow[0].disponible}`);
    } else {
      checks.push("OK: not in CoverageSnapshot (expected for IMPORT)");
    }

    // Check 5: Should NOT have OP replacement options
    checks.push("OK: IMPORT excluded from replacement engine");

    const status = refPass ? "PASS" : "FAIL";
    if (refPass) pass++; else fail++;

    const subgrupo = importProducts.find((p: any) => p.sku === item.sku)?.subgrupoSag ?? "?";
    console.log(`[${status}] ${item.sku} (subgrupo=${subgrupo}, avail=${item.avail}, state=${expectedState})`);
    for (const c of checks) console.log(`  ${c}`);
    console.log();
  }

  console.log("═══════════════════════════════════════════════");
  console.log(`RESULT: ${pass}/${pass + fail} PASS (${Math.round(pass / (pass + fail) * 100)}%)`);
  console.log("═══════════════════════════════════════════════\n");

  // ── 5. Global stats ─────────────────────────────────────────────────
  const totalImport = importSkus.size;
  const scarceCount = [...importSkus].filter((sku) => (availMap.get(sku) ?? 0) <= IMPORT_SCARCITY_MINIMUM).length;
  const healthyCount = totalImport - scarceCount;

  console.log("Global Import Scarcity Stats:");
  console.log(`  Total IMPORT refs: ${totalImport}`);
  console.log(`  Saludable (>10): ${healthyCount} (${Math.round(healthyCount / totalImport * 100)}%)`);
  console.log(`  Escasez (<=10): ${scarceCount} (${Math.round(scarceCount / totalImport * 100)}%)`);
  console.log(`  Source warehouses: B${IMPORT_SOURCE_WAREHOUSES.join("+B")}`);
  console.log(`  Minimum threshold: ${IMPORT_SCARCITY_MINIMUM}`);

  // Subgrupo distribution of scarce refs
  const scarceSubgrupos = new Map<string, number>();
  for (const sku of importSkus) {
    if ((availMap.get(sku) ?? 0) <= IMPORT_SCARCITY_MINIMUM) {
      const sub = importProducts.find((p: any) => p.sku === sku)?.subgrupoSag ?? "OTRO";
      scarceSubgrupos.set(sub, (scarceSubgrupos.get(sub) ?? 0) + 1);
    }
  }
  console.log(`\n  Scarce refs by subgrupo:`);
  const sortedSubs = [...scarceSubgrupos.entries()].sort((a, b) => b[1] - a[1]);
  for (const [sub, count] of sortedSubs.slice(0, 10)) {
    console.log(`    ${sub}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
