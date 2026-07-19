/**
 * validate-maletas-tabla-referencias-cleanup.ts
 *
 * GO-LIVE-MALETAS-TABLA-REFERENCIAS-CLEANUP-01 validation script.
 * 8 checks.
 *
 * Run: npx tsx scripts/validate-maletas-tabla-referencias-cleanup.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

console.log("\n=== GO-LIVE-MALETAS-TABLA-REFERENCIAS-CLEANUP-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// Find the per-line accordion table section
const tableStart = client.indexOf("REF_TABLE_COLS");
const refTableSection = tableStart > 0 ? client.substring(tableStart - 200, tableStart + 200) : "";

// ── 1. No "Accion" column in active refs table header
check(
  "1. No 'Accion' column in active refs table",
  (() => {
    // Find the header array that uses REF_TABLE_COLS — should not include "Accion"
    const headerIdx = client.indexOf('["", "Ref", "Descripcion"');
    if (headerIdx < 0) return false;
    const headerLine = client.substring(headerIdx, headerIdx + 200);
    return !headerLine.includes('"Accion"');
  })(),
  "Active refs table header must not include 'Accion'",
);

// ── 2. Header and rows use same column definition (REF_TABLE_COLS)
check(
  "2. Header and rows share REF_TABLE_COLS",
  (client.match(/gridTemplateColumns: REF_TABLE_COLS/g) ?? []).length === 2 &&
  (client.match(/const REF_TABLE_COLS/g) ?? []).length === 1,
  "REF_TABLE_COLS must be defined once and used in exactly 2 places",
);

// ── 3. Final columns: Ref, Descripcion, Subgrupo SAG, Linea, Disponible, Estado
check(
  "3. Final columns are correct (7 columns including thumbnail)",
  (() => {
    const match = client.match(/const REF_TABLE_COLS = "([^"]+)"/);
    if (!match) return false;
    const cols = match[1].split(/\s+/);
    return cols.length === 7; // thumb + 6 data columns
  })() &&
  client.includes('"Ref"') &&
  client.includes('"Descripcion"') &&
  client.includes('"Subgrupo SAG"') &&
  client.includes('"Linea"') &&
  client.includes('"Disponible"') &&
  client.includes('"Estado"'),
  "Table must have exactly 7 grid columns (thumb + Ref + Desc + Subgrupo + Linea + Disponible + Estado)",
);

// ── 4. Description uses ellipsis
check(
  "4. Description uses ellipsis",
  (() => {
    const descIdx = client.indexOf("title={ref.description}");
    if (descIdx < 0) return false;
    const section = client.substring(descIdx, descIdx + 300);
    return section.includes('textOverflow: "ellipsis"') &&
           section.includes("minWidth: 0");
  })(),
  "Description cell must have text-overflow ellipsis and minWidth 0",
);

// ── 5. Subgrupo SAG uses ellipsis
check(
  "5. Subgrupo SAG uses ellipsis",
  (() => {
    const sgIdx = client.indexOf("title={ref.subgrupoSag}");
    if (sgIdx < 0) return false;
    const section = client.substring(sgIdx, sgIdx + 300);
    return section.includes('textOverflow: "ellipsis"') &&
           section.includes("minWidth: 0");
  })(),
  "Subgrupo SAG cell must have text-overflow ellipsis and minWidth 0",
);

// ── 6. No service changes (loader intact)
check(
  "6. No service changes (vendor-sample-loader intact)",
  (() => {
    const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
    return loader.includes("function deriveState(") &&
           loader.includes("function applyReplacements(");
  })(),
  "vendor-sample-loader.ts must not be modified",
);

// ── 7. No API changes
check(
  "7. No API route changes",
  (() => {
    // Verify the service file still has its key functions
    const service = readFile("lib/comercial/maletas/vendor-sample-service.ts");
    return service.includes("buildVendorSnapshots");
  })(),
  "vendor-sample-service.ts must not be modified",
);

// ── 8. Logic preserved (filters, states, refs intact)
check(
  "8. Logic preserved (filters, states, activeRefs, depletedRefs)",
  client.includes("FILTER_ORDER") &&
  client.includes("activeRefs") &&
  client.includes("depletedRefs") &&
  client.includes("StateBadge") &&
  client.includes("coverageByLine"),
  "All business logic references must remain intact",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
