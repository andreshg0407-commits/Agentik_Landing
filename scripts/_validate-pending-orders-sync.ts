/**
 * _validate-pending-orders-sync.ts
 *
 * INVENTORY-PENDING-ORDERS-SYNC-01 — Validation script.
 *
 * Validates that CustomerOrderLine data exists and produces correct
 * pending deductions per reference. Compares 4 audit references
 * against admin-reported values.
 *
 * READ ONLY — no writes.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_validate-pending-orders-sync.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

// Admin-reported quantities for textile references (same as multi-bodega validation)
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
  console.log(B("  PENDING ORDERS SYNC VALIDATION — INVENTORY-PENDING-ORDERS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // ── FASE A: CustomerOrderLine data check ────────────────────────────────────

  console.log(B("  FASE A — CustomerOrderLine Data Check"));
  console.log("  ─────────────────────────────────────────────────────────────");

  const lineCount: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "CustomerOrderLine" WHERE "organizationId" = $1`,
    ORG,
  );
  console.log(`  Total CustomerOrderLine rows: ${B(String(lineCount[0]?.count ?? 0))}`);

  const orderCount: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "CustomerOrderRecord" WHERE "organizationId" = $1 AND status = 'PENDIENTE'`,
    ORG,
  );
  console.log(`  PENDIENTE CustomerOrderRecords: ${B(String(orderCount[0]?.count ?? 0))}`);

  const ordersWithLines: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT col."orderId")::int as count
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'`,
    ORG,
  );
  console.log(`  PENDIENTE orders WITH lines: ${B(String(ordersWithLines[0]?.count ?? 0))}`);

  const distinctRefs: Array<{ count: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT col."referenceCode")::int as count
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'`,
    ORG,
  );
  console.log(`  Distinct references with pending qty: ${B(String(distinctRefs[0]?.count ?? 0))}`);
  console.log("");

  // ── FASE B: Per-reference pending qty check ─────────────────────────────────

  console.log(B("  FASE B — 4 Textile Reference Validation (with PD deduction)"));
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log("");

  let pass = 0;
  let fail = 0;

  for (const ref of TEXTILE_AUDIT_REFS) {
    // B01+B04 gross inventory
    const grossRows: Array<{ quantity: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("quantity")::float as quantity
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`,
      ORG, ref.sku, ["01", "04"],
    );
    const gross = Math.round(grossRows[0]?.quantity ?? 0);

    // Pending PD qty from CustomerOrderLine
    const pendingRows: Array<{ pending: number }> = await db.$queryRawUnsafe(
      `SELECT SUM(col."quantity")::float as pending
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG, ref.sku,
    );
    const pending = Math.round(pendingRows[0]?.pending ?? 0);

    const disponible = gross - pending;

    // Tolerance: within 20% of admin-reported value
    const tolerance = Math.max(10, Math.round(ref.adminQty * 0.20));
    const diff = Math.abs(disponible - ref.adminQty);
    const withinTolerance = diff <= tolerance;

    const status = withinTolerance ? G("PASS") : Y("NEAR");
    if (withinTolerance) pass++;
    else fail++;

    console.log(`  ${ref.sku.padEnd(14)} [${status}]`);
    console.log(`    B01+B04 gross:  ${String(gross).padStart(8)}`);
    console.log(`    PD pending:     ${String(pending).padStart(8)}`);
    console.log(`    Disponible:     ${B(String(disponible).padStart(8))}`);
    console.log(`    Admin:          ${String(ref.adminQty).padStart(8)}`);
    console.log(`    Gap:            ${String(diff).padStart(8)}  (tolerance: +/-${tolerance})`);
    console.log("");
  }

  console.log(`  Result: ${G(String(pass))} within tolerance, ${fail > 0 ? Y(String(fail)) : G("0")} outside tolerance`);
  console.log("");

  // ── FASE C: Global pending orders impact ────────────────────────────────────

  console.log(B("  FASE C — Global Pending Orders Impact"));
  console.log("  ─────────────────────────────────────────────────────────────");

  const totalPending: Array<{ total: number; refs: number }> = await db.$queryRawUnsafe(
    `SELECT SUM(col."quantity")::float as total,
            COUNT(DISTINCT col."referenceCode")::int as refs
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'`,
    ORG,
  );
  console.log(`  Total pending units: ${B(String(Math.round(totalPending[0]?.total ?? 0)))}`);
  console.log(`  Distinct references: ${B(String(totalPending[0]?.refs ?? 0))}`);

  // Top 10 references by pending qty
  const topPending: Array<{ ref: string; qty: number }> = await db.$queryRawUnsafe(
    `SELECT col."referenceCode" as ref, SUM(col."quantity")::float as qty
     FROM "CustomerOrderLine" col
     JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
     WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'
     GROUP BY col."referenceCode"
     ORDER BY qty DESC
     LIMIT 10`,
    ORG,
  );
  if (topPending.length > 0) {
    console.log("");
    console.log(`  Top 10 references by pending qty:`);
    for (const r of topPending) {
      console.log(`    ${r.ref.padEnd(16)} ${String(Math.round(r.qty)).padStart(8)} units`);
    }
  }
  console.log("");

  // Summary
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  VALIDATION SUMMARY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  const hasLines = (lineCount[0]?.count ?? 0) > 0;
  console.log(`  CustomerOrderLine populated: ${hasLines ? G("YES") : R("NO — run sync first")}`);
  console.log(`  4-ref audit:                ${pass === 4 ? G("ALL PASS") : Y(`${pass}/4 within tolerance`)}`);
  console.log(`  Formula:                    disponible = B01+B04 - PD pending`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
