/**
 * scripts/audit-tiendas-variant-data.ts
 *
 * READ-ONLY audit: where do talla/color actually live for textile products?
 * Sprint: TIENDAS-VARIANT-DATA-AUDIT-01
 *
 * Usage: npx tsx scripts/audit-tiendas-variant-data.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ORG_SLUG = "castillitos";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
    if (!org) { console.error("Org not found"); return; }
    const orgId = org.id;

    console.log("=== TIENDAS-VARIANT-DATA-AUDIT-01 ===");
    console.log(`Org: ${ORG_SLUG} (${orgId})\n`);

    // ═══════════════════════════════════════════════════════════
    // FASE 1 — Sample 100 variants from line 1 and 100 from line 2
    // ═══════════════════════════════════════════════════════════
    console.log("═".repeat(60));
    console.log("FASE 1: MUESTRA CONTROLADA");
    console.log("═".repeat(60));

    for (const line of ["1", "2"]) {
      console.log(`\n── productLine = ${line} ──\n`);

      // Get sample products
      const products = await prisma.productEntity.findMany({
        where: { organizationId: orgId, productLine: line },
        select: { id: true, name: true, sku: true, subgrupoSag: true },
        take: 20,
      });

      const productIds = products.map(p => p.id);

      // Get variants for these products
      const variants = await prisma.productVariant.findMany({
        where: { productId: { in: productIds } },
        select: { id: true, productId: true, name: true, sku: true },
        take: 100,
      });

      console.log(`Productos muestra: ${products.length}`);
      console.log(`Variantes muestra: ${variants.length}`);

      // Show 10 examples
      console.log("\nEjemplos (producto → variante):");
      let shown = 0;
      for (const v of variants.slice(0, 15)) {
        const prod = products.find(p => p.id === v.productId);
        // Get attributes for this variant
        const attrs = await pool.query(
          `SELECT key, value FROM "ProductVariantAttribute" WHERE "variantId" = $1`,
          [v.id],
        );
        const attrStr = attrs.rows.map((a: any) => `${a.key}=${a.value}`).join(", ");

        console.log(`  Prod: ${prod?.sku ?? "?"} | ${prod?.name ?? "?"} | sg=${prod?.subgrupoSag ?? "null"}`);
        console.log(`  Var:  ${v.sku ?? "(null)"} | ${v.name ?? "(null)"}`);
        console.log(`  Attr: ${attrStr || "(none)"}`);
        console.log();
        shown++;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 2 — Audit ProductVariant.name for talla/color patterns
    // ═══════════════════════════════════════════════════════════
    console.log("═".repeat(60));
    console.log("FASE 2: PRODUCTVARIANT.NAME ANALYSIS");
    console.log("═".repeat(60));

    for (const line of ["1", "2"]) {
      console.log(`\n── productLine = ${line} ──`);

      const res = await pool.query(`
        SELECT v.name AS vname, v.sku AS vsku, count(*) AS cnt
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.name IS NOT NULL AND trim(v.name) != ''
        GROUP BY v.name, v.sku
        ORDER BY cnt DESC
        LIMIT 40
      `, [orgId, line]);

      console.log(`\nTop variant names:`);
      for (const r of res.rows) {
        console.log(`  ${r.cnt.toString().padStart(5)} | name=${r.vname} | sku=${r.vsku}`);
      }

      // Count total variants and those with non-empty name
      const totalRes = await pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE v.name IS NOT NULL AND trim(v.name) != '') AS with_name
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const { total, with_name } = totalRes.rows[0];
      console.log(`\nVariantes totales: ${total}`);
      console.log(`Con name no vacio: ${with_name} (${Math.round(with_name/total*100)}%)`);
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 3 — Audit SKU patterns
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 3: SKU PATTERNS");
    console.log("═".repeat(60));

    for (const line of ["1", "2"]) {
      console.log(`\n── productLine = ${line} ──`);

      // Variant SKU patterns
      const vskuRes = await pool.query(`
        SELECT v.sku, count(*) AS cnt
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.sku IS NOT NULL AND trim(v.sku) != ''
        GROUP BY v.sku
        ORDER BY cnt DESC
        LIMIT 30
      `, [orgId, line]);

      console.log(`\nTop variant SKUs:`);
      for (const r of vskuRes.rows) {
        console.log(`  ${r.cnt.toString().padStart(5)} | ${r.sku}`);
      }

      // Count segments in variant SKU
      const segRes = await pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE v.sku IS NOT NULL AND trim(v.sku) != '') AS with_sku,
          count(*) FILTER (WHERE v.sku LIKE '%-%-%-%') AS four_segments,
          count(*) FILTER (WHERE v.sku LIKE '%-%-%' AND v.sku NOT LIKE '%-%-%-%') AS three_segments,
          count(*) FILTER (WHERE v.sku LIKE '%-%' AND v.sku NOT LIKE '%-%-%') AS two_segments
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const s = segRes.rows[0];
      console.log(`\nSKU segment analysis:`);
      console.log(`  Total: ${s.total}`);
      console.log(`  With SKU: ${s.with_sku} (${Math.round(s.with_sku/s.total*100)}%)`);
      console.log(`  4+ segments (X-X-X-X): ${s.four_segments} (${Math.round(s.four_segments/s.total*100)}%)`);
      console.log(`  3 segments (X-X-X): ${s.three_segments} (${Math.round(s.three_segments/s.total*100)}%)`);
      console.log(`  2 segments (X-X): ${s.two_segments} (${Math.round(s.two_segments/s.total*100)}%)`);

      // Parse a sample of 4-segment SKUs to identify talla/color positions
      const sampleRes = await pool.query(`
        SELECT v.sku
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.sku LIKE '%-%-%-%'
        LIMIT 30
      `, [orgId, line]);
      if (sampleRes.rows.length > 0) {
        console.log(`\nSample 4+ segment SKUs:`);
        for (const r of sampleRes.rows) {
          const parts = r.sku.split("-");
          console.log(`  ${r.sku}  →  segments: [${parts.join(" | ")}]`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 4 — Audit ProductVariantAttribute
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 4: PRODUCTVARIANTATTRIBUTE");
    console.log("═".repeat(60));

    for (const line of ["1", "2"]) {
      console.log(`\n── productLine = ${line} ──`);

      // Top attribute keys
      const keyRes = await pool.query(`
        SELECT a.key, count(*) AS cnt
        FROM "ProductVariantAttribute" a
        JOIN "ProductVariant" v ON a."variantId" = v.id
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
        GROUP BY a.key
        ORDER BY cnt DESC
        LIMIT 20
      `, [orgId, line]);
      console.log(`\nAttribute keys:`);
      for (const r of keyRes.rows) {
        console.log(`  ${r.cnt.toString().padStart(7)} | ${r.key}`);
      }

      // For key=talla and key=color, show top values
      for (const key of ["talla", "color"]) {
        const valRes = await pool.query(`
          SELECT a.value, count(*) AS cnt
          FROM "ProductVariantAttribute" a
          JOIN "ProductVariant" v ON a."variantId" = v.id
          JOIN "ProductEntity" p ON v."productId" = p.id
          WHERE p."organizationId" = $1 AND p."productLine" = $2 AND a.key = $3
          GROUP BY a.value
          ORDER BY cnt DESC
          LIMIT 30
        `, [orgId, line, key]);

        if (valRes.rows.length > 0) {
          console.log(`\n  Top values for key="${key}":`);
          for (const r of valRes.rows) {
            console.log(`    ${r.cnt.toString().padStart(5)} | "${r.value}"`);
          }
        } else {
          console.log(`\n  key="${key}": NO RECORDS FOUND`);
        }
      }

      // Count % of variants with talla attribute vs total
      const coverageRes = await pool.query(`
        SELECT
          count(DISTINCT v.id) AS total_variants,
          count(DISTINCT v.id) FILTER (
            WHERE EXISTS (SELECT 1 FROM "ProductVariantAttribute" a WHERE a."variantId" = v.id AND a.key = 'talla' AND trim(a.value) != '' AND a.value NOT IN ('GEN', 'GENERICO', 'GENERICA'))
          ) AS with_real_talla,
          count(DISTINCT v.id) FILTER (
            WHERE EXISTS (SELECT 1 FROM "ProductVariantAttribute" a WHERE a."variantId" = v.id AND a.key = 'color' AND trim(a.value) != '' AND a.value NOT IN ('GEN', 'GENERICO', 'GENERICA'))
          ) AS with_real_color,
          count(DISTINCT v.id) FILTER (
            WHERE EXISTS (SELECT 1 FROM "ProductVariantAttribute" a WHERE a."variantId" = v.id AND a.key = 'talla')
          ) AS with_any_talla,
          count(DISTINCT v.id) FILTER (
            WHERE EXISTS (SELECT 1 FROM "ProductVariantAttribute" a WHERE a."variantId" = v.id AND a.key = 'color')
          ) AS with_any_color
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const c = coverageRes.rows[0];
      console.log(`\nCobertura atributos (line ${line}):`);
      console.log(`  Total variantes: ${c.total_variants}`);
      console.log(`  Con attr talla (any): ${c.with_any_talla} (${Math.round(c.with_any_talla/c.total_variants*100)}%)`);
      console.log(`  Con attr talla (real, excl GEN): ${c.with_real_talla} (${Math.round(c.with_real_talla/c.total_variants*100)}%)`);
      console.log(`  Con attr color (any): ${c.with_any_color} (${Math.round(c.with_any_color/c.total_variants*100)}%)`);
      console.log(`  Con attr color (real, excl GEN): ${c.with_real_color} (${Math.round(c.with_real_color/c.total_variants*100)}%)`);
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 5 — Cross-check: same variant in PIL
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 5: INVENTARIO CROSS-CHECK");
    console.log("═".repeat(60));

    for (const line of ["1", "2"]) {
      console.log(`\n── productLine = ${line} ──`);

      const pilRes = await pool.query(`
        SELECT
          count(*) AS total_pil,
          count(*) FILTER (WHERE v.sku IS NOT NULL AND trim(v.sku) != '') AS pil_with_vsku,
          count(*) FILTER (WHERE v.name IS NOT NULL AND trim(v.name) != '') AS pil_with_vname
        FROM "ProductInventoryLevel" pil
        JOIN "ProductEntity" p ON pil."productId" = p.id
        LEFT JOIN "ProductVariant" v ON pil."variantId" = v.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const pi = pilRes.rows[0];
      console.log(`PIL records: ${pi.total_pil}`);
      console.log(`  with variant SKU: ${pi.pil_with_vsku} (${Math.round(pi.pil_with_vsku/pi.total_pil*100)}%)`);
      console.log(`  with variant name: ${pi.pil_with_vname} (${Math.round(pi.pil_with_vname/pi.total_pil*100)}%)`);

      // Check if PIL has variantId populated
      const variantIdRes = await pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE pil."variantId" IS NOT NULL) AS with_variant_id
        FROM "ProductInventoryLevel" pil
        JOIN "ProductEntity" p ON pil."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const vi = variantIdRes.rows[0];
      console.log(`  with variantId FK: ${vi.with_variant_id} (${Math.round(vi.with_variant_id/vi.total*100)}%)`);
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 6 — Full traceability: 20 real textile references
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 6: TRAZABILIDAD COMPLETA (20 refs)");
    console.log("═".repeat(60));

    const traceRes = await pool.query(`
      SELECT DISTINCT ON (p.sku)
        p.sku AS psku, p.name AS pname, p."productLine",
        v.id AS vid, v.sku AS vsku, v.name AS vname,
        pil.quantity, pil."warehouseId"
      FROM "ProductEntity" p
      JOIN "ProductVariant" v ON v."productId" = p.id
      JOIN "ProductInventoryLevel" pil ON pil."variantId" = v.id
      WHERE p."organizationId" = $1
        AND p."productLine" IN ('1', '2')
        AND pil.quantity > 0
      ORDER BY p.sku, v.id
      LIMIT 20
    `, [orgId]);

    for (const r of traceRes.rows) {
      // Get attributes for this variant
      const attrRes = await pool.query(
        `SELECT key, value FROM "ProductVariantAttribute" WHERE "variantId" = $1 ORDER BY key`,
        [r.vid],
      );
      const attrs = attrRes.rows.map((a: any) => `${a.key}="${a.value}"`).join(", ");

      console.log(`\n  Ref: ${r.psku} | Line: ${r.productLine}`);
      console.log(`  Prod name: ${r.pname}`);
      console.log(`  Variant SKU: ${r.vsku}`);
      console.log(`  Variant name: ${r.vname}`);
      console.log(`  Attributes: ${attrs || "(none)"}`);
      console.log(`  PIL qty: ${r.quantity} @ warehouse ${r.warehouseId}`);

      // Parse variant SKU for embedded talla/color
      if (r.vsku) {
        const parts = r.vsku.split("-");
        if (parts.length >= 3) {
          console.log(`  SKU parse: prefix=${parts[0]} | code=${parts[1]} | seg3=${parts[2]}${parts[3] ? ` | seg4=${parts[3]}` : ""}${parts[4] ? ` | seg5=${parts[4]}` : ""}`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 7+8 — Detect real source of talla and color
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 7+8: FUENTE REAL DE TALLA Y COLOR");
    console.log("═".repeat(60));

    for (const line of ["1", "2"]) {
      console.log(`\n── productLine = ${line} ──`);

      // A) Attribute coverage (real values)
      const attrCov = await pool.query(`
        SELECT
          count(DISTINCT v.id) AS total,
          count(DISTINCT v.id) FILTER (
            WHERE EXISTS (SELECT 1 FROM "ProductVariantAttribute" a WHERE a."variantId" = v.id AND a.key = 'talla' AND trim(a.value) != '' AND a.value NOT IN ('GEN', 'GENERICO', 'GENERICA', 'gen', 'generico'))
          ) AS attr_talla,
          count(DISTINCT v.id) FILTER (
            WHERE EXISTS (SELECT 1 FROM "ProductVariantAttribute" a WHERE a."variantId" = v.id AND a.key = 'color' AND trim(a.value) != '' AND a.value NOT IN ('GEN', 'GENERICO', 'GENERICA', 'gen', 'generico'))
          ) AS attr_color
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const ac = attrCov.rows[0];

      // B) Variant name coverage (non-empty)
      const nameCov = await pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE v.name IS NOT NULL AND trim(v.name) != '') AS with_name
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const nc = nameCov.rows[0];

      // C) Variant SKU with 3+ segments
      const skuCov = await pool.query(`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE v.sku IS NOT NULL AND v.sku LIKE '%-%-%') AS sku_3seg
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const sc = skuCov.rows[0];

      console.log(`\nFuente talla (line ${line}):`);
      console.log(`  A) ProductVariantAttribute (real): ${ac.attr_talla}/${ac.total} (${Math.round(ac.attr_talla/ac.total*100)}%)`);
      console.log(`  B) ProductVariant.name: ${nc.with_name}/${nc.total} (${Math.round(nc.with_name/nc.total*100)}%)`);
      console.log(`  C) ProductVariant.sku (3+ seg): ${sc.sku_3seg}/${sc.total} (${Math.round(sc.sku_3seg/sc.total*100)}%)`);

      console.log(`\nFuente color (line ${line}):`);
      console.log(`  A) ProductVariantAttribute (real): ${ac.attr_color}/${ac.total} (${Math.round(ac.attr_color/ac.total*100)}%)`);
      console.log(`  B) ProductVariant.name: same as talla — ${nc.with_name}/${nc.total}`);
      console.log(`  C) ProductVariant.sku (3+ seg): same as talla — ${sc.sku_3seg}/${sc.total}`);
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 9 — How does the Tiendas adapter extract talla/color?
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 9: ADAPTER EXTRACTION METHOD");
    console.log("═".repeat(60));
    console.log("\nThe Tiendas adapter (sag-store-adapter.ts) extracts talla/color from:");
    console.log("  ProductVariantAttribute WHERE key IN ('talla', 'color')");
    console.log("\nIf these attributes are empty/missing, the adapter falls back to 'SIN_TALLA'/'SIN_COLOR'.");
    console.log("This is the ROOT CAUSE of 0% coverage in Line 1.");
    console.log("\nChecking adapter source code...");

    // Read the adapter to confirm
    const adapterContent = require("fs").readFileSync(
      path.resolve(__dirname, "../lib/comercial/tiendas/sag-store-adapter.ts"),
      "utf-8"
    );
    const usesAttrKey = adapterContent.includes('key: { in: ["talla", "color"]');
    const usesVariantSku = adapterContent.includes("v.sku") || adapterContent.includes("variant.sku");
    const usesVariantName = adapterContent.includes("v.name") || adapterContent.includes("variant.name");
    console.log(`  Uses ProductVariantAttribute: ${usesAttrKey ? "YES" : "NO"}`);
    console.log(`  Parses variant SKU for talla/color: ${usesVariantSku ? "MAYBE" : "NO"}`);
    console.log(`  Parses variant name for talla/color: ${usesVariantName ? "MAYBE" : "NO"}`);

    // ═══════════════════════════════════════════════════════════
    // FASE 10 — Coverage matrix
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("FASE 10: MATRIZ DE COBERTURA");
    console.log("═".repeat(60));

    console.log(`\n${"Campo".padEnd(35)} | ${"Line 1 Talla".padEnd(15)} | ${"Line 1 Color".padEnd(15)} | ${"Line 2 Talla".padEnd(15)} | ${"Line 2 Color".padEnd(15)}`);
    console.log("─".repeat(100));

    for (const line of ["1", "2"]) {
      const total = await pool.query(`
        SELECT count(*) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const t = parseInt(total.rows[0].cnt, 10);

      // Attr real talla
      const attrTalla = await pool.query(`
        SELECT count(DISTINCT v.id) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        JOIN "ProductVariantAttribute" a ON a."variantId" = v.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND a.key = 'talla' AND trim(a.value) != '' AND upper(a.value) NOT IN ('GEN', 'GENERICO', 'GENERICA')
      `, [orgId, line]);

      // Attr real color
      const attrColor = await pool.query(`
        SELECT count(DISTINCT v.id) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        JOIN "ProductVariantAttribute" a ON a."variantId" = v.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND a.key = 'color' AND trim(a.value) != '' AND upper(a.value) NOT IN ('GEN', 'GENERICO', 'GENERICA')
      `, [orgId, line]);

      // Variant name
      const vname = await pool.query(`
        SELECT count(*) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.name IS NOT NULL AND trim(v.name) != ''
      `, [orgId, line]);

      // Variant SKU 3+ segments
      const vsku = await pool.query(`
        SELECT count(*) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.sku IS NOT NULL AND v.sku LIKE '%-%-%'
      `, [orgId, line]);

      const at = parseInt(attrTalla.rows[0].cnt, 10);
      const ac = parseInt(attrColor.rows[0].cnt, 10);
      const vn = parseInt(vname.rows[0].cnt, 10);
      const vs = parseInt(vsku.rows[0].cnt, 10);

      if (line === "1") {
        // Print all rows for line 1
        console.log(`${"PVA (real, excl GEN)".padEnd(35)} | ${(at + "/" + t + " " + Math.round(at/t*100) + "%").padEnd(15)} | ${(ac + "/" + t + " " + Math.round(ac/t*100) + "%").padEnd(15)} | ...`);
        console.log(`${"ProductVariant.name".padEnd(35)} | ${(vn + "/" + t + " " + Math.round(vn/t*100) + "%").padEnd(15)} | ${"(embedded)".padEnd(15)} | ...`);
        console.log(`${"ProductVariant.sku (3+ seg)".padEnd(35)} | ${(vs + "/" + t + " " + Math.round(vs/t*100) + "%").padEnd(15)} | ${"(embedded)".padEnd(15)} | ...`);
      }
    }

    // Final matrix with both lines
    console.log("\nFull matrix (combined):");
    for (const line of ["1", "2"]) {
      const total = await pool.query(`
        SELECT count(*) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);
      const t = parseInt(total.rows[0].cnt, 10);

      const attrTalla = await pool.query(`
        SELECT count(DISTINCT v.id) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        JOIN "ProductVariantAttribute" a ON a."variantId" = v.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND a.key = 'talla' AND trim(a.value) != '' AND upper(a.value) NOT IN ('GEN', 'GENERICO', 'GENERICA')
      `, [orgId, line]);
      const attrColor = await pool.query(`
        SELECT count(DISTINCT v.id) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        JOIN "ProductVariantAttribute" a ON a."variantId" = v.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND a.key = 'color' AND trim(a.value) != '' AND upper(a.value) NOT IN ('GEN', 'GENERICO', 'GENERICA')
      `, [orgId, line]);
      const vname = await pool.query(`
        SELECT count(*) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.name IS NOT NULL AND trim(v.name) != ''
      `, [orgId, line]);
      const vsku3 = await pool.query(`
        SELECT count(*) AS cnt FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
          AND v.sku IS NOT NULL AND v.sku LIKE '%-%-%'
      `, [orgId, line]);

      const at = parseInt(attrTalla.rows[0].cnt, 10);
      const ac = parseInt(attrColor.rows[0].cnt, 10);
      const vn = parseInt(vname.rows[0].cnt, 10);
      const vs = parseInt(vsku3.rows[0].cnt, 10);

      console.log(`\n  Line ${line} (${t} variantes):`);
      console.log(`    PVA talla (real): ${at} (${Math.round(at/t*100)}%)`);
      console.log(`    PVA color (real): ${ac} (${Math.round(ac/t*100)}%)`);
      console.log(`    Variant.name:     ${vn} (${Math.round(vn/t*100)}%)`);
      console.log(`    Variant.sku 3+:   ${vs} (${Math.round(vs/t*100)}%)`);
    }

    console.log("\n=== AUDIT COMPLETE (READ-ONLY) ===");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
