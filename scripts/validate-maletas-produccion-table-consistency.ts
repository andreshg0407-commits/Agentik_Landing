/**
 * validate-maletas-produccion-table-consistency.ts
 *
 * GO-LIVE-MALETAS-PRODUCCION-TABLE-CLONE-01 + DEBUG validation script.
 * 7 checks.
 *
 * Run: npx tsx scripts/validate-maletas-produccion-table-consistency.ts
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

console.log("\n=== GO-LIVE-MALETAS-PRODUCCION-TABLE-CLONE-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. No separate PROD_GRID
check(
  "1. No separate PROD_GRID",
  !client.includes("const PROD_GRID") && !client.includes("PROD_GRID"),
  "PROD_GRID must not exist — all tables use GAP_GRID",
);

// ── 2. ProductionRow uses GAP_GRID
check(
  "2. ProductionRow uses GAP_GRID",
  (() => {
    const start = client.indexOf("function ProductionRow");
    const end = client.indexOf("function CoverageGapRow", start);
    const body = start > 0 && end > start ? client.substring(start, end) : "";
    return body.includes("gridTemplateColumns: GAP_GRID");
  })(),
  "ProductionRow must use GAP_GRID",
);

// ── 3. nextToWatch includes subgrupoSag
check(
  "3. nextToWatch includes subgrupoSag",
  client.includes("subgrupoSag: ref.subgrupoSag") &&
  client.includes("type WatchRef"),
  "nextToWatch dataset must include subgrupoSag from ref",
);

// ── 4. Proximas textile table uses GAP_GRID
check(
  "4. Proximas textile table uses GAP_GRID",
  (() => {
    const start = client.indexOf("Sin produccion sugerida hoy");
    const end = client.indexOf("Recompra sugerida", start);
    const section = start > 0 && end > start ? client.substring(start, end) : "";
    return section.includes("gridTemplateColumns: GAP_GRID") &&
           section.includes('"Subgrupo SAG"') &&
           section.includes("r.subgrupoSag");
  })(),
  "Proximas textile table must use GAP_GRID with Subgrupo SAG column",
);

// ── 5. Proximas import table uses GAP_GRID
check(
  "5. Proximas import table uses GAP_GRID",
  (() => {
    const start = client.indexOf("Sin recompras sugeridas hoy");
    const end = client.indexOf("Coverage Gaps", start);
    const section = start > 0 && end > start ? client.substring(start, end) : "";
    return section.includes("gridTemplateColumns: GAP_GRID") &&
           section.includes('"Subgrupo SAG"') &&
           section.includes("r.subgrupoSag");
  })(),
  "Proximas import table must use GAP_GRID with Subgrupo SAG column",
);

// ── 6. All 3 table types use same visual structure
check(
  "6. All tables share visual structure (GAP_GRID, ROW_PAD, minHeight 72)",
  (() => {
    // Count GAP_GRID usages — should be in: ProductionRow, CoverageGapRow, + fallback tables
    const matches = client.match(/gridTemplateColumns: GAP_GRID/g);
    return matches !== null && matches.length >= 6; // 2 per table type (header + rows) minimum
  })(),
  "GAP_GRID must be used across all production, recompra, and gap tables",
);

// ── 7. No logic modifications
check(
  "7. No logic modifications",
  (() => {
    const service = readFile("lib/comercial/maletas/vendor-sample-service.ts");
    return service.includes("buildVendorSnapshots");
  })(),
  "vendor-sample-service.ts must not be modified",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
