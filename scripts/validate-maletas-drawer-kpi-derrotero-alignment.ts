/**
 * validate-maletas-drawer-kpi-derrotero-alignment.ts
 *
 * GO-LIVE-MALETAS-DRAWER-KPI-DERROTERO-ALIGNMENT-01 validation script.
 * 9 checks.
 *
 * Run: npx tsx scripts/validate-maletas-drawer-kpi-derrotero-alignment.ts
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

console.log("\n=== GO-LIVE-MALETAS-DRAWER-KPI-DERROTERO-ALIGNMENT-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// Find the KPI section (between "Derrotero-aligned KPIs" comment and "Row 2")
const kpiStart = client.indexOf("Derrotero-aligned KPIs");
const kpiEnd = client.indexOf("Row 2:", kpiStart);
const kpiSection = kpiStart > 0 && kpiEnd > kpiStart ? client.substring(kpiStart, kpiEnd) : "";

// ── 1. KPIs use activeRefs
check(
  "1. KPIs use activeRefs",
  kpiSection.includes("activeRefs") &&
  kpiSection.includes("activeRefs.length") &&
  kpiSection.includes("activeRefs.filter"),
  "KPI section must reference activeRefs for counts",
);

// ── 2. KPIs do not use depletedRefs except for Retiradas
check(
  "2. KPIs do not use depletedRefs except Retiradas",
  (() => {
    // depletedRefs should only appear near Retiradas KPI (value + color)
    const matches = kpiSection.match(/depletedRefs/g) ?? [];
    // All occurrences must be within Retiradas block (max 2: value + color)
    return matches.length <= 2 && kpiSection.includes('label="Retiradas"');
  })(),
  "Only Retiradas KPI may use depletedRefs",
);

// ── 3. "Cobertura derrotero" appears
check(
  "3. 'Cobertura derrotero' KPI present",
  kpiSection.includes('"Cobertura derrotero"'),
  "Cobertura derrotero KPI must be present",
);

// ── 4. "Subgrupos pendientes" appears
check(
  "4. 'Subgrupos pendientes' KPI present",
  kpiSection.includes('"Subgrupos pendientes"'),
  "Subgrupos pendientes KPI must be present",
);

// ── 5. "Acciones sugeridas" appears
check(
  "5. 'Acciones sugeridas' KPI present",
  kpiSection.includes('"Acciones sugeridas"') &&
  kpiSection.includes("REEMPLAZAR_BODEGA") &&
  kpiSection.includes("COMPLETAR_DESDE_OP") &&
  kpiSection.includes("PRODUCCION_SUGERIDA") &&
  kpiSection.includes("RECOMPRA_SUGERIDA"),
  "Acciones sugeridas KPI must show Motor 2 supply action breakdown",
);

// ── 6. No "Pendientes" KPI label
check(
  "6. No 'Pendientes' KPI label",
  !kpiSection.includes('label="Pendientes"'),
  "Old Pendientes KPI must be removed",
);

// ── 7. No "Atencion" KPI label
check(
  "7. No 'Atencion' KPI label",
  !kpiSection.includes('label="Atencion"'),
  "Old Atencion KPI must be removed",
);

// ── 8. No "Reemplazar" as KPI label
check(
  "8. No 'Reemplazar' as KPI label",
  !kpiSection.includes('label="Reemplazar"'),
  "Reemplazar must not be a KPI label",
);

// ── 9. TSC baseline (informational — run separately)
check(
  "9. Retiradas shows 'no cuenta en cobertura'",
  kpiSection.includes("no cuenta en cobertura"),
  "Retiradas subtitle must clarify it does not count in coverage",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
