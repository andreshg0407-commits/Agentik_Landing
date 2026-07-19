/**
 * _validate-multi-bodega.ts
 *
 * INVENTORY-COMMERCIAL-AVAILABILITY-MULTI-BODEGA-01 — FASE 7/8 Validation
 *
 * Validates that the multi-bodega fix (B01+B04) produces correct textile
 * commercial availability for 4 known references with admin-reported quantities.
 *
 * Also runs a global textile impact analysis (FASE 8).
 *
 * READ ONLY — no writes.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_validate-multi-bodega.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

// Admin-reported quantities for textile references
const TEXTILE_AUDIT_REFS: Array<{
  sku: string;
  adminQty: number;
  line: string;
}> = [
  { sku: "L-1367", adminQty: 64, line: "LT" },
  { sku: "L-8467", adminQty: 511, line: "LT" },
  { sku: "CJ-1126012", adminQty: 79, line: "CS" },
  { sku: "CJ-2026004B", adminQty: 164, line: "CS" },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  MULTI-BODEGA VALIDATION — INVENTORY-COMMERCIAL-AVAILABILITY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // ── FASE 7: Validate 4 textile references ──────────────────────────────────

  console.log(B("  FASE 7 — 4 Textile Reference Validation"));
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log("");

  let pass = 0;
  let fail = 0;

  for (const ref of TEXTILE_AUDIT_REFS) {
    // Query B01 only
    const b01Rows: Array<{ quantity: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("quantity")::float as quantity
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = '01'`,
      ORG, ref.sku,
    );

    // Query B04 only
    const b04Rows: Array<{ quantity: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("quantity")::float as quantity
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = '04'`,
      ORG, ref.sku,
    );

    // Query B01+B04 combined (what the new resync does)
    const combinedRows: Array<{ quantity: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("quantity")::float as quantity
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`,
      ORG, ref.sku, ["01", "04"],
    );

    const b01 = Math.round(b01Rows[0]?.quantity ?? 0);
    const b04 = Math.round(b04Rows[0]?.quantity ?? 0);
    const combined = Math.round(combinedRows[0]?.quantity ?? 0);

    // Tolerance: within 15% of admin-reported value (operational variance)
    const tolerance = Math.max(5, Math.round(ref.adminQty * 0.15));
    const diff = Math.abs(combined - ref.adminQty);
    const withinTolerance = diff <= tolerance;

    const status = withinTolerance ? G("PASS") : R("FAIL");
    if (withinTolerance) pass++;
    else fail++;

    console.log(`  ${ref.sku.padEnd(14)} [${status}]`);
    console.log(`    B01:          ${String(b01).padStart(8)}`);
    console.log(`    B04:          ${String(b04).padStart(8)}`);
    console.log(`    B01+B04:      ${B(String(combined).padStart(8))}`);
    console.log(`    Admin:        ${String(ref.adminQty).padStart(8)}`);
    console.log(`    Diff:         ${String(diff).padStart(8)}  (tolerance: +/-${tolerance})`);
    console.log(`    OLD (B01):    ${b01 <= 0 ? R("sin_stock") : Y(String(b01))}`);
    console.log(`    NEW (B01+04): ${combined <= 0 ? R("sin_stock") : G(String(combined))}`);
    console.log("");
  }

  console.log(`  Result: ${G(String(pass))} passed, ${fail > 0 ? R(String(fail)) : G("0")} failed`);
  console.log("");

  // ── FASE 8: Global textile impact analysis ─────────────────────────────────

  console.log(B("  FASE 8 — Global Textile Impact Analysis"));
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log("");

  // Count products with B01 <= 0 (old model: sin_stock)
  const oldSinStock: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT pe.sku)::int as count
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1
       AND pil."externalRef" = '01'
       AND pe."productLine" IN ('1', '2')
     GROUP BY pe.sku
     HAVING SUM("quantity") <= 0`,
    ORG,
  );

  // Count products with B01+B04 <= 0 (new model: sin_stock)
  const newSinStock: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM (
       SELECT pe.sku
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pil."externalRef" = ANY($2::text[])
         AND pe."productLine" IN ('1', '2')
       GROUP BY pe.sku
       HAVING SUM("quantity") <= 0
     ) sub`,
    ORG, ["01", "04"],
  );

  // Total textile products
  const totalTextile: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT pe.sku)::int as count
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1
       AND pil."externalRef" = '01'
       AND pe."productLine" IN ('1', '2')`,
    ORG,
  );

  const oldCount = oldSinStock.length; // each row = 1 SKU with <=0
  const newCount = newSinStock[0]?.count ?? 0;
  const total = totalTextile[0]?.count ?? 0;
  const recovered = oldCount - newCount;

  console.log(`  Total textile SKUs (in B01):         ${B(String(total))}`);
  console.log(`  OLD sin_stock (B01 only):            ${R(String(oldCount))} (${(oldCount / total * 100).toFixed(1)}%)`);
  console.log(`  NEW sin_stock (B01+B04):             ${newCount > 0 ? Y(String(newCount)) : G("0")} (${(newCount / total * 100).toFixed(1)}%)`);
  console.log(`  RECOVERED references:                ${G(String(recovered))}`);
  console.log(`  Recovery rate:                       ${G((recovered / Math.max(1, oldCount) * 100).toFixed(1) + "%")}`);
  console.log("");

  // Summary
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  VALIDATION SUMMARY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  FASE 7 (4-ref audit):       ${fail === 0 ? G("ALL PASS") : R(`${fail} FAIL`)}`);
  console.log(`  FASE 8 (global impact):     ${recovered > 0 ? G(`${recovered} refs recovered`) : Y("no change")}`);
  console.log(`  Multi-bodega model:         B01 (dispatch) + B04 (production/support)`);
  console.log(`  Topology config:            lib/inventory/inventory-warehouse-topology.ts`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
