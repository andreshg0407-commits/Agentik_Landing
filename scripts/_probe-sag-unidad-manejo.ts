/**
 * _probe-sag-unidad-manejo.ts
 *
 * Discovers where "Unidad de manejo" (PEQUEÑO/MEDIANO/GRANDE) lives in SAG.
 *
 * Hypothesis 1: UNIDADES_MEDIDA lookup table → ka_ni_tipo_unidad FK
 * Hypothesis 2: A separate view or custom field not in ARTICULOS
 * Hypothesis 3: Castillitos uses a custom table
 *
 * Usage: npx tsx --env-file=.env scripts/_probe-sag-unidad-manejo.ts
 */

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) { console.error("FATAL: PYA_SOAP_TOKEN required"); process.exit(1); }
  const config = { token, endpointUrl, database };

  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  // ── 1. Query UNIDADES_MEDIDA lookup ──────────────────────────────────────
  console.log("\n=== 1. UNIDADES_MEDIDA lookup ===\n");
  try {
    const rows = await consultaSagJson(config as any, "SELECT * FROM UNIDADES_MEDIDA");
    console.log(`Rows: ${rows.length}`);
    if (rows.length > 0) {
      console.log(`Fields: ${Object.keys(rows[0]).join(", ")}`);
      console.log("\nAll entries:");
      for (const r of rows) {
        const keys = Object.keys(r);
        const vals = keys.map(k => `${k}=${r[k] ?? "NULL"}`).join(" | ");
        console.log(`  ${vals}`);
      }
    }
  } catch (e) {
    console.log(`Failed: ${(e as Error).message}`);
  }

  // ── 2. Check if there's a separate UNIDADES table ──────────────────────
  console.log("\n=== 2. UNIDADES table (alternative) ===\n");
  try {
    const rows = await consultaSagJson(config as any, "SELECT * FROM UNIDADES");
    console.log(`Rows: ${rows.length}`);
    if (rows.length > 0) {
      console.log(`Fields: ${Object.keys(rows[0]).join(", ")}`);
      for (const r of rows.slice(0, 20)) {
        const keys = Object.keys(r);
        const vals = keys.map(k => `${k}=${r[k] ?? "NULL"}`).join(" | ");
        console.log(`  ${vals}`);
      }
    }
  } catch (e) {
    console.log(`Failed: ${(e as Error).message}`);
  }

  // ── 3. Check v_articulos view for handling unit fields ─────────────────
  console.log("\n=== 3. v_articulos view (first row field list) ===\n");
  try {
    const rows = await consultaSagJson(config as any, "SELECT * FROM v_articulos");
    console.log(`Rows: ${rows.length}`);
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]).sort();
      console.log(`Fields (${keys.length}):`);
      const matches = keys.filter(k =>
        /unidad|manejo|handling|tamano|tamaño|size|pequeno|mediano|grande/i.test(k)
      );
      if (matches.length > 0) {
        console.log("\n★ MATCHING FIELDS:");
        for (const k of matches) {
          console.log(`  ${k} = ${rows[0][k]}`);
        }
      } else {
        console.log("\nNo matching fields for unidad/manejo/handling/size.");
        // Show all fields
        for (const k of keys) {
          console.log(`  ${k}`);
        }
      }

      // Find C6-838-1 in v_articulos
      const target = rows.find((r: any) =>
        String(r.k_sc_codigo_articulo ?? "").toUpperCase() === "C6-838-1"
      );
      if (target) {
        console.log("\n★ C6-838-1 in v_articulos:");
        const tkeys = Object.keys(target).sort();
        const tmatches = tkeys.filter(k =>
          /unidad|manejo|handling|tamano|tamaño|size|tipo_unidad/i.test(k)
        );
        for (const k of tmatches.length > 0 ? tmatches : tkeys) {
          console.log(`  ${k} = ${target[k] ?? "NULL"}`);
        }
      }
    }
  } catch (e) {
    console.log(`Failed: ${(e as Error).message}`);
  }

  // ── 4. What ka_ni_tipo_unidad values exist for Import (line=5)? ────────
  console.log("\n=== 4. ka_ni_tipo_unidad distribution for Import articles ===\n");
  try {
    const rows = await consultaSagJson(config as any, "SELECT * FROM ARTICULOS");
    const importRows = rows.filter((r: any) => String(r.ka_nl_linea) === "5");
    console.log(`Import articles (ka_nl_linea=5): ${importRows.length}`);

    const dist: Record<string, number> = {};
    for (const r of importRows) {
      const val = String(r.ka_ni_tipo_unidad ?? "NULL");
      dist[val] = (dist[val] || 0) + 1;
    }
    console.log("\nka_ni_tipo_unidad distribution:");
    for (const [val, count] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${val.padEnd(10)} → ${count} articles`);
    }
  } catch (e) {
    console.log(`Failed: ${(e as Error).message}`);
  }

  console.log("\n=== Done. ===\n");
}

main().catch(e => { console.error(`FATAL: ${(e as Error).message}`); process.exit(1); });
