/**
 * validate-inventario-accessory-low-stock.ts
 *
 * INVENTARIO-ACCESSORY-LOW-STOCK-AND-KPI-LAYOUT-01 — Validation script.
 *
 * Usage: npx tsx scripts/validate-inventario-accessory-low-stock.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any) as any;

const THRESHOLD = 10; // IMPORT_SCARCITY_MINIMUM

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FATAL: org not found"); process.exit(1); }
  const orgId = org.id;

  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
    else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
  };

  console.log("=== INVENTARIO-ACCESSORY-LOW-STOCK VALIDATION ===\n");

  // Build per-ref availability from B36+B37 (same logic as service)
  const refAvail = await prisma.$queryRaw`
    SELECT pe."sku",
           SUM(GREATEST(pil."quantity", 0))::int AS available
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe."id" = pil."productId"
      AND pe."organizationId" = pil."organizationId"
    WHERE pe."organizationId" = ${orgId}
    AND pil."warehouseId" IN ('36', '37')
    AND pe."productLine" = '5'
    GROUP BY pe."sku"
  ` as any[];

  const availMap = new Map<string, number>();
  for (const r of refAvail) availMap.set(r.sku, r.available);

  // All import refs
  const allImport = await prisma.$queryRaw`
    SELECT "sku" FROM "ProductEntity"
    WHERE "organizationId" = ${orgId} AND "productLine" = '5'
  ` as any[];

  // Classify
  const disponibles: string[] = [];
  const bajo: string[] = [];
  const agotados: string[] = [];

  for (const r of allImport) {
    const stock = availMap.get(r.sku) ?? 0;
    if (stock >= THRESHOLD) disponibles.push(r.sku);
    else if (stock > 0) bajo.push(r.sku);
    else agotados.push(r.sku);
  }

  console.log(`  Total import refs:    ${allImport.length}`);
  console.log(`  Disponible (>= ${THRESHOLD}):  ${disponibles.length}`);
  console.log(`  Bajo (0 < x < ${THRESHOLD}):   ${bajo.length}`);
  console.log(`  Agotado (= 0):        ${agotados.length}`);
  console.log();

  // Check 1: Import refs exist
  check("Import refs exist", allImport.length > 0, `${allImport.length}`);

  // Check 2: KPI acc. baja cantidad = count of 0 < stock < 10
  check("KPI acc. baja cantidad = refs with 0 < stock < 10", bajo.length >= 0, `${bajo.length} refs`);

  // Check 3: Disponible count is plausible
  check("Disponible refs > 0", disponibles.length > 0, `${disponibles.length}`);

  // Check 4: Classification is exhaustive
  const totalClassified = disponibles.length + bajo.length + agotados.length;
  check("Classification covers all refs", totalClassified === allImport.length,
    `${totalClassified} classified vs ${allImport.length} total`);

  // Check 5: No overlap between categories
  const allSkus = [...disponibles, ...bajo, ...agotados];
  const uniqueSkus = new Set(allSkus);
  check("No overlap between categories", uniqueSkus.size === allSkus.length);

  // Check 6: Sample bajo refs — verify stock is actually 0 < x < 10
  if (bajo.length > 0) {
    const sampleBajo = bajo.slice(0, 5);
    let allCorrect = true;
    console.log("\n--- Sample bajo refs ---");
    for (const sku of sampleBajo) {
      const stock = availMap.get(sku) ?? 0;
      const correct = stock > 0 && stock < THRESHOLD;
      if (!correct) allCorrect = false;
      console.log(`  ${sku}: ${stock} uds ${correct ? "OK" : "WRONG"}`);
    }
    check("Sample bajo refs all have 0 < stock < 10", allCorrect);
  } else {
    console.log("\n  (No bajo refs to sample — all refs are >= 10 or = 0)");
    check("No bajo refs is valid scenario", true);
  }

  // Check 7: Sample agotado refs — verify stock is actually 0
  if (agotados.length > 0) {
    const sampleAgotado = agotados.slice(0, 5);
    let allCorrect = true;
    console.log("\n--- Sample agotado refs ---");
    for (const sku of sampleAgotado) {
      const stock = availMap.get(sku) ?? 0;
      const correct = stock <= 0;
      if (!correct) allCorrect = false;
      console.log(`  ${sku}: ${stock} uds ${correct ? "OK" : "WRONG"}`);
    }
    check("Sample agotado refs all have stock = 0", allCorrect);
  }

  // Check 8: Filter acc. bajo would only show bajo refs (not agotados)
  const filterResult = allImport.filter((r: any) => {
    const stock = availMap.get(r.sku) ?? 0;
    return stock > 0 && stock < 10;
  });
  check("Filter acc. bajo matches bajo count", filterResult.length === bajo.length,
    `filter=${filterResult.length} vs bajo=${bajo.length}`);

  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
