/**
 * validate-maletas-go-live-01.ts
 *
 * MALETAS-GO-LIVE-01 validation script.
 * 10 checks to verify Motor 1 / Motor 2 separation.
 *
 * Run: npx tsx scripts/validate-maletas-go-live-01.ts
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

console.log("\n=== MALETAS-GO-LIVE-01 Validation ===\n");

// ── Files under test ────────────────────────────────────────────────────────
const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");
const service = readFile("lib/comercial/maletas/vendor-sample-service.ts");
const types = readFile("lib/comercial/maletas/vendor-sample-types.ts");

// ── Check 1: Motor 1 — suggestedAction is "Retirar del mostrario" in loader
check(
  "1. Loader: suggestedAction = 'Retirar del mostrario'",
  loader.includes('"Retirar del mostrario"') && !loader.includes('"Reemplazar referencia"'),
  'Found "Reemplazar referencia" — Motor 1 should use "Retirar del mostrario"',
);

// ── Check 2: Motor 1 — suggestedAction is "Retirar del mostrario" in service
check(
  "2. Service: suggestedAction = 'Retirar del mostrario'",
  service.includes('"Retirar del mostrario"') && !service.includes('"Reemplazar referencia"'),
  'Found "Reemplazar referencia" — Motor 1 should use "Retirar del mostrario"',
);

// ── Check 3: No "Sugerir produccion" as suggestedAction in loader
// Motor 2 sets requiresProductionSuggestion but does NOT set suggestedAction to "Sugerir produccion"
check(
  "3. Loader: no 'Sugerir produccion' as suggestedAction",
  !loader.includes('suggestedAction = "Sugerir produccion"') &&
  !loader.includes("suggestedAction = 'Sugerir produccion'"),
  "Motor 1 owns suggestedAction — 'Sugerir produccion' should not appear",
);

// ── Check 4: Motor 2 uses DEFAULT_SUBGROUP_MINIMUM_REFS
check(
  "4. Loader: Motor 2 uses DEFAULT_SUBGROUP_MINIMUM_REFS",
  loader.includes("DEFAULT_SUBGROUP_MINIMUM_REFS"),
  "Motor 2 should use subgroup coverage threshold from types",
);

// ── Check 5: Types file has derrotero constants
check(
  "5. Types: DEFAULT_SUBGROUP_IDEAL_REFS and MINIMUM_REFS exist",
  types.includes("DEFAULT_SUBGROUP_IDEAL_REFS") && types.includes("DEFAULT_SUBGROUP_MINIMUM_REFS"),
  "Derrotero constants missing from vendor-sample-types.ts",
);

// ── Check 6: Accessories no longer forced to "saludable" in loader
// The old pattern: `isAccessory ? "saludable" : rawState` should be gone
check(
  "6. Loader: accessories use rawState (not forced saludable)",
  !loader.includes('isAccessory ? "saludable"') && !loader.includes("isAccessory ? 'saludable'"),
  "Accessories should use the same 2-state model as textil refs",
);

// ── Check 7: Motor 2 groups by subgrupoSag (not per-ref)
check(
  "7. Loader: Motor 2 groups refs by subgrupoSag",
  loader.includes("subgroupMap") && loader.includes("subgroupsNeedingCoverage"),
  "Motor 2 should aggregate by subgrupo for coverage decisions",
);

// ── Check 8: Motor 2 cascade — production is LAST RESORT (LT/CS only)
check(
  "8. Loader: production suggestion only for LT/CS (last resort)",
  loader.includes('ref.line === "LT" || ref.line === "CS"') &&
  loader.includes("requiresProductionSuggestion = true"),
  "Production suggestions should only apply to LT/CS lines",
);

// ── Check 9: No "En produccion" as suggestedAction
// Motor 2 never overrides Motor 1's suggestedAction
check(
  "9. Loader: no 'En produccion' as suggestedAction",
  !loader.includes('suggestedAction = "En produccion"') &&
  !loader.includes("suggestedAction = 'En produccion'"),
  "Motor 2 should not override suggestedAction — Motor 1 owns it",
);

// ── Check 10: UI file NOT modified
const clientPath = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";
try {
  // Just verify the file exists and was not touched by checking for our sprint tag
  const client = readFile(clientPath);
  check(
    "10. maletas-client.tsx: NOT modified (no GO-LIVE-01 tag)",
    !client.includes("MALETAS-GO-LIVE-01"),
    "UI file should NOT be modified in this sprint",
  );
} catch {
  check("10. maletas-client.tsx: file exists", false, "File not found");
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
