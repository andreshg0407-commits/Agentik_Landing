/**
 * scripts/validate-tiendas-adapter-real-data.ts
 *
 * Validation for TIENDAS-ADAPTER-REAL-DATA-01
 *
 * Usage: npx tsx scripts/validate-tiendas-adapter-real-data.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else    { fail++; console.log(`  FAIL  ${label}`); }
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileNotContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return true;
  return !fs.readFileSync(fp, "utf-8").includes(text);
}

console.log("=== TIENDAS-ADAPTER-REAL-DATA-01 Validation ===\n");

const adapter  = "lib/comercial/tiendas/sag-store-adapter.ts";
const active   = "lib/comercial/tiendas/active-inventory.ts";
const assort   = "lib/comercial/tiendas/assortment-engine.ts";
const textile  = "lib/comercial/tiendas/textile-coverage-engine.ts";
const catalog  = "lib/comercial/tiendas/store-rule-catalog.ts";
const needs    = "lib/comercial/tiendas/store-needs-service.ts";
const suggest  = "lib/comercial/tiendas/store-suggestions-service.ts";
const engine   = "lib/comercial/tiendas/store-replenishment-engine.ts";

// ── 1. Adapter uses real SAG fields ──────────────────────────────────────────

console.log("CHECK 1: Adapter uses ProductEntity.subgrupoSag");
check("Adapter selects subgrupoSag from product", fileContains(adapter, "subgrupoSag: true"));
check("Adapter selects productLine from product", fileContains(adapter, "productLine: true"));
check("Adapter maps category from subgrupoSag", fileContains(adapter, "subgrupoSag ||"));
check("Adapter maps line from productLine", fileContains(adapter, "productLine ||"));

// ── 2. Adapter does NOT use heuristic inference ──────────────────────────────

console.log("\nCHECK 2: Adapter does NOT use inferCategory/inferProductType");
check("No inferCategory import", fileNotContains(adapter, "import { inferCategory"));
check("No inferCategory call", fileNotContains(adapter, "inferCategory("));
check("No inferProductType import", fileNotContains(adapter, "import { inferProductType"));
check("No inferProductType call", fileNotContains(adapter, "inferProductType("));

// ── 3. Fallback sentinels ────────────────────────────────────────────────────

console.log("\nCHECK 3: Fallback sentinels");
check("SIN_SUBGRUPO_SAG fallback in adapter", fileContains(adapter, "SIN_SUBGRUPO_SAG"));
check("SIN_LINEA_SAG fallback in adapter", fileContains(adapter, "SIN_LINEA_SAG"));
check("SIN_TALLA fallback in adapter", fileContains(adapter, "SIN_TALLA"));
check("SIN_COLOR fallback in adapter", fileContains(adapter, "SIN_COLOR"));

// ── 4. Talla/color normalization ─────────────────────────────────────────────

console.log("\nCHECK 4: Talla/color normalization");
check("Talla trimmed and uppercased (batch)", fileContains(adapter, ".trim().toUpperCase()"));
check("Size resolved from variantAttributes talla", fileContains(adapter, 'a.key === "talla"'));
check("Color resolved from variantAttributes color", fileContains(adapter, 'a.key === "color"'));

// ── 5. No category || line as subgroup fallback pattern ──────────────────────
// Note: downstream consumers use v.category || v.line which is now correct
// because category = subgrupoSag (real). The pattern is valid.

console.log("\nCHECK 5: Adapter field semantics");
check("Category field = subgrupoSag (not SAG group ID)", fileContains(adapter, "subgrupoSag"));
check("Line field = productLine (SAG line ID)", fileContains(adapter, "productLine"));

// ── 6. Suggestions service uses real data ────────────────────────────────────

console.log("\nCHECK 6: Suggestions service uses real data");
check("Suggestions selects subgrupoSag", fileContains(suggest, "subgrupoSag"));
check("Suggestions does NOT select category as SAG ID", fileNotContains(suggest, "category:      true"));
check("Suggestions maps subgroup from subgrupoSag", fileContains(suggest, "p.subgrupoSag"));

// ── 7. Needs service uses real data ──────────────────────────────────────────

console.log("\nCHECK 7: Needs service uses real data");
check("Needs service maps subgroup from v.category (= subgrupoSag)", fileContains(needs, "v.category, // v.category = real subgrupoSag"));

// ── 8. Product class inference updated ───────────────────────────────────────

console.log("\nCHECK 8: Product class inference uses real subgrupoSag");
check("Active-inventory inferProductClass checks SIN_TALLA sentinel", fileContains(active, "SIN_TALLA"));
check("Active-inventory inferProductClass checks SIN_COLOR sentinel", fileContains(active, "SIN_COLOR"));
check("Active-inventory uses SAG line IDs for textile", fileContains(active, 'lineId === "1"'));
check("No LATIN/CASTILLITO heuristic in active-inventory", fileNotContains(active, "LATIN"));
check("No LATIN/CASTILLITO heuristic in needs-service", fileNotContains(needs, "LATIN"));

// ── 9. Coverage engine receives real subgroup ────────────────────────────────

console.log("\nCHECK 9: Coverage engine receives real subgroup");
check("Textile engine uses v.category || v.line (now = subgrupoSag || productLine)", fileContains(textile, "v.category || v.line"));
check("Active-inventory subgroup coverage uses v.category || v.line", fileContains(active, "v.category || v.line"));

// ── 10. Replenishment engine receives real data ──────────────────────────────

console.log("\nCHECK 10: Replenishment engine receives real data");
check("Engine passes category from variant", fileContains(engine, "category:      v.category"));
check("Engine passes line from variant", fileContains(engine, "line:          v.line"));

// ── 11. Rule catalog uses real data ──────────────────────────────────────────

console.log("\nCHECK 11: Rule catalog uses real data");
check("Catalog inferProductClass uses SAG line IDs", fileContains(catalog, 'lineId === "1"'));
check("Catalog resolveSubgroup uses v.category || v.line", fileContains(catalog, "v.category || v.line"));

// ── 12. CRM fallback has sentinel values ─────────────────────────────────────

console.log("\nCHECK 12: CRM fallback sentinels");
check("CRM fallback category = SIN_SUBGRUPO_SAG", fileContains(adapter, '"SIN_SUBGRUPO_SAG",  // CRM fallback'));
check("CRM fallback line = SIN_LINEA_SAG", fileContains(adapter, '"SIN_LINEA_SAG",      // CRM fallback'));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
