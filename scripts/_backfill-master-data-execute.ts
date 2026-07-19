/**
 * _backfill-master-data-execute.ts
 *
 * COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01 — Fase 7 Execute
 *
 * Runs syncSagArticlesToProductEntity() in WRITE mode to persist
 * all new master data fields (grupoSag, lineaSag, costo, dates, etc.)
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_backfill-master-data-execute.ts
 */

// Patch server-only before any imports that might trigger it
const mockServerOnly = require("./_mock-server-only.cjs");

import { syncSagArticlesToProductEntity } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

const ORG = "cmmpwstuf000dp5y58kj1daaj";

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
  console.log(B("  FASE 7 — EXECUTE: Master Data Backfill"));
  console.log(B("  MODE: WRITE (persisting to ProductEntity)"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const t0 = Date.now();

  const result = await syncSagArticlesToProductEntity(ORG, config, {
    dryRun: false,
    activeOnly: false,
  });

  const elapsed = Date.now() - t0;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  BACKFILL RESULT"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  Status:        ${result.status === "success" ? G(result.status) : result.status === "partial" ? Y(result.status) : R(result.status)}`);
  console.log(`  Total rows:    ${B(String(result.totalRows))}`);
  console.log(`  Valid rows:    ${G(String(result.validRows))}`);
  console.log(`  Invalid rows:  ${result.invalidRows > 0 ? Y(String(result.invalidRows)) : G("0")}`);
  console.log(`  Excluded:      ${String(result.excluded)} (non-commercial)`);
  console.log(`  Created:       ${result.created > 0 ? G(String(result.created)) : "0"}`);
  console.log(`  Updated:       ${result.updated > 0 ? G(String(result.updated)) : "0"}`);
  console.log(`  Skipped:       ${String(result.skipped)}`);
  console.log(`  Duration:      ${B(String(elapsed))}ms (${Math.round(elapsed / 1000)}s)`);
  console.log(`  Dry run:       ${result.dryRun ? Y("YES") : G("NO — data was written")}`);
  console.log("");

  if (result.validationErrors.length > 0) {
    console.log(Y("  VALIDATION ERRORS:"));
    for (const e of result.validationErrors.slice(0, 10)) {
      console.log(`    Row ${e.rowIndex}: ${e.codigo ?? "?"} — ${e.reason}`);
    }
    console.log("");
  }

  if (result.error) {
    console.log(R(`  ERROR: ${result.error}`));
    console.log("");
  }

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  BACKFILL COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  console.error((e as Error).stack);
  process.exit(1);
});
