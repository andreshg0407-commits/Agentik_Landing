/**
 * _resync-diagnostic.ts
 *
 * CASTILLITOS-SAG-FULL-RESYNC-01 — Phase 2 diagnostic.
 * Examines ProductInventoryLevel structure, bodegas, and product lines.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_resync-diagnostic.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  // 1. Sample ProductInventoryLevel
  const sample = await db.productInventoryLevel.findMany({
    where: { organizationId: ORG, quantity: { gt: 0 } },
    take: 5,
    include: { product: { select: { id: true, sku: true, name: true, productLine: true, category: true } } },
  });
  console.log("=== ProductInventoryLevel sample (5 rows) ===");
  for (const r of sample) {
    console.log(JSON.stringify({
      productId: r.productId,
      sku: r.product?.sku,
      name: r.product?.name?.slice(0, 40),
      line: r.product?.productLine,
      category: r.product?.category,
      externalRef: r.externalRef,
      quantity: r.quantity,
    }));
  }

  // 2. Distinct bodegas
  const bodegas: any[] = await db.$queryRawUnsafe(
    `SELECT "externalRef", COUNT(*)::int as cnt, SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "quantity" > 0
     GROUP BY "externalRef"
     ORDER BY cnt DESC`,
    ORG,
  );
  console.log("\n=== Distinct bodegas (externalRef) ===");
  for (const b of bodegas) {
    console.log(`  Bodega ${(b.externalRef ?? "NULL").padEnd(4)}: ${String(b.cnt).padStart(6)} variants, qty: ${Math.round(b.total_qty)}`);
  }

  // 3. Distinct product lines
  const lines: any[] = await db.$queryRawUnsafe(
    `SELECT "productLine", COUNT(DISTINCT "id")::int as cnt
     FROM "ProductEntity"
     WHERE "organizationId" = $1
     GROUP BY "productLine"
     ORDER BY cnt DESC`,
    ORG,
  );
  console.log("\n=== Product Lines ===");
  for (const l of lines) {
    console.log(`  ${(l.productLine ?? "NULL").padEnd(20)}: ${l.cnt} products`);
  }

  // 4. Bodega 01 aggregate by line
  const bod01: any[] = await db.$queryRawUnsafe(
    `SELECT pe."productLine" as line, COUNT(DISTINCT pil."productId")::int as products, SUM(pil."quantity")::float as total_qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe."id" = pil."productId"
     WHERE pil."organizationId" = $1 AND pil."externalRef" = '01' AND pil."quantity" > 0
     GROUP BY pe."productLine"
     ORDER BY total_qty DESC`,
    ORG,
  );
  console.log("\n=== Bodega 01 by Product Line ===");
  for (const r of bod01) {
    console.log(`  ${(r.line ?? "NULL").padEnd(20)}: ${String(r.products).padStart(4)} products, qty: ${Math.round(r.total_qty)}`);
  }

  // 5. Check ProductionOrder status distribution
  const prodStatus: any[] = await db.$queryRawUnsafe(
    `SELECT "status", "isClosed", COUNT(*)::int as cnt
     FROM "ProductionOrder"
     WHERE "organizationId" = $1
     GROUP BY "status", "isClosed"
     ORDER BY cnt DESC`,
    ORG,
  );
  console.log("\n=== ProductionOrder status ===");
  for (const r of prodStatus) {
    console.log(`  ${(r.status ?? "NULL").padEnd(10)} closed=${r.isClosed}: ${r.cnt}`);
  }

  // 6. Open production orders sample
  const openOps = await db.productionOrder.findMany({
    where: { organizationId: ORG, isClosed: false },
    include: { lines: { take: 3, select: { referenceCode: true, productName: true, quantityOrdered: true } } },
    orderBy: { documentDate: "desc" },
    take: 5,
  });
  console.log("\n=== Open OP sample (5) ===");
  for (const op of openOps) {
    console.log(`  OP #${op.documentNumber} | ${op.documentDate.toISOString().split("T")[0]} | ${op.warehouseCode ?? "—"} | ${op.lines.length} lines`);
    for (const l of op.lines) {
      console.log(`    → ${l.referenceCode.padEnd(12)} ${(l.productName ?? "").slice(0, 30)} qty: ${l.quantityOrdered}`);
    }
  }

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
