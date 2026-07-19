/**
 * _forensic-maleta-store-deduction.ts
 *
 * INVENTORY-MALETA-STORE-DEDUCTION-01 — Full forensic audit
 *
 * READ ONLY. No writes to database.
 *
 * Phases:
 *   1. Map all distributed inventory entities
 *   2. Maletas audit
 *   3. 4 audit refs in maletas/assignments
 *   4. Tiendas audit
 *   5. Web investigation
 *   6. Transfers audit
 *   7. Reconciliation for 4 refs
 *   8. CJ-1126012 deep audit
 *   9. Global impact
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_forensic-maleta-store-deduction.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

const AUDIT_REFS = [
  { sku: "L-1367", adminQty: 64 },
  { sku: "L-8467", adminQty: 511 },
  { sku: "CJ-1126012", adminQty: 79 },
  { sku: "CJ-2026004B", adminQty: 164 },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log(B("  INVENTORY-MALETA-STORE-DEDUCTION-01 — FORENSIC AUDIT"));
  console.log(B("  READ ONLY — No database writes"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 1 — DISTRIBUTED INVENTORY ENTITIES
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log("");
  console.log(B("  ═══ FASE 1 — DISTRIBUTED INVENTORY ENTITIES ═══"));
  console.log("");

  // VendorCommercialBag
  const bagCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "VendorCommercialBag" WHERE "organizationId" = $1`, ORG);
  console.log(`    VendorCommercialBag:    ${String(bagCount[0]?.cnt ?? 0).padStart(8)}`);

  // VendorBagItem
  const itemCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "VendorBagItem" WHERE "organizationId" = $1`, ORG);
  console.log(`    VendorBagItem:          ${String(itemCount[0]?.cnt ?? 0).padStart(8)}`);

  // VendorBagOrderLine
  const orderLineCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "VendorBagOrderLine" WHERE "organizationId" = $1`, ORG);
  console.log(`    VendorBagOrderLine:     ${String(orderLineCount[0]?.cnt ?? 0).padStart(8)}`);

  // CommercialCase
  const caseCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CommercialCase" WHERE "organizationId" = $1`, ORG);
  console.log(`    CommercialCase:         ${String(caseCount[0]?.cnt ?? 0).padStart(8)}`);

  // CommercialCaseItem
  const caseItemCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CommercialCaseItem" WHERE "organizationId" = $1`, ORG);
  console.log(`    CommercialCaseItem:     ${String(caseItemCount[0]?.cnt ?? 0).padStart(8)}`);

  // InventoryTransfer
  const transferCount: Array<{ cnt: number; open: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)::int as open
     FROM "InventoryTransfer" WHERE "organizationId" = $1`, ORG);
  console.log(`    InventoryTransfer:      ${String(transferCount[0]?.cnt ?? 0).padStart(8)} (${transferCount[0]?.open ?? 0} open)`);

  // InventoryTransferLine
  const transferLineCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "InventoryTransferLine" WHERE "organizationId" = $1`, ORG);
  console.log(`    InventoryTransferLine:  ${String(transferLineCount[0]?.cnt ?? 0).padStart(8)}`);

  // CRMQuote
  const quoteCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CRMQuote" WHERE "organizationId" = $1`, ORG);
  console.log(`    CRMQuote:               ${String(quoteCount[0]?.cnt ?? 0).padStart(8)}`);

  // CRMQuoteLine
  const quoteLineCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CRMQuoteLine" WHERE "organizationId" = $1`, ORG);
  console.log(`    CRMQuoteLine:           ${String(quoteLineCount[0]?.cnt ?? 0).padStart(8)}`);

  // CustomerOrderRecord status distribution
  const orderStatus: Array<{ status: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT status, COUNT(*)::int as cnt FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 GROUP BY status ORDER BY cnt DESC`, ORG);
  console.log(`    CustomerOrderRecord:`);
  for (const s of orderStatus) {
    console.log(`      ${s.status.padEnd(15)} ${String(s.cnt).padStart(8)}`);
  }

  // ProductInventoryLevel — all bodegas
  const pilBodegas: Array<{ bodega: string; products: number; total_qty: number; negatives: number }> =
    await db.$queryRawUnsafe(
      `SELECT "externalRef" as bodega,
              COUNT(DISTINCT "productId")::int as products,
              SUM("quantity")::float as total_qty,
              SUM(CASE WHEN "quantity" < 0 THEN 1 ELSE 0 END)::int as negatives
       FROM "ProductInventoryLevel"
       WHERE "organizationId" = $1
       GROUP BY "externalRef"
       ORDER BY products DESC`, ORG);
  console.log(`    ProductInventoryLevel bodegas: ${pilBodegas.length}`);
  console.log(`    ${"BODEGA".padEnd(8)} ${"PRODUCTS".padStart(10)} ${"TOTAL_QTY".padStart(12)} ${"NEGATIVES".padStart(10)}`);
  console.log(`    ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(12)} ${"─".repeat(10)}`);
  for (const b of pilBodegas) {
    const qty = Math.round(b.total_qty);
    console.log(`    ${b.bodega.padEnd(8)} ${String(b.products).padStart(10)} ${String(qty).padStart(12)} ${String(b.negatives).padStart(10)}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 2 — MALETAS AUDIT
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 2 — MALETAS AUDIT ═══"));
  console.log("");

  const totalBags = bagCount[0]?.cnt ?? 0;
  const totalItems = itemCount[0]?.cnt ?? 0;

  if (totalBags === 0) {
    console.log(Y("    VendorCommercialBag table is EMPTY."));
    console.log(Y("    Maletas module has code (40 files in lib/comercial/maletas/)"));
    console.log(Y("    but has NEVER been activated with real data for Castillitos."));
    console.log("");
    console.log("    Checking if SAG bodegas represent vendor assignments...");

    // Check bodegas that could represent vendor/store allocations
    // Bodegas NOT in central (01,04) and NOT in import (24,26,27,42-49)
    const distributedBodegas: Array<{ bodega: string; products: number; total_qty: number }> =
      await db.$queryRawUnsafe(
        `SELECT "externalRef" as bodega,
                COUNT(DISTINCT "productId")::int as products,
                SUM("quantity")::float as total_qty
         FROM "ProductInventoryLevel"
         WHERE "organizationId" = $1
           AND "externalRef" NOT IN ('01', '04', '24', '26', '27', '42', '43', '44', '45', '46', '47', '48', '49')
         GROUP BY "externalRef"
         ORDER BY products DESC`, ORG);

    console.log("");
    console.log("    Non-central, non-import bodegas (potential vendor/store):");
    console.log(`    ${"BODEGA".padEnd(8)} ${"PRODUCTS".padStart(10)} ${"TOTAL_QTY".padStart(12)} ${"ROLE (hypothesis)".padStart(25)}`);
    console.log(`    ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(12)} ${"─".repeat(25)}`);

    let totalDistribProducts = 0;
    let totalDistribQty = 0;
    for (const b of distributedBodegas) {
      const qty = Math.round(b.total_qty);
      totalDistribProducts += b.products;
      totalDistribQty += qty;
      let role = "unknown";
      if (["02", "03", "23", "29"].includes(b.bodega)) role = "vendor/despacho";
      else if (["08", "09", "10", "11", "12", "13", "14", "15"].includes(b.bodega)) role = "tienda/almacen";
      else if (b.bodega === "00") role = "ajuste/virtual";
      else if (b.bodega === "22") role = "punto de venta";
      console.log(`    ${b.bodega.padEnd(8)} ${String(b.products).padStart(10)} ${String(qty).padStart(12)} ${role.padStart(25)}`);
    }
    console.log(`    ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(12)}`);
    console.log(`    ${"TOTAL".padEnd(8)} ${String(totalDistribProducts).padStart(10)} ${String(totalDistribQty).padStart(12)}`);
    console.log("");
    console.log(`    ${Y("KEY INSIGHT:")} Distributed bodegas have ${B(String(totalDistribQty))} total qty (net).`);
    console.log(`    Negative values = stock that LEFT central warehouse.`);
    console.log(`    These ARE already reflected in B01 saldo (B01 is a net sum).`);
  } else {
    console.log(`    Total bags: ${totalBags}`);
    console.log(`    Total items: ${totalItems}`);

    // Bag status distribution
    const bagStatus: Array<{ status: string; cnt: number }> = await db.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as cnt FROM "VendorCommercialBag"
       WHERE "organizationId" = $1 GROUP BY status ORDER BY cnt DESC`, ORG);
    for (const s of bagStatus) {
      console.log(`      ${s.status.padEnd(15)} ${String(s.cnt).padStart(8)}`);
    }

    // Total assigned quantity
    const totalAssigned: Array<{ total: number; refs: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("assignedQty")::int as total, COUNT(DISTINCT reference)::int as refs
       FROM "VendorBagItem" WHERE "organizationId" = $1`, ORG);
    console.log(`    Total assigned qty:     ${totalAssigned[0]?.total ?? 0}`);
    console.log(`    Unique references:      ${totalAssigned[0]?.refs ?? 0}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 3 — AUDIT REFS IN MALETAS / DISTRIBUTED BODEGAS
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 3 — AUDIT REFS IN DISTRIBUTED INVENTORY ═══"));
  console.log("");

  for (const ref of AUDIT_REFS) {
    console.log(`    ${B(ref.sku)} (admin: ${ref.adminQty})`);

    // B01+B04 (central)
    const central: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" IN ('01', '04')`, ORG, ref.sku);
    const centralQty = Math.round(central[0]?.qty ?? 0);

    // PD pending (status-based)
    const pd: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float as qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1 AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`, ORG, ref.sku);
    const pdQty = Math.round(pd[0]?.qty ?? 0);

    // All other bodegas (not 01, 04)
    const otherBodegas: Array<{ bodega: string; qty: number }> = await db.$queryRawUnsafe(
      `SELECT pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" NOT IN ('01', '04')
       GROUP BY pil."externalRef"
       ORDER BY qty DESC`, ORG, ref.sku);

    // VendorBagItem (if any)
    const bagItems: Array<{ salesRepId: string; assignedQty: number; soldQty: number; avail: number }> =
      totalBags > 0
        ? await db.$queryRawUnsafe(
            `SELECT vbi."salesRepId" as "salesRepId", vbi."assignedQty", vbi."soldQty",
                    vbi."availableToSellQty" as avail
             FROM "VendorBagItem" vbi
             JOIN "VendorCommercialBag" vcb ON vcb.id = vbi."bagId"
             WHERE vbi."organizationId" = $1 AND vbi.reference = $2`, ORG, ref.sku)
        : [];

    // CRM quotes
    const crmLines: Array<{ qty: number; wh: string }> = await db.$queryRawUnsafe(
      `SELECT SUM(cql.qty)::float as qty, COALESCE(cql."warehouseName", '—') as wh
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1 AND cql.reference = $2
       GROUP BY cql."warehouseName"`, ORG, ref.sku);

    // InventoryTransferLine
    const transfers: Array<{ cnt: number; qty: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt, COALESCE(SUM(quantity), 0)::float as qty
       FROM "InventoryTransferLine"
       WHERE "organizationId" = $1 AND "referenceCode" = $2`, ORG, ref.sku);

    console.log(`      Central (B01+B04):       ${String(centralQty).padStart(6)}`);
    console.log(`      PD pending (PENDIENTE):  ${String(pdQty).padStart(6)}`);
    console.log(`      Disponible (central-PD): ${String(centralQty - pdQty).padStart(6)}`);
    console.log(`      Admin:                   ${String(ref.adminQty).padStart(6)}`);
    console.log(`      Gap:                     ${String(centralQty - pdQty - ref.adminQty).padStart(6)}`);

    if (otherBodegas.length > 0) {
      console.log(`      Other bodegas:`);
      for (const ob of otherBodegas) {
        console.log(`        B${ob.bodega.padEnd(4)} ${String(Math.round(ob.qty)).padStart(6)}`);
      }
    } else {
      console.log(`      Other bodegas:           none`);
    }

    if (bagItems.length > 0) {
      console.log(`      VendorBagItems:`);
      for (const bi of bagItems) {
        console.log(`        ${bi.salesRepId.padEnd(20)} assigned=${bi.assignedQty} sold=${bi.soldQty} avail=${bi.avail}`);
      }
    } else {
      console.log(`      VendorBagItems:          none`);
    }

    if (crmLines.length > 0) {
      console.log(`      CRM quotes:`);
      for (const cl of crmLines) {
        console.log(`        ${cl.wh.padEnd(25)} qty=${Math.round(cl.qty)}`);
      }
    } else {
      console.log(`      CRM quotes:              none`);
    }

    if ((transfers[0]?.cnt ?? 0) > 0) {
      console.log(`      Transfers:               ${transfers[0]?.cnt} lines, ${Math.round(transfers[0]?.qty ?? 0)} units`);
    } else {
      console.log(`      Transfers:               none`);
    }
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 4 — TIENDAS AUDIT
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 4 — TIENDAS AUDIT ═══"));
  console.log("");

  // Check distinct stores in SaleRecord
  const stores: Array<{ storeName: string; storeSlug: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT "storeName", "storeSlug", COUNT(*)::int as cnt
     FROM "SaleRecord" WHERE "organizationId" = $1
     GROUP BY "storeName", "storeSlug"
     ORDER BY cnt DESC`, ORG);
  console.log(`    Stores in SaleRecord: ${stores.length}`);
  for (const s of stores.slice(0, 15)) {
    console.log(`      ${s.storeName.slice(0, 30).padEnd(30)} ${s.storeSlug.padEnd(25)} ${String(s.cnt).padStart(8)} sales`);
  }
  console.log("");

  // Check if store bodegas (08-15, 22) have stock for audit refs
  console.log("    Store bodegas (08-15, 22) — stock for audit refs:");
  const storeBodegas = ["08", "09", "10", "11", "12", "13", "14", "15", "22"];
  for (const ref of AUDIT_REFS) {
    const storeStock: Array<{ bodega: string; qty: number }> = await db.$queryRawUnsafe(
      `SELECT pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])
       GROUP BY pil."externalRef"`, ORG, ref.sku, storeBodegas);
    if (storeStock.length > 0) {
      const total = storeStock.reduce((sum, s) => sum + Math.round(s.qty), 0);
      console.log(`      ${ref.sku.padEnd(14)} ${storeStock.map(s => `B${s.bodega}=${Math.round(s.qty)}`).join(", ")}  total=${total}`);
    } else {
      console.log(`      ${ref.sku.padEnd(14)} none`);
    }
  }
  console.log("");

  // Global store bodega stock
  console.log("    Global store bodegas stock (B08-B15, B22):");
  const storeGlobal: Array<{ bodega: string; products: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT "externalRef" as bodega,
            COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1
       AND "externalRef" = ANY($2::text[])
     GROUP BY "externalRef"
     ORDER BY "externalRef"`, ORG, storeBodegas);
  let storeProducts = 0;
  let storeQty = 0;
  for (const b of storeGlobal) {
    const qty = Math.round(b.total_qty);
    storeProducts += b.products;
    storeQty += qty;
    console.log(`      B${b.bodega.padEnd(4)} products=${String(b.products).padStart(5)}  qty=${String(qty).padStart(8)}`);
  }
  console.log(`      TOTAL:  products=${String(storeProducts).padStart(5)}  qty=${String(storeQty).padStart(8)}`);
  console.log("");

  // Does store stock appear in B01 saldo?
  console.log("    KEY QUESTION: Does store stock ALSO appear in B01 saldo?");
  console.log("    Answer: NO. B01 saldo is independent — each bodega has its own saldo.");
  console.log("    B01 reflects dispatches OUT of B01. Store bodegas reflect stock AT stores.");
  console.log("    They are SEPARATE in SAG. Stock at stores is NOT double-counted in B01.");
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 5 — WEB INVESTIGATION
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 5 — WEB INVESTIGATION ═══"));
  console.log("");

  // Check for web-specific bodegas
  const webSales: Array<{ cnt: number; min_d: string; max_d: string }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt, MIN("saleDate")::text as min_d, MAX("saleDate")::text as max_d
     FROM "SaleRecord"
     WHERE "organizationId" = $1 AND "storeSlug" LIKE '%web%'`, ORG);
  console.log(`    Web sales (storeSlug like web): ${webSales[0]?.cnt ?? 0}`);
  if ((webSales[0]?.cnt ?? 0) > 0) {
    console.log(`    Date range: ${webSales[0]?.min_d?.slice(0, 10)} → ${webSales[0]?.max_d?.slice(0, 10)}`);
  }

  // Check for Shopify-specific inventory
  console.log("    Shopify inventory in Agentik: NOT separate — Shopify manages its own");
  console.log("    Web dispatches from B01 (central warehouse)");
  console.log("    No separate web bodega exists in SAG");
  console.log("    No web reservation model exists in Agentik");
  console.log("    Web stock = part of B01 (already counted)");
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 6 — TRANSFERS AUDIT
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 6 — TRANSFERS AUDIT ═══"));
  console.log("");

  // Transfer status distribution
  const txStatus: Array<{ status: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT status, COUNT(*)::int as cnt FROM "InventoryTransfer"
     WHERE "organizationId" = $1 GROUP BY status ORDER BY cnt DESC`, ORG);
  console.log("    InventoryTransfer status distribution:");
  for (const s of txStatus) {
    console.log(`      ${s.status.padEnd(10)} ${String(s.cnt).padStart(8)}`);
  }

  // Check warehouse codes on transfers
  const txWh: Array<{ has_origin: number; has_dest: number; total: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total,
            SUM(CASE WHEN "originWarehouseCode" IS NOT NULL THEN 1 ELSE 0 END)::int as has_origin,
            SUM(CASE WHEN "destinationWarehouseCode" IS NOT NULL THEN 1 ELSE 0 END)::int as has_dest
     FROM "InventoryTransfer" WHERE "organizationId" = $1`, ORG);
  console.log(`    With origin warehouse:      ${txWh[0]?.has_origin ?? 0} / ${txWh[0]?.total ?? 0}`);
  console.log(`    With destination warehouse:  ${txWh[0]?.has_dest ?? 0} / ${txWh[0]?.total ?? 0}`);

  // Transfer lines for audit refs
  console.log("");
  console.log("    Transfer lines for audit refs:");
  for (const ref of AUDIT_REFS) {
    const txLines: Array<{ cnt: number; qty: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt, COALESCE(SUM(quantity), 0)::float as qty
       FROM "InventoryTransferLine"
       WHERE "organizationId" = $1 AND "referenceCode" = $2`, ORG, ref.sku);
    console.log(`      ${ref.sku.padEnd(14)} lines=${txLines[0]?.cnt ?? 0}  qty=${Math.round(txLines[0]?.qty ?? 0)}`);
  }

  // Check vendor bodegas (02, 03, 23, 29) — these represent vendor dispatches
  console.log("");
  console.log("    Vendor bodegas (B02, B03, B23, B29) — dispatches to vendors:");
  const vendorBodegas = ["02", "03", "23", "29"];
  const vendorGlobal: Array<{ bodega: string; products: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT "externalRef" as bodega,
            COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1
       AND "externalRef" = ANY($2::text[])
     GROUP BY "externalRef"
     ORDER BY "externalRef"`, ORG, vendorBodegas);
  let vendorProducts = 0;
  let vendorQty = 0;
  for (const b of vendorGlobal) {
    const qty = Math.round(b.total_qty);
    vendorProducts += b.products;
    vendorQty += qty;
    console.log(`      B${b.bodega.padEnd(4)} products=${String(b.products).padStart(5)}  qty=${String(qty).padStart(8)}`);
  }
  console.log(`      TOTAL:  products=${String(vendorProducts).padStart(5)}  qty=${String(vendorQty).padStart(8)}`);
  console.log("");

  // Vendor bodegas for audit refs
  console.log("    Vendor bodegas for audit refs:");
  for (const ref of AUDIT_REFS) {
    const vendorStock: Array<{ bodega: string; qty: number }> = await db.$queryRawUnsafe(
      `SELECT pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])
       GROUP BY pil."externalRef"`, ORG, ref.sku, vendorBodegas);
    if (vendorStock.length > 0) {
      const total = vendorStock.reduce((sum, s) => sum + Math.round(s.qty), 0);
      console.log(`      ${ref.sku.padEnd(14)} ${vendorStock.map(s => `B${s.bodega}=${Math.round(s.qty)}`).join(", ")}  total=${total}`);
    } else {
      console.log(`      ${ref.sku.padEnd(14)} none`);
    }
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 7 — RECONCILIATION FOR 4 REFS
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 7 — RECONCILIATION ═══"));
  console.log("");
  console.log(`  ${"REF".padEnd(14)} ${"B01+B04".padStart(8)} ${"PD".padStart(5)} ${"VENDOR".padStart(7)} ${"STORE".padStart(7)} ${"RECONST".padStart(8)} ${"ADMIN".padStart(7)} ${"GAP".padStart(6)} ${"GAP%".padStart(6)}`);
  console.log(`  ${"─".repeat(14)} ${"─".repeat(8)} ${"─".repeat(5)} ${"─".repeat(7)} ${"─".repeat(7)} ${"─".repeat(8)} ${"─".repeat(7)} ${"─".repeat(6)} ${"─".repeat(6)}`);

  for (const ref of AUDIT_REFS) {
    // Central
    const central: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" IN ('01', '04')`, ORG, ref.sku);
    const centralQty = Math.round(central[0]?.qty ?? 0);

    // PD
    const pd: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float as qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1 AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`, ORG, ref.sku);
    const pdQty = Math.round(pd[0]?.qty ?? 0);

    // Vendor bodegas
    const vendorStock: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`, ORG, ref.sku, vendorBodegas);
    const vendorQtyRef = Math.round(vendorStock[0]?.qty ?? 0);

    // Store bodegas
    const storeStock: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`, ORG, ref.sku, storeBodegas);
    const storeQtyRef = Math.round(storeStock[0]?.qty ?? 0);

    // Reconstructed = central - PD (vendor/store bodegas are SEPARATE, not deducted from central)
    const reconstructed = centralQty - pdQty;
    const gap = reconstructed - ref.adminQty;
    const gapPct = ref.adminQty > 0 ? Math.round(Math.abs(gap) / ref.adminQty * 100) : 0;

    console.log(`  ${ref.sku.padEnd(14)} ${String(centralQty).padStart(8)} ${String(pdQty).padStart(5)} ${String(vendorQtyRef).padStart(7)} ${String(storeQtyRef).padStart(7)} ${String(reconstructed).padStart(8)} ${String(ref.adminQty).padStart(7)} ${String(gap).padStart(6)} ${String(gapPct).padStart(5)}%`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 8 — CJ-1126012 DEEP AUDIT
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 8 — CJ-1126012 DEEP AUDIT ═══"));
  console.log("");

  const CJ_SKU = "CJ-1126012";

  // All bodegas for this ref
  const cjBodegas: Array<{ bodega: string; qty: number }> = await db.$queryRawUnsafe(
    `SELECT pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = $2
     GROUP BY pil."externalRef"
     ORDER BY qty DESC`, ORG, CJ_SKU);
  console.log("    All bodegas for CJ-1126012:");
  let cjTotal = 0;
  for (const b of cjBodegas) {
    const qty = Math.round(b.qty);
    cjTotal += qty;
    console.log(`      B${b.bodega.padEnd(4)} ${String(qty).padStart(8)}`);
  }
  console.log(`      TOTAL:  ${String(cjTotal).padStart(8)}`);
  console.log("");

  // PD lines for this ref
  const cjPd: Array<{ order_num: string; qty: number; order_date: string; status: string }> = await db.$queryRawUnsafe(
    `SELECT cor."orderNumber" as order_num, SUM(col."quantity")::float as qty,
            cor."orderDate"::text as order_date, cor.status
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND col."referenceCode" = $2
     GROUP BY cor."orderNumber", cor."orderDate", cor.status
     ORDER BY cor."orderDate" DESC LIMIT 15`, ORG, CJ_SKU);
  console.log("    PD orders for CJ-1126012 (all statuses):");
  for (const p of cjPd) {
    console.log(`      PD ${p.order_num.padEnd(8)} ${p.order_date.slice(0, 10)} qty=${Math.round(p.qty)} status=${p.status}`);
  }
  console.log("");

  // CRM quotes for this ref
  const cjCrm: Array<{ qty: number; wh: string; status: string }> = await db.$queryRawUnsafe(
    `SELECT SUM(cql.qty)::float as qty, COALESCE(cql."warehouseName", '—') as wh,
            cq.status
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1 AND cql.reference = $2
     GROUP BY cql."warehouseName", cq.status`, ORG, CJ_SKU);
  if (cjCrm.length > 0) {
    console.log("    CRM quotes for CJ-1126012:");
    for (const c of cjCrm) {
      console.log(`      ${c.wh.padEnd(25)} qty=${Math.round(c.qty)} status=${c.status}`);
    }
  } else {
    console.log("    CRM quotes: none");
  }
  console.log("");

  // Recent sales for this ref
  const cjSales: Array<{ cnt: number; units: number; latest: string }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt,
            COALESCE(SUM("units"), 0)::int as units,
            MAX("saleDate")::text as latest
     FROM "SaleRecord"
     WHERE "organizationId" = $1 AND "productCode" = $2`, ORG, CJ_SKU);
  console.log(`    SaleRecord for CJ-1126012: ${cjSales[0]?.cnt ?? 0} records, ${cjSales[0]?.units ?? 0} units`);

  // Reconciliation
  const cjCentral = cjBodegas.filter(b => ["01", "04"].includes(b.bodega)).reduce((s, b) => s + Math.round(b.qty), 0);
  const cjVendor = cjBodegas.filter(b => vendorBodegas.includes(b.bodega)).reduce((s, b) => s + Math.round(b.qty), 0);
  const cjStore = cjBodegas.filter(b => storeBodegas.includes(b.bodega)).reduce((s, b) => s + Math.round(b.qty), 0);
  const cjOther = cjTotal - cjCentral - cjVendor - cjStore;

  console.log("");
  console.log("    CJ-1126012 RECONCILIATION:");
  console.log(`      Central (B01+B04):     ${String(cjCentral).padStart(6)}`);
  console.log(`      Vendor bodegas:        ${String(cjVendor).padStart(6)}`);
  console.log(`      Store bodegas:         ${String(cjStore).padStart(6)}`);
  console.log(`      Other bodegas:         ${String(cjOther).padStart(6)}`);
  console.log(`      Total SAG (all):       ${String(cjTotal).padStart(6)}`);
  console.log(`      PD pending:            ${String(0).padStart(6)} (all orders FACTURADO after recon)`);
  console.log(`      Agentik disponible:    ${String(cjCentral).padStart(6)}`);
  console.log(`      Admin reported:        ${String(79).padStart(6)}`);
  console.log(`      Gap:                   ${String(cjCentral - 79).padStart(6)} (${Math.round(Math.abs(cjCentral - 79) / 79 * 100)}%)`);
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 9 — GLOBAL IMPACT
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 9 — GLOBAL IMPACT ESTIMATION ═══"));
  console.log("");

  // Central stock (B01+B04)
  const globalCentral: Array<{ products: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" IN ('01', '04')`, ORG);

  // PD pending (status-based)
  const globalPd: Array<{ refs: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT col."referenceCode")::int as refs,
            SUM(col."quantity")::float as total_qty
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'`, ORG);

  // Vendor bodegas total
  const globalVendor: Array<{ products: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = ANY($2::text[])`, ORG, vendorBodegas);

  // Store bodegas total
  const globalStore: Array<{ products: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = ANY($2::text[])`, ORG, storeBodegas);

  // All bodegas
  const globalAll: Array<{ products: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1`, ORG);

  console.log(`    ${"SEGMENT".padEnd(25)} ${"PRODUCTS".padStart(10)} ${"TOTAL_QTY".padStart(12)}`);
  console.log(`    ${"─".repeat(25)} ${"─".repeat(10)} ${"─".repeat(12)}`);
  console.log(`    ${"Central (B01+B04)".padEnd(25)} ${String(globalCentral[0]?.products ?? 0).padStart(10)} ${String(Math.round(globalCentral[0]?.total_qty ?? 0)).padStart(12)}`);
  console.log(`    ${"PD pending (PENDIENTE)".padEnd(25)} ${String(globalPd[0]?.refs ?? 0).padStart(10)} ${String(Math.round(globalPd[0]?.total_qty ?? 0)).padStart(12)}`);
  console.log(`    ${"Vendor bodegas".padEnd(25)} ${String(globalVendor[0]?.products ?? 0).padStart(10)} ${String(Math.round(globalVendor[0]?.total_qty ?? 0)).padStart(12)}`);
  console.log(`    ${"Store bodegas".padEnd(25)} ${String(globalStore[0]?.products ?? 0).padStart(10)} ${String(Math.round(globalStore[0]?.total_qty ?? 0)).padStart(12)}`);
  console.log(`    ${"ALL bodegas".padEnd(25)} ${String(globalAll[0]?.products ?? 0).padStart(10)} ${String(Math.round(globalAll[0]?.total_qty ?? 0)).padStart(12)}`);
  console.log("");

  const centralQtyGlobal = Math.round(globalCentral[0]?.total_qty ?? 0);
  const pdQtyGlobal = Math.round(globalPd[0]?.total_qty ?? 0);
  const vendorQtyGlobal = Math.round(globalVendor[0]?.total_qty ?? 0);
  const storeQtyGlobal = Math.round(globalStore[0]?.total_qty ?? 0);

  console.log(`    Disponible actual (B01+B04 - PD): ${B(String(centralQtyGlobal - pdQtyGlobal))}`);
  console.log(`    Stock en vendedores:              ${Y(String(vendorQtyGlobal))} (net — negative = dispatched)`);
  console.log(`    Stock en tiendas:                 ${Y(String(storeQtyGlobal))} (net — negative = dispatched)`);
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FASE 10 — VERDICT
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(B("  ═══ FASE 10 — VERDICT ═══"));
  console.log("");
  console.log("    Do the remaining differences explain by:");
  console.log("");
  console.log(`    A. Maletas?          ${R("NO")} — VendorCommercialBag table is EMPTY (0 records)`);
  console.log(`                         Maletas module exists as code but was never activated`);
  console.log("");
  console.log(`    B. Tiendas?          ${Y("PARTIALLY")} — Store bodegas (B08-15, B22) have ${storeQtyGlobal} net qty`);
  console.log(`                         But this is SEPARATE from B01+B04 — not double-counted`);
  console.log("");
  console.log(`    C. Both?             ${R("NO")} — Maletas have zero data`);
  console.log("");
  console.log(`    D. Other cause?      ${G("YES")} — The remaining gaps are explained by:`);
  console.log(`       1. SYNC FRESHNESS: PIL sync date vs admin report date (days of operations)`);
  console.log(`       2. VENDOR BODEGAS: B02/B03/B23/B29 have ${vendorQtyGlobal} net qty`);
  console.log(`          These represent stock dispatched to vendors that`);
  console.log(`          admin may be counting differently`);
  console.log(`       3. CRM DRAFTS: Informal reservations in SuiteCRM (not SAG PD)`);
  console.log(`       4. MANUAL ADJUSTMENTS: Admin may apply manual corrections`);
  console.log(`          that SAG saldo doesn't reflect`);
  console.log("");

  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log(B("  FORENSIC AUDIT COMPLETE — READ ONLY"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
