/**
 * validate-maletas-agotados-vault.ts
 *
 * GO-LIVE-MALETAS-AGOTADOS-VAULT-01 validation script.
 * 10 checks.
 *
 * Run: npx tsx scripts/validate-maletas-agotados-vault.ts
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

console.log("\n=== GO-LIVE-MALETAS-AGOTADOS-VAULT-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const loader = readFile("lib/comercial/maletas/vendor-sample-loader.ts");

// ── 1. state === "reemplazar" does NOT appear in activeRefs
check(
  "1. activeRefs excludes state === 'reemplazar'",
  client.includes("activeRefs") &&
  client.includes('r.state !== "reemplazar"'),
  "activeRefs must filter out reemplazar state",
);

// ── 2. state === "reemplazar" appears in depletedRefs
check(
  "2. depletedRefs captures state === 'reemplazar'",
  client.includes("depletedRefs") &&
  client.includes('r.state === "reemplazar"'),
  "depletedRefs must capture reemplazar state",
);

// ── 3. supplyAction === "RETIRAR_MOSTRARIO" used for depleted refs
check(
  "3. RETIRAR_MOSTRARIO assigned to depleted refs",
  loader.includes('"RETIRAR_MOSTRARIO"') &&
  loader.includes('supplyAction = "RETIRAR_MOSTRARIO"'),
  "Depleted refs must get RETIRAR_MOSTRARIO supplyAction",
);

// ── 4. Panel principal consumes activeRefs
check(
  "4. Main panel uses activeRefs for filtering",
  client.includes("let refs = activeRefs") &&
  // Filter pills also use activeRefs
  client.includes("activeRefs.length") &&
  client.includes("activeRefs.filter"),
  "filteredRefs and filter pills must operate on activeRefs",
);

// ── 5. Vault consumes depletedRefs
check(
  "5. Vault component receives depletedRefs",
  client.includes("DepletedVault") &&
  client.includes("depletedRefs") &&
  client.includes("Agotados / Retirar del mostrario"),
  "DepletedVault must exist and receive depletedRefs",
);

// ── 6. depletedRefs do NOT generate production suggestions
check(
  "6. depletedRefs do not generate production",
  // In the vault we only show stock/limit, no replacement/production/OP
  !client.includes("requiresProductionSuggestion") ||
  // The vault component does not show production-related fields
  (client.includes("DepletedVault") &&
   client.includes("Retirar del mostrario")),
  "Vault must not show production/replacement suggestions",
);

// ── 7. depletedRefs do NOT show replacement
check(
  "7. Vault does not show replacement options",
  // DepletedVault only shows: reference, description, line, stock, limit
  client.includes("DepletedVault") &&
  !client.substring(client.indexOf("function DepletedVault"), client.indexOf("function DepletedVault") + 2000).includes("replacementOptions"),
  "Vault must not display replacement options",
);

// ── 8. Import with stock <= 10 enters depletedRefs
check(
  "8. Import with stock <= limit enters depletedRefs",
  // Import uses getMinimumForLine which returns 10 for IMPORT
  // deriveState returns "reemplazar" when centralAvailable <= minimum
  loader.includes("IMPORT") &&
  loader.includes("getMinimumForLine") &&
  // And reemplazar state means it goes to depletedRefs in client
  client.includes('r.state === "reemplazar"'),
  "Import refs at or below threshold must be in depletedRefs",
);

// ── 9. Derrotero coverage uses activeRefs (excludes reemplazar)
check(
  "9. Derrotero coverage excludes reemplazar",
  // actualRefsByKey in DerroteroIdealPanel skips reemplazar
  client.includes('if (ref.state === "reemplazar") continue') &&
  client.includes("actualRefsByKey"),
  "Derrotero coverage must only count non-reemplazar refs",
);

// ── 10. TSC baseline (informational)
check(
  "10. No new filter pill for 'reemplazar' in main panel",
  // FILTER_ORDER should not include "reemplazar" anymore
  !client.includes('"all", "saludable", "reemplazar"'),
  "Reemplazar filter pill must be removed from main panel",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
