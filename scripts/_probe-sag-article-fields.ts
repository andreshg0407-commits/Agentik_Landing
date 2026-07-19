/**
 * _probe-sag-article-fields.ts
 *
 * Probes a single SAG ARTICULO row to discover field names related to
 * "unidad de manejo" / handling unit.
 *
 * Usage: npx tsx --env-file=.env scripts/_probe-sag-article-fields.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const PROBE_CODIGO = process.env.PROBE_CODIGO ?? "C6-838-1";

async function main() {
  // SAG config
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error("FATAL: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required");
    process.exit(1);
  }

  const config = { token, endpointUrl, database };

  // Dynamic import to avoid server-only
  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  // 1. Fetch a single article
  console.log(`\n=== PROBE: SAG ARTICULO ${PROBE_CODIGO} ===\n`);
  // SAG uses internal field names — fetch all and find our target
  console.log("Fetching SELECT * FROM ARTICULOS...\n");
  const allRows = await consultaSagJson(config as any, "SELECT * FROM ARTICULOS");
  console.log(`Total rows returned: ${allRows.length}\n`);

  if (allRows.length === 0) {
    console.error("No rows returned from ARTICULOS.");
    process.exit(1);
  }

  // Show first row to understand structure
  console.log("=== FIRST ROW FIELD ANALYSIS ===\n");
  printFieldAnalysis(allRows[0], "first");

  // Find our target
  const target = allRows.find((r: any) => {
    const code = String(r.CODIGO ?? r.k_sc_codigo_articulo ?? "").toUpperCase().trim();
    return code === PROBE_CODIGO.toUpperCase();
  });

  if (target) {
    console.log(`\n=== FOUND ${PROBE_CODIGO} ===\n`);
    printFieldAnalysis(target, PROBE_CODIGO);
  } else {
    console.log(`\n${PROBE_CODIGO} NOT found. Showing 5 sample import-looking refs...\n`);
    // Show a few rows to help identify import articles
    for (const row of allRows.slice(0, 5)) {
      const code = String(row.CODIGO ?? row.k_sc_codigo_articulo ?? "?");
      console.log(`  ${code}`);
    }
  }

  // 2. Also check: what does the full catalog look like for Import (line=5)?
  // Find a few import refs from DB
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const importRefs = await (prisma as any).productEntity.findMany({
    where: { productLine: "5", externalSource: "sag" },
    select: { sku: true, name: true, handlingUnit: true },
    take: 5,
  });

  console.log("\n=== IMPORT PRODUCTS IN DB (first 5) ===\n");
  for (const p of importRefs) {
    console.log(`  ${(p.sku ?? "?").padEnd(18)} handlingUnit=${p.handlingUnit ?? "NULL"} ${p.name}`);
  }

  await prisma.$disconnect();
  pool.end();
  console.log("\n=== Done. ===\n");
}

function printFieldAnalysis(row: any, codigo: string) {
  const keys = Object.keys(row);
  console.log(`Total fields in row: ${keys.length}\n`);

  // Print ALL keys and values
  console.log("── ALL FIELDS ──────────────────────────────────────────");
  for (const key of keys.sort()) {
    const val = row[key];
    const display = val === null || val === undefined ? "NULL" : String(val).slice(0, 80);
    console.log(`  ${key.padEnd(40)} = ${display}`);
  }

  // Filter for relevant keys
  console.log("\n── FIELDS MATCHING: unidad, manejo, und, handling, size, tamano ──");
  const patterns = [/unidad/i, /manejo/i, /und/i, /handling/i, /size/i, /tamano/i, /tamaño/i];
  let found = 0;
  for (const key of keys) {
    if (patterns.some(p => p.test(key))) {
      found++;
      const val = row[key];
      console.log(`  ★ ${key.padEnd(40)} = ${val === null || val === undefined ? "NULL" : String(val)}`);
    }
  }
  if (found === 0) {
    console.log("  (none found)");
  }
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
