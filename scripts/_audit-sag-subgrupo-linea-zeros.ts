/**
 * _audit-sag-subgrupo-linea-zeros.ts
 *
 * Forensic: query SAG directly to determine how many commercial articles
 * have ka_ni_subgrupo=0/null/empty and ka_nl_linea=0/null/empty.
 *
 * This disambiguates between:
 *   A) Genuinely null in SAG source → cannot fix
 *   B) Zero FK (0) lost by parseInt(x) || null bug → can fix
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_audit-sag-subgrupo-linea-zeros.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpoint = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl: endpoint, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  SAG SUBGRUPO/LINEA ZERO-vs-NULL FORENSICS"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  // Query 1: Distribution of ka_ni_subgrupo values (null, 0, >0) for commercial articles
  const subgrupoQuery = `
    SELECT
      CASE
        WHEN ka_ni_subgrupo IS NULL THEN 'NULL'
        WHEN ka_ni_subgrupo = 0 THEN 'ZERO'
        ELSE 'POSITIVE'
      END AS bucket,
      COUNT(*) AS cnt
    FROM ARTICULOS
    WHERE sc_activo = 'S'
      AND sc_bloqueado = 'N'
      AND n_valor_venta_normal > 0
      AND sc_maneja_kardex = 'S'
    GROUP BY
      CASE
        WHEN ka_ni_subgrupo IS NULL THEN 'NULL'
        WHEN ka_ni_subgrupo = 0 THEN 'ZERO'
        ELSE 'POSITIVE'
      END
  `;

  console.log("  Querying SAG: ka_ni_subgrupo distribution (commercial articles)...");
  try {
    const subgrupoRows = await consultaSagJson(config, subgrupoQuery);
    console.log("");
    console.log(B("  ka_ni_subgrupo distribution:"));
    for (const row of subgrupoRows) {
      const r = row as any;
      const bucket = String(r.bucket ?? r.BUCKET ?? Object.values(r)[0]);
      const cnt = String(r.cnt ?? r.CNT ?? Object.values(r)[1]);
      console.log(`    ${bucket.padEnd(12)} ${cnt}`);
    }
  } catch (e) {
    console.error(R(`  SUBGRUPO query failed: ${(e as Error).message}`));
    // Fallback: simpler query
    console.log("  Trying fallback approach...");
    const fallback = await consultaSagJson(config,
      `SELECT ka_ni_subgrupo, COUNT(*) as cnt
       FROM ARTICULOS
       WHERE sc_activo = 'S' AND sc_bloqueado = 'N' AND n_valor_venta_normal > 0 AND sc_maneja_kardex = 'S'
       GROUP BY ka_ni_subgrupo
       ORDER BY cnt DESC`
    );
    console.log("");
    console.log(B("  ka_ni_subgrupo value distribution (top 20):"));
    for (const row of (fallback as any[]).slice(0, 20)) {
      const vals = Object.values(row);
      console.log(`    subgrupo=${String(vals[0]).padEnd(8)} count=${vals[1]}`);
    }
    // Count nulls and zeros explicitly
    let nullCount = 0, zeroCount = 0, positiveCount = 0;
    for (const row of fallback as any[]) {
      const v = Object.values(row)[0];
      const c = Number(Object.values(row)[1]);
      if (v == null || v === "") nullCount += c;
      else if (Number(v) === 0) zeroCount += c;
      else positiveCount += c;
    }
    console.log("");
    console.log(`  Summary: NULL=${nullCount} ZERO=${zeroCount} POSITIVE=${positiveCount}`);
  }

  // Query 2: Distribution of ka_nl_linea values
  console.log("");
  console.log("  Querying SAG: ka_nl_linea distribution (commercial articles)...");
  try {
    const lineaRows = await consultaSagJson(config,
      `SELECT ka_nl_linea, COUNT(*) as cnt
       FROM ARTICULOS
       WHERE sc_activo = 'S' AND sc_bloqueado = 'N' AND n_valor_venta_normal > 0 AND sc_maneja_kardex = 'S'
       GROUP BY ka_nl_linea
       ORDER BY cnt DESC`
    );
    console.log("");
    console.log(B("  ka_nl_linea value distribution:"));
    let lineaNull = 0, lineaZero = 0, lineaPositive = 0;
    for (const row of lineaRows as any[]) {
      const vals = Object.values(row);
      const v = vals[0];
      const c = Number(vals[1]);
      const label = v == null || v === "" ? "NULL" : String(v);
      console.log(`    linea=${label.padEnd(8)} count=${c}`);
      if (v == null || v === "") lineaNull += c;
      else if (Number(v) === 0) lineaZero += c;
      else lineaPositive += c;
    }
    console.log("");
    console.log(`  Summary: NULL=${lineaNull} ZERO=${lineaZero} POSITIVE=${lineaPositive}`);
  } catch (e) {
    console.error(R(`  LINEA query failed: ${(e as Error).message}`));
  }

  // Query 3: Sample articles with ka_ni_subgrupo=0 (if any)
  console.log("");
  console.log("  Querying SAG: sample articles with ka_ni_subgrupo=0...");
  try {
    const zeroSub = await consultaSagJson(config,
      `SELECT TOP 5 k_sc_codigo_articulo, sc_detalle_articulo, ka_ni_subgrupo, ka_ni_grupo, ka_nl_linea
       FROM ARTICULOS
       WHERE sc_activo = 'S' AND sc_bloqueado = 'N' AND n_valor_venta_normal > 0 AND sc_maneja_kardex = 'S'
         AND ka_ni_subgrupo = 0`
    );
    if ((zeroSub as any[]).length > 0) {
      console.log(Y(`  Found ${(zeroSub as any[]).length} articles with subgrupo=0:`));
      for (const r of zeroSub as any[]) {
        const vals = Object.values(r);
        console.log(`    code=${vals[0]} desc="${vals[1]}" subgrupo=${vals[2]} grupo=${vals[3]} linea=${vals[4]}`);
      }
    } else {
      console.log(G("  No articles with subgrupo=0 found."));
    }
  } catch (e) {
    console.error(R(`  Zero subgrupo query failed: ${(e as Error).message}`));
  }

  // Query 4: Sample articles with ka_nl_linea=0 or NULL
  console.log("");
  console.log("  Querying SAG: sample articles with ka_nl_linea=0 or NULL...");
  try {
    const zeroLinea = await consultaSagJson(config,
      `SELECT TOP 5 k_sc_codigo_articulo, sc_detalle_articulo, ka_ni_subgrupo, ka_ni_grupo, ka_nl_linea
       FROM ARTICULOS
       WHERE sc_activo = 'S' AND sc_bloqueado = 'N' AND n_valor_venta_normal > 0 AND sc_maneja_kardex = 'S'
         AND (ka_nl_linea = 0 OR ka_nl_linea IS NULL)`
    );
    if ((zeroLinea as any[]).length > 0) {
      console.log(Y(`  Found ${(zeroLinea as any[]).length} articles with linea=0/NULL:`));
      for (const r of zeroLinea as any[]) {
        const vals = Object.values(r);
        console.log(`    code=${vals[0]} desc="${vals[1]}" subgrupo=${vals[2]} grupo=${vals[3]} linea=${vals[4]}`);
      }
    } else {
      console.log(G("  No articles with linea=0/NULL found."));
    }
  } catch (e) {
    console.error(R(`  Zero linea query failed: ${(e as Error).message}`));
  }

  // Query 5: Sample articles with ka_ni_subgrupo IS NULL (truly null, not zero)
  console.log("");
  console.log("  Querying SAG: sample articles with ka_ni_subgrupo IS NULL...");
  try {
    const nullSub = await consultaSagJson(config,
      `SELECT TOP 5 k_sc_codigo_articulo, sc_detalle_articulo, ka_ni_subgrupo, ka_ni_grupo, ka_nl_linea
       FROM ARTICULOS
       WHERE sc_activo = 'S' AND sc_bloqueado = 'N' AND n_valor_venta_normal > 0 AND sc_maneja_kardex = 'S'
         AND ka_ni_subgrupo IS NULL`
    );
    if ((nullSub as any[]).length > 0) {
      console.log(Y(`  Found ${(nullSub as any[]).length} articles with subgrupo=NULL:`));
      for (const r of nullSub as any[]) {
        const vals = Object.values(r);
        console.log(`    code=${vals[0]} desc="${vals[1]}" subgrupo=${vals[2]} grupo=${vals[3]} linea=${vals[4]}`);
      }
    } else {
      console.log(G("  No articles with subgrupo=NULL found."));
    }
  } catch (e) {
    console.error(R(`  Null subgrupo query failed: ${(e as Error).message}`));
  }

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FORENSICS COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
