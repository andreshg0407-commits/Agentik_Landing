/**
 * scripts/audit-tiendas-line-mapping.ts
 *
 * READ-ONLY audit: productLine mapping validation for Castillitos.
 * Sprint: TIENDAS-LINE-MAPPING-AUDIT-01
 *
 * Usage: npx tsx scripts/audit-tiendas-line-mapping.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ORG_SLUG = "castillitos";
const BATCH = 200;

async function batchCount(
  prisma: PrismaClient,
  model: string,
  productIds: string[],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    total += await (prisma as any)[model].count({
      where: { productId: { in: batch } },
    });
  }
  return total;
}

async function batchTallaColor(
  pool: Pool,
  productIds: string[],
): Promise<{ total: number; withTalla: number; withColor: number }> {
  if (productIds.length === 0) return { total: 0, withTalla: 0, withColor: 0 };

  // Use raw SQL — PrismaPg doesn't support nested select on relations
  const totalRes = await pool.query(
    `SELECT count(*) AS cnt FROM "ProductVariant" WHERE "productId" = ANY($1)`,
    [productIds],
  );
  const total = parseInt(totalRes.rows[0].cnt, 10);

  const tallaRes = await pool.query(
    `SELECT count(DISTINCT v.id) AS cnt
     FROM "ProductVariant" v
     JOIN "ProductVariantAttribute" a ON a."variantId" = v.id
     WHERE v."productId" = ANY($1) AND a.key = 'talla' AND trim(a.value) != ''`,
    [productIds],
  );
  const withTalla = parseInt(tallaRes.rows[0].cnt, 10);

  const colorRes = await pool.query(
    `SELECT count(DISTINCT v.id) AS cnt
     FROM "ProductVariant" v
     JOIN "ProductVariantAttribute" a ON a."variantId" = v.id
     WHERE v."productId" = ANY($1) AND a.key = 'color' AND trim(a.value) != ''`,
    [productIds],
  );
  const withColor = parseInt(colorRes.rows[0].cnt, 10);

  return { total, withTalla, withColor };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
    if (!org) { console.error("Org not found"); return; }
    const orgId = org.id;

    console.log("=== TIENDAS-LINE-MAPPING-AUDIT-01 ===");
    console.log(`Org: ${ORG_SLUG} (${orgId})\n`);

    const products = await prisma.productEntity.findMany({
      where: { organizationId: orgId },
      select: { id: true, sku: true, name: true, productLine: true, subgrupoSag: true },
    });

    console.log(`Total ProductEntity: ${products.length}\n`);

    // Group by productLine
    const lineGroups = new Map<string, typeof products>();
    for (const p of products) {
      const key = p.productLine ?? "NULL";
      if (!lineGroups.has(key)) lineGroups.set(key, []);
      lineGroups.get(key)!.push(p);
    }

    const sortedKeys = [...lineGroups.keys()].sort((a, b) => {
      if (a === "NULL") return 1;
      if (b === "NULL") return -1;
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    // Collect matrix data
    const matrixRows: Array<{
      key: string; prods: number; vars: number; pil: number;
      sgs: number; pctTalla: number; pctColor: number;
    }> = [];

    for (const key of sortedKeys) {
      const group = lineGroups.get(key)!;
      const productIds = group.map(p => p.id);

      console.log("─".repeat(60));
      console.log(`productLine = ${key}`);
      console.log(`productos = ${group.length}`);

      const variantCount = await batchCount(prisma, "productVariant", productIds);
      console.log(`variantes = ${variantCount}`);

      const pilCount = await batchCount(prisma, "productInventoryLevel", productIds);
      console.log(`registros inventario (PIL) = ${pilCount}`);

      // Top subgrupoSag
      const subgrupoFreq = new Map<string, number>();
      for (const p of group) {
        const sg = p.subgrupoSag?.trim() || "(null)";
        subgrupoFreq.set(sg, (subgrupoFreq.get(sg) ?? 0) + 1);
      }
      const topSubgrupos = [...subgrupoFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      console.log(`\nsubgrupoSag (top ${topSubgrupos.length}):`);
      for (const [sg, cnt] of topSubgrupos) {
        console.log(`  ${cnt.toString().padStart(5)} | ${sg}`);
      }

      // Top names (more useful than individual refs)
      const nameFreq = new Map<string, number>();
      for (const p of group) {
        const nm = p.name?.trim() || "(null)";
        nameFreq.set(nm, (nameFreq.get(nm) ?? 0) + 1);
      }
      const topNames = [...nameFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);
      console.log(`\nnombres (top ${topNames.length}):`);
      for (const [nm, cnt] of topNames) {
        console.log(`  ${cnt.toString().padStart(5)} | ${nm}`);
      }

      // Reference prefix analysis
      const prefixFreq = new Map<string, number>();
      for (const p of group) {
        const sku = (p.sku || "").trim().toUpperCase();
        const match = sku.match(/^([A-Z]{1,5}[-_]?)/);
        if (match) {
          prefixFreq.set(match[1], (prefixFreq.get(match[1]) ?? 0) + 1);
        }
      }
      const topPrefixes = [...prefixFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      if (topPrefixes.length > 0) {
        console.log(`\nprefijos referencia (top ${topPrefixes.length}):`);
        for (const [pf, cnt] of topPrefixes) {
          console.log(`  ${cnt.toString().padStart(5)} | ${pf}`);
        }
      }

      // Talla/color coverage (raw SQL)
      const tc = await batchTallaColor(pool, productIds);
      const pctTalla = tc.total ? Math.round(tc.withTalla / tc.total * 100) : 0;
      const pctColor = tc.total ? Math.round(tc.withColor / tc.total * 100) : 0;
      console.log(`\ntalla/color coverage:`);
      console.log(`  variantes con talla: ${tc.withTalla}/${tc.total} (${pctTalla}%)`);
      console.log(`  variantes con color: ${tc.withColor}/${tc.total} (${pctColor}%)`);

      const sgs = new Set(group.map(p => p.subgrupoSag).filter(Boolean)).size;
      matrixRows.push({ key, prods: group.length, vars: variantCount, pil: pilCount, sgs, pctTalla, pctColor });

      console.log();
    }

    // Summary matrix
    console.log("═".repeat(80));
    console.log("MATRIZ RESUMEN");
    console.log("═".repeat(80));
    console.log(
      `${"productLine".padEnd(14)} | ${"productos".padEnd(10)} | ${"variantes".padEnd(10)} | ${"PIL".padEnd(8)} | ${"subgrupos".padEnd(10)} | ${"% talla".padEnd(8)} | ${"% color".padEnd(8)}`
    );
    console.log("─".repeat(80));
    for (const r of matrixRows) {
      console.log(
        `${r.key.padEnd(14)} | ${r.prods.toString().padEnd(10)} | ${r.vars.toString().padEnd(10)} | ${r.pil.toString().padEnd(8)} | ${r.sgs.toString().padEnd(10)} | ${(r.pctTalla + "%").padEnd(8)} | ${(r.pctColor + "%").padEnd(8)}`
      );
    }

    console.log("\n=== AUDIT COMPLETE (READ-ONLY) ===");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
