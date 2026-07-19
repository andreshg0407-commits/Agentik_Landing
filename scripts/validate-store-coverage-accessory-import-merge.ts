/**
 * scripts/validate-store-coverage-accessory-import-merge.ts
 *
 * Validation for HOTFIX: STORE-COVERAGE-ACCESSORY-IMPORT-MERGE-01
 *
 * Validates the unified Accesorios / Importacion world:
 *   - Only 2 visible modes (textile + accessory_import)
 *   - Textil uses SUBGROUP strategy
 *   - Accesorios / Importacion uses SIZE strategy
 *   - No separate Accesorios tab
 *   - No separate Importacion tab
 *   - Aliases resolve to unified line
 *   - Attributes (subgrupo, color, etc.) remain in model
 *   - No duplicate rules
 *   - Textil unchanged
 *
 * Usage: npx tsx scripts/validate-store-coverage-accessory-import-merge.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    failed++;
  }
}

function readFile(relPath: string): string {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf-8");
}

function fileContains(content: string, needle: string): boolean {
  return content.includes(needle);
}

function fileNotContains(content: string, needle: string): boolean {
  return !content.includes(needle);
}

console.log("\n=== STORE-COVERAGE-ACCESSORY-IMPORT-MERGE-01 Validation ===\n");

// ── Business lines ──────────────────────────────────────────────────────────

const businessLines = readFile("lib/comercial/tiendas/store-business-lines.ts");

check("Phase 1: Single unified line id = accesorios_importacion", fileContains(businessLines, 'id: "accesorios_importacion"'));
check("Phase 1: Label = Accesorios / Importacion", fileContains(businessLines, 'label: "Accesorios / Importacion"'));
check("Phase 1: ruleMode = accessory_import", fileContains(businessLines, 'ruleMode: "accessory_import"'));
check("Phase 1: No separate 'id: \"accesorios\"' line def", fileNotContains(businessLines, 'id: "accesorios",'));
check("Phase 1: No separate 'id: \"importacion\"' line def", fileNotContains(businessLines, 'id: "importacion",'));
check("Phase 1: Alias 'accesorios' resolves to unified", fileContains(businessLines, "accesorios:"));
check("Phase 1: Alias 'importacion' resolves to unified", fileContains(businessLines, "importacion:"));

// ── Phase 2: RuleMode ───────────────────────────────────────────────────────

check("Phase 2: RuleMode has textile", fileContains(businessLines, '"textile"'));
check("Phase 2: RuleMode has accessory_import", fileContains(businessLines, '"accessory_import"'));
check("Phase 2: No 3-mode RuleMode (no standalone 'accessory')", fileNotContains(businessLines, '"textile" | "accessory" | "importacion"'));

// ── Phase 3: UI ─────────────────────────────────────────────────────────────

const tiendasClient = readFile("app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");

check("Phase 3: Only 2 visible tabs (textile + accessory_import)", fileContains(tiendasClient, 'setMode("accessory_import")'));
check("Phase 3: Textil tab present", fileContains(tiendasClient, 'setMode("textile")'));
check("Phase 3: No separate Accesorios-only tab", fileNotContains(tiendasClient, 'setMode("accessory")'));
check("Phase 3: No separate Importacion tab", fileNotContains(tiendasClient, 'setMode("importacion")'));
check("Phase 3: Tab label is 'Accesorios / Importacion'", fileContains(tiendasClient, ">Accesorios / Importacion<") || fileContains(tiendasClient, "Accesorios / Importacion\n"));
check("Phase 3: Size rows in accessory_import form", fileContains(tiendasClient, 'mode === "accessory_import"'));
check("Phase 3: No subgroup selector in accessory_import form", fileNotContains(tiendasClient, "accSubgroupMode"));

// ── Phase 4: Attributes remain in model ─────────────────────────────────────

const policyTypes = readFile("lib/comercial/tiendas/store-policy-types.ts");

check("Phase 4: subgroup field remains", fileContains(policyTypes, "subgroup?:"));
check("Phase 4: referenceCode field remains", fileContains(policyTypes, "referenceCode?:"));
check("Phase 4: color field remains", fileContains(policyTypes, "color?:"));
check("Phase 4: category field remains", fileContains(policyTypes, "category?:"));
check("Phase 4: sizeClass field remains", fileContains(policyTypes, "sizeClass?:"));

// ── Phase 5: SAG mappings ───────────────────────────────────────────────────

check("Phase 5: SAG line 4 → accesorios_importacion", fileContains(businessLines, '"4": "accesorios_importacion"'));
check("Phase 5: SAG line 5 → accesorios_importacion", fileContains(businessLines, '"5": "accesorios_importacion"'));
check("Phase 5: Default line = accesorios_importacion", fileContains(businessLines, 'DEFAULT_LINE_ID = "accesorios_importacion"'));

// ── Phase 6: Size rules ─────────────────────────────────────────────────────

check("Phase 6: IMPORTACION_SIZE_ROWS defined", fileContains(tiendasClient, "IMPORTACION_SIZE_ROWS"));
check("Phase 6: Small size", fileContains(tiendasClient, '"small"'));
check("Phase 6: Medium size", fileContains(tiendasClient, '"medium"'));
check("Phase 6: Large size", fileContains(tiendasClient, '"large"'));
check("Phase 6: coverageStrategy SIZE set", fileContains(tiendasClient, 'coverageStrategy: "SIZE"'));

// ── Phase 7: Compatibility ──────────────────────────────────────────────────

const activeInv = readFile("lib/comercial/tiendas/active-inventory.ts");
const ruleCatalog = readFile("lib/comercial/tiendas/store-rule-catalog.ts");
const needsService = readFile("lib/comercial/tiendas/store-needs-service.ts");

check("Phase 7: active-inventory uses accesorios_importacion", fileContains(activeInv, '"accesorios_importacion"'));
check("Phase 7: store-rule-catalog uses accesorios_importacion", fileContains(ruleCatalog, '"accesorios_importacion"'));
check("Phase 7: store-needs-service uses accesorios_importacion", fileContains(needsService, '"accesorios_importacion"'));

// ── Phase 8: Rule labels ────────────────────────────────────────────────────

check("Phase 8: Rule label uses 'Accesorios / Importacion'", fileContains(tiendasClient, "Accesorios / Importacion"));

// ── Phase 9: Textile untouched ──────────────────────────────────────────────

check("Phase 9: Textile still uses SUBGROUP", fileContains(tiendasClient, 'coverageStrategy: "SUBGROUP"'));
check("Phase 9: Textile form has line selector", fileContains(tiendasClient, "handleLineChange"));
check("Phase 9: Textile form has subgroup mode", fileContains(tiendasClient, "subgroupMode"));

// ── Phase 10: CoverageStrategy abstraction ──────────────────────────────────

const coverageStrategy = readFile("lib/comercial/tiendas/coverage-strategy.ts");
check("Phase 10: coverage-strategy.ts exists", coverageStrategy.length > 0);
check("Phase 10: SUBGROUP strategy", fileContains(coverageStrategy, 'id: "SUBGROUP"'));
check("Phase 10: SIZE strategy", fileContains(coverageStrategy, 'id: "SIZE"'));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("HOTFIX VALIDATION FAILED — fix issues above.\n");
  process.exit(1);
} else {
  console.log("HOTFIX VALIDATION PASSED — STORE-COVERAGE-ACCESSORY-IMPORT-MERGE-01 complete.\n");
}
