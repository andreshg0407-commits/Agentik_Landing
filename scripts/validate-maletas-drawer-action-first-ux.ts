/**
 * scripts/validate-maletas-drawer-action-first-ux.ts
 *
 * MALETAS-DRAWER-ACTION-FIRST-UX-01 — FASE 8
 *
 * Structural validation of the compact drawer UX changes.
 *
 * Usage:
 *   npx tsx scripts/validate-maletas-drawer-action-first-ux.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function fileContains(rel: string, needle: string): boolean {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) return false;
  return fs.readFileSync(fullPath, "utf-8").includes(needle);
}

console.log("=== MALETAS DRAWER ACTION-FIRST UX VALIDATION ===\n");

const clientPath = "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx";
const drawerPath = "components/workspace/operational-side-drawer.tsx";
const src = fs.readFileSync(path.join(ROOT, clientPath), "utf-8");

// ── 1. Header compacto ───────────────────────────────────────────────────────
console.log("[1] Header compacto");
check("No large Score circle (width: 64, height: 64)", !src.includes("width: 64, height: 64, borderRadius: R.pill,\n                    background: C.white,\n                    border: `3px solid"));
check("CompactChip component exists", fileContains(clientPath, "function CompactChip"));
check("Score shown as compact pill", src.includes("score.total} {SCORE_LABEL"));
check("Compact sticky toolbar section", fileContains(clientPath, "Compact sticky toolbar"));

// ── 2. KPIs in single line ───────────────────────────────────────────────────
console.log("\n[2] KPIs in compact chips");
check("KPIs use CompactChip", src.includes('<CompactChip label="Activas"'));
check("No large KPI grid in sticky toolbar", !src.includes('KPI Strip'));
check("Chips in flex row", src.includes('display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap"'));

// ── 3. Plan activo compacto ──────────────────────────────────────────────────
console.log("\n[3] Plan activo compacto");
check("Plan bar inline with tabs", src.includes("Plan bar — compact"));
check("Sin plan activo label", fileContains(clientPath, "Sin plan activo"));
check("Ver button compact", src.includes(">Ver<") || src.includes("        Ver"));
check("Guia button compact", src.includes(">Guia<") || src.includes("        Guia"));

// ── 4. Table appears early ───────────────────────────────────────────────────
console.log("\n[4] Table appears early (search + filters before table)");
check("Search toolbar uses gap S[2] (compact)", src.includes('gap: S[2],\n              padding: `${S[2]} 0`'));
check("Filter pills height 24 (compact)", src.includes("height: 24"));
check("Search padding 6px (compact)", src.includes('padding: `6px ${S[3]}`'));

// ── 5. Drawer flex column layout ─────────────────────────────────────────────
console.log("\n[5] Drawer flex column layout");
check("Main drawer content uses flex column", src.includes('display: "flex", flexDirection: "column", height: "100%"'));

// ── 6. Table uses flex 1 + overflow ──────────────────────────────────────────
console.log("\n[6] Table uses flex 1 + overflow");
check("Table container flex 1", src.includes("flex: 1,\n              overflowY:"));
check("Table container minHeight 0", src.includes("minHeight: 0,"));

// ── 7. Background scroll blocked ────────────────────────────────────────────
console.log("\n[7] Background scroll blocked");
check("Body overflow hidden", fileContains(drawerPath, 'document.body.style.overflow = "hidden"'));

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
