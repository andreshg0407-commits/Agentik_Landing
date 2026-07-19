import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];
const ADMIN = { "L-1367": 64, "L-8467": 511, "CJ-1126012": 79, "CJ-2026004B": 164 };

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("\n=== FULL RECONCILIATION ===\n");

  for (const ref of REFS) {
    // B01+B04
    const gross = await db.$queryRawUnsafe(
      `SELECT SUM(pil."quantity")::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" IN ('01','04')`, ORG, ref,
    );
    const b01b04 = Math.round(gross[0]?.qty ?? 0);

    // Other bodegas (02, 03, 22, 23, etc.)
    const other = await db.$queryRawUnsafe(
      `SELECT pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" NOT IN ('01','04')
       GROUP BY pil."externalRef"
       HAVING ABS(SUM(pil."quantity")) > 0.01`, ORG, ref,
    );
    const otherTotal = other.reduce((s: number, r: any) => s + Math.round(r.qty), 0);

    // CRM Quote Lines (pending order commitments)
    let crmQty = 0;
    try {
      const crm = await db.$queryRawUnsafe(
        `SELECT SUM(ql.qty::float)::float as qty
         FROM "CRMQuoteLine" ql
         JOIN "CRMQuote" q ON q.id = ql."quoteId"
         WHERE ql."organizationId" = $1 AND ql.reference = $2
           AND q.status IN ('DRAFT','OPEN','PENDING')`, ORG, ref,
      );
      crmQty = Math.round(crm[0]?.qty ?? 0);
    } catch {}

    // CustomerOrderRecord (header only, no per-ref data)
    // = 0 by definition since no product ref field

    const adminQty = (ADMIN as any)[ref];
    const calculated = b01b04 - crmQty;
    const diff = adminQty - calculated;

    console.log(`  ${ref}`);
    console.log(`    B01+B04 (gross):        ${b01b04}`);
    console.log(`    Other bodegas:          ${otherTotal} ${other.map((r: any) => `B${r.bodega}=${Math.round(r.qty)}`).join(', ')}`);
    console.log(`    CRM pending qty:        ${crmQty}`);
    console.log(`    Calculated available:   ${calculated} (= gross ${b01b04} - crm ${crmQty})`);
    console.log(`    Admin reported:         ${adminQty}`);
    console.log(`    Remaining gap:          ${diff}`);
    console.log("");
  }

  // Global impact: how many CRM pending lines exist
  console.log("=== GLOBAL CRM COMMITMENT IMPACT ===");
  try {
    const globalCrm = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT ql.reference)::int as refs_with_commitments,
              SUM(ql.qty::float)::float as total_committed_qty
       FROM "CRMQuoteLine" ql
       JOIN "CRMQuote" q ON q.id = ql."quoteId"
       WHERE ql."organizationId" = $1
         AND q.status IN ('DRAFT','OPEN','PENDING')`, ORG,
    );
    console.table(globalCrm);
  } catch (e) { console.log("CRM global:", (e as Error).message); }

  // Global bodega 02/03/22/23/29 — are these vendor/store bodegas?
  console.log("\n=== GLOBAL NON-TEXTILE BODEGA SUMMARY ===");
  const globalNonCore = await db.$queryRawUnsafe(
    `SELECT pil."externalRef" as bodega,
            COUNT(DISTINCT pe.sku)::int as textile_skus,
            SUM(pil."quantity")::float as total_qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1
       AND pe."productLine" IN ('1','2')
       AND pil."externalRef" IN ('00','02','03','22','23','29')
     GROUP BY pil."externalRef"
     ORDER BY textile_skus DESC`, ORG,
  );
  console.table(globalNonCore);

  await prisma.$disconnect();
  pool.end();
}
main().catch(e => { console.error("FATAL:", (e as Error).message); process.exit(1); });
