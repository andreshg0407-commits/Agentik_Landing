/**
 * sag-probe-duedate.ts
 *
 * Probes all plausible due-date sources in the SAG PYA installation:
 *
 *  1. MOVIMIENTOS full field list (TOP 3) — any hidden date columns
 *  2. VENCIMIENTOS table (TOP 5)          — payment-schedule table if it exists
 *  3. FUENTES table (TOP 20)              — document types; may carry dias_credito
 *  4. MOVIMIENTOS JOIN FUENTES sample     — combined to compute dueDate
 *
 * Outputs raw field names and sample values so we can identify the real
 * due-date field before touching any mapper.
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

  // Build apiConfig from env (same resolution as SagPyaSoapAdapter)
  const token    = process.env.PYA_SOAP_TOKEN?.trim() || process.env.SAG_TEST_TOKEN?.trim();
  const database = process.env.PYA_SAG_BD?.trim();
  if (!token) throw new Error("PYA_SOAP_TOKEN or SAG_TEST_TOKEN required");
  const apiConfig = getPyaConfig({ token, database });

  function section(title: string) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${"═".repeat(60)}`);
  }

  function printRows(rows: Record<string, unknown>[]) {
    if (rows.length === 0) { console.log("  (no rows)"); return; }
    // Print all keys of the first row
    const keys = Object.keys(rows[0]);
    console.log(`  Fields (${keys.length}): ${keys.join(", ")}\n`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`  --- Row ${i + 1} ---`);
      for (const k of keys) {
        const v = row[k];
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          console.log(`    ${k.padEnd(30)} = ${String(v).slice(0, 80)}`);
        }
      }
    }
  }

  // ── 1. MOVIMIENTOS full field list ──────────────────────────────────────────
  section("1. MOVIMIENTOS — full field list (TOP 3)");
  try {
    const rows = await consultaSagJson(apiConfig, "SELECT TOP 3 * FROM MOVIMIENTOS WHERE sc_anulado = 'N'") as Record<string, unknown>[];
    printRows(rows);
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 2. VENCIMIENTOS table ───────────────────────────────────────────────────
  section("2. VENCIMIENTOS — payment schedules (TOP 5)");
  try {
    const rows = await consultaSagJson(apiConfig, "SELECT TOP 5 * FROM VENCIMIENTOS") as Record<string, unknown>[];
    printRows(rows);
  } catch (e) {
    console.log(`  NOT FOUND / ERROR: ${(e as Error).message}`);
  }

  // ── 2b. Try alternate names ─────────────────────────────────────────────────
  for (const tbl of ["CUOTAS", "VENCIMIENTOS_MOV", "CARTERA_VENCIMIENTOS"]) {
    section(`2b. ${tbl} (TOP 3)`);
    try {
      const rows = await consultaSagJson(apiConfig, `SELECT TOP 3 * FROM ${tbl}`) as Record<string, unknown>[];
      printRows(rows);
    } catch (e) {
      console.log(`  NOT FOUND: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // ── 3. FUENTES table ────────────────────────────────────────────────────────
  section("3. FUENTES — document types (ALL)");
  try {
    const rows = await consultaSagJson(apiConfig, "SELECT * FROM FUENTES") as Record<string, unknown>[];
    printRows(rows);
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 4. MOVIMIENTOS JOIN FUENTES (TOP 5) ─────────────────────────────────────
  section("4. MOVIMIENTOS JOIN FUENTES — combined for dias_credito");
  try {
    const q = [
      "SELECT TOP 5",
      "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
      "  m.d_fecha_documento, m.ka_nl_tercero,",
      "  f.n_dias_credito, f.sc_descripcion",
      "FROM MOVIMIENTOS m",
      "LEFT JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente",
      "WHERE m.sc_anulado = 'N'",
      "ORDER BY m.ka_nl_movimiento DESC",
    ].join(" ");
    const rows = await consultaSagJson(apiConfig, q) as Record<string, unknown>[];
    printRows(rows);
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 5. TERCEROS dias_credito sample ─────────────────────────────────────────
  section("5. TERCEROS — dias_credito sample (TOP 5 with dias_credito > 0)");
  try {
    const q = "SELECT TOP 5 n_nit, sc_nombre, n_dias_credito, ka_nl_tercero FROM TERCEROS WHERE n_dias_credito > 0";
    const rows = await consultaSagJson(apiConfig, q) as Record<string, unknown>[];
    printRows(rows);
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 6. rawErpJson sample from DB ─────────────────────────────────────────────
  section("6. CustomerReceivable.rawErpJson — sample 3 rows (all fields)");
  const crSample = await prisma.$queryRaw<{ erpId: string; raw: Record<string, unknown> }[]>`
    SELECT "erpId", "rawErpJson" AS raw
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
    LIMIT 3
  `;
  for (const r of crSample) {
    console.log(`\n  erpId=${r.erpId}`);
    const meta = r.raw as Record<string, unknown>;
    for (const k of Object.keys(meta)) {
      const v = meta[k];
      if (k === "raw") {
        console.log(`    raw (MOVIMIENTOS fields):`);
        const rawObj = v as Record<string, unknown>;
        for (const rk of Object.keys(rawObj)) {
          const rv = rawObj[rk];
          if (rv !== null && rv !== undefined) {
            console.log(`      ${rk.padEnd(30)} = ${String(rv).slice(0, 80)}`);
          }
        }
      } else {
        console.log(`    ${k.padEnd(30)} = ${String(v ?? "").slice(0, 80)}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
