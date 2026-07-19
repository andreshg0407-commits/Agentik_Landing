/**
 * diagnose-importaciones-sag-live.ts
 *
 * Controlled diagnostic for Importaciones SAG live data.
 * Tests 3-5 real references against SAG and Prisma to confirm
 * all data sources are connected and producing correct results.
 *
 * Run: npx tsx scripts/diagnose-importaciones-sag-live.ts
 *
 * Sprint: GO-LIVE-IMPORTACIONES-SAG-LIVE-DATA-01
 */

import { prisma } from "../lib/prisma";
import { createSagDirectDataSource } from "../lib/comercial/data-sources/sag-direct-commercial-product-data-source";
import { classifySale } from "../lib/comercial/intelligence/sales-classification-engine";

const SAMPLE_REFS = ["C6-24-129"]; // Will be extended dynamically

async function main() {
  console.log("\n=== IMPORTACIONES SAG LIVE DIAGNOSTIC ===\n");

  // 1. Find the Castillitos org
  const org = await (prisma as any).organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) {
    console.log("ERROR: Castillitos org not found");
    process.exit(1);
  }
  console.log(`Org: ${org.slug} (${org.id})\n`);

  // 2. Find sample imported products (productLine "5")
  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: org.id, productLine: "5", status: { not: "archived" } },
    select: { id: true, externalId: true, name: true, price: true, createdAt: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  console.log(`Total import products (line 5): ${products.length}`);

  // Find products with inventory, sales, and multiple receipts for good test cases
  const sampleCodes: string[] = [];
  for (const ref of SAMPLE_REFS) {
    const found = products.find((p: any) => p.externalId === ref);
    if (found) sampleCodes.push(ref);
  }

  // Add more test cases with inventory
  const productIds = products.map((p: any) => p.id);
  const allCodes = products.map((p: any) => p.externalId).filter(Boolean) as string[];

  const invLevels = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: org.id, productId: { in: productIds } },
    select: { productId: true, quantity: true, warehouseId: true },
  });

  // Products with positive inventory
  const invByProduct = new Map<string, number>();
  for (const lvl of invLevels) {
    invByProduct.set(lvl.productId, (invByProduct.get(lvl.productId) ?? 0) + Number(lvl.quantity ?? 0));
  }

  // Products with sales
  const salesCounts = await (prisma as any).customerOrderLine.groupBy({
    by: ["referenceCode"],
    where: { organizationId: org.id, referenceCode: { in: allCodes.slice(0, 200) } },
    _sum: { quantity: true },
    _count: true,
  });
  const salesByCode = new Map<string, { count: number; sum: number }>();
  for (const s of salesCounts) {
    salesByCode.set(s.referenceCode, { count: s._count, sum: Number(s._sum.quantity ?? 0) });
  }

  // Pick 4 more references with interesting data
  for (const p of products) {
    if (sampleCodes.length >= 5) break;
    const code = p.externalId as string;
    if (!code || sampleCodes.includes(code)) continue;
    const inv = invByProduct.get(p.id) ?? 0;
    const sales = salesByCode.get(code);
    if (inv > 0 && sales && sales.count > 5) {
      sampleCodes.push(code);
    }
  }

  // If still not enough, just add some with sales
  for (const p of products) {
    if (sampleCodes.length >= 5) break;
    const code = p.externalId as string;
    if (!code || sampleCodes.includes(code)) continue;
    const sales = salesByCode.get(code);
    if (sales && sales.count > 0) {
      sampleCodes.push(code);
    }
  }

  console.log(`\nSample references: ${sampleCodes.join(", ")}\n`);

  // 3. SAG enrichment
  console.log("─── SAG Enrichment ───");
  const t0 = Date.now();
  const ds = createSagDirectDataSource();
  let enrichmentMap;
  try {
    enrichmentMap = await ds.fetchEnrichment(sampleCodes);
    console.log(`SAG enrichment completed in ${Date.now() - t0}ms`);
    console.log(`  Codes enriched: ${enrichmentMap.size}/${sampleCodes.length}`);
  } catch (err) {
    console.log(`SAG enrichment FAILED: ${(err as Error).message}`);
    enrichmentMap = new Map();
  }

  // 4. For each sample reference, print detailed diagnostic
  for (const code of sampleCodes) {
    const product = products.find((p: any) => p.externalId === code);
    if (!product) continue;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`REF: ${code} — ${product.name}`);
    console.log(`${"═".repeat(60)}`);

    // Prices
    const enrichment = enrichmentMap.get(code.toUpperCase());
    const pv3 = enrichment?.prices.pricePV3 ?? null;
    const pv4 = enrichment?.prices.pricePV4 ?? null;
    console.log(`\n  PRECIOS:`);
    console.log(`    PV3 (detal):     ${pv3 !== null ? `$${pv3}` : "NO DISPONIBLE"}`);
    console.log(`    PV4 (mayorista): ${pv4 !== null ? `$${pv4}` : "NO DISPONIBLE"}`);
    console.log(`    Prisma price:    ${product.price !== null ? `$${product.price}` : "null"}`);

    // Receipts
    const receipts = enrichment?.receipts ?? [];
    console.log(`\n  INGRESOS: ${receipts.length} documentos`);
    if (receipts.length > 0) {
      console.log(`    Primera entrada: ${enrichment?.firstEntryDate ?? "?"}`);
      console.log(`    Ultima entrada:  ${enrichment?.lastEntryDate ?? "?"}`);
      console.log(`    Total importado: ${enrichment?.totalImported ?? "?"}`);
      console.log(`    Lotes distintos: ${enrichment?.batchCount ?? 0}`);
      for (const r of receipts.slice(0, 5)) {
        console.log(`    ${r.date} | ${r.fuenteCode}-${r.documentNumber} | qty: ${r.quantity} | ${r.providerName ?? "sin proveedor"}`);
      }
      if (receipts.length > 5) console.log(`    ... y ${receipts.length - 5} mas`);
    }

    // Inventory
    const productInv = invLevels.filter((l: any) => l.productId === product.id);
    const warehouseBreakdown = new Map<string, number>();
    for (const l of productInv) {
      const wh = String(l.warehouseId);
      warehouseBreakdown.set(wh, (warehouseBreakdown.get(wh) ?? 0) + Number(l.quantity ?? 0));
    }
    const totalInv = Array.from(warehouseBreakdown.values()).reduce((s, v) => s + v, 0);
    const importInv = Array.from(warehouseBreakdown.entries())
      .filter(([wh]) => ["24", "42", "43", "44", "45", "46"].includes(wh))
      .reduce((s, [, v]) => s + v, 0);

    console.log(`\n  INVENTARIO:`);
    console.log(`    Total todas bodegas: ${totalInv}`);
    console.log(`    Import bodegas:      ${importInv} (bodegas 24, 42-46)`);
    console.log(`    Restante (display):  ${Math.max(0, importInv)}`);
    for (const [wh, qty] of Array.from(warehouseBreakdown.entries()).sort()) {
      const isImport = ["24", "42", "43", "44", "45", "46"].includes(wh);
      console.log(`    Bodega ${wh}: ${qty}${isImport ? " [IMPORT]" : ""}`);
    }

    // Sales
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);

    const lines = await (prisma as any).customerOrderLine.findMany({
      where: {
        organizationId: org.id,
        referenceCode: code,
        order: { status: "FACTURADO" },
      },
      select: {
        quantity: true,
        unitValue: true,
        order: { select: { orderDate: true } },
      },
    });

    let grossAll = 0, returnsAll = 0, gross6m = 0, returns6m = 0;
    let detalUnits = 0, mayoristaUnits = 0, noDetUnits = 0;
    const unitValues: number[] = [];

    for (const line of lines) {
      const qty = Number(line.quantity ?? 0);
      const uv = Number(line.unitValue ?? 0);
      const orderDate = new Date(line.order.orderDate);
      const is6m = orderDate >= sixMonthsAgo;

      if (qty > 0) {
        grossAll += qty;
        if (is6m) gross6m += qty;
      } else if (qty < 0) {
        returnsAll += Math.abs(qty);
        if (is6m) returns6m += Math.abs(qty);
      }

      if (uv > 0) unitValues.push(uv);

      // Classify
      if (uv > 0 && Math.abs(qty) > 0 && (pv3 !== null || pv4 !== null)) {
        const result = classifySale(
          { price: { unitValue: uv, pricePV3: pv3, pricePV4: pv4 } },
          "castillitos",
        );
        const absQty = Math.abs(qty);
        if (result.channel === "DETAL") detalUnits += absQty;
        else if (result.channel === "MAYORISTA") mayoristaUnits += absQty;
        else noDetUnits += absQty;
      }
    }

    console.log(`\n  VENTAS: ${lines.length} lineas`);
    console.log(`    Venta bruta (historico): ${grossAll}`);
    console.log(`    Devoluciones:            ${returnsAll}`);
    console.log(`    Venta neta:              ${grossAll - returnsAll}`);
    console.log(`    Venta bruta 6M:          ${gross6m}`);
    console.log(`    Devoluciones 6M:         ${returns6m}`);
    console.log(`    Venta neta 6M:           ${gross6m - returns6m}`);

    // Unit value distribution
    if (unitValues.length > 0) {
      const sorted = [...unitValues].sort((a, b) => a - b);
      const unique = [...new Set(sorted.map(v => Math.round(v)))];
      console.log(`\n  PRECIOS UNITARIOS DE VENTA:`);
      console.log(`    Valores unicos: ${unique.slice(0, 10).join(", ")}${unique.length > 10 ? ` ... (${unique.length} total)` : ""}`);
      console.log(`    Min: $${sorted[0]} | Max: $${sorted[sorted.length - 1]}`);
    }

    // Classification
    console.log(`\n  CLASIFICACION CANAL:`);
    console.log(`    Detal:          ${detalUnits} unidades`);
    console.log(`    Mayorista:      ${mayoristaUnits} unidades`);
    console.log(`    No determinado: ${noDetUnits} unidades`);

    const totalClassified = detalUnits + mayoristaUnits;
    if (totalClassified > 0) {
      const detalPct = Math.round((detalUnits / totalClassified) * 100);
      console.log(`    Dominante:      ${detalPct > 60 ? "DETAL" : detalPct < 40 ? "MAYORISTA" : "EQUILIBRADO"} (${detalPct}% detal)`);
    }
  }

  // 5. Performance summary
  console.log(`\n\n${"═".repeat(60)}`);
  console.log(`RESUMEN`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Total import products (line 5): ${products.length}`);
  console.log(`Products with inventory: ${invByProduct.size}`);
  console.log(`SAG enrichment time: ${Date.now() - t0}ms`);
  console.log(`References with SAG prices: ${enrichmentMap.size}`);

  let withPV3 = 0, withPV4 = 0, withReceipts = 0;
  for (const [, e] of enrichmentMap) {
    if (e.prices.pricePV3 !== null) withPV3++;
    if (e.prices.pricePV4 !== null) withPV4++;
    if (e.receipts.length > 0) withReceipts++;
  }
  console.log(`  With PV3: ${withPV3}`);
  console.log(`  With PV4: ${withPV4}`);
  console.log(`  With receipts: ${withReceipts}`);

  await (prisma as any).$disconnect();
  console.log("\nDone.");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
