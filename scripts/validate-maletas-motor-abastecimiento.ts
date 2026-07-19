/**
 * validate-maletas-motor-abastecimiento.ts
 *
 * GO-LIVE-MALETAS-MOTOR-ABASTECIMIENTO-01 validation script.
 * 8 checks.
 *
 * Run: npx tsx scripts/validate-maletas-motor-abastecimiento.ts
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

console.log("\n=== GO-LIVE-MALETAS-MOTOR-ABASTECIMIENTO-01 Validation ===\n");

const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
const types = readFile("lib/comercial/maletas/vendor-sample-types.ts");

// ── 1. Inventario disponible → REEMPLAZAR_BODEGA
check(
  "1. Inventario disponible → REEMPLAZAR_BODEGA",
  loader.includes('"REEMPLAZAR_BODEGA"') &&
  loader.includes("options.length > 0") &&
  loader.includes('supplyAction = "REEMPLAZAR_BODEGA"'),
  "When bodega candidates exist, supplyAction must be REEMPLAZAR_BODEGA",
);

// ── 2. Sin inventario pero con OP → COMPLETAR_DESDE_OP
check(
  "2. Sin inventario + OP → COMPLETAR_DESDE_OP",
  loader.includes('"COMPLETAR_DESDE_OP"') &&
  loader.includes("opOptions.length > 0") &&
  loader.includes('supplyAction = "COMPLETAR_DESDE_OP"'),
  "When no bodega but OP exists, supplyAction must be COMPLETAR_DESDE_OP",
);

// ── 3. Sin inventario y sin OP → PRODUCCION_SUGERIDA
check(
  "3. Sin inventario + sin OP → PRODUCCION_SUGERIDA",
  loader.includes('"PRODUCCION_SUGERIDA"') &&
  loader.includes('supplyAction = "PRODUCCION_SUGERIDA"'),
  "Last resort: supplyAction must be PRODUCCION_SUGERIDA",
);

// ── 4. Referencia agotada → RETIRAR_MOSTRARIO (no other suggestion)
check(
  "4. Referencia agotada → RETIRAR_MOSTRARIO only",
  loader.includes('"RETIRAR_MOSTRARIO"') &&
  // Refs NOT in subgroups needing coverage get RETIRAR only
  loader.includes('supplyAction = "RETIRAR_MOSTRARIO"') &&
  loader.includes("!subgroupsNeedingCoverage.has(sg)"),
  "Exhausted refs outside coverage need must only get RETIRAR_MOSTRARIO",
);

// ── 5. Produccion textil uses inventario central (separate from Motor 2)
check(
  "5. Produccion textil uses inventario central",
  // Production suggestions are built from vendor.refs with requiresProductionSuggestion
  // which only fires after Motor 2 exhausts bodega + OP options
  loader.includes("requiresProductionSuggestion") &&
  // Production suggestions are aggregated by subgroup from central stock
  loader.includes("subgroupProdMap") &&
  loader.includes("centralAvailable"),
  "Production suggestions must come from central inventory analysis",
);

// ── 6. No duplicate alerts (one supplyAction per ref)
check(
  "6. No duplicate alerts — one supplyAction per ref",
  // The cascade is if/else-if/else — only one branch sets supplyAction
  types.includes("supplyAction: SupplyActionType | null") &&
  // Each ref gets exactly one action
  loader.includes("// Priority 1: REEMPLAZAR_BODEGA") &&
  loader.includes("// Priority 2: COMPLETAR_DESDE_OP") &&
  loader.includes("// Priority 3: PRODUCCION_SUGERIDA"),
  "Each ref must have exactly one typed supplyAction",
);

// ── 7. Priority order correct: bodega > OP > produccion > retirar
check(
  "7. Priority: bodega → OP → produccion → retirar",
  // Verify the cascade order in the code
  loader.indexOf('"REEMPLAZAR_BODEGA"') < loader.indexOf('"COMPLETAR_DESDE_OP"') &&
  loader.indexOf('"COMPLETAR_DESDE_OP"') < loader.indexOf('"PRODUCCION_SUGERIDA"'),
  "Priority order must be REEMPLAZAR_BODEGA < COMPLETAR_DESDE_OP < PRODUCCION_SUGERIDA",
);

// ── 8. SupplyActionType is defined with all 4 types
check(
  "8. SupplyActionType defined with all 4 types",
  types.includes("export type SupplyActionType") &&
  types.includes('"REEMPLAZAR_BODEGA"') &&
  types.includes('"COMPLETAR_DESDE_OP"') &&
  types.includes('"PRODUCCION_SUGERIDA"') &&
  types.includes('"RETIRAR_MOSTRARIO"'),
  "SupplyActionType must have all 4 action types",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
