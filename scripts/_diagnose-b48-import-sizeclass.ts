/**
 * scripts/_diagnose-b48-import-sizeclass.ts
 *
 * IMPORT-SIZECLASS-FROM-SAG-01 — Rules 8 & 9 diagnostic.
 *
 * Rule 8: Recalculate B48 using only current refs with qty >= 1
 * Rule 9: Report: total Import in B48; Pequeño; Mediano; Grande;
 *         sin Unidad de manejo; valor no homologado
 *
 * Usage: npx tsx scripts/_diagnose-b48-import-sizeclass.ts
 */

import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { consultaSagJson } from "@/lib/connectors/pya/client";

const NESTOR_BODEGA_KA_NL = 48;

async function main() {
  console.log("=== IMPORT-SIZECLASS-FROM-SAG-01 — B48 Diagnostic ===\n");

  // 1. Load SAG config
  const sagEnv = loadSagTestEnv();
  if (!sagEnv) {
    console.error("SAG env not configured. Set SAG_TEST_* env vars.");
    process.exit(1);
  }

  // 2. Fetch current B48 presence (refs with net_qty > 0)
  const balanceQuery = `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${NESTOR_BODEGA_KA_NL} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${NESTOR_BODEGA_KA_NL} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${NESTOR_BODEGA_KA_NL} OR mt.ka_nl_bodega_origen = ${NESTOR_BODEGA_KA_NL})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0
  `.trim();

  console.log("Querying B48 (Néstor) current presence via SAG F34...");
  const rows = await consultaSagJson(sagEnv as any, balanceQuery);
  console.log(`B48 total refs with qty >= 1: ${rows.length}\n`);

  // 3. Load ProductEntity for enrichment (productLine + handlingUnit)
  const orgId = await resolveOrgId();
  if (!orgId) {
    console.error("No organization found for castillitos.");
    process.exit(1);
  }

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId },
    select: { sku: true, productLine: true, handlingUnit: true },
  });

  const productMap = new Map<string, { productLine: string | null; handlingUnit: string | null }>();
  for (const p of products) {
    if (p.sku) productMap.set(p.sku.toUpperCase(), { productLine: p.productLine, handlingUnit: p.handlingUnit });
  }

  // 4. Classify B48 refs
  const CANONICAL = new Set(["PEQUENO", "MEDIANO", "GRANDE"]);

  let totalImport = 0;
  let pequeno = 0;
  let mediano = 0;
  let grande = 0;
  let sinUnidadManejo = 0;
  let noHomologado = 0;
  const unmappedValues: Record<string, number> = {};
  const missingHandlingUnit: string[] = [];

  let totalNonImport = 0;
  let noProductFound = 0;

  for (const row of rows) {
    const ref = String(row.ref || "").toUpperCase().trim();
    if (!ref) continue;

    const product = productMap.get(ref);
    if (!product) {
      noProductFound++;
      continue;
    }

    if (product.productLine !== "5") {
      totalNonImport++;
      continue;
    }

    // This is an Import ref present in B48
    totalImport++;

    if (!product.handlingUnit) {
      sinUnidadManejo++;
      missingHandlingUnit.push(ref);
      continue;
    }

    if (CANONICAL.has(product.handlingUnit)) {
      if (product.handlingUnit === "PEQUENO") pequeno++;
      else if (product.handlingUnit === "MEDIANO") mediano++;
      else if (product.handlingUnit === "GRANDE") grande++;
    } else {
      noHomologado++;
      unmappedValues[product.handlingUnit] = (unmappedValues[product.handlingUnit] || 0) + 1;
    }
  }

  // 5. Report
  console.log("─── RULE 9 REPORT ──────────────────────────────────────");
  console.log(`Total refs in B48 (qty >= 1):           ${rows.length}`);
  console.log(`  Non-Import (LT/CS/other):             ${totalNonImport}`);
  console.log(`  No ProductEntity match:               ${noProductFound}`);
  console.log(`  Import (productLine=5) in B48:        ${totalImport}`);
  console.log("");
  console.log("─── IMPORT SIZE CLASS BREAKDOWN ────────────────────────");
  console.log(`  PEQUENO (Pequeño):                    ${pequeno}`);
  console.log(`  MEDIANO (Mediano):                    ${mediano}`);
  console.log(`  GRANDE (Grande):                      ${grande}`);
  console.log(`  Sin Unidad de manejo:                 ${sinUnidadManejo}`);
  console.log(`  Valor no homologado:                  ${noHomologado}`);
  console.log("");

  if (Object.keys(unmappedValues).length > 0) {
    console.log("─── UNMAPPED VALUES ────────────────────────────────────");
    for (const [val, count] of Object.entries(unmappedValues).sort((a, b) => b[1] - a[1])) {
      console.log(`  "${val}": ${count} refs`);
    }
    console.log("");
  }

  if (missingHandlingUnit.length > 0) {
    console.log("─── SAMPLE: refs sin Unidad de manejo (first 20) ──────");
    for (const ref of missingHandlingUnit.slice(0, 20)) {
      console.log(`  ${ref}`);
    }
    console.log("");
  }

  // Verify: totals add up
  const classified = pequeno + mediano + grande + sinUnidadManejo + noHomologado;
  if (classified !== totalImport) {
    console.warn(`⚠ Classification mismatch: ${classified} classified vs ${totalImport} import refs`);
  } else {
    console.log(`✓ Classification complete: ${totalImport} import refs = ${pequeno}P + ${mediano}M + ${grande}G + ${sinUnidadManejo} sin UM + ${noHomologado} no homolog.`);
  }

  // 6. ProductEntity-wide stats (all imports, not just B48)
  console.log("\n─── GLOBAL ProductEntity IMPORT STATS ──────────────────");
  const allImport = await (prisma as any).productEntity.findMany({
    where: { organizationId: orgId, productLine: "5" },
    select: { sku: true, handlingUnit: true },
  });

  let gTotal = 0, gPeq = 0, gMed = 0, gGrd = 0, gNull = 0, gUnmapped = 0;
  for (const p of allImport) {
    gTotal++;
    if (!p.handlingUnit) { gNull++; continue; }
    if (p.handlingUnit === "PEQUENO") gPeq++;
    else if (p.handlingUnit === "MEDIANO") gMed++;
    else if (p.handlingUnit === "GRANDE") gGrd++;
    else gUnmapped++;
  }
  console.log(`Total Import products in catalog:       ${gTotal}`);
  console.log(`  PEQUENO:                              ${gPeq}`);
  console.log(`  MEDIANO:                              ${gMed}`);
  console.log(`  GRANDE:                               ${gGrd}`);
  console.log(`  NULL (sin handlingUnit):               ${gNull}`);
  console.log(`  Non-canonical:                        ${gUnmapped}`);

  console.log("\n=== Diagnostic complete. ===");
  process.exit(0);
}

async function resolveOrgId(): Promise<string | null> {
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  return org?.id ?? null;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
