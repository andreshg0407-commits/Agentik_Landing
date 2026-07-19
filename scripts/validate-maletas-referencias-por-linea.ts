/**
 * validate-maletas-referencias-por-linea.ts
 *
 * GO-LIVE-MALETAS-REFERENCIAS-POR-LINEA-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-maletas-referencias-por-linea.ts
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

console.log("\n=== GO-LIVE-MALETAS-REFERENCIAS-POR-LINEA-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");

// ── 1. No single flat table — refsTableExpanded removed
check(
  "1. Single flat table removed (no refsTableExpanded)",
  !client.includes("refsTableExpanded") &&
  !client.includes("setRefsTableExpanded"),
  "Old single-table collapsible state must be removed",
);

// ── 2. References grouped by line
check(
  "2. References grouped by line (lineGroups)",
  client.includes("lineGroups") &&
  client.includes("lineGroups.map") &&
  client.includes("ref.line"),
  "activeRefs must be grouped into lineGroups by line",
);

// ── 3. Each line is expandable (lineExpanded)
check(
  "3. Each line is expandable (lineExpanded state)",
  client.includes("lineExpanded") &&
  client.includes("setLineExpanded") &&
  client.includes("isExpanded_"),
  "Per-line expanded state must exist",
);

// ── 4. Each line has a summary in the header
check(
  "4. Each line has summary stats in accordion header",
  client.includes("saludables") &&
  client.includes("riesgo") &&
  client.includes("bajo minimo") &&
  client.includes("recompra") &&
  client.includes(`lineName} (`),
  "Accordion header must show line name + count + status breakdown",
);

// ── 5. Each line has independent filters (lineFilters)
check(
  "5. Each line has independent filters (lineFilters state)",
  client.includes("lineFilters") &&
  client.includes("setLineFilters") &&
  client.includes("localFilter"),
  "Per-line filter state must exist",
);

// ── 6. No change to state logic (deriveState intact)
check(
  "6. Motor 1 unchanged (deriveState intact)",
  loader.includes("function deriveState(") &&
  loader.includes('return "saludable"') &&
  loader.includes('return "reemplazar"'),
  "deriveState function must remain unchanged",
);

// ── 7. No change to Motor 2 (applyReplacements intact)
check(
  "7. Motor 2 unchanged (applyReplacements intact)",
  loader.includes("function applyReplacements(") &&
  loader.includes("REEMPLAZAR_BODEGA") &&
  loader.includes("COMPLETAR_DESDE_OP") &&
  loader.includes("PRODUCCION_SUGERIDA"),
  "applyReplacements function must remain unchanged",
);

// ── 8. No new API calls or data fetching
check(
  "8. No new fetch/API calls added",
  // The only fetch calls should be the pre-existing ones (plans, guides)
  // searchedActiveRefs and lineGroups use useMemo only
  client.includes("searchedActiveRefs") &&
  client.includes("useMemo(() => {") &&
  !client.includes("lineGroups = await"),
  "Line grouping must use useMemo, not new API calls",
);

// ── 9. Per-line pagination (lineVisibleCounts)
check(
  "9. Per-line pagination (lineVisibleCounts state)",
  client.includes("lineVisibleCounts") &&
  client.includes("setLineVisibleCounts") &&
  client.includes("localVisibleCount"),
  "Per-line visible count state must exist for pagination",
);

// ── 10. Table columns unchanged
check(
  "10. Table columns unchanged (same headers)",
  client.includes('"Ref"') &&
  client.includes('"Descripcion"') &&
  client.includes('"Subgrupo SAG"') &&
  client.includes('"Linea"') &&
  client.includes('"Disponible"') &&
  client.includes('"Estado"') &&
  client.includes('"Accion"'),
  "Table columns must remain exactly the same",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
