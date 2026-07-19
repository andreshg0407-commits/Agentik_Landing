/**
 * _production-stage-forensics.ts
 *
 * PRODUCTION-STAGE-MAPPING-01 — Phases 1-5 forensic queries.
 * READ ONLY. No modifications. Discovery only.
 *
 * Usage: npx tsx scripts/_production-stage-forensics.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const db = prisma as any;

  // ── Phase 4: Reference traceability ────────────────────────────────────────
  console.log("=== OP count per reference (top 20 most active) ===");
  const refOps: any[] = await db.$queryRawUnsafe(`
    SELECT pol."referenceCode", COUNT(DISTINCT po.id)::int as op_count,
           SUM(pol."quantityOrdered")::int as total_qty,
           MIN(po."documentDate") as earliest_op,
           MAX(po."documentDate") as latest_op,
           MIN(pol."productName") as product_name
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
    WHERE po."organizationId" = $1 AND po."isClosed" = false
    GROUP BY pol."referenceCode"
    ORDER BY op_count DESC
    LIMIT 20
  `, ORG_ID);
  for (const r of refOps) {
    console.log(`  ${r.referenceCode} | OPs: ${r.op_count} | qty: ${r.total_qty} | from: ${String(r.earliest_op).slice(0,10)} to: ${String(r.latest_op).slice(0,10)}`);
  }

  // Total unique references
  console.log("\n=== Overall reference stats ===");
  const refStats: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT pol."referenceCode")::int as unique_refs,
           COUNT(DISTINCT po.id)::int as unique_ops,
           SUM(pol."quantityOrdered")::int as total_units,
           AVG(pol."quantityOrdered")::int as avg_per_line
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
    WHERE po."organizationId" = $1 AND po."isClosed" = false
  `, ORG_ID);
  console.log(`  Unique references: ${refStats[0].unique_refs}`);
  console.log(`  Unique OPs: ${refStats[0].unique_ops}`);
  console.log(`  Total units: ${refStats[0].total_units}`);
  console.log(`  Avg per line: ${refStats[0].avg_per_line}`);

  // Distribution of OPs per reference
  console.log("\n=== Distribution: how many refs have N OPs? ===");
  const dist: any[] = await db.$queryRawUnsafe(`
    WITH ref_counts AS (
      SELECT pol."referenceCode", COUNT(DISTINCT po.id)::int as op_count
      FROM "ProductionOrderLine" pol
      JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND po."isClosed" = false
      GROUP BY pol."referenceCode"
    )
    SELECT op_count, COUNT(*)::int as ref_count
    FROM ref_counts
    GROUP BY op_count
    ORDER BY op_count
  `, ORG_ID);
  for (const d of dist) {
    console.log(`  ${d.op_count} OP(s): ${d.ref_count} references`);
  }

  // SubLinea distribution
  console.log("\n=== SubLinea distribution ===");
  const lineaDist: any[] = await db.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN pol."referenceCode" LIKE 'L-%' THEN 'LATIN KIDS'
        WHEN pol."referenceCode" LIKE 'C-%' THEN 'CASTILLITOS'
        WHEN pol."referenceCode" LIKE 'CP-%' THEN 'CASTILLITOS-P'
        WHEN pol."referenceCode" LIKE 'CT-%' THEN 'CASTILLITOS-T'
        WHEN pol."referenceCode" LIKE 'CA-%' THEN 'CASTILLITOS-A'
        WHEN pol."referenceCode" LIKE 'CD-%' THEN 'CASTILLITOS-D'
        WHEN pol."referenceCode" LIKE 'DA-%' THEN 'DAMA'
        ELSE 'OTRO (' || LEFT(pol."referenceCode", 3) || ')'
      END as sub_linea,
      COUNT(DISTINCT pol."referenceCode")::int as refs,
      COUNT(DISTINCT po.id)::int as ops,
      SUM(pol."quantityOrdered")::int as units
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
    WHERE po."organizationId" = $1 AND po."isClosed" = false
    GROUP BY sub_linea
    ORDER BY ops DESC
  `, ORG_ID);
  for (const l of lineaDist) {
    console.log(`  ${l.sub_linea} | refs: ${l.refs} | OPs: ${l.ops} | units: ${l.units}`);
  }

  // Phase 5: OP age distribution
  console.log("\n=== OP age distribution (open OPs) ===");
  const ageDist: any[] = await db.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN EXTRACT(DAY FROM NOW() - "documentDate") <= 30 THEN '0-30d'
        WHEN EXTRACT(DAY FROM NOW() - "documentDate") <= 90 THEN '31-90d'
        WHEN EXTRACT(DAY FROM NOW() - "documentDate") <= 180 THEN '91-180d'
        WHEN EXTRACT(DAY FROM NOW() - "documentDate") <= 365 THEN '181-365d'
        WHEN EXTRACT(DAY FROM NOW() - "documentDate") <= 730 THEN '1-2yr'
        ELSE '2yr+'
      END as age_bucket,
      COUNT(*)::int as op_count,
      SUM(pol_stats.total_qty)::int as total_units
    FROM "ProductionOrder" po
    LEFT JOIN (
      SELECT "productionOrderId", SUM("quantityOrdered")::int as total_qty
      FROM "ProductionOrderLine"
      GROUP BY "productionOrderId"
    ) pol_stats ON pol_stats."productionOrderId" = po.id
    WHERE po."organizationId" = $1 AND po."isClosed" = false
    GROUP BY age_bucket
    ORDER BY MIN(EXTRACT(DAY FROM NOW() - po."documentDate"))
  `, ORG_ID);
  for (const a of ageDist) {
    console.log(`  ${a.age_bucket}: ${a.op_count} OPs, ${a.total_units} units`);
  }

  // Phase 4: Trace a specific reference through ALL its OPs
  console.log("\n=== Sample reference trace (most active ref) ===");
  if (refOps.length > 0) {
    const topRef = refOps[0].referenceCode;
    console.log(`  Tracing: ${topRef}`);
    const trace: any[] = await db.$queryRawUnsafe(`
      SELECT po."documentNumber" as op_number, po."documentDate",
             po."isClosed", pol."quantityOrdered",
             pol."size", pol."color"
      FROM "ProductionOrderLine" pol
      JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND pol."referenceCode" = $2
      ORDER BY po."documentDate"
    `, ORG_ID, topRef);
    for (const t of trace) {
      console.log(`    OP #${t.op_number} | ${String(t.documentDate).slice(0,10)} | closed: ${t.isClosed} | qty: ${t.quantityOrdered} | size: ${t.size} | color: ${t.color}`);
    }
  }

  // Check if references exist in BOTH production and Bodega 01
  // ProductEntity uses "sku" not "referenceCode". Also check ProductVariant.sku.
  console.log("\n=== References in production AND Bodega 01 ===");
  const crossRef: any[] = await db.$queryRawUnsafe(`
    WITH prod_refs AS (
      SELECT DISTINCT pol."referenceCode"
      FROM "ProductionOrderLine" pol
      JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND po."isClosed" = false
    ),
    inv_skus AS (
      SELECT DISTINCT pe.sku
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pil."productId" = pe.id
      WHERE pil."organizationId" = $1 AND pil."warehouseId" = '10'
        AND pil."quantity" > 0 AND pe.sku IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM prod_refs)::int as prod_total,
      (SELECT COUNT(*) FROM inv_skus)::int as inv_total,
      (SELECT COUNT(*) FROM prod_refs pr JOIN inv_skus iv ON pr."referenceCode" = iv.sku)::int as in_both,
      (SELECT COUNT(*) FROM prod_refs pr LEFT JOIN inv_skus iv ON pr."referenceCode" = iv.sku WHERE iv.sku IS NULL)::int as prod_only
  `, ORG_ID);
  if (crossRef.length > 0) {
    const c = crossRef[0];
    console.log(`  Production refs (open): ${c.prod_total}`);
    console.log(`  Bodega 01 refs (positive): ${c.inv_total}`);
    console.log(`  In BOTH: ${c.in_both}`);
    console.log(`  Production ONLY (not in Bodega 01): ${c.prod_only}`);
  }

  // Lines per OP distribution
  console.log("\n=== Lines per OP distribution ===");
  const linesDist: any[] = await db.$queryRawUnsafe(`
    WITH op_lines AS (
      SELECT po.id, COUNT(*)::int as line_count
      FROM "ProductionOrder" po
      JOIN "ProductionOrderLine" pol ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND po."isClosed" = false
      GROUP BY po.id
    )
    SELECT
      CASE
        WHEN line_count <= 5 THEN '1-5'
        WHEN line_count <= 10 THEN '6-10'
        WHEN line_count <= 20 THEN '11-20'
        WHEN line_count <= 50 THEN '21-50'
        ELSE '50+'
      END as bucket,
      COUNT(*)::int as op_count,
      AVG(line_count)::int as avg_lines
    FROM op_lines
    GROUP BY bucket
    ORDER BY MIN(line_count)
  `, ORG_ID);
  for (const l of linesDist) {
    console.log(`  ${l.bucket} lines: ${l.op_count} OPs (avg: ${l.avg_lines})`);
  }

  // Size/color data availability
  console.log("\n=== Size/Color data availability ===");
  const sizeColor: any[] = await db.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int as total_lines,
      COUNT(CASE WHEN "size" IS NOT NULL AND "size" != '' THEN 1 END)::int as with_size,
      COUNT(CASE WHEN "color" IS NOT NULL AND "color" != '' THEN 1 END)::int as with_color,
      COUNT(DISTINCT "size")::int as unique_sizes,
      COUNT(DISTINCT "color")::int as unique_colors
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
    WHERE po."organizationId" = $1 AND po."isClosed" = false
  `, ORG_ID);
  if (sizeColor.length > 0) {
    const sc = sizeColor[0];
    console.log(`  Total lines: ${sc.total_lines}`);
    console.log(`  With size: ${sc.with_size} (${Math.round(sc.with_size/sc.total_lines*100)}%)`);
    console.log(`  With color: ${sc.with_color} (${Math.round(sc.with_color/sc.total_lines*100)}%)`);
    console.log(`  Unique sizes: ${sc.unique_sizes}`);
    console.log(`  Unique colors: ${sc.unique_colors}`);
  }

  // Phase 6: Stage inference validation — what doc types exist?
  console.log("\n=== Phase 6: ProductionOrder sourceCode distribution ===");
  const srcDist: any[] = await db.$queryRawUnsafe(`
    SELECT "sourceCode", COUNT(*)::int as cnt,
           COUNT(CASE WHEN "isClosed" = false THEN 1 END)::int as open_cnt
    FROM "ProductionOrder"
    WHERE "organizationId" = $1
    GROUP BY "sourceCode"
    ORDER BY cnt DESC
  `, ORG_ID);
  for (const s of srcDist) {
    console.log(`  sourceCode=${s.sourceCode} | total: ${s.cnt} | open: ${s.open_cnt}`);
  }

  console.log("\n=== InventoryTransfer type distribution ===");
  const itDist: any[] = await db.$queryRawUnsafe(`
    SELECT "transferType", COUNT(*)::int as cnt
    FROM "InventoryTransfer"
    WHERE "organizationId" = $1
    GROUP BY "transferType"
    ORDER BY cnt DESC
  `, ORG_ID);
  for (const i of itDist) {
    console.log(`  type=${i.transferType} | count: ${i.cnt}`);
  }

  console.log("\n=== InventoryTransfer line count ===");
  const itLines: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int as line_count
    FROM "InventoryTransferLine" itl
    JOIN "InventoryTransfer" it ON itl."inventoryTransferId" = it.id
    WHERE it."organizationId" = $1
  `, ORG_ID);
  console.log(`  Transfer lines: ${itLines[0].line_count}`);

  // Check if any other tables could provide stage evidence
  console.log("\n=== Bodega 04 (WIP) inventory snapshot ===");
  const b04: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT pil."productId")::int as products,
           COUNT(*)::int as variants,
           SUM(pil."quantity")::int as total_units
    FROM "ProductInventoryLevel" pil
    WHERE pil."organizationId" = $1 AND pil."warehouseId" = '13'
      AND pil."quantity" > 0
  `, ORG_ID);
  if (b04.length > 0) {
    console.log(`  Products: ${b04[0].products}`);
    console.log(`  Variants: ${b04[0].variants}`);
    console.log(`  Total units: ${b04[0].total_units}`);
  }

  console.log("\n=== Bodega 01 (finished goods) inventory snapshot ===");
  const b01: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT pil."productId")::int as products,
           COUNT(*)::int as variants,
           SUM(pil."quantity")::int as total_units
    FROM "ProductInventoryLevel" pil
    WHERE pil."organizationId" = $1 AND pil."warehouseId" = '10'
      AND pil."quantity" > 0
  `, ORG_ID);
  if (b01.length > 0) {
    console.log(`  Products: ${b01[0].products}`);
    console.log(`  Variants: ${b01[0].variants}`);
    console.log(`  Total units: ${b01[0].total_units}`);
  }

  // Cross-reference: production refs with inventory in Bodega 04 (WIP)
  console.log("\n=== Production refs with Bodega 04 (WIP) inventory ===");
  const crossB04: any[] = await db.$queryRawUnsafe(`
    WITH prod_refs AS (
      SELECT DISTINCT pol."referenceCode"
      FROM "ProductionOrderLine" pol
      JOIN "ProductionOrder" po ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND po."isClosed" = false
    ),
    b04_skus AS (
      SELECT DISTINCT pe.sku
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pil."productId" = pe.id
      WHERE pil."organizationId" = $1 AND pil."warehouseId" = '13'
        AND pil."quantity" > 0 AND pe.sku IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM prod_refs)::int as prod_total,
      (SELECT COUNT(*) FROM b04_skus)::int as b04_total,
      (SELECT COUNT(*) FROM prod_refs pr JOIN b04_skus b ON pr."referenceCode" = b.sku)::int as in_both,
      (SELECT COUNT(*) FROM prod_refs pr LEFT JOIN b04_skus b ON pr."referenceCode" = b.sku WHERE b.sku IS NULL)::int as prod_not_in_b04
  `, ORG_ID);
  if (crossB04.length > 0) {
    const c = crossB04[0];
    console.log(`  Production refs (open): ${c.prod_total}`);
    console.log(`  Bodega 04 SKUs (positive qty): ${c.b04_total}`);
    console.log(`  In BOTH: ${c.in_both}`);
    console.log(`  Production NOT in Bodega 04: ${c.prod_not_in_b04}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
