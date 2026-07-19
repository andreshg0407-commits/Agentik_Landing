/**
 * _forensic-pd-docref.ts
 *
 * Check if SaleRecord.originDocumentRef, comprobante, or rawJson
 * contain references to PD order numbers (n_numero_documento).
 * Also check if SaleRecord grain is AGGREGATED (no product detail).
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

  // 1. SaleRecord grain distribution
  console.log(B("\n  1. SaleRecord grain distribution"));
  const grains: Array<{ grain: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT grain, COUNT(*)::int as cnt FROM "SaleRecord"
     WHERE "organizationId" = $1 GROUP BY grain ORDER BY cnt DESC`, ORG);
  for (const g of grains) {
    console.log(`    ${g.grain.padEnd(15)} ${String(g.cnt).padStart(8)}`);
  }

  // 2. originDocumentRef — how many are populated?
  console.log(B("\n  2. originDocumentRef coverage"));
  const odr: Array<{ total: number; populated: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total,
            SUM(CASE WHEN "originDocumentRef" IS NOT NULL THEN 1 ELSE 0 END)::int as populated
     FROM "SaleRecord" WHERE "organizationId" = $1`, ORG);
  console.log(`    Total SaleRecords:     ${String(odr[0]?.total ?? 0).padStart(8)}`);
  console.log(`    With originDocRef:     ${String(odr[0]?.populated ?? 0).padStart(8)}`);

  // 3. Sample some PD order numbers and check if they appear in SaleRecord
  console.log(B("\n  3. PD order numbers → search in SaleRecord"));
  const pdSample: Array<{ order_num: string; nit: string; order_date: string }> = await db.$queryRawUnsafe(
    `SELECT "orderNumber" as order_num, "customerNit" as nit, "orderDate"::text as order_date
     FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND "orderDate" >= '2025-01-01'
     ORDER BY "orderDate" DESC LIMIT 5`, ORG);

  for (const pd of pdSample) {
    // Search in comprobante
    const inComprobante: Array<{ cnt: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "SaleRecord"
       WHERE "organizationId" = $1 AND comprobante LIKE '%' || $2 || '%'`, ORG, pd.order_num);
    // Search in originDocumentRef
    const inOriginDoc: Array<{ cnt: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "SaleRecord"
       WHERE "organizationId" = $1 AND "originDocumentRef" LIKE '%' || $2 || '%'`, ORG, pd.order_num);
    console.log(`    PD ${pd.order_num.padEnd(8)} nit=${pd.nit.padEnd(8)} ${pd.order_date.slice(0, 10)}  → comprobante: ${inComprobante[0]?.cnt ?? 0}  originDoc: ${inOriginDoc[0]?.cnt ?? 0}`);
  }

  // 4. Check rawJson for a known PD order's customer
  console.log(B("\n  4. Sample SaleRecord rawJson for PD customer (first match)"));
  const samplePd = pdSample[0];
  if (samplePd) {
    const saleForCustomer: Array<{ comprobante: string; code: string; raw: any; saleDate: string }> = await db.$queryRawUnsafe(
      `SELECT comprobante, "comprobanteCode" as code, "rawJson" as raw, "saleDate"::text as "saleDate"
       FROM "SaleRecord"
       WHERE "organizationId" = $1 AND "customerNit" = $2
       ORDER BY "saleDate" DESC LIMIT 3`, ORG, samplePd.nit);
    for (const sr of saleForCustomer) {
      const rawKeys = sr.raw ? Object.keys(sr.raw).join(", ") : "—";
      const rawSample = sr.raw
        ? JSON.stringify(sr.raw).slice(0, 200)
        : "—";
      console.log(`    ${sr.code?.padEnd(5)} ${(sr.comprobante ?? "—").padEnd(15)} ${sr.saleDate.slice(0, 10)}`);
      console.log(`      keys: ${rawKeys}`);
      console.log(`      raw:  ${rawSample}`);
    }
  }

  // 5. Check if SAG MOVIMIENTOS erpMovId links exist in SaleRecord (via rawJson ka_nl_movimiento)
  console.log(B("\n  5. Check ka_nl_movimiento in SaleRecord rawJson"));
  const samplePdMovId: Array<{ erpMovId: number; order_num: string }> = await db.$queryRawUnsafe(
    `SELECT "erpMovId", "orderNumber" as order_num FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 ORDER BY "orderDate" DESC LIMIT 3`, ORG);
  for (const pd of samplePdMovId) {
    // Check if any SaleRecord rawJson contains this movimiento ID
    const inRaw: Array<{ cnt: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "SaleRecord"
       WHERE "organizationId" = $1
         AND "rawJson"::text LIKE '%' || $2 || '%'
       LIMIT 1`, ORG, String(pd.erpMovId));
    console.log(`    PD erpMovId=${pd.erpMovId} (${pd.order_num}) → in rawJson: ${inRaw[0]?.cnt ?? 0}`);
  }

  // 6. Alternative: match by customerNit + amount proximity
  console.log(B("\n  6. Alternative: customerNit + amount matching for audit refs"));
  const auditPds: Array<{ id: string; nit: string; order_num: string; amount: number; order_date: string }> = await db.$queryRawUnsafe(
    `SELECT cor.id, cor."customerNit" as nit, cor."orderNumber" as order_num,
            cor.amount::float as amount, cor."orderDate"::text as order_date
     FROM "CustomerOrderRecord" cor
     JOIN "CustomerOrderLine" col ON col."orderId" = cor.id
     WHERE col."organizationId" = $1
       AND col."referenceCode" IN ('L-1367', 'L-8467')
       AND cor."orderDate" >= '2025-01-01'
     GROUP BY cor.id, cor."customerNit", cor."orderNumber", cor.amount, cor."orderDate"
     ORDER BY cor."orderDate" DESC LIMIT 5`, ORG);
  for (const pd of auditPds) {
    const sales: Array<{ code: string; amount: number; sale_date: string }> = await db.$queryRawUnsafe(
      `SELECT "comprobanteCode" as code, amount::float as amount, "saleDate"::text as sale_date
       FROM "SaleRecord"
       WHERE "organizationId" = $1 AND "customerNit" = $2 AND "saleDate" >= $3::timestamptz
       ORDER BY "saleDate" ASC LIMIT 5`, ORG, pd.nit, pd.order_date);
    console.log(`    PD ${pd.order_num.padEnd(8)} nit=${pd.nit.padEnd(8)} $${Math.round(pd.amount).toLocaleString()} ${pd.order_date.slice(0, 10)}`);
    for (const s of sales) {
      const amtMatch = Math.abs(s.amount - pd.amount) / pd.amount < 0.05 ? " ← AMOUNT MATCH" : "";
      console.log(`      → ${s.code} $${Math.round(s.amount).toLocaleString()} ${s.sale_date.slice(0, 10)}${amtMatch}`);
    }
  }

  console.log("");
  await db.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
