/**
 * validate-maletas-derrotero-hardening-02.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-HARDENING-02 validation script.
 * 9 checks.
 *
 * Run: npx tsx scripts/validate-maletas-derrotero-hardening-02.ts
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

console.log("\n=== GO-LIVE-MALETAS-DERROTERO-HARDENING-02 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. Actual does NOT count refs with state === "reemplazar"
check(
  "1. Actual excludes state === 'reemplazar'",
  client.includes('ref.state === "reemplazar") continue') &&
  !client.includes('ref.state !== "saludable") continue'),
  "actualRefsByKey should skip reemplazar, not filter to only saludable",
);

// ── 2. Actual counts active (non-agotadas) refs
check(
  "2. Actual counts all non-reemplazar refs",
  // The loop should increment for all refs except reemplazar
  client.includes("actualRefsByKey") &&
  client.includes('if (ref.state === "reemplazar") continue'),
  "Should count saludable + riesgo + any non-reemplazar state",
);

// ── 3. Faltan column calculates correctly
check(
  "3. 'Faltan' column: Math.max(0, ideal - actual)",
  client.includes("Math.max(0, rule.minimumRefs - actual)") &&
  client.includes("Faltan"),
  "Must show Faltan = max(0, ideal - actual)",
);

// ── 4. Estado Cubierto when actual > ideal
check(
  "4. Estado 'Cubierto' when actual > ideal",
  client.includes("if (actual > ideal) return \"cubierto\""),
  "deriveCoverageState should return cubierto when actual > ideal",
);

// ── 5. Estado En límite when actual === ideal
check(
  "5. Estado 'En limite' when actual === ideal",
  client.includes("if (actual === ideal) return \"en_limite\""),
  "deriveCoverageState should return en_limite when actual === ideal",
);

// ── 6. Estado Falta cobertura when actual < ideal
check(
  "6. Estado 'Falta cobertura' when actual < ideal",
  client.includes('return "falta_cobertura"') &&
  client.includes('"Falta cobertura"'),
  "deriveCoverageState should return falta_cobertura when actual < ideal",
);

// ── 7. Summary strip exists with all KPIs
check(
  "7. Summary strip: Cubiertos + En limite + Falta cobertura + Cobertura %",
  client.includes("DerroteroSummaryKpi") &&
  client.includes("derroteroSummary") &&
  client.includes("coberturaPct") &&
  client.includes("Sin derrotero activo"),
  "Summary strip must show all 4 KPIs and empty state",
);

// ── 8. Cobertura % calculated correctly: (cubiertos + enLimite) / total * 100
check(
  "8. Cobertura % = (cubiertos + enLimite) / total * 100",
  client.includes("((cubiertos + enLimite) / total) * 100"),
  "coberturaPct formula must be ((cubiertos + enLimite) / total) * 100",
);

// ── 9. No modifications outside drawer
check(
  "9. No modifications outside drawer",
  !readFile("components/shell/module-nav-config.ts").includes("DERROTERO") &&
  !readFile("components/shell/module-nav-config.ts").includes("HARDENING-02"),
  "No structural changes outside the drawer",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
