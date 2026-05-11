/**
 * scripts/_audit-diana-financials.ts
 *
 * READ-ONLY financial coherence audit for INDUSTRIAS DIANA ALZATE SAS.
 * Reports exact queries + results for all 7 audit sections.
 */

import { prisma }  from "@/lib/prisma";
import { Prisma }  from "@prisma/client";

const ORG_ID       = "cmmpwstuf000dp5y58kj1daaj";
const CANONICAL_ID = "cmnjaig7h0kdy7yy5x1ig4w4x";
const SAG_TERCERO  = "526";     // SaleRecord.customerNit value
const REAL_NIT     = "901383501";

function fmt(n: number | null | undefined): string {
  if (n == null) return "NULL";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP",
    maximumFractionDigits: 0 }).format(n);
}
function pct(num: number, den: number): string {
  if (!den) return "N/A";
  return (num / den * 100).toFixed(2) + "%";
}
function sep() { console.log("─".repeat(70)); }

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(70));
  console.log("  AUDITORÍA FINANCIERA — INDUSTRIAS DIANA ALZATE SAS");
  console.log("  customerId  : " + CANONICAL_ID);
  console.log("  sagTerceroId: " + SAG_TERCERO);
  console.log("  NIT real    : " + REAL_NIT);
  console.log("═".repeat(70));

  // ──────────────────────────────────────────────────────────────────────────
  // 1. LTV TOTAL
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[1] LTV TOTAL — SaleRecord all-time");
  sep();

  // 1a. All-time total (as used by getCustomer360)
  const [ltvRow] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT SUM("amount")::float8 AS total
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${SAG_TERCERO}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
  `);
  console.log("  Query: SUM(amount) WHERE customerNit='526' AND NOT (Total/Subtotal lines)");
  console.log("  LTV total :", fmt(ltvRow?.total));

  // 1b. Breakdown by sagSourceType
  const ltvBySource = await prisma.$queryRaw<Array<{ source: string; amount: number; rows: string }>>(Prisma.sql`
    SELECT
      COALESCE("sagSourceType"::text, 'NULL') AS source,
      SUM("amount")::float8                   AS amount,
      CAST(COUNT(*) AS TEXT)                  AS rows
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${SAG_TERCERO}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    GROUP BY "sagSourceType"
    ORDER BY amount DESC
  `);
  console.log("  Breakdown by sagSourceType:");
  for (const r of ltvBySource) {
    console.log(`    ${r.source.padEnd(20)} rows=${r.rows.padStart(6)}  total=${fmt(r.amount)}`);
  }

  // 1c. With anulaciones / negative amounts
  const [negRow] = await prisma.$queryRaw<Array<{ neg: number; rows: string }>>(Prisma.sql`
    SELECT SUM("amount")::float8 AS neg, CAST(COUNT(*) AS TEXT) AS rows
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${SAG_TERCERO}
      AND "amount" < 0
  `);
  console.log(`  Filas con amount < 0 (anulaciones): rows=${negRow?.rows ?? 0}  sum=${fmt(negRow?.neg)}`);

  // 1d. Count all rows including Total/Subtotal header rows
  const [allRowsCount] = await prisma.$queryRaw<Array<{ rows: string; gross: number }>>(Prisma.sql`
    SELECT CAST(COUNT(*) AS TEXT) AS rows, SUM("amount")::float8 AS gross
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${SAG_TERCERO}
  `);
  console.log(`  Filas totales incl. Total/Subtotal: rows=${allRowsCount?.rows}  gross=${fmt(allRowsCount?.gross)}`);

  const ltv = ltvRow?.total ?? 0;

  // ──────────────────────────────────────────────────────────────────────────
  // 2. VENTAS L12M — F1 + F2 breakdown
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[2] VENTAS L12M — NOW() - INTERVAL '12 months'");
  sep();

  const [l12Row] = await prisma.$queryRaw<Array<{
    total: number; periods: string; last_date: string | null; min_date: string | null;
  }>>(Prisma.sql`
    SELECT
      SUM("amount")::float8                             AS total,
      CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)      AS periods,
      TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')            AS last_date,
      TO_CHAR(MIN("saleDate"), 'YYYY-MM-DD')            AS min_date
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${SAG_TERCERO}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
      AND "saleDate" >= NOW() - INTERVAL '12 months'
  `);
  console.log("  Query: SUM(amount) WHERE saleDate >= NOW() - INTERVAL '12 months'");
  console.log("  Ventas L12M  :", fmt(l12Row?.total));
  console.log("  Periodos     :", l12Row?.periods ?? "0");
  console.log("  Rango real   :", l12Row?.min_date ?? "—", "→", l12Row?.last_date ?? "—");

  const l12BySource = await prisma.$queryRaw<Array<{ source: string; amount: number; rows: string }>>(Prisma.sql`
    SELECT
      COALESCE("sagSourceType"::text, 'NULL') AS source,
      SUM("amount")::float8                   AS amount,
      CAST(COUNT(*) AS TEXT)                  AS rows
    FROM "SaleRecord"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerNit" = ${SAG_TERCERO}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
      AND "saleDate" >= NOW() - INTERVAL '12 months'
    GROUP BY "sagSourceType"
    ORDER BY amount DESC
  `);
  console.log("  Breakdown L12M por sagSourceType:");
  for (const r of l12BySource) {
    console.log(`    ${r.source.padEnd(20)} rows=${r.rows.padStart(6)}  total=${fmt(r.amount)}`);
  }

  // F1 (OFICIAL) + F2 (REMISION) sum check
  const f1 = l12BySource.find(r => r.source === "OFICIAL")?.amount ?? 0;
  const f2 = l12BySource.find(r => r.source === "REMISION")?.amount ?? 0;
  const f1f2Sum = f1 + f2;
  const l12Total = l12Row?.total ?? 0;
  console.log(`  F1 + F2 = ${fmt(f1f2Sum)} vs L12M total = ${fmt(l12Total)} → diff = ${fmt(l12Total - f1f2Sum)}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CARTERA TOTAL ABIERTA
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[3] CARTERA TOTAL — CustomerReceivable open/partial/overdue");
  sep();

  const [cartRow] = await prisma.$queryRaw<Array<{
    total: number; rows: string; min_date: string | null; max_date: string | null;
  }>>(Prisma.sql`
    SELECT
      SUM("balanceDue")::float8                       AS total,
      CAST(COUNT(*) AS TEXT)                          AS rows,
      TO_CHAR(MIN("invoiceDate"), 'YYYY-MM-DD')       AS min_date,
      TO_CHAR(MAX("invoiceDate"), 'YYYY-MM-DD')       AS max_date
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerId" = ${CANONICAL_ID}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      AND "balanceDue" > 0
  `);
  console.log("  Query: SUM(balanceDue) WHERE customerId=CANONICAL AND status IN (OPEN,PARTIAL,OVERDUE) AND balanceDue>0");
  console.log("  Cartera total:", fmt(cartRow?.total));
  console.log("  Documentos   :", cartRow?.rows ?? "0");
  console.log("  Rango fechas :", cartRow?.min_date ?? "—", "→", cartRow?.max_date ?? "—");

  // Also check via customerId (backfill linked via customerId, not customerNit)
  const [cartById] = await prisma.$queryRaw<Array<{ total: number; rows: string }>>(Prisma.sql`
    SELECT
      SUM("balanceDue")::float8  AS total,
      CAST(COUNT(*) AS TEXT)     AS rows
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerId" = ${CANONICAL_ID}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      AND "balanceDue" > 0
  `);
  console.log("  Por customerId (correcto):", fmt(cartById?.total), `(${cartById?.rows} docs)`);

  // Diagnose: what customerNit values exist for this customerId?
  const nitSamples = await prisma.$queryRaw<Array<{ cn: string | null; cnt: string }>>(Prisma.sql`
    SELECT "customerNit" AS cn, CAST(COUNT(*) AS TEXT) AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerId" = ${CANONICAL_ID}
    GROUP BY "customerNit"
    ORDER BY cnt DESC
    LIMIT 5
  `);
  console.log("  customerNit values en CustomerReceivable para este customerId:");
  for (const r of nitSamples) {
    console.log(`    "${r.cn ?? "NULL"}" → ${r.cnt} docs`);
  }

  // Agrupar por año de invoiceDate (usando customerId — la clave correcta)
  const cartByYear = await prisma.$queryRaw<Array<{ yr: string; total: number; rows: string }>>(Prisma.sql`
    SELECT
      TO_CHAR("invoiceDate", 'YYYY')  AS yr,
      SUM("balanceDue")::float8       AS total,
      CAST(COUNT(*) AS TEXT)          AS rows
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerId" = ${CANONICAL_ID}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      AND "balanceDue" > 0
    GROUP BY yr
    ORDER BY yr DESC
  `);
  console.log("  Distribución por año de invoiceDate:");
  for (const r of cartByYear) {
    console.log(`    ${r.yr ?? "NULL"}  docs=${r.rows.padStart(4)}  balanceDue=${fmt(r.total)}`);
  }

  const carteraTotal = cartById?.total ?? cartRow?.total ?? 0;

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CARTERA VENCIDA + AGING BUCKETS
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[4] CARTERA VENCIDA — daysOverdue > 0");
  sep();

  const [vencRow] = await prisma.$queryRaw<Array<{ total: number; rows: string; max_dpd: number }>>(Prisma.sql`
    SELECT
      SUM("balanceDue")::float8  AS total,
      CAST(COUNT(*) AS TEXT)     AS rows,
      MAX("daysOverdue")         AS max_dpd
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerId" = ${CANONICAL_ID}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      AND "daysOverdue" > 0
      AND "balanceDue" > 0
  `);
  console.log("  Cartera vencida:", fmt(vencRow?.total));
  console.log("  Documentos     :", vencRow?.rows ?? "0");
  console.log("  Max DPD (días) :", vencRow?.max_dpd ?? "0");

  // Aging buckets
  const buckets = await prisma.$queryRaw<Array<{ bucket: string | null; total: number; rows: string }>>(Prisma.sql`
    SELECT
      "agingBucket"               AS bucket,
      SUM("balanceDue")::float8   AS total,
      CAST(COUNT(*) AS TEXT)      AS rows
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND "customerId" = ${CANONICAL_ID}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      AND "balanceDue" > 0
    GROUP BY "agingBucket"
    ORDER BY "agingBucket"
  `);
  // NOTE: bucket query also needs customerId
  console.log("  Aging buckets:");
  for (const b of buckets) {
    const tag = (b.bucket === "CURRENT") ? "  (no vencido)" : "";
    console.log(`    ${(b.bucket ?? "NULL").padEnd(16)} docs=${b.rows.padStart(4)}  balanceDue=${fmt(b.total)}${tag}`);
  }

  const carteraVencida = vencRow?.total ?? 0;

  // ──────────────────────────────────────────────────────────────────────────
  // 5. TABLA DE FACTURAS — conteo y orden
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[5] TABLA DE FACTURAS — conteo y orden");
  sep();

  // What getCustomer360 returns (take: 20, orderBy: dueDate ASC)
  const invoices = await (prisma as any).customerReceivable.findMany({
    where: {
      organizationId: ORG_ID,
      OR: [{ customerId: CANONICAL_ID }, { customerNit: REAL_NIT }],
      status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
    },
    orderBy: { dueDate: "asc" },
    take: 20,
    select: {
      id: true, invoiceNumber: true, invoiceDate: true, dueDate: true,
      balanceDue: true, daysOverdue: true, agingBucket: true, status: true,
    },
  });

  // Total open count (without take limit)
  const totalOpenCount = await (prisma as any).customerReceivable.count({
    where: {
      organizationId: ORG_ID,
      OR: [{ customerId: CANONICAL_ID }, { customerNit: REAL_NIT }],
      status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
    },
  });

  console.log(`  Total documentos abiertos en DB    : ${totalOpenCount}`);
  console.log(`  Documentos mostrados en UI (take:20): ${invoices.length}`);
  console.log(`  Orden actual                       : dueDate ASC (próxima a vencer primero)`);
  console.log(`  → UI muestra ${invoices.length} de ${totalOpenCount} documentos`);
  console.log("");
  console.log("  Primeros 5 (más urgentes):");
  for (const inv of invoices.slice(0, 5)) {
    const bd = typeof inv.balanceDue === "object" ? Number(inv.balanceDue) : inv.balanceDue;
    console.log(`    inv=${inv.invoiceNumber ?? "?"} due=${inv.dueDate?.toISOString().slice(0,10) ?? "?"} dpd=${inv.daysOverdue ?? 0} bucket=${inv.agingBucket ?? "?"} bal=${fmt(bd)}`);
  }
  console.log("  ...");
  console.log("  Últimos 5 (más lejanos):");
  for (const inv of invoices.slice(-5)) {
    const bd = typeof inv.balanceDue === "object" ? Number(inv.balanceDue) : inv.balanceDue;
    console.log(`    inv=${inv.invoiceNumber ?? "?"} due=${inv.dueDate?.toISOString().slice(0,10) ?? "?"} dpd=${inv.daysOverdue ?? 0} bucket=${inv.agingBucket ?? "?"} bal=${fmt(bd)}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. COHERENCIA FINANCIERA
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[6] COHERENCIA FINANCIERA");
  sep();
  console.log(`  LTV total (all-time)         : ${fmt(ltv)}`);
  console.log(`  Ventas L12M                  : ${fmt(l12Total)}`);
  console.log(`  Cartera total abierta        : ${fmt(carteraTotal)}`);
  console.log(`  Cartera vencida              : ${fmt(carteraVencida)}`);
  console.log(`  Cartera abierta / LTV        : ${pct(carteraTotal, ltv)}`);
  console.log(`  Cartera vencida / LTV        : ${pct(carteraVencida, ltv)}`);
  console.log(`  Cartera vencida / L12M       : ${pct(carteraVencida, l12Total)}`);
  console.log(`  Cartera abierta / L12M       : ${pct(carteraTotal, l12Total)}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 7. ALERTAS
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[7] ALERTAS");
  sep();

  const cartLtvRatio = ltv > 0 ? carteraTotal / ltv : 0;
  const vencidaL12Ratio = l12Total > 0 ? carteraVencida / l12Total : 0;

  if (cartLtvRatio >= 0.9) {
    console.log("  🚨 CRITICO: Cartera total ≈ LTV total (" + pct(carteraTotal, ltv) + ")");
    console.log("     → Cliente con cartera histórica crítica / revisar conciliación histórica.");
    console.log("     → Muy probable que existan cobros no reconciliados en SAG.");
  } else if (cartLtvRatio >= 0.5) {
    console.log("  ⚠️  ALERTA: Cartera total > 50% del LTV (" + pct(carteraTotal, ltv) + ")");
  } else {
    console.log("  ✅ Ratio Cartera/LTV dentro de rango: " + pct(carteraTotal, ltv));
  }

  if (vencidaL12Ratio >= 1.0) {
    console.log("  🚨 CRITICO: Cartera vencida > Ventas L12M (" + pct(carteraVencida, l12Total) + ")");
    console.log("     → Cliente insolvente respecto a actividad reciente.");
  } else if (vencidaL12Ratio >= 0.5) {
    console.log("  ⚠️  ALERTA: Cartera vencida > 50% de Ventas L12M (" + pct(carteraVencida, l12Total) + ")");
  }

  if (cartByYear.some(r => parseInt(r.yr ?? "9999") < 2026)) {
    const preYears = cartByYear.filter(r => parseInt(r.yr ?? "9999") < 2026);
    const preTotal = preYears.reduce((s, r) => s + r.total, 0);
    console.log(`  ⚠️  CARRY-OVER: Existen ${preYears.length} año(s) anteriores a 2026 con cartera abierta:`);
    for (const y of preYears) {
      console.log(`       ${y.yr}: ${fmt(y.total)} (${y.rows} docs)`);
    }
    console.log(`     Total carry-over: ${fmt(preTotal)}`);
  }

  console.log("\n" + "═".repeat(70));
  console.log("  FIN AUDITORÍA");
  console.log("═".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
