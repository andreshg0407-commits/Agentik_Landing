/**
 * COMERCIAL-INVENTARIO-ACTIVO-HISTORICO-01 — Phase 1 Audit
 *
 * Answers all 8 audit questions before implementation.
 */

import { prisma } from "../lib/prisma";
import { loadAvailabilityRecords } from "../lib/commercial-intelligence/report-loader";
import { buildAvailabilityReport } from "../lib/commercial-intelligence/availability-engine";
import type { SagAvailabilityRecord } from "../lib/commercial-intelligence/availability-types";
import { LINE_TO_SUBLINEA } from "../lib/comercial/line-map";
import { inferProductType } from "../lib/comercial/maletas/sag-inventory-adapter";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";
const ORG_SLUG = "castillitos";

async function run() {
  console.log("=== FASE 1: AUDITORÍA PREVIA ===\n");

  // ── Q1: What function builds the 4,048 InventoryItem? ───────────────────
  console.log("Q1: buildInventoryControlSnapshot() in lib/inventory/inventory-control-service.ts");
  console.log("    Orchestrates: loadAvailabilityRecords → buildAvailabilityReport → enrich textile + accessory\n");

  // ── Q2: What field does the UI use as "Disponible"? ─────────────────────
  console.log("Q2: InventoryItem.disponibleReal");
  console.log("    Textile: existenciaBodega01 - pedidosPendientes (bodegas 01+04+14+15)");
  console.log("    Accessory: SUM(PIL.quantity) from bodegas 26+27\n");

  // ── Q3-Q6: Distribution of disponibleReal ───────────────────────────────

  // Load textile data (inlined from report-loader to avoid server-only)
  const snapLatest = await prisma.$queryRawUnsafe<any[]>(`
    SELECT MAX("snapshotAt") as latest FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1
  `, ORG_ID);
  const snapshotAt = snapLatest[0]?.latest;

  const rows = await (prisma as any).commercialCoverageSnapshot.findMany({
    where: { organizationId: ORG_ID, snapshotAt },
    select: { refCode: true, description: true, line: true, disponible: true, pendingOrdersQty: true, subgrupoSag: true },
  });

  const records: SagAvailabilityRecord[] = rows.map((row: any) => {
    const pendingOrders = row.pendingOrdersQty ?? 0;
    const inventarioBodega = row.disponible + pendingOrders;
    const rawSubgrupoSag = row.subgrupoSag as string | null;
    return {
      reference: row.refCode,
      description: row.description,
      subLinea: LINE_TO_SUBLINEA[row.line] ?? row.line,
      subGrupo: rawSubgrupoSag ?? inferProductType(row.description),
      subGrupoInferred: !rawSubgrupoSag,
      bodega: "01+04+14+15",
      inventarioBodega,
      pedidosPendientes: pendingOrders,
    };
  });

  const report = buildAvailabilityReport({ orgSlug: ORG_SLUG, records, sourceBodega: "01+04+14+15" });

  // Textile distribution
  const textileByLine: Record<string, { total: number; active: number; oos: number; negative: number }> = {};
  for (const row of report.rows) {
    const key = row.subLinea;
    if (!textileByLine[key]) textileByLine[key] = { total: 0, active: 0, oos: 0, negative: 0 };
    textileByLine[key].total++;
    if (row.disponibleReal > 0) textileByLine[key].active++;
    else if (row.disponibleReal === 0) textileByLine[key].oos++;
    else textileByLine[key].negative++;
  }

  let totalTextileActive = 0, totalTextileOOS = 0, totalTextileNeg = 0;

  console.log("Q3-Q4: Textile references by disponibleReal (bodegas 01+04+14+15):");
  console.log("  Line                 Total  Active(>0)  OOS(=0)  Negative(<0)");
  console.log("  " + "─".repeat(65));
  for (const [line, stats] of Object.entries(textileByLine).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${line.padEnd(20)} ${String(stats.total).padStart(5)}  ${String(stats.active).padStart(10)}  ${String(stats.oos).padStart(7)}  ${String(stats.negative).padStart(12)}`);
    totalTextileActive += stats.active;
    totalTextileOOS += stats.oos;
    totalTextileNeg += stats.negative;
  }
  const totalTextile = report.totalReferences;
  console.log("  " + "─".repeat(65));
  console.log(`  ${"TOTAL TEXTILE".padEnd(20)} ${String(totalTextile).padStart(5)}  ${String(totalTextileActive).padStart(10)}  ${String(totalTextileOOS).padStart(7)}  ${String(totalTextileNeg).padStart(12)}`);

  // Accessory distribution
  const accProducts = await (prisma as any).productEntity.findMany({
    where: { organizationId: ORG_ID, productLine: "5" },
    select: { sku: true, name: true, subgrupoSag: true, grupoSag: true, handlingUnit: true },
  });
  const accSkus = accProducts.filter((p: any) => p.sku).map((p: any) => p.sku as string);

  // Load accessory availability from PIL (bodegas 26+27)
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

  // Classify accessories
  let accActive = 0, accOOS = 0, accNoData = 0;
  for (const sku of accSkus) {
    const avail = accAvailMap.get(sku);
    if (avail === undefined) {
      accNoData++; // No PIL record for bodegas 26/27
    } else if (avail > 0) {
      accActive++;
    } else {
      accOOS++;
    }
  }

  console.log(`\n  Accessory references (bodegas 26+27):`);
  console.log(`  Total: ${accSkus.length}`);
  console.log(`  Active (avail > 0):   ${accActive}`);
  console.log(`  OOS (avail = 0):      ${accOOS}`);
  console.log(`  NO_DATA (no PIL):     ${accNoData}`);

  // ── Q5-Q8: Final classification ─────────────────────────────────────────

  // Textile: all have snapshot data, so no NO_DATA for textile
  // (snapshot existence = data exists)
  const textileNoData = 0; // All textile refs come from CommercialCoverageSnapshot

  const totalActive = totalTextileActive + accActive;
  const totalOOS = totalTextileOOS + totalTextileNeg + accOOS;
  const totalNoData = textileNoData + accNoData;
  const grandTotal = totalActive + totalOOS + totalNoData;

  console.log(`\n${"=".repeat(70)}`);
  console.log("CLASSIFICATION SUMMARY");
  console.log("=".repeat(70));
  console.log(`  ACTIVE (disponibleReal > 0):         ${totalActive}`);
  console.log(`    Textile:    ${totalTextileActive}`);
  console.log(`    Accessory:  ${accActive}`);
  console.log(`  OUT_OF_STOCK (disponibleReal <= 0):   ${totalOOS}`);
  console.log(`    Textile (=0):  ${totalTextileOOS}`);
  console.log(`    Textile (<0):  ${totalTextileNeg}`);
  console.log(`    Accessory:     ${accOOS}`);
  console.log(`  NO_DATA (no availability record):     ${totalNoData}`);
  console.log(`    Textile:    ${textileNoData}`);
  console.log(`    Accessory:  ${accNoData}`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  GRAND TOTAL:                          ${grandTotal}`);
  console.log(`  Expected:                             4048`);
  console.log(`  Match: ${grandTotal === 4048 ? "YES ✓" : `NO ✗ (diff=${grandTotal - 4048})`}`);

  // Additional: negative disponible detail
  if (totalTextileNeg > 0) {
    console.log(`\n  Note: ${totalTextileNeg} textile refs have NEGATIVE disponible (sobre-comprometido).`);
    console.log(`  These are operationally exhausted → classified as OUT_OF_STOCK.`);
  }

  // Textile disponible sums
  const activeDispSum = report.rows.filter(r => r.disponibleReal > 0).reduce((s, r) => s + r.disponibleReal, 0);
  console.log(`\n  Active textile disponible sum: ${activeDispSum.toLocaleString("es-CO")}`);
  console.log(`  Current total disponible sum:  ${report.totalDisponible.toLocaleString("es-CO")}`);

  console.log("\n=== AUDIT COMPLETE ===\n");
  process.exit(0);
}

run();
