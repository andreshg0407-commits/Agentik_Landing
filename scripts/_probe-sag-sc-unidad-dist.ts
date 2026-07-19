/**
 * sc_unidad distribution from v_articulos, cross-referenced with ARTICULOS.ka_nl_linea
 * Usage: npx tsx --env-file=.env scripts/_probe-sag-sc-unidad-dist.ts
 */
async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";
  if (!token) { console.error("FATAL: PYA_SOAP_TOKEN required"); process.exit(1); }
  const config = { token, endpointUrl, database };
  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  // Fetch both sources
  console.log("Fetching ARTICULOS...");
  const artRows = await consultaSagJson(config as any, "SELECT * FROM ARTICULOS");
  console.log(`ARTICULOS: ${artRows.length} rows`);

  console.log("Fetching v_articulos...");
  const vRows = await consultaSagJson(config as any, "SELECT * FROM v_articulos");
  console.log(`v_articulos: ${vRows.length} rows\n`);

  // Build map: codigo → ka_nl_linea from ARTICULOS
  const lineMap = new Map<string, string>();
  for (const r of artRows) {
    const code = String((r as any).k_sc_codigo_articulo ?? "").toUpperCase().trim();
    if (code) lineMap.set(code, String((r as any).ka_nl_linea ?? "NULL"));
  }

  // Build map: codigo → sc_unidad from v_articulos
  const unidadMap = new Map<string, string>();
  for (const r of vRows) {
    const code = String((r as any).k_sc_codigo_articulo ?? "").toUpperCase().trim();
    if (code) unidadMap.set(code, String((r as any).sc_unidad ?? "").trim());
  }

  // Cross-reference: Import articles (line=5) + sc_unidad
  const importCodes = [...lineMap.entries()].filter(([_, line]) => line === "5").map(([code]) => code);
  console.log(`Import articles (line=5): ${importCodes.length}\n`);

  const dist: Record<string, number> = {};
  let noUnidad = 0;
  for (const code of importCodes) {
    const unidad = unidadMap.get(code) ?? "";
    if (!unidad) {
      noUnidad++;
      continue;
    }
    dist[unidad] = (dist[unidad] || 0) + 1;
  }

  console.log("=== sc_unidad DISTRIBUTION for Import (line=5) ===\n");
  for (const [val, count] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${val}"${" ".repeat(Math.max(1, 25 - val.length))}→ ${count}`);
  }
  console.log(`  (no sc_unidad)${" ".repeat(14)}→ ${noUnidad}`);
  console.log(`\n  TOTAL: ${importCodes.length}`);

  // Also show overall distribution
  console.log("\n=== sc_unidad DISTRIBUTION (ALL articles) ===\n");
  const allDist: Record<string, number> = {};
  for (const [_, unidad] of unidadMap) {
    const val = unidad || "(empty)";
    allDist[val] = (allDist[val] || 0) + 1;
  }
  for (const [val, count] of Object.entries(allDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${val}"${" ".repeat(Math.max(1, 25 - val.length))}→ ${count}`);
  }
}

main().catch(e => { console.error(`FATAL: ${(e as Error).message}`); process.exit(1); });
