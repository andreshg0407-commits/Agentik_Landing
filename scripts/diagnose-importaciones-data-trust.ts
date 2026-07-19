/**
 * diagnose-importaciones-data-trust.ts
 *
 * Diagnostic for Importaciones data trust issues.
 * Validates dates, inventory, sales, and classification
 * against real Castillitos data.
 *
 * Run: npx tsx scripts/diagnose-importaciones-data-trust.ts
 *
 * Sprint: GO-LIVE-IMPORTACIONES-DATA-TRUST-AND-NAVIGATION-01
 */

import { prisma } from "../lib/prisma";
import { createSagDirectDataSource } from "../lib/comercial/data-sources/sag-direct-commercial-product-data-source";

async function main() {
  console.log("\n=== IMPORTACIONES DATA TRUST DIAGNOSTIC ===\n");

  const org = await (prisma as any).organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, slug: true },
  });
  if (org === null) {
    console.log("ERROR: Castillitos org not found");
    process.exit(1);
  }
  console.log(`Org: ${org.slug} (${org.id})\n`);

  // 1. Product date distribution
  const allProducts = await (prisma as any).productEntity.findMany({
    where: { organizationId: org.id, productLine: "5", status: { not: "archived" } },
    select: { id: true, externalId: true, createdAt: true },
  });
  const dateSet = new Set(allProducts.map((p: any) => p.createdAt?.toISOString().slice(0, 10)));
  console.log(`Total import products: ${allProducts.length}`);
  console.log(`Distinct createdAt dates: ${[...dateSet].sort().join(", ")}`);
  console.log(`DIAGNOSIS: ${dateSet.size === 1 ? "ALL products share same createdAt (sync date)" : "Multiple dates detected"}\n`);

  // 2. Warehouse distribution
  const productIds = allProducts.map((p: any) => p.id);
  const inv = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: org.id, productId: { in: productIds } },
    select: { productId: true, warehouseId: true, quantity: true },
  });

  const IMPORT_WH = new Set(["24", "42", "43", "44", "45", "46"]);
  const whSummary = new Map<string, { count: number; qty: number; products: Set<string> }>();
  for (const i of inv) {
    const wh = i.warehouseId;
    const e = whSummary.get(wh) ?? { count: 0, qty: 0, products: new Set() };
    e.count++;
    e.qty += Number(i.quantity ?? 0);
    e.products.add(i.productId);
    whSummary.set(wh, e);
  }

  console.log("=== WAREHOUSE DISTRIBUTION ===");
  let importProducts = 0;
  let importQty = 0;
  let totalProducts = 0;
  let totalPositiveQty = 0;
  for (const [wh, data] of [...whSummary.entries()].sort()) {
    const isImport = IMPORT_WH.has(wh);
    const posQty = Math.max(0, data.qty);
    console.log(`  WH ${wh.padStart(3)}: ${data.products.size} products, qty=${data.qty}${isImport ? " [IMPORT]" : ""}`);
    if (isImport) {
      importProducts += data.products.size;
      importQty += posQty;
    }
    totalProducts += data.products.size;
    totalPositiveQty += posQty;
  }
  console.log(`\nImport WH: ${importProducts} products, ${importQty} units`);
  console.log(`All WH (positive): ${totalPositiveQty} units`);
  console.log(`Products with import WH inventory: ${new Set(inv.filter((i: any) => IMPORT_WH.has(i.warehouseId) && Number(i.quantity) > 0).map((i: any) => i.productId)).size} / ${allProducts.length}\n`);

  // 3. SAG enrichment sample
  const sampleCodes = allProducts.slice(0, 20).map((p: any) => p.externalId).filter(Boolean) as string[];
  console.log("=== SAG ENRICHMENT SAMPLE ===");
  try {
    const ds = createSagDirectDataSource();
    const t0 = Date.now();
    const enrichment = await ds.fetchEnrichment(sampleCodes);
    console.log(`Fetched in ${Date.now() - t0}ms — ${enrichment.size} / ${sampleCodes.length} enriched`);

    let withPV3 = 0, withPV4 = 0, withReceipts = 0;
    for (const [code, e] of enrichment) {
      if (e.prices.pricePV3 !== null) withPV3++;
      if (e.prices.pricePV4 !== null) withPV4++;
      if (e.receipts.length > 0) withReceipts++;
    }
    console.log(`  With PV3: ${withPV3}`);
    console.log(`  With PV4: ${withPV4}`);
    console.log(`  With receipts: ${withReceipts}`);

    // Show first 5 with details
    let shown = 0;
    for (const [code, e] of enrichment) {
      if (shown >= 5) break;
      console.log(`\n  ${code}: PV3=${e.prices.pricePV3 ?? "null"}, PV4=${e.prices.pricePV4 ?? "null"}, receipts=${e.receipts.length}, first=${e.firstEntryDate ?? "null"}, last=${e.lastEntryDate ?? "null"}, totalImported=${e.totalImported ?? "null"}`);
      shown++;
    }
  } catch (err) {
    console.log(`SAG FAILED: ${(err as Error).message}`);
  }

  // 4. Sales distribution
  console.log("\n\n=== SALES DISTRIBUTION ===");
  const allCodes = allProducts.map((p: any) => p.externalId).filter(Boolean) as string[];
  const salesAgg = await (prisma as any).customerOrderLine.groupBy({
    by: ["referenceCode"],
    where: { organizationId: org.id, referenceCode: { in: allCodes.slice(0, 300) }, order: { status: "FACTURADO" } },
    _sum: { quantity: true },
    _count: true,
  });
  const withSales = salesAgg.filter((s: any) => Number(s._sum.quantity ?? 0) > 0).length;
  const withReturns = salesAgg.filter((s: any) => Number(s._sum.quantity ?? 0) < 0).length;
  console.log(`Products with sales data: ${salesAgg.length} / ${allCodes.length}`);
  console.log(`  Net positive: ${withSales}`);
  console.log(`  Net negative (returns > sales): ${withReturns}`);

  // 5. Classification audit — pick 5 refs with sales and check PV3/PV4
  console.log("\n=== CLASSIFICATION AUDIT ===");
  const topSales = salesAgg
    .filter((s: any) => Number(s._sum.quantity ?? 0) > 10)
    .sort((a: any, b: any) => Number(b._sum.quantity ?? 0) - Number(a._sum.quantity ?? 0))
    .slice(0, 5);

  if (topSales.length > 0) {
    const auditCodes = topSales.map((s: any) => s.referenceCode) as string[];
    try {
      const ds = createSagDirectDataSource();
      const auditEnrichment = await ds.fetchEnrichment(auditCodes);
      for (const s of topSales) {
        const code = s.referenceCode;
        const e = auditEnrichment.get(code.toUpperCase());
        const pv3 = e?.prices.pricePV3 ?? null;
        const pv4 = e?.prices.pricePV4 ?? null;
        const canClassify = pv3 !== null || pv4 !== null;
        console.log(`  ${code}: sold=${Number(s._sum.quantity).toFixed(0)}, PV3=${pv3 ?? "null"}, PV4=${pv4 ?? "null"} → ${canClassify ? "CAN CLASSIFY" : "CANNOT CLASSIFY"}`);
      }
    } catch {
      console.log("  SAG unavailable for classification audit");
    }
  }

  await (prisma as any).$disconnect();
  console.log("\nDone.");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
