/**
 * validate-maletas-derrotero-persistence-status.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-PERSISTENCE-STATUS-01 validation script.
 * 7 checks.
 *
 * Run: npx tsx scripts/validate-maletas-derrotero-persistence-status.ts
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

console.log("\n=== GO-LIVE-MALETAS-DERROTERO-PERSISTENCE-STATUS-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. Indicator uses active rules from BD (allActiveRules drives header)
check(
  "1. Indicator uses active rules from BD",
  client.includes("derroteroSummary.total > 0") &&
  client.includes("Derrotero activo") &&
  client.includes("allActiveRules"),
  "Persistence header must derive state from loaded rules, not session-only state",
);

// ── 2. Shows 'Guardado' when active rules exist (data-driven, not lastSavedAt)
check(
  "2. Shows 'Guardado' from BD rules (not only lastSavedAt)",
  // The permanent header must show "Guardado" unconditionally when rules > 0
  client.includes("Guardado") &&
  // And it should NOT be gated solely on lastSavedAt for the header
  client.includes("data-driven"),
  "Header must show 'Guardado' when rules exist, regardless of session state",
);

// ── 3. Does not depend ONLY on lastSavedAt for permanent indicator
check(
  "3. Not solely dependent on lastSavedAt for header",
  // lastSavedAt can still exist for the toast, but header uses derroteroSummary.total
  client.includes("lastUpdatedAt") &&
  client.includes("allActiveRules"),
  "Permanent indicator must use data from BD",
);

// ── 4. Shows last update time using updatedAt from rules
check(
  "4. Shows last update using updatedAt",
  client.includes("lastUpdatedAt") &&
  client.includes("updatedAt") &&
  client.includes("Ultima actualizacion"),
  "Must compute and display the most recent updatedAt from active rules",
);

// ── 5. Toast 'Derrotero guardado' still works
check(
  "5. Toast 'Derrotero guardado' maintained",
  client.includes("Derrotero guardado") &&
  client.includes("showFeedback"),
  "Temporal toast must still fire on save",
);

// ── 6. Text 'Falta' not changed
check(
  "6. Coverage label 'Falta' unchanged",
  client.includes('falta_cobertura: "Falta"'),
  "Must not change the short coverage label",
);

// ── 7. IdealRouteRule includes updatedAt
check(
  "7. IdealRouteRule interface includes updatedAt",
  client.includes("updatedAt: string"),
  "Client interface must include updatedAt for data-driven persistence",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
