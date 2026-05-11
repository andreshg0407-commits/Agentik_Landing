/**
 * _create-jupiter-connector.ts
 *
 * Sprint TA-03 / TA-04 — Admin script to provision the Jupiter Pets SAG PYA connector.
 *
 * Reads ALL credentials from environment variables — never hardcodes secrets.
 * Safe to run multiple times — uses upsert semantics.
 * Delegates all provisioning logic to lib/activation/connector-provisioner.ts.
 *
 * Required env vars:
 *   JUPITER_ORG_SLUG          — org slug for Jupiter Pets (e.g. "jupiter-pets")
 *   JUPITER_PYA_TOKEN         — SAG PYA API token for Jupiter Pets company
 *   JUPITER_PYA_DATABASE      — SAG company database name (a_s_bd) for Jupiter Pets
 *
 * Optional env vars:
 *   JUPITER_PYA_ENDPOINT      — SOAP endpoint (defaults to shared PYA endpoint)
 *   JUPITER_FUENTES_JSON_PATH — path to a JSON file mapping kaNiFuente → codigoFuente
 *                               built from Jupiter's FUENTES.xlsx via discoverFuentesMap().
 *                               When absent: adapter falls back to Castillitos rules.
 *   SKIP_VALIDATION=true      — skip credentials validation step (use when already verified)
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_create-jupiter-connector.ts
 *
 * To also discover FUENTES automatically (recommended):
 *   1. Run scripts/_discover-fuentes.ts with JUPITER_* credentials
 *   2. Save output JSON to a file
 *   3. Set JUPITER_FUENTES_JSON_PATH=<path> and re-run this script
 */

import { prisma }            from "@/lib/prisma";
import { provisionConnector } from "@/lib/activation/connector-provisioner";
import * as fs               from "fs";
import * as path             from "path";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Env resolution ─────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) {
    console.error(R(`  ✗ Missing required env var: ${key}`));
    process.exit(1);
  }
  return v;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

const DEFAULT_PYA_ENDPOINT =
  process.env.PYA_SOAP_ENDPOINT?.trim() ??
  "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════"));
  console.log(B("  TA-03/04 — Create Jupiter Pets SAG PYA Connector "));
  console.log(B("═══════════════════════════════════════════════════\n"));

  const orgSlug     = requireEnv("JUPITER_ORG_SLUG");
  const pyaToken    = requireEnv("JUPITER_PYA_TOKEN");
  const pyaDatabase = requireEnv("JUPITER_PYA_DATABASE");
  const pyaEndpoint = optionalEnv("JUPITER_PYA_ENDPOINT") ?? DEFAULT_PYA_ENDPOINT;
  const skipVal     = optionalEnv("SKIP_VALIDATION") === "true";

  console.log(C(`  Org slug:    ${orgSlug}`));
  console.log(C(`  Database:    ${pyaDatabase}`));
  console.log(C(`  Endpoint:    ${pyaEndpoint}`));
  console.log(C(`  Token:       [SET — ${pyaToken.length} chars]`));
  console.log(C(`  Validation:  ${skipVal ? "SKIPPED (SKIP_VALIDATION=true)" : "enabled"}`));

  // ── Resolve org ────────────────────────────────────────────────────────────
  const org = await prisma.organization.findFirst({
    where:  { slug: orgSlug },
    select: { id: true, name: true },
  });

  if (!org) {
    console.error(R(`\n  ✗ Organization not found: slug="${orgSlug}"`));
    console.error(R("    Create the Jupiter Pets org row before running this script."));
    process.exit(1);
  }

  console.log(G(`\n  Found org: ${org.name} (${org.id})\n`));

  // ── Load fuentesMap (optional) ─────────────────────────────────────────────
  let fuentesMap: Record<number, string> | undefined;
  const fuentesJsonPath = optionalEnv("JUPITER_FUENTES_JSON_PATH");

  if (fuentesJsonPath) {
    const resolved = path.resolve(fuentesJsonPath);
    if (!fs.existsSync(resolved)) {
      console.error(R(`  ✗ JUPITER_FUENTES_JSON_PATH does not exist: ${resolved}`));
      process.exit(1);
    }
    try {
      const raw = JSON.parse(fs.readFileSync(resolved, "utf-8")) as Record<string, string>;
      fuentesMap = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [Number(k), v])
      );
      console.log(C(`  fuentesMap:  ${Object.keys(fuentesMap).length} entries loaded`));
    } catch (e) {
      console.error(R(`  ✗ Failed to parse FUENTES JSON: ${(e as Error).message}`));
      process.exit(1);
    }
  } else {
    console.log(Y("  fuentesMap:  ABSENT — adapter will fall back to Castillitos FUENTES rules"));
    console.log(Y("               Run scripts/_discover-fuentes.ts to build Jupiter's FUENTES map."));
  }

  // ── Provision via service ──────────────────────────────────────────────────
  console.log(B("\n  Running provisioning service...\n"));

  const result = await provisionConnector({
    organizationId: org.id,
    provider:       "sag_pya_soap",
    name:           "SAG PYA SOAP — Jupiter Pets",
    credentials: {
      token:       pyaToken,
      endpointUrl: pyaEndpoint,
      database:    pyaDatabase,
    },
    fuentesMap,
    skipValidation: skipVal,
  });

  // ── Print diagnostics ──────────────────────────────────────────────────────
  for (const d of result.diagnostics) {
    const icon = d.success ? G("  ✓") : R("  ✗");
    const msg  = d.message ? ` — ${d.message}` : "";
    console.log(`${icon} [${d.step}]${msg}`);
    for (const w of d.warnings) console.log(Y(`      ⚠ ${w}`));
    for (const r of d.recommendations) console.log(C(`      → ${r}`));
  }

  for (const w of result.warnings) console.log(Y(`\n  ⚠ ${w}`));
  for (const e of result.errors)   console.log(R(`\n  ✗ ${e}`));

  if (!result.ok) {
    console.error(R("\n  Provisioning failed. See diagnostics above.\n"));
    process.exit(1);
  }

  console.log(G(`\n  ✓ Connector ready: ${result.connectorId}`));
  console.log(B("\n  ── Next steps ──────────────────────────────────────────────────────────"));
  console.log(`  1. Test sync via:`);
  console.log(C(`       POST /api/orgs/${orgSlug}/connectors/${result.connectorId}/sync`));
  console.log(`       body: { "module": "customers" }`);
  console.log(`  2. Verify CustomerProfile rows have organizationId=${org.id}`);
  if (!fuentesMap) {
    console.log(`  3. Run scripts/_discover-fuentes.ts for Jupiter's FUENTES map`);
    console.log(`     then re-run with JUPITER_FUENTES_JSON_PATH=<path>`);
  }
  console.log(B("  ─────────────────────────────────────────────────────────────────────\n"));
  console.log(C("  Done.\n"));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
