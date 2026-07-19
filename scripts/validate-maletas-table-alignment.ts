/**
 * validate-maletas-table-alignment.ts
 *
 * GO-LIVE-MALETAS-TABLAS-ALIGNMENT-01 validation script.
 * 8 checks.
 *
 * Run: npx tsx scripts/validate-maletas-table-alignment.ts
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

console.log("\n=== GO-LIVE-MALETAS-TABLAS-ALIGNMENT-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. Single definition of DRAWER_REF_GRID
check(
  "1. Single DRAWER_REF_GRID definition",
  (client.match(/const DRAWER_REF_GRID/g) ?? []).length === 1,
  "DRAWER_REF_GRID must be defined exactly once",
);

// ── 2. Header and rows both use DRAWER_REF_GRID
check(
  "2. Header and rows share DRAWER_REF_GRID",
  (client.match(/gridTemplateColumns: DRAWER_REF_GRID/g) ?? []).length === 2,
  "DRAWER_REF_GRID must be used in exactly 2 places (header + rows)",
);

// ── 3. Description uses ellipsis
check(
  "3. Description uses text-overflow ellipsis",
  (() => {
    // Find Description cell — it has title={ref.description}
    const descIdx = client.indexOf("title={ref.description}");
    if (descIdx < 0) return false;
    const descSection = client.substring(descIdx, descIdx + 300);
    return descSection.includes("textOverflow: \"ellipsis\"") &&
           descSection.includes("overflow: \"hidden\"") &&
           descSection.includes("whiteSpace: \"nowrap\"") &&
           descSection.includes("minWidth: 0");
  })(),
  "Description cell must have ellipsis + overflow hidden + minWidth 0 + tooltip",
);

// ── 4. Subgrupo does not invade Description (has minWidth: 0 and ellipsis)
check(
  "4. Subgrupo isolated from Description (minWidth 0 + ellipsis)",
  (() => {
    const sgIdx = client.indexOf("title={ref.subgrupoSag}");
    if (sgIdx < 0) return false;
    const sgSection = client.substring(sgIdx, sgIdx + 300);
    return sgSection.includes("minWidth: 0") &&
           sgSection.includes("textOverflow: \"ellipsis\"") &&
           sgSection.includes("overflow: \"hidden\"");
  })(),
  "Subgrupo cell must have minWidth 0 + ellipsis + overflow hidden",
);

// ── 5. Estado has fixed width in grid
check(
  "5. Estado column has fixed width in grid definition",
  (() => {
    // DRAWER_REF_GRID should have a fixed px value for Estado (7th column)
    const match = client.match(/const DRAWER_REF_GRID = "([^"]+)"/);
    if (!match) return false;
    const cols = match[1].split(/\s+/);
    // 8 columns: Thumb Ref Desc Subgrupo Line Disponible Estado Accion
    return cols.length === 8 && cols[6].includes("px");
  })(),
  "Estado column (7th) must have fixed px width",
);

// ── 6. Accion has fixed width in grid
check(
  "6. Accion column has fixed width in grid definition",
  (() => {
    const match = client.match(/const DRAWER_REF_GRID = "([^"]+)"/);
    if (!match) return false;
    const cols = match[1].split(/\s+/);
    return cols.length === 8 && cols[7].includes("px");
  })(),
  "Accion column (8th) must have fixed px width",
);

// ── 7. No functional changes (motors, states, filters intact)
check(
  "7. No functional changes — motors and states intact",
  client.includes("FILTER_ORDER") &&
  client.includes("FILTER_LABEL") &&
  client.includes("StateBadge") &&
  client.includes("supplyAction"),
  "Filters, state badges, and supply actions must remain unchanged",
);

// ── 8. Description uses minmax (flexible but bounded)
check(
  "8. Grid uses minmax for flexible columns",
  (() => {
    const match = client.match(/const DRAWER_REF_GRID = "([^"]+)"/);
    if (!match) return false;
    return match[1].includes("minmax(") && match[1].includes("1.4fr");
  })(),
  "Description must use minmax() for bounded flexibility",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
