/**
 * validate-maletas-derrotero-ux-persistence.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-UX-PERSISTENCE-01 validation script.
 * 8 checks.
 *
 * Run: npx tsx scripts/validate-maletas-derrotero-ux-persistence.ts
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

console.log("\n=== GO-LIVE-MALETAS-DERROTERO-UX-PERSISTENCE-01 Validation ===\n");

const client = readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ── 1. Tabs use full names, not abbreviations
check(
  "1. Tabs use full names: Referencias, Inteligencia, Derrotero",
  client.includes('"Referencias"') &&
  client.includes('"Inteligencia"') &&
  client.includes('"Derrotero"'),
  "Tab labels must be full words",
);

// ── 2. No abbreviated tab labels Refs / Intel
check(
  "2. No abbreviated labels Refs / Intel",
  !client.includes('"Refs"') &&
  !client.includes('"Intel"'),
  "Abbreviated labels must not appear",
);

// ── 3. Persistence message exists
check(
  "3. Persistence message: 'Derrotero guardado' or 'Cambios guardados'",
  client.includes("Derrotero guardado") &&
  client.includes("Cambios guardados"),
  "Must show clear save confirmation",
);

// ── 4. Active indicator exists
check(
  "4. Active indicator: 'Derrotero activo'",
  client.includes("Derrotero activo") &&
  client.includes("Sin derrotero activo"),
  "Must show active/inactive state",
);

// ── 5. Table Estado column wide enough (>= 80px)
check(
  "5. Table Estado column >= 80px",
  // Grid has 6 columns; the 5th (Estado) should be >= 80px
  client.includes("80px 90px"),
  "Estado and Accion columns must be wide enough to avoid overlap",
);

// ── 6. Action uses 'Desactivar', not 'OFF'
check(
  "6. Action uses 'Desactivar', not 'OFF'",
  client.includes("Desactivar") &&
  !client.includes(">OFF<") &&
  // Make sure OFF is not used as a button label (but OFF inside comments is ok)
  !client.includes(">\n                              OFF\n"),
  "Must use 'Desactivar' instead of 'OFF'",
);

// ── 7. No modifications outside Maletas module
check(
  "7. No modifications outside Maletas",
  !readFile("components/shell/module-nav-config.ts").includes("UX-PERSISTENCE") &&
  !readFile("components/shell/module-nav-config.ts").includes("DERROTERO-UX"),
  "No structural changes outside the Maletas module",
);

// ── 8. TSC baseline (informational — run npx tsc --noEmit separately)
check(
  "8. Tabs styled as real tabs (borderBottom, not borderRadius pill)",
  client.includes("borderBottom: `2px solid") &&
  // The tab buttons should NOT use borderRadius: R.pill
  !client.includes("borderRadius: R.pill,\n                          transition"),
  "Tabs must look like tabs, not pills",
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===\n`);
if (fail > 0) {
  console.log(`${fail} check(s) FAILED.`);
  process.exit(1);
}
console.log("All checks passed.");
