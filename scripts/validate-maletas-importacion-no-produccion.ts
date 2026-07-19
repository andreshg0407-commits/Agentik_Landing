/**
 * validate-maletas-importacion-no-produccion.ts
 *
 * GO-LIVE-MALETAS-IMPORTACION-NO-PRODUCCION-01 validation script.
 * 7 checks.
 *
 * Run: npx tsx scripts/validate-maletas-importacion-no-produccion.ts
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

console.log("\n=== GO-LIVE-MALETAS-IMPORTACION-NO-PRODUCCION-01 Validation ===\n");

const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
const types = readFile("lib/comercial/maletas/vendor-sample-types.ts");

// ── 1. IMPORT never gets PRODUCCION_SUGERIDA
check(
  "1. IMPORT never gets PRODUCCION_SUGERIDA",
  // The code must guard: if isAccessory or IMPORT → NOT PRODUCCION_SUGERIDA
  loader.includes('ref.isAccessory || ref.line === "IMPORT"') &&
  loader.includes('"RECOMPRA_SUGERIDA"'),
  "Import/accessory refs must get RECOMPRA_SUGERIDA, never PRODUCCION_SUGERIDA",
);

// ── 2. IMPORT can get RECOMPRA_SUGERIDA
check(
  "2. IMPORT can get RECOMPRA_SUGERIDA",
  loader.includes('supplyAction = "RECOMPRA_SUGERIDA"') &&
  types.includes('"RECOMPRA_SUGERIDA"'),
  "RECOMPRA_SUGERIDA must exist in both types and loader",
);

// ── 3. LT can still get PRODUCCION_SUGERIDA
check(
  "3. LT can still get PRODUCCION_SUGERIDA",
  // The else branch (non-import) assigns PRODUCCION_SUGERIDA
  loader.includes('supplyAction = "PRODUCCION_SUGERIDA"') &&
  loader.includes("requiresProductionSuggestion = true"),
  "Textil refs must still be able to get PRODUCCION_SUGERIDA",
);

// ── 4. CS can still get PRODUCCION_SUGERIDA
check(
  "4. CS can still get PRODUCCION_SUGERIDA",
  // Same code path as LT — the guard is isAccessory || IMPORT, so CS passes through
  !loader.includes('ref.line === "CS"') || // CS is not explicitly blocked
  loader.includes('supplyAction = "PRODUCCION_SUGERIDA"'),
  "CS refs must not be blocked from PRODUCCION_SUGERIDA",
);

// ── 5. Exhausted IMPORT refs can get RETIRAR_MOSTRARIO
check(
  "5. Exhausted IMPORT refs → RETIRAR_MOSTRARIO",
  loader.includes('supplyAction = "RETIRAR_MOSTRARIO"') &&
  // Refs not in subgroups needing coverage → RETIRAR
  loader.includes("!subgroupsNeedingCoverage.has(sg)"),
  "Exhausted import refs outside coverage need must get RETIRAR_MOSTRARIO",
);

// ── 6. Import and textil bodegas are not mixed
check(
  "6. Import/textil bodega logic separated",
  // Import availability uses B36+B37 (IMPORT_SOURCE_WAREHOUSES)
  loader.includes("IMPORT_SOURCE_WAREHOUSES") &&
  loader.includes("importAvailMap") &&
  // Textil uses bodega principal (coverageMap)
  loader.includes("coverageMap") &&
  loader.includes("bodega_principal"),
  "Import uses B36+B37, textil uses bodega principal — no mixing",
);

// ── 7. SupplyActionType has all 5 types
check(
  "7. SupplyActionType has all 5 types including RECOMPRA_SUGERIDA",
  types.includes('"REEMPLAZAR_BODEGA"') &&
  types.includes('"COMPLETAR_DESDE_OP"') &&
  types.includes('"PRODUCCION_SUGERIDA"') &&
  types.includes('"RECOMPRA_SUGERIDA"') &&
  types.includes('"RETIRAR_MOSTRARIO"'),
  "SupplyActionType must have all 5 action types",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
