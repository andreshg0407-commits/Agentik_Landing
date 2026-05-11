/**
 * scripts/_diag-consignaciones.ts
 * Debug: consignaciones pendientes — COUNT > 0 pero SUM(amount) = 0?
 * Usage: ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_diag-consignaciones.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";
const CP_CODES = ["CP", "B1", "B2", "H1", "H2"];

async function main() {
  const org = await prisma.organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(`ORG NOT FOUND: ${ORG_SLUG}`); process.exit(1); }
  console.log(`\nORG: ${org.id} — ${org.name}\n`);

  // ── 1. Aggregate por comprobanteCode (2026 strict) ────────────────────────
  type AggRow = {
    comprobanteCode: string | null;
    cnt:   string;
    total: string | null;
    min_amount: string | null;
    max_amount: string | null;
  };

  const from2026 = new Date("2026-01-01T00:00:00.000Z");
  const to2027   = new Date("2027-01-01T00:00:00.000Z");

  const agg = await prisma.$queryRaw<AggRow[]>(Prisma.sql`
    SELECT
      "comprobanteCode",
      CAST(COUNT(*)          AS TEXT) AS cnt,
      CAST(SUM("amount")     AS TEXT) AS total,
      CAST(MIN("amount")     AS TEXT) AS min_amount,
      CAST(MAX("amount")     AS TEXT) AS max_amount
    FROM "SaleRecord"
    WHERE "organizationId" = ${org.id}
      AND "comprobanteCode" IN ('CP','B1','B2','H1','H2')
      AND "saleDate" >= ${from2026}
      AND "saleDate" <  ${to2027}
    GROUP BY "comprobanteCode"
    ORDER BY "comprobanteCode"
  `);

  console.log("══ 1. AGGREGATE 2026 (CP/B1/B2/H1/H2) ══════════════════════════════");
  if (agg.length === 0) {
    console.log("  Sin registros con esos códigos en 2026.");
  } else {
    console.log(`  ${"code".padEnd(6)} ${"cnt".padStart(8)} ${"total".padStart(20)} ${"min".padStart(16)} ${"max".padStart(16)}`);
    console.log("  " + "─".repeat(70));
    for (const r of agg) {
      console.log(
        `  ${(r.comprobanteCode ?? "NULL").padEnd(6)} ` +
        `${(r.cnt ?? "0").padStart(8)} ` +
        `${(r.total ?? "NULL").padStart(20)} ` +
        `${(r.min_amount ?? "NULL").padStart(16)} ` +
        `${(r.max_amount ?? "NULL").padStart(16)}`
      );
    }
  }

  // ── 1b. Sin filtro de fecha (all-time) ────────────────────────────────────
  const aggAll = await prisma.$queryRaw<AggRow[]>(Prisma.sql`
    SELECT
      "comprobanteCode",
      CAST(COUNT(*)          AS TEXT) AS cnt,
      CAST(SUM("amount")     AS TEXT) AS total,
      CAST(MIN("amount")     AS TEXT) AS min_amount,
      CAST(MAX("amount")     AS TEXT) AS max_amount
    FROM "SaleRecord"
    WHERE "organizationId" = ${org.id}
      AND "comprobanteCode" IN ('CP','B1','B2','H1','H2')
    GROUP BY "comprobanteCode"
    ORDER BY "comprobanteCode"
  `);

  console.log("\n══ 1b. AGGREGATE ALL-TIME (sin filtro fecha) ════════════════════════");
  if (aggAll.length === 0) {
    console.log("  Sin registros con esos códigos en todo el historial.");
  } else {
    console.log(`  ${"code".padEnd(6)} ${"cnt".padStart(8)} ${"total".padStart(20)} ${"min".padStart(16)} ${"max".padStart(16)}`);
    console.log("  " + "─".repeat(70));
    for (const r of aggAll) {
      console.log(
        `  ${(r.comprobanteCode ?? "NULL").padEnd(6)} ` +
        `${(r.cnt ?? "0").padStart(8)} ` +
        `${(r.total ?? "NULL").padStart(20)} ` +
        `${(r.min_amount ?? "NULL").padStart(16)} ` +
        `${(r.max_amount ?? "NULL").padStart(16)}`
      );
    }
  }

  // ── 2. 5 filas reales (all-time, cualquier año) ───────────────────────────
  type SampleRow = {
    comprobanteCode: string | null;
    amount:          string | null;
    saleDate:        Date | null;
    rawErpJson:      unknown;
  };

  const sample = await prisma.$queryRaw<SampleRow[]>(Prisma.sql`
    SELECT
      "comprobanteCode",
      CAST("amount" AS TEXT) AS amount,
      "saleDate",
      "rawErpJson"
    FROM "SaleRecord"
    WHERE "organizationId" = ${org.id}
      AND "comprobanteCode" IN ('CP','B1','B2','H1','H2')
    ORDER BY "saleDate" DESC
    LIMIT 5
  `);

  console.log("\n══ 2. MUESTRA 5 FILAS REALES (recientes, any year) ══════════════════");
  if (sample.length === 0) {
    console.log("  Sin filas encontradas.");
  } else {
    for (const [i, r] of sample.entries()) {
      console.log(`\n  [${i + 1}] code=${r.comprobanteCode ?? "NULL"}  amount=${r.amount ?? "NULL"}  saleDate=${r.saleDate?.toISOString().slice(0, 10) ?? "NULL"}`);
      // Print relevant rawErpJson fields if present
      if (r.rawErpJson && typeof r.rawErpJson === "object") {
        const j = r.rawErpJson as Record<string, unknown>;
        const relevant = ["ka_sc_signo", "sc_valor_total", "sc_valor_neto", "k_n_clase_fuente", "ka_sc_codigo_fuente", "sc_cobrar_pagar"];
        const parts = relevant
          .filter(k => k in j)
          .map(k => `${k}=${JSON.stringify(j[k])}`);
        if (parts.length > 0) console.log(`       rawErpJson: ${parts.join("  ")}`);
        else console.log(`       rawErpJson keys: ${Object.keys(j).slice(0, 10).join(", ")}`);
      }
    }
  }

  // ── 3. Diagnóstico: amount NULL vs 0 vs positivo ──────────────────────────
  type NullRow = { null_cnt: string; zero_cnt: string; pos_cnt: string; neg_cnt: string };
  const nullCheck = await prisma.$queryRaw<NullRow[]>(Prisma.sql`
    SELECT
      CAST(COUNT(*) FILTER (WHERE "amount" IS NULL)  AS TEXT) AS null_cnt,
      CAST(COUNT(*) FILTER (WHERE "amount" = 0)      AS TEXT) AS zero_cnt,
      CAST(COUNT(*) FILTER (WHERE "amount" > 0)      AS TEXT) AS pos_cnt,
      CAST(COUNT(*) FILTER (WHERE "amount" < 0)      AS TEXT) AS neg_cnt
    FROM "SaleRecord"
    WHERE "organizationId" = ${org.id}
      AND "comprobanteCode" IN ('CP','B1','B2','H1','H2')
  `);

  console.log("\n══ 3. DIAGNÓSTICO amount NULL/0/positivo/negativo ════════════════════");
  const nc = nullCheck[0];
  if (nc) {
    console.log(`  amount IS NULL:  ${nc.null_cnt}`);
    console.log(`  amount = 0:      ${nc.zero_cnt}`);
    console.log(`  amount > 0:      ${nc.pos_cnt}`);
    console.log(`  amount < 0:      ${nc.neg_cnt}`);
  }

  // ── 4. Signo SAG: ka_sc_signo en rawErpJson ───────────────────────────────
  // En SAG, cobros pueden tener signo negativo (reducen saldo). Si amount se
  // mapea como sc_valor_total * signo y el signo es -1, SUM puede cancelarse.
  type SignoRow = { signo: string | null; cnt: string; total: string | null };
  const signoCheck = await prisma.$queryRaw<SignoRow[]>(Prisma.sql`
    SELECT
      ("rawErpJson"->>'ka_sc_signo')   AS signo,
      CAST(COUNT(*) AS TEXT)            AS cnt,
      CAST(SUM("amount") AS TEXT)       AS total
    FROM "SaleRecord"
    WHERE "organizationId" = ${org.id}
      AND "comprobanteCode" IN ('CP','B1','B2','H1','H2')
    GROUP BY signo
    ORDER BY cnt DESC
  `);

  console.log("\n══ 4. SIGNO SAG (ka_sc_signo en rawErpJson) ══════════════════════════");
  if (signoCheck.length === 0) {
    console.log("  No se pudo extraer signo (rawErpJson puede no tener ese campo).");
  } else {
    console.log(`  ${"signo".padEnd(8)} ${"cnt".padStart(8)} ${"SUM(amount)".padStart(20)}`);
    for (const r of signoCheck) {
      console.log(`  ${(r.signo ?? "NULL").padEnd(8)} ${(r.cnt ?? "0").padStart(8)} ${(r.total ?? "NULL").padStart(20)}`);
    }
  }

  console.log("\n");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
