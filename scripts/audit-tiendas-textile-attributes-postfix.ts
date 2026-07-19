/**
 * scripts/audit-tiendas-textile-attributes-postfix.ts
 *
 * Post-fix audit: verify resolveVariantSizeColor produces real talla/color
 * for textile products (productLine 1 and 2).
 *
 * Sprint: TIENDAS-TEXTILE-ATTRIBUTES-FIX-01
 *
 * Usage: npx tsx scripts/audit-tiendas-textile-attributes-postfix.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { resolveVariantSizeColor, type VariantAttributeSource } from "../lib/comercial/tiendas/variant-attribute-resolver";

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

    console.log("=== TIENDAS-TEXTILE-ATTRIBUTES-POSTFIX AUDIT ===");
    console.log(`Org: ${ORG_SLUG} (${orgId})\n`);

    for (const line of ["1", "2"]) {
      console.log("═".repeat(60));
      console.log(`productLine = ${line}`);
      console.log("═".repeat(60));

      // Single query: get all variants with JSON attributes, name, sku
      const res = await pool.query(`
        SELECT v.sku, v.name, v.attributes
        FROM "ProductVariant" v
        JOIN "ProductEntity" p ON v."productId" = p.id
        WHERE p."organizationId" = $1 AND p."productLine" = $2
      `, [orgId, line]);

      let totalVariants = 0;
      let withRealSize = 0;
      let withRealColor = 0;
      const sourceCount: Record<VariantAttributeSource, number> = {
        json_attributes: 0,
        variant_name: 0,
        variant_sku: 0,
        relational_attributes: 0,
        fallback: 0,
      };
      const examples: Array<{ sku: string; name: string; size: string; color: string; source: string }> = [];

      for (const row of res.rows) {
        totalVariants++;

        // No relational attributes passed — tests JSON/name/sku sources
        const resolved = resolveVariantSizeColor({
          attributes: row.attributes,
          name: row.name,
          sku: row.sku,
          variantAttributes: [],
        });

        if (resolved.size !== "SIN_TALLA") withRealSize++;
        if (resolved.color !== "SIN_COLOR") withRealColor++;
        sourceCount[resolved.source]++;

        if (examples.filter(e => e.source === resolved.source).length < 3) {
          examples.push({
            sku: row.sku ?? "(null)",
            name: row.name ?? "(null)",
            size: resolved.size,
            color: resolved.color,
            source: resolved.source,
          });
        }
      }

      console.log(`\nTotal variantes: ${totalVariants}`);
      console.log(`Con talla real (!= SIN_TALLA): ${withRealSize} (${Math.round(withRealSize/totalVariants*100)}%)`);
      console.log(`Con color real (!= SIN_COLOR): ${withRealColor} (${Math.round(withRealColor/totalVariants*100)}%)`);

      console.log(`\nDistribucion por fuente:`);
      for (const [source, count] of Object.entries(sourceCount)) {
        if (count > 0) {
          console.log(`  ${source.padEnd(25)} ${count.toString().padStart(7)} (${Math.round(count/totalVariants*100)}%)`);
        }
      }

      console.log(`\nEjemplos reales:`);
      for (const ex of examples) {
        console.log(`  [${ex.source}] sku=${ex.sku} | name=${ex.name} → size=${ex.size}, color=${ex.color}`);
      }
      console.log();
    }

    console.log("=== POST-FIX AUDIT COMPLETE ===");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
