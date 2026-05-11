/**
 * _discover-fuentes.ts
 *
 * Sprint TA-04 — Phase D: FUENTES Discovery Script.
 *
 * Queries the SAG FUENTES table for any PYA company and prints the
 * normalised fuentesMap JSON ready to be stored in connector.config.fuentesMap.
 *
 * This script wraps lib/activation/fuentes-discovery.ts.
 * It does NOT write to the DB — it only reads from SAG FUENTES.
 *
 * Required env vars (pick one set):
 *
 *   Castillitos (default):
 *     PYA_SOAP_TOKEN, PYA_SAG_BD
 *
 *   Jupiter Pets or another company:
 *     DISCOVER_PYA_TOKEN    — SAG token for the target company
 *     DISCOVER_PYA_DATABASE — target company database name
 *     DISCOVER_PYA_ENDPOINT — (optional) SOAP endpoint
 *
 * Usage:
 *   # Discover for Castillitos (default env vars):
 *   npx dotenv-cli -e .env -- npx tsx scripts/_discover-fuentes.ts
 *
 *   # Discover for Jupiter Pets:
 *   DISCOVER_PYA_TOKEN=<token> DISCOVER_PYA_DATABASE=<db> \
 *   npx dotenv-cli -e .env -- npx tsx scripts/_discover-fuentes.ts
 *
 *   # Save output for use in provisioning:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_discover-fuentes.ts \
 *     > fuentes-jupiter.json
 *   JUPITER_FUENTES_JSON_PATH=fuentes-jupiter.json \
 *     npx dotenv-cli -e .env -- npx tsx scripts/_create-jupiter-connector.ts
 */

import { discoverFuentesMap } from "@/lib/activation/fuentes-discovery";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

async function main() {
  // Prefer DISCOVER_* vars (company-specific) then fall back to defaults
  const token    = (process.env.DISCOVER_PYA_TOKEN    ?? process.env.PYA_SOAP_TOKEN    ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.DISCOVER_PYA_DATABASE ?? process.env.PYA_SAG_BD        ?? "").trim() || undefined;
  const endpoint =  process.env.DISCOVER_PYA_ENDPOINT?.trim();

  const jsonMode = process.argv.includes("--json");

  if (!jsonMode) {
    console.error(B("\n═══════════════════════════════════════════════════"));
    console.error(B("  TA-04 — FUENTES Discovery                       "));
    console.error(B("═══════════════════════════════════════════════════\n"));
    console.error(C(`  Token:    ${token ? `[SET — ${token.length} chars]` : "MISSING"}`));
    console.error(C(`  Database: ${database ?? "(not set)"}`));
    console.error(C(`  Endpoint: ${endpoint ?? "(default)"}`));
    console.error("");
  }

  if (!token) {
    if (!jsonMode) console.error(R("  ✗ Token is required. Set DISCOVER_PYA_TOKEN or PYA_SOAP_TOKEN."));
    process.exit(1);
  }

  const result = await discoverFuentesMap({ token, database, endpointUrl: endpoint });

  if (jsonMode) {
    // Pure JSON output for piping into files or other scripts
    // Output the fuentesMap as a Record<string,string> (JSON-safe keys)
    const jsonOut = Object.fromEntries(
      Object.entries(result.fuentesMap).map(([k, v]) => [k, v])
    );
    process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");
    return;
  }

  // ── Human-readable report ─────────────────────────────────────────────────

  if (!result.ok) {
    console.error(R("  ✗ Discovery failed:"));
    for (const e of result.errors) console.error(R(`      ${e}`));
    for (const w of result.warnings) console.error(Y(`      ⚠ ${w}`));
    process.exit(1);
  }

  console.error(G(`  ✓ Discovered ${result.rows.length} FUENTES rows\n`));

  // Summary table
  console.error(B("  ── Summary ─────────────────────────────────────────────────────────────"));
  console.error(`  Total FUENTES:   ${result.summary.total}`);
  console.error(`  AR codes (C):    ${result.summary.arCodes.join(", ") || "(none)"}`);
  console.error(`  AP codes (P):    ${result.summary.apCodes.join(", ") || "(none)"}`);
  console.error(`  Order codes (4): ${result.summary.orderCodes.join(", ") || "(none)"}`);

  if (result.warnings.length > 0) {
    console.error("\n  Warnings:");
    for (const w of result.warnings) console.error(Y(`    ⚠ ${w}`));
  }

  console.error(B("\n  ── fuentesMap (JSON — store in connector.config.fuentesMap) ────────────\n"));

  // Print fuentesMap as JSON to stdout (can be redirected to file)
  const jsonOut = Object.fromEntries(
    Object.entries(result.fuentesMap).map(([k, v]) => [k, v])
  );
  process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");

  console.error(B("\n  ── Row detail ──────────────────────────────────────────────────────────"));
  console.error("  kaNiFuente  │ codigo │ cobrar │ clase │ descripcion");
  console.error("  ──────────────────────────────────────────────────────────────────────");

  for (const row of result.rows) {
    const clase = row.claseFuente !== undefined ? String(row.claseFuente).padEnd(5) : "     ";
    const desc  = (row.descripcion ?? "").slice(0, 40);
    const line  = [
      String(row.kaNiFuente).padStart(11),
      row.codigoFuente.padEnd(7),
      (row.cobrarPagar ?? "?").padEnd(7),
      clase,
      desc,
    ].join(" │ ");
    console.error(`  ${line}`);
  }

  console.error(C("\n  To store: copy the JSON above into JUPITER_FUENTES_JSON_PATH or pass\n  fuentesMap directly to provisionConnector({ fuentesMap }).\n"));
}

main().catch(e => { console.error(e); process.exit(1); });
