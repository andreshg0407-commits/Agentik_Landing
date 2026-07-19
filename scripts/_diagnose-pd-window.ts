/**
 * _diagnose-pd-window.ts
 *
 * Find the optimal date window for PD pending orders
 * that best approximates admin-reported values.
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

const AUDIT_REFS = [
  { sku: "L-1367", adminQty: 64 },
  { sku: "L-8467", adminQty: 511 },
  { sku: "CJ-1126012", adminQty: 79 },
  { sku: "CJ-2026004B", adminQty: 164 },
];

// Windows to test (in days)
const WINDOWS = [7, 14, 30, 45, 60, 90];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  PD WINDOW ANALYSIS — Finding optimal recency filter"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Get gross B01+B04 for each ref
  const grossMap = new Map<string, number>();
  for (const ref of AUDIT_REFS) {
    const rows: Array<{ quantity: number }> = await db.$queryRawUnsafe(
      `SELECT SUM("quantity")::float as quantity
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`,
      ORG, ref.sku, ["01", "04"],
    );
    grossMap.set(ref.sku, Math.round(rows[0]?.quantity ?? 0));
  }

  // Header
  console.log(`  ${"SKU".padEnd(14)} ${"GROSS".padStart(6)} ${"ADMIN".padStart(6)} | ${WINDOWS.map(w => `${w}d`.padStart(6)).join(" ")} | ${"BEST".padStart(6)}`);
  console.log(`  ${"─".repeat(14)} ${"─".repeat(6)} ${"─".repeat(6)} | ${WINDOWS.map(() => "─".repeat(6)).join(" ")} | ${"─".repeat(6)}`);

  for (const ref of AUDIT_REFS) {
    const gross = grossMap.get(ref.sku)!;
    let bestWindow = 0;
    let bestGap = Infinity;
    const windowResults: number[] = [];

    for (const days of WINDOWS) {
      const rows: Array<{ pending: number }> = await db.$queryRawUnsafe(
        `SELECT COALESCE(SUM(col."quantity"), 0)::float as pending
         FROM "CustomerOrderLine" col
         JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
         WHERE col."organizationId" = $1
           AND col."referenceCode" = $2
           AND cor.status = 'PENDIENTE'
           AND cor."orderDate" >= NOW() - ($3 || ' days')::interval`,
        ORG, ref.sku, String(days),
      );
      const pending = Math.round(rows[0]?.pending ?? 0);
      const disponible = gross - pending;
      const gap = Math.abs(disponible - ref.adminQty);
      windowResults.push(disponible);

      if (gap < bestGap) {
        bestGap = gap;
        bestWindow = days;
      }
    }

    console.log(
      `  ${ref.sku.padEnd(14)} ${String(gross).padStart(6)} ${String(ref.adminQty).padStart(6)} | ${windowResults.map(d => String(d).padStart(6)).join(" ")} | ${String(bestWindow).padStart(4)}d`,
    );
  }

  console.log("");

  // Also test: no PD filter at all (just gross)
  console.log(B("  Legend: values show disponible = gross - PD(window)"));
  console.log(`  BEST = window whose disponible is closest to admin`);
  console.log("");

  // Global impact per window
  console.log(B("  Global impact per window:"));
  for (const days of WINDOWS) {
    const rows: Array<{ refs: number; total_qty: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT col."referenceCode")::int as refs,
              COALESCE(SUM(col."quantity"), 0)::float as total_qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND cor.status = 'PENDIENTE'
         AND cor."orderDate" >= NOW() - ($2 || ' days')::interval`,
      ORG, String(days),
    );
    console.log(`    ${String(days).padStart(3)}d:  ${String(rows[0]?.refs ?? 0).padStart(5)} refs, ${String(Math.round(rows[0]?.total_qty ?? 0)).padStart(8)} units pending`);
  }
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
