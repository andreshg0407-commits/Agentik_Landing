/**
 * scripts/validate-tiendas-rules-simplification.ts
 *
 * Structural validation for TIENDAS-RULES-SIMPLIFICATION-01
 *
 * Usage: npx tsx scripts/validate-tiendas-rules-simplification.ts
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
  return !fileContains(rel, text);
}

console.log("=== TIENDAS-RULES-SIMPLIFICATION-01 Validation ===\n");

const client = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";
const engine = "lib/comercial/tiendas/store-policy-engine.ts";
const catalog = "lib/comercial/tiendas/store-rule-catalog.ts";
const lines = "lib/comercial/tiendas/store-business-lines.ts";

// 1. Old templates removed
console.log("CHECK 1: Old templates removed");
check("No RULE_TEMPLATES constant", fileNotContains(client, "const RULE_TEMPLATES"));
check("No 'Textil basico' template", fileNotContains(client, "Textil basico"));
check("No 'Textil detallado' template", fileNotContains(client, "Textil detallado"));
check("No 'Tienda global' template", fileNotContains(client, "Tienda global"));
check("No 'Voluminoso' in empty state", fileNotContains(client, "Voluminoso: 1/1/1"));

// 2. Old scope/class constants removed from form
console.log("\nCHECK 2: Old form constants removed");
check("No PRIMARY_SCOPES in form", fileNotContains(client, "PRIMARY_SCOPES.map"));
check("No OVERRIDE_SCOPES in form", fileNotContains(client, "OVERRIDE_SCOPES.map"));
check("No SCOPE_LABEL in form", fileNotContains(client, "SCOPE_LABEL[s]"));
check("No CLASS_LABEL in form", fileNotContains(client, "CLASS_LABEL[c"));

// 3. New two-mode form
console.log("\nCHECK 3: Two-mode form");
check("RuleMode import", fileContains(client, "import type { RuleMode }"));
check("BUSINESS_LINES import", fileContains(client, "import { BUSINESS_LINES }"));
check("Mode state", fileContains(client, 'useState<RuleMode>("textile")'));
check("Textile mode button", fileContains(client, "Textil"));
check("Accessory mode button", fileContains(client, "Accesorios / Importacion"));

// 4. Textile form fields
console.log("\nCHECK 4: Textile form");
check("Line selector from BUSINESS_LINES", fileContains(client, "textileLines.map"));
check("Subgroup mode: all", fileContains(client, 'setSubgroupMode("all")'));
check("Subgroup mode: selected", fileContains(client, 'setSubgroupMode("selected")'));
check("Subgroup multi-select toggle", fileContains(client, "toggleSubgroup"));
check("Min/Ideal/Max inputs for textile", fileContains(client, "Cantidad por talla/color en tienda"));

// 5. Accessory form fields
console.log("\nCHECK 5: Accessory form");
check("ACCESSORY_SIZE_ROWS defined", fileContains(client, "ACCESSORY_SIZE_ROWS"));
check("Pequeno row", fileContains(client, '"Pequeno"'));
check("Mediano row", fileContains(client, '"Mediano"'));
check("Grande row", fileContains(client, '"Grande"'));
check("Enabled checkbox per row", fileContains(client, 'type="checkbox"'));
check("updateAccRow helper", fileContains(client, "updateAccRow"));

// 6. Submit maps to existing StorePolicyRule
console.log("\nCHECK 6: Submit compatibility");
check("Textile saves scope=line_subgroup", fileContains(client, 'scope: "line_subgroup"'));
check("Textile saves productClass=textile", fileContains(client, 'productClass: "textile"'));
check("Accessory saves scope=class_size", fileContains(client, 'scope: "class_size"'));
check("Accessory saves productClass=accessory", fileContains(client, 'productClass: "accessory"'));
check("Submit validation (canSubmit)", fileContains(client, "const canSubmit"));

// 7. describeRule function
console.log("\nCHECK 7: describeRule labels");
check("describeRule function exists", fileContains(client, "function describeRule(rule: StorePolicyRule)"));
check("Textile label format", fileContains(client, "`Textil · ${line}`"));
check("Accessory label format", fileContains(client, "Accesorios / Importacion"));
check("Legacy rule detection", fileContains(client, "isLegacy: true"));
check("Legacy amber border", fileContains(client, "desc.isLegacy"));

// 8. Engine: all-subgroups support
console.log("\nCHECK 8: Engine all-subgroups");
check("All subgroups match in engine", fileContains(engine, "allSubgroupsMatch"));
check("Matches line_subgroup with no subgroup", fileContains(engine, "&& !r.subgroup"));
check("Bulky → accessory resolution", fileContains(engine, 'input.productClass === "bulky" ? "accessory"'));

// 9. Server validation
console.log("\nCHECK 9: Server validation");
check("Min/ideal/max ordering validation", fileContains(catalog, "Ideal no puede ser menor que Min"));
check("Max >= ideal validation", fileContains(catalog, "Max no puede ser menor que Ideal"));
check("Textile requires line", fileContains(catalog, "Regla textil requiere una linea"));
check("Accessory requires sizeClass", fileContains(catalog, "Regla de accesorios requiere un tamano comercial"));
check("Negative qty check", fileContains(catalog, "no pueden ser negativas"));

// 10. Business lines model
console.log("\nCHECK 10: Business lines");
check("BUSINESS_LINES exported", fileContains(lines, "export const BUSINESS_LINES"));
check("RuleMode type exported", fileContains(lines, "export type RuleMode"));
check("Castillitos line", fileContains(lines, '"castillitos"'));
check("Latin Kids line", fileContains(lines, '"latin_kids"'));
check("Accesorios line", fileContains(lines, '"accesorios_importacion"'));

// 11. No oversized in catalog
console.log("\nCHECK 11: Size class cleanup");
check("No oversized in empty catalog", fileNotContains(catalog, '"oversized"'));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
