/**
 * _forensic-pd-comprobante.ts
 *
 * Check which comprobanteCode represents invoices and test product-level matching.
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const db = new PrismaClient({ adapter } as any) as any;

  // 1. sagDocumentFamily + sourceDocumentStage distribution
  console.log(B("\n  1. sagDocumentFamily distribution"));
  const families: Array<{ fam: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT "sagDocumentFamily" as fam, COUNT(*)::int as cnt
     FROM "SaleRecord" WHERE "organizationId" = $1
     GROUP BY "sagDocumentFamily" ORDER BY cnt DESC`, ORG);
  for (const f of families) {
    console.log(`    ${(f.fam ?? "NULL").padEnd(15)} ${String(f.cnt).padStart(8)}`);
  }

  console.log(B("\n  2. sourceDocumentStage distribution"));
  const stages: Array<{ stage: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT "sourceDocumentStage" as stage, COUNT(*)::int as cnt
     FROM "SaleRecord" WHERE "organizationId" = $1
     GROUP BY "sourceDocumentStage" ORDER BY cnt DESC`, ORG);
  for (const s of stages) {
    console.log(`    ${(s.stage ?? "NULL").padEnd(15)} ${String(s.cnt).padStart(8)}`);
  }

  // 3. Top invoice-like codes (F-prefix) — sample productCode
  console.log(B("\n  3. F-prefix comprobanteCode — sample productCode"));
  const fCodes = ["FE", "FD", "FA", "FC", "FG", "FW", "F2", "F1"];
  for (const code of fCodes) {
    const sample: Array<{ productCode: string | null; productName: string | null }> = await db.$queryRawUnsafe(
      `SELECT "productCode", "productName" FROM "SaleRecord"
       WHERE "organizationId" = $1 AND "comprobanteCode" = $2
       AND "productCode" IS NOT NULL LIMIT 3`, ORG, code);
    const products = sample.map(s => s.productCode ?? "—").join(", ");
    console.log(`    ${code.padEnd(5)} → ${products || "(no productCode)"}`);
  }

  // 4. Test: match PD orders to ANY F-prefix SaleRecord by customerNit + productCode
  console.log(B("\n  4. Product-level matching (PD ↔ ALL sales, by customerNit + productCode)"));
  const AUDIT_REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];
  for (const sku of AUDIT_REFS) {
    // Find PD orders for this SKU and check if ANY SaleRecord exists
    // with same customerNit AND same productCode AND saleDate >= orderDate
    const matched: Array<{ order_cnt: number; matched_cnt: number }> = await db.$queryRawUnsafe(
      `SELECT
         COUNT(DISTINCT col."orderId")::int as order_cnt,
         SUM(CASE WHEN EXISTS (
           SELECT 1 FROM "SaleRecord" sr
           WHERE sr."organizationId" = $1
             AND sr."customerNit" = cor."customerNit"
             AND sr."productCode" = col."referenceCode"
             AND sr."saleDate" >= cor."orderDate"
         ) THEN 1 ELSE 0 END)::int as matched_cnt
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG, sku);
    const m = matched[0];
    console.log(`    ${sku.padEnd(14)} orders: ${String(m?.order_cnt ?? 0).padStart(4)}  matched: ${String(m?.matched_cnt ?? 0).padStart(4)}`);
  }

  // 5. Check: does SaleRecord.productCode overlap with CustomerOrderLine.referenceCode at all?
  console.log(B("\n  5. ProductCode overlap between SaleRecord and CustomerOrderLine"));
  const overlap: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT sr."productCode")::int as cnt
     FROM "SaleRecord" sr
     WHERE sr."organizationId" = $1
       AND sr."productCode" IS NOT NULL
       AND sr."productCode" IN (
         SELECT DISTINCT "referenceCode" FROM "CustomerOrderLine"
         WHERE "organizationId" = $1
       )`, ORG);
  const totalSaleProducts: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "productCode")::int as cnt
     FROM "SaleRecord" WHERE "organizationId" = $1 AND "productCode" IS NOT NULL`, ORG);
  const totalPdRefs: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "referenceCode")::int as cnt
     FROM "CustomerOrderLine" WHERE "organizationId" = $1`, ORG);
  console.log(`    Unique SaleRecord productCodes:     ${String(totalSaleProducts[0]?.cnt ?? 0).padStart(6)}`);
  console.log(`    Unique PD line referenceCodes:      ${String(totalPdRefs[0]?.cnt ?? 0).padStart(6)}`);
  console.log(`    Overlap:                            ${String(overlap[0]?.cnt ?? 0).padStart(6)}`);

  // 6. Sample overlapping products
  console.log(B("\n  6. Sample overlapping product codes"));
  const sampleOverlap: Array<{ code: string }> = await db.$queryRawUnsafe(
    `SELECT DISTINCT sr."productCode" as code
     FROM "SaleRecord" sr
     WHERE sr."organizationId" = $1
       AND sr."productCode" IS NOT NULL
       AND sr."productCode" IN (
         SELECT DISTINCT "referenceCode" FROM "CustomerOrderLine"
         WHERE "organizationId" = $1
       )
     LIMIT 10`, ORG);
  console.log(`    ${sampleOverlap.map(s => s.code).join(", ")}`);

  // 7. Global match: PD orders where ALL lines have a corresponding SaleRecord
  console.log(B("\n  7. PD orders fully matched (all lines have sale)"));
  const fullyMatched: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT cor.id)::int as cnt
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
       AND NOT EXISTS (
         SELECT 1 FROM "CustomerOrderLine" col
         WHERE col."orderId" = cor.id
           AND NOT EXISTS (
             SELECT 1 FROM "SaleRecord" sr
             WHERE sr."organizationId" = $1
               AND sr."customerNit" = cor."customerNit"
               AND sr."productCode" = col."referenceCode"
               AND sr."saleDate" >= cor."orderDate"
           )
       )
       AND EXISTS (SELECT 1 FROM "CustomerOrderLine" WHERE "orderId" = cor.id)`,
    ORG);
  console.log(`    Fully matched PD orders: ${String(fullyMatched[0]?.cnt ?? 0).padStart(6)} / 9522`);

  console.log("");
  await db.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
