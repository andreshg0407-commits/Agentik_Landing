/**
 * Quick probe: all field names in v_articulos + their values for C6-838-1
 * Usage: npx tsx --env-file=.env scripts/_probe-sag-v-articulos-fields.ts
 */
async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";
  if (!token) { console.error("FATAL: PYA_SOAP_TOKEN required"); process.exit(1); }
  const config = { token, endpointUrl, database };
  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  const rows = await consultaSagJson(config as any, "SELECT * FROM v_articulos");
  console.log(`v_articulos: ${rows.length} rows, ${Object.keys(rows[0]).length} fields\n`);

  // Find C6-838-1
  const target = rows.find((r: any) =>
    String(r.k_sc_codigo_articulo ?? "").toUpperCase() === "C6-838-1"
  );

  if (target) {
    console.log("=== C6-838-1 ALL FIELDS ===\n");
    for (const [k, v] of Object.entries(target).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${k.padEnd(35)} = ${v ?? "NULL"}`);
    }
  }

  // Distribution of sc_unidad for Import (ka_nl_linea=5)
  console.log("\n=== sc_unidad distribution for Import (line=5) ===\n");
  const importRows = rows.filter((r: any) => String(r.ka_nl_linea) === "5");
  const dist: Record<string, number> = {};
  for (const r of importRows) {
    const val = String((r as any).sc_unidad ?? "NULL").trim();
    dist[val] = (dist[val] || 0) + 1;
  }
  for (const [val, count] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${val}".padEnd(20) → ${count}`);
    console.log(`  ${val.padEnd(20)} → ${count}`);
  }

  // Also check: does v_articulos have k_sc_codigo_articulo for joining?
  console.log("\n=== Join key check ===");
  console.log(`k_sc_codigo_articulo present: ${target ? "YES" : "NO"}`);
  console.log(`ka_nl_articulo present: ${"ka_nl_articulo" in (target ?? {}) ? "YES" : "NO"}`);
}

main().catch(e => { console.error(`FATAL: ${(e as Error).message}`); process.exit(1); });
