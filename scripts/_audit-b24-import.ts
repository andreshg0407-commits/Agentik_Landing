/**
 * _audit-b24-import.ts — Phase 1: Audit B24 data availability for IMPORT/accessories
 */
import { prisma } from "@/lib/prisma";

const db = prisma as any;

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (org == null) { console.log("FAIL: org not found"); return; }

  console.log("=== PHASE 1: B24 IMPORT AUDIT ===\n");

  // 1. Check ProductInventoryLevel for B24
  console.log("── ProductInventoryLevel ──");
  try {
    const pilB24: any[] = await db.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count,
             COUNT(DISTINCT "sku")::int as unique_refs,
             SUM("availableQuantity")::float as total_qty,
             MIN("updatedAt") as oldest,
             MAX("updatedAt") as newest
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = $1
        AND "warehouseCode" = '24'
    `, org.id);
    const r = pilB24[0];
    console.log(`  B24 records: ${r.count} | unique refs: ${r.unique_refs} | total qty: ${r.total_qty}`);
    console.log(`  Date range: ${r.oldest?.toISOString?.().slice(0,10)} → ${r.newest?.toISOString?.().slice(0,10)}`);

    // Sample refs
    const sample: any[] = await db.$queryRawUnsafe(`
      SELECT pil.sku, pil."availableQuantity", pil."warehouseCode", pil."updatedAt",
             pe."productLine", pe."subgrupoSag"
      FROM "ProductInventoryLevel" pil
      LEFT JOIN "ProductEntity" pe ON pe.sku = pil.sku AND pe."organizationId" = pil."organizationId"
      WHERE pil."organizationId" = $1 AND pil."warehouseCode" = '24'
      ORDER BY pil."availableQuantity" DESC
      LIMIT 15
    `, org.id);
    console.log("\n  Sample B24 refs (top 15 by qty):");
    for (const s of sample) {
      console.log(`    ${s.sku} | qty=${s.availableQuantity} | line=${s.productLine} | subgrupo=${s.subgrupoSag}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 120)}`);
  }

  // 2. Check CommercialCoverageSnapshot for IMPORT line
  console.log("\n── CommercialCoverageSnapshot (line=IMPORT) ──");
  try {
    const cssImport: any[] = await db.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT "refCode")::int as unique_refs,
             SUM(disponible)::float as total_disp
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1 AND line = 'IMPORT'
    `, org.id);
    console.log(`  IMPORT refs: ${cssImport[0]?.unique_refs} | total disponible: ${cssImport[0]?.total_disp}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 120)}`);
  }

  // 3. Check which warehouses CoverageSnapshot covers
  console.log("\n── CoverageSnapshot warehouse coverage ──");
  try {
    const whs: any[] = await db.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'CommercialCoverageSnapshot'
      AND column_name LIKE '%warehouse%' OR column_name LIKE '%bodega%'
    `);
    console.log(`  Warehouse columns: ${whs.map(w => w.column_name).join(", ") || "NONE"}`);

    // Check if CoverageSnapshot has per-warehouse data or is aggregated
    const cssLines: any[] = await db.$queryRawUnsafe(`
      SELECT DISTINCT line, COUNT(DISTINCT "refCode")::int as refs
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
      GROUP BY line ORDER BY refs DESC
    `, org.id);
    console.log("  Lines in CoverageSnapshot:");
    for (const l of cssLines) console.log(`    ${l.line}: ${l.refs} refs`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 120)}`);
  }

  // 4. Check ProductEntity for IMPORT identification
  console.log("\n── ProductEntity IMPORT identification ──");
  try {
    const peImport: any[] = await db.$queryRawUnsafe(`
      SELECT "productLine", COUNT(*)::int as count
      FROM "ProductEntity"
      WHERE "organizationId" = $1
      GROUP BY "productLine"
      ORDER BY count DESC
    `, org.id);
    console.log("  productLine distribution:");
    for (const p of peImport) console.log(`    line=${p.productLine}: ${p.count} refs`);

    // Check line "5" (AC/IMPORT)
    const line5: any[] = await db.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count,
             COUNT(DISTINCT "subgrupoSag")::int as subgrupos
      FROM "ProductEntity"
      WHERE "organizationId" = $1 AND "productLine" = '5'
    `, org.id);
    console.log(`\n  productLine=5 (AC/IMPORT): ${line5[0]?.count} refs, ${line5[0]?.subgrupos} subgrupos`);

    // Sample line 5 refs
    const acSample: any[] = await db.$queryRawUnsafe(`
      SELECT pe.sku, pe."subgrupoSag", pe."productLine",
             pil."availableQuantity" as b24_qty
      FROM "ProductEntity" pe
      LEFT JOIN "ProductInventoryLevel" pil
        ON pil.sku = pe.sku AND pil."organizationId" = pe."organizationId" AND pil."warehouseCode" = '24'
      WHERE pe."organizationId" = $1 AND pe."productLine" = '5'
      ORDER BY pil."availableQuantity" DESC NULLS LAST
      LIMIT 15
    `, org.id);
    console.log("\n  Sample line=5 refs with B24 qty:");
    for (const s of acSample) {
      console.log(`    ${s.sku} | b24=${s.b24_qty ?? "null"} | subgrupo=${s.subgrupoSag}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 120)}`);
  }

  // 5. Check what "IMPORT" means in CoverageSnapshot vs ProductEntity
  console.log("\n── Cross-reference: CoverageSnapshot IMPORT vs ProductEntity line=5 ──");
  try {
    const cross: any[] = await db.$queryRawUnsafe(`
      SELECT
        COUNT(DISTINCT css."refCode") FILTER (WHERE pe."productLine" = '5')::int as import_in_both,
        COUNT(DISTINCT css."refCode") FILTER (WHERE pe."productLine" IS NULL)::int as import_no_pe,
        COUNT(DISTINCT css."refCode") FILTER (WHERE pe."productLine" != '5')::int as import_wrong_line,
        COUNT(DISTINCT css."refCode")::int as total_import_css
      FROM "CommercialCoverageSnapshot" css
      LEFT JOIN "ProductEntity" pe ON pe.sku = css."refCode" AND pe."organizationId" = css."organizationId"
      WHERE css."organizationId" = $1 AND css.line = 'IMPORT'
    `, org.id);
    const c = cross[0];
    console.log(`  IMPORT in CSS: ${c.total_import_css}`);
    console.log(`  Also line=5 in PE: ${c.import_in_both}`);
    console.log(`  No ProductEntity: ${c.import_no_pe}`);
    console.log(`  Different line in PE: ${c.import_wrong_line}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 120)}`);
  }

  // 6. Check if vendor presence engine picks up IMPORT refs
  console.log("\n── Vendor presence: IMPORT refs in vendor bodegas ──");
  try {
    // Check if any IMPORT refs show up in the F34 presence data
    const vpImport: any[] = await db.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT pil.sku)::int as import_in_vendor_bodegas
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe.sku = pil.sku AND pe."organizationId" = pil."organizationId"
      WHERE pil."organizationId" = $1
        AND pe."productLine" = '5'
        AND pil."warehouseCode" IN ('45','46','47','48','49','50')
    `, org.id);
    console.log(`  IMPORT refs in vendor bodegas (45-50): ${vpImport[0]?.import_in_vendor_bodegas}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 120)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
