/**
 * sag-probe-duedate2.ts
 *
 * Round 2: probe FORMAS_PAGO and TERCEROS field list for credit terms.
 * Also checks MOVIMIENTOS for any date field we might have missed by
 * pulling a wider sample.
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

  function printRows(rows: Record<string, unknown>[], maxRows = 5) {
    if (rows.length === 0) { console.log("  (no rows)"); return; }
    const keys = Object.keys(rows[0]);
    console.log(`  Fields (${keys.length}): ${keys.slice(0, 30).join(", ")}${keys.length > 30 ? " ..." : ""}\n`);
    for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
      const row = rows[i];
      console.log(`  --- Row ${i + 1} ---`);
      for (const k of keys) {
        const v = row[k];
        if (v !== null && v !== undefined && String(v).trim() !== "" && String(v) !== "0") {
          console.log(`    ${k.padEnd(30)} = ${String(v).slice(0, 80)}`);
        }
      }
    }
  }

  // ── 1. FORMAS_PAGO ──────────────────────────────────────────────────────────
  section("1. FORMAS_PAGO — payment methods with credit terms");
  try {
    const rows = await consultaSagJson(apiConfig, "SELECT * FROM FORMAS_PAGO") as Record<string, unknown>[];
    printRows(rows, 10);
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 2. TERCEROS — full field list (one row) ─────────────────────────────────
  section("2. TERCEROS — full field list (TOP 1)");
  try {
    const rows = await consultaSagJson(apiConfig, "SELECT TOP 1 * FROM TERCEROS") as Record<string, unknown>[];
    if (rows.length > 0) {
      const row = rows[0];
      const keys = Object.keys(row);
      console.log(`  All ${keys.length} TERCEROS fields:`);
      for (const k of keys) {
        const v = row[k];
        console.log(`    ${k.padEnd(35)} = ${v !== null && v !== undefined ? String(v).slice(0, 60) : "(null)"}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 3. MOVIMIENTOS — all date fields for 3 recent rows ─────────────────────
  section("3. MOVIMIENTOS — date fields only (TOP 3 recent)");
  try {
    const rows = await consultaSagJson(
      apiConfig,
      "SELECT TOP 3 * FROM MOVIMIENTOS WHERE sc_anulado = 'N' ORDER BY ka_nl_movimiento DESC"
    ) as Record<string, unknown>[];
    if (rows.length > 0) {
      const dateKeys = Object.keys(rows[0]).filter(k =>
        k.startsWith("d_") || k.startsWith("dd_") || k.startsWith("ddt_") || k.includes("fecha") || k.includes("date")
      );
      console.log(`  Date fields found (${dateKeys.length}): ${dateKeys.join(", ")}\n`);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        console.log(`  --- Row ${i + 1} (ka_nl_movimiento=${row.ka_nl_movimiento}) ---`);
        for (const k of dateKeys) {
          const v = row[k];
          if (v !== null && v !== undefined && String(v).trim() !== "") {
            console.log(`    ${k.padEnd(35)} = ${String(v)}`);
          }
        }
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 4. CustomerProfile rawErpJson — TERCEROS fields from our stored data ────
  section("4. CustomerProfile rawErpJson — TERCEROS fields (all, from stored sync)");
  const cpSample = await prisma.$queryRaw<{ raw: Record<string, unknown> }[]>`
    SELECT "rawErpJson"->'raw' AS raw
    FROM "CustomerProfile"
    WHERE "organizationId" = ${ORG_ID}
      AND "erpId" IS NOT NULL
      AND "rawErpJson" IS NOT NULL
      AND "rawErpJson" != '{}'
    LIMIT 1
  `;
  if (cpSample.length > 0) {
    const raw = cpSample[0].raw as Record<string, unknown>;
    const keys = Object.keys(raw);
    console.log(`  TERCEROS has ${keys.length} fields in rawErpJson:`);
    for (const k of keys) {
      const v = raw[k];
      console.log(`    ${k.padEnd(35)} = ${v !== null && v !== undefined ? String(v).slice(0, 60) : "(null)"}`);
    }
    // Specifically look for credit/payment fields
    const creditFields = keys.filter(k =>
      k.includes("credito") || k.includes("dias") || k.includes("plazo") ||
      k.includes("pago") || k.includes("vencim") || k.includes("cuota")
    );
    console.log(`\n  Credit/payment related fields: ${creditFields.length > 0 ? creditFields.join(", ") : "(none found)"}`);
  } else {
    console.log("  No CustomerProfile with rawErpJson found");
  }

  // ── 5. FUENTES for ka_ni_fuente=6 (the dominant fuente in receivables) ──────
  section("5. FUENTES — fuente 6 full details");
  try {
    const rows = await consultaSagJson(apiConfig, "SELECT * FROM FUENTES WHERE ka_ni_fuente = 6") as Record<string, unknown>[];
    if (rows.length > 0) {
      const row = rows[0];
      const paymentFields = Object.keys(row).filter(k =>
        k.includes("forma") || k.includes("pago") || k.includes("plazo") || k.includes("dias") ||
        k.includes("credito") || k.includes("vencim") || k.includes("cuota") || k.includes("mp")
      );
      console.log(`  Payment-related fields on fuente 6:`);
      for (const k of paymentFields) {
        console.log(`    ${k.padEnd(35)} = ${String(row[k] ?? "(null)")}`);
      }
      console.log(`\n  fuente name: ${row.sc_nombre_fuente}`);
      console.log(`  ka_ni_forma_pago_fte: ${row.ka_ni_forma_pago_fte}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ── 6. Distribution of ka_ni_fuente in CustomerReceivable ──────────────────
  section("6. Fuente distribution in CustomerReceivable (from stored data)");
  const fuenteDist = await prisma.$queryRaw<{ fuente: string; cnt: bigint }[]>`
    SELECT
      "rawErpJson"->'raw'->>'ka_ni_fuente' AS fuente,
      COUNT(*) AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
    GROUP BY fuente
    ORDER BY cnt DESC
    LIMIT 10
  `;
  for (const f of fuenteDist) {
    console.log(`  fuente=${f.fuente}  →  ${f.cnt} rows`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
