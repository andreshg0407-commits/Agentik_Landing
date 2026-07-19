/**
 * validate-maletas-drawer-executive-copy.ts
 *
 * GO-LIVE-MALETAS-DRAWER-EXECUTIVE-COPY-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-maletas-drawer-executive-copy.ts
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

console.log("\n=== GO-LIVE-MALETAS-DRAWER-EXECUTIVE-COPY-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. No user-visible "Insights" label in drawer (comments are OK)
check(
  "1. No user-visible 'Insights' label",
  // "Insights historicos" was the old label — must not appear as rendered text
  !client.includes('"Insights historicos"') &&
  !client.includes(">Insights historicos<") &&
  !client.includes(">Insights<"),
  "Old 'Insights historicos' label must be replaced with 'Resumen historico'",
);

// ── 2. No user-visible "Score" in drawer KPI section
check(
  "2. Drawer KPIs do not show 'Score' label",
  // SCORE_LABEL exists for vendor card grid (OK), but drawer section must not render it
  // DrawerKpiCard labels must not include "Score"
  !client.includes('label="Score"') &&
  !client.includes("DrawerKpiCard") || (
    !client.substring(client.indexOf("DrawerKpiCard"), client.indexOf("DrawerKpiCard") + 500).includes("Score")
  ),
  "Drawer KPI cards must not use 'Score' as a label",
);

// ── 3. No user-visible "Vault" as a UI label
check(
  "3. No user-visible 'Vault' label (function names and comments OK)",
  // "Vault" should only exist in code-level identifiers (DepletedVault, comments), not rendered text
  !client.includes(">Vault<") &&
  !client.includes('"Vault"'),
  "Vault must not appear as user-visible text",
);

// ── 4. No "Refs" as a standalone column/tab label
check(
  "4. No standalone 'Refs' tab label",
  // Old tab was "Refs" — now "Referencias"
  !client.includes('"Refs"'),
  "Old 'Refs' tab label must be replaced with 'Referencias'",
);

// ── 5. "Resumen historico" visible
check(
  "5. 'Resumen historico' label present",
  client.includes("Resumen historico"),
  "Historical summary card must use 'Resumen historico'",
);

// ── 6. Drawer KPI: "Activas"
check(
  "6. Drawer KPI 'Activas' present",
  client.includes('label="Activas"'),
  "DrawerKpiCard with label 'Activas' must exist",
);

// ── 7. Drawer KPI: "Pendientes"
check(
  "7. Drawer KPI 'Pendientes' present",
  client.includes('label="Pendientes"'),
  "DrawerKpiCard with label 'Pendientes' must exist",
);

// ── 8. Drawer KPI: "Atencion"
check(
  "8. Drawer KPI 'Atencion' present",
  client.includes('label="Atencion"'),
  "DrawerKpiCard with label 'Atencion' must exist",
);

// ── 9. Drawer KPI: "Retiradas"
check(
  "9. Drawer KPI 'Retiradas' present",
  client.includes('label="Retiradas"'),
  "DrawerKpiCard with label 'Retiradas' must exist",
);

// ── 10. "Sin inventario" replaces "Sin stock"
check(
  "10. 'Sin inventario' replaces 'Sin stock'",
  client.includes("Sin inventario") &&
  !client.includes("Sin stock"),
  "'Sin stock' must be replaced with 'Sin inventario'",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
