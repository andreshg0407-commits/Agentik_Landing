/**
 * scripts/_audit-tiendas-raw-mapping.ts
 *
 * Deep dive into SaleRecord.rawJson to find SAG warehouse codes.
 * Also check SAG variants source data.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org"); return; }
  const orgId = org.id;

  // 1. Check what's inside rawJson.raw for each store
  console.log("--- 1. SaleRecord rawJson.raw structure per store ---");
  const stores = ["sag", "almacen-a", "almacen-c", "almacen-d", "almacen-g", "tienda-web", "empresa", "empresa-f2", "pos"];
  for (const slug of stores) {
    const rec = await prisma.saleRecord.findFirst({
      where: { organizationId: orgId, storeSlug: slug },
      select: { rawJson: true, storeSlug: true, storeName: true },
      orderBy: { saleDate: "desc" },
    });
    if (!rec) { console.log(`  ${slug}: NO RECORD`); continue; }
    const rawJson = rec.rawJson as Record<string, unknown>;
    const raw = rawJson.raw as Record<string, unknown>;
    if (!raw || typeof raw !== "object") {
      console.log(`  ${slug} (${rec.storeName}): rawJson.raw is ${typeof raw}`);
      continue;
    }
    const keys = Object.keys(raw);
    // Find bodega/warehouse related keys
    const bodegaKeys = keys.filter(k =>
      k.toLowerCase().includes("bodega") ||
      k.toLowerCase().includes("ka_nl_bod") ||
      k.toLowerCase().includes("sucursal") ||
      k.toLowerCase().includes("tienda") ||
      k.toLowerCase().includes("almacen") ||
      k.toLowerCase().includes("punto_venta") ||
      k.toLowerCase().includes("store")
    );
    console.log(`\n  ${slug} (${rec.storeName}):`);
    console.log(`    rawJson.raw keys (${keys.length}): ${keys.join(", ")}`);
    if (bodegaKeys.length > 0) {
      for (const k of bodegaKeys) {
        console.log(`    ${k} = ${JSON.stringify(raw[k])}`);
      }
    }
    // Show ka_nl fields
    const nlKeys = keys.filter(k => k.startsWith("ka_nl"));
    if (nlKeys.length > 0) {
      for (const k of nlKeys) {
        console.log(`    ${k} = ${JSON.stringify(raw[k])}`);
      }
    }
  }

  // 2. Check SAG variants source — how do warehouse names appear
  console.log("\n\n--- 2. SAG Variant Types source ---");
  try {
    const variantSample = await (prisma as any).productVariant.findFirst({
      where: { organizationId: orgId, externalSource: "sag" },
      select: { id: true, name: true, sku: true, externalId: true, attributes: true },
    });
    if (variantSample) {
      console.log(`  Sample variant: ${JSON.stringify(variantSample, null, 2)}`);
    }
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 120)}`);
  }

  // 3. Check the SAG mapper to understand how storeSlug is derived
  console.log("\n--- 3. How storeSlug is derived from SAG data ---");
  // Check if there's a ka_nl_bodega or similar in the raw SAG data
  // by looking at one SaleRecord rawJson per store with ALL raw fields
  const saleRec = await prisma.saleRecord.findFirst({
    where: { organizationId: orgId, storeSlug: "almacen-a" },
    select: { rawJson: true },
    orderBy: { saleDate: "desc" },
  });
  if (saleRec) {
    const raw = (saleRec.rawJson as any)?.raw;
    if (raw) {
      console.log(`  almacen-a full raw: ${JSON.stringify(raw, null, 2).slice(0, 1500)}`);
    }
  }

  // 4. What SAG connector adapter does to create store slugs
  console.log("\n--- 4. SaleRecord storeSlug derivation ---");
  // Check if there's a pattern: some stores have different raw.code values
  for (const slug of stores.slice(0, 6)) {
    const recs = await prisma.saleRecord.findMany({
      where: { organizationId: orgId, storeSlug: slug },
      select: { rawJson: true },
      take: 3,
      orderBy: { saleDate: "desc" },
    });
    const codes = recs.map(r => (r.rawJson as any)?.code).filter(Boolean);
    const channels = recs.map(r => (r.rawJson as any)?.channel).filter(Boolean);
    console.log(`  ${slug}: codes=[${[...new Set(codes)].join(",")}] channels=[${[...new Set(channels)].join(",")}]`);
  }

  // 5. Check ProductVariantAttribute for talla/color patterns
  console.log("\n--- 5. ProductVariantAttribute sample ---");
  try {
    const attrs = await (prisma as any).productVariantAttribute.findMany({
      where: { organizationId: orgId },
      take: 10,
      select: { key: true, value: true, label: true, source: true },
    });
    console.table(attrs);
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 120)}`);
  }

  await pool.end();
  console.log("\n=== DONE ===");
}

main().catch(console.error);
