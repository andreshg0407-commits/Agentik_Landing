/**
 * sag-probe-duedate3.ts
 *
 * Round 3: identify the actual fuente names for the top fuentes in
 * CustomerReceivable, to understand which document types are present
 * and whether any fuente has credit terms.
 *
 * Also probes TERCEROS for any payment/credit fields using wildcards.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const { getPyaConfig }    = await import("../lib/connectors/pya/auth");
  const { consultaSagJson } = await import("../lib/connectors/pya/client");
  const { prisma }          = await import("../lib/prisma");

  const token    = process.env.PYA_SOAP_TOKEN?.trim() || process.env.SAG_TEST_TOKEN?.trim();
  const database = process.env.PYA_SAG_BD?.trim();
  if (!token) throw new Error("PYA_SOAP_TOKEN or SAG_TEST_TOKEN required");
  const apiConfig = getPyaConfig({ token, database });

  function section(title: string) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${"═".repeat(60)}`);
  }

  // ── 1. Top fuentes in our CustomerReceivable ──────────────────────────────
  section("1. Top fuentes in CustomerReceivable (stored data)");
  const fuenteDist = await prisma.$queryRaw<{ fuente: string; cnt: bigint }[]>`
    SELECT
      "rawErpJson"->'raw'->>'ka_ni_fuente' AS fuente,
      COUNT(*) AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
    GROUP BY fuente
    ORDER BY cnt DESC
  `;
  const topFuentes = fuenteDist.map(f => f.fuente).filter(Boolean).slice(0, 20);
  console.log("  fuente  →  count:");
  for (const f of fuenteDist) {
    console.log(`    ${String(f.fuente).padEnd(8)} →  ${f.cnt}`);
  }

  // ── 2. FUENTES — names for top IDs ───────────────────────────────────────
  section("2. FUENTES names for top IDs in CustomerReceivable");
  const ids = topFuentes.join(", ");
  try {
    const rows = await consultaSagJson(
      apiConfig,
      `SELECT ka_ni_fuente, sc_nombre_fuente, sc_cobrar_pagar, k_n_clase_fuente, k_sc_codigo_fuente, sc_cuotas, ka_ni_forma_pago_fte FROM FUENTES WHERE ka_ni_fuente IN (${ids})`
    ) as Record<string, unknown>[];
    console.log(`\n  ID   clase  cob/pag  cuotas  forma_pago  nombre`);
    console.log(`  ${"-".repeat(70)}`);
    for (const r of rows) {
      console.log(
        `  ${String(r.ka_ni_fuente).padEnd(5)}` +
        `${String(r.k_n_clase_fuente ?? "").padEnd(7)}` +
        `${String(r.sc_cobrar_pagar ?? "").padEnd(9)}` +
        `${String(r.sc_cuotas ?? "").padEnd(8)}` +
        `${String(r.ka_ni_forma_pago_fte ?? "null").padEnd(12)}` +
        `${r.sc_nombre_fuente} (${r.k_sc_codigo_fuente})`
      );
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 3. Sample recent MOVIMIENTOS from top fuente for date fields ─────────
  section("3. Sample MOVIMIENTOS for fuente 97 (full row — date fields)");
  try {
    const rows = await consultaSagJson(
      apiConfig,
      "SELECT TOP 3 * FROM MOVIMIENTOS WHERE ka_ni_fuente = 97 AND sc_anulado = 'N' ORDER BY ka_nl_movimiento DESC"
    ) as Record<string, unknown>[];
    if (rows.length > 0) {
      const dateKeys = Object.keys(rows[0]).filter(k =>
        k.startsWith("d_") || k.startsWith("dd_") || k.startsWith("ddt_")
      );
      console.log(`  Date fields: ${dateKeys.join(", ")}\n`);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        console.log(`  --- Row ${i + 1} (ka_nl_movimiento=${row.ka_nl_movimiento}) ---`);
        for (const k of dateKeys) {
          const v = row[k];
          if (v !== null && v !== undefined && String(v).trim()) {
            console.log(`    ${k.padEnd(35)} = ${String(v)}`);
          }
        }
        // Also show fuente and amounts
        console.log(`    ka_ni_fuente = ${row.ka_ni_fuente}  |  ka_nl_tercero = ${row.ka_nl_tercero}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 4. Check MEDIOS_PAGO or FORMA_PAGO table (alternate names) ───────────
  section("4. Alternate payment-method table names");
  for (const tbl of ["MEDIOS_PAGO", "CONDICIONES_PAGO", "PLAZOS_PAGO", "PLAZO_PAGO", "FORMA_PAGO"]) {
    try {
      const rows = await consultaSagJson(apiConfig, `SELECT TOP 1 * FROM ${tbl}`) as Record<string, unknown>[];
      console.log(`  ✓ ${tbl} EXISTS — fields: ${Object.keys(rows[0] ?? {}).join(", ")}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Invalid object name")) {
        console.log(`  ✗ ${tbl} — does not exist`);
      } else {
        console.log(`  ? ${tbl} — ${msg.slice(0, 80)}`);
      }
    }
  }

  // ── 5. Amount distribution in CustomerReceivable by fuente ───────────────
  section("5. Amount totals by fuente (to identify debit/credit doc types)");
  const amtDist = await prisma.$queryRaw<{
    fuente: string;
    cnt: bigint;
    total_balance: string;
    avg_balance: string;
  }[]>`
    SELECT
      "rawErpJson"->'raw'->>'ka_ni_fuente'  AS fuente,
      COUNT(*)                               AS cnt,
      SUM("balanceDue")::text                AS total_balance,
      AVG("balanceDue")::text                AS avg_balance
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
    GROUP BY fuente
    ORDER BY SUM("balanceDue") DESC
    LIMIT 15
  `;
  console.log(`  fuente   cnt      total_balance          avg_balance`);
  console.log(`  ${"-".repeat(60)}`);
  for (const f of amtDist) {
    console.log(
      `  ${String(f.fuente).padEnd(9)}` +
      `${String(f.cnt).padEnd(9)}` +
      `${Number(f.total_balance).toLocaleString("es-CO").padStart(22)}  ` +
      `${Number(f.avg_balance).toLocaleString("es-CO").padStart(18)}`
    );
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
