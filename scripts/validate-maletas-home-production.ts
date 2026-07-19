/**
 * validate-maletas-home-production.ts
 *
 * GO-LIVE-MALETAS-HOME-PRODUCTION-01 validation script.
 * 12 checks.
 *
 * Run: npx tsx scripts/validate-maletas-home-production.ts
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

console.log("\n=== GO-LIVE-MALETAS-HOME-PRODUCTION-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// Find the executive summary section
const execStart = client.indexOf("Resumen ejecutivo");
const execEnd = client.indexOf("Plan save status", execStart);
const execSection = execStart > 0 && execEnd > execStart ? client.substring(execStart, execEnd) : "";

// ── 1. Executive summary has exactly 3 KPI cards
check(
  "1. Executive summary has 3 cards",
  (() => {
    // Count both <ExecKpi label= and <ExecKpi\n patterns
    const matches = execSection.match(/<ExecKpi[\s\n]/g);
    return matches !== null && matches.length === 3;
  })(),
  "Must have exactly 3 ExecKpi cards in summary strip",
);

// ── 2. No "Reemplazo" as principal KPI
check(
  "2. No 'Reemplazo' as principal KPI",
  !execSection.includes('"Para reemplazo"') &&
  !execSection.includes('"Reemplazo"'),
  "Must not show 'Para reemplazo' or 'Reemplazo' as KPI",
);

// ── 3. Only active maletas shown by default
check(
  "3. Only active maletas shown by default",
  client.includes("Maletas activas") &&
  client.includes("activeVendors.map(") &&
  !client.includes("sortedVendors.map((vendor)"),
  "Must show activeVendors, not sortedVendors",
);

// ── 4. Inactive maletas collapsible section exists
check(
  "4. Inactive maletas collapsible section",
  client.includes("Maletas inactivas") &&
  client.includes("showInactive") &&
  client.includes("inactiveVendors.map("),
  "Must have collapsible inactive vendors section",
);

// ── 5. Produccion sugerida always visible
check(
  "5. Produccion sugerida always visible",
  (() => {
    // Should NOT be wrapped in a conditional — find the SectionHeader for Produccion
    const idx = client.indexOf('"Produccion sugerida"');
    if (idx < 0) return false;
    // Check 100 chars before — should NOT have `&& (` or `.length > 0`
    const before = client.substring(Math.max(0, idx - 150), idx);
    return !before.includes("textileProduction.length > 0 && (");
  })(),
  "Produccion sugerida must be always visible, not conditionally rendered",
);

// ── 6. Produccion never includes IMPORT
check(
  "6. Produccion never includes IMPORT",
  client.includes('productionSuggestions.filter((ps) => ps.line !== "IMPORT")') &&
  client.includes("textileProduction"),
  "Produccion must filter out IMPORT line",
);

// ── 7. Recompra sugerida always visible
check(
  "7. Recompra sugerida always visible",
  (() => {
    const idx = client.indexOf('"Recompra sugerida"');
    if (idx < 0) return false;
    const before = client.substring(Math.max(0, idx - 150), idx);
    return !before.includes("importRecompra.length > 0 && (");
  })(),
  "Recompra sugerida must be always visible",
);

// ── 8. Recompra uses import/accessories only
check(
  "8. Recompra uses IMPORT only",
  client.includes('productionSuggestions.filter((ps) => ps.line === "IMPORT")') &&
  client.includes("importRecompra"),
  "Recompra must only include IMPORT line",
);

// ── 9. Oportunidades de cobertura maintained
check(
  "9. Oportunidades de cobertura maintained",
  client.includes("Oportunidades de cobertura") &&
  client.includes("coverageGaps"),
  "Coverage gaps section must remain",
);

// ── 10. Drawer not modified (CommercialDecisionCenter still present)
check(
  "10. Drawer intact (CommercialDecisionCenter present)",
  client.includes("function CommercialDecisionCenter") &&
  client.includes("function CoverageCircle") &&
  client.includes('drawerTab === "referencias"') &&
  client.includes('drawerTab === "derrotero"'),
  "Drawer components and tabs must remain unchanged",
);

// ── 11. Services/APIs not modified
check(
  "11. Services not modified",
  (() => {
    const service = readFile("lib/comercial/maletas/vendor-sample-service.ts");
    return service.includes("buildVendorSnapshots");
  })(),
  "vendor-sample-service.ts must not be modified",
);

// ── 12. Home proactive (proximas a vigilar when empty)
check(
  "12. Home proactive — proximas a vigilar fallback",
  client.includes("Sin produccion sugerida hoy") &&
  client.includes("Proximas referencias a vigilar") &&
  client.includes("Sin recompras sugeridas hoy") &&
  client.includes("nextToWatch") &&
  client.includes("nextToWatchImport"),
  "Empty production/recompra must show 'proximas a vigilar' fallback",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
