/**
 * scripts/validate-tiendas-business-lines.ts
 *
 * Validation for TIENDAS-LINE-BUSINESS-MODEL-01
 *
 * Usage: npx tsx scripts/validate-tiendas-business-lines.ts
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

console.log("=== TIENDAS-LINE-BUSINESS-MODEL-01 Validation ===\n");

const blFile = "lib/comercial/tiendas/store-business-lines.ts";
const adapter = "lib/comercial/tiendas/sag-store-adapter.ts";
const catalog = "lib/comercial/tiendas/store-rule-catalog.ts";
const activeInv = "lib/comercial/tiendas/active-inventory.ts";
const needsSvc = "lib/comercial/tiendas/store-needs-service.ts";
const sugsSvc = "lib/comercial/tiendas/store-suggestions-service.ts";

// 1. Business line model exists
console.log("CHECK 1: Business line model");
check("store-business-lines.ts exists", fs.existsSync(path.join(ROOT, blFile)));
check("BUSINESS_LINES exported", fileContains(blFile, "export const BUSINESS_LINES"));
check("BUSINESS_LINE_MAP exported", fileContains(blFile, "export const BUSINESS_LINE_MAP"));
check("resolveBusinessLineId exported", fileContains(blFile, "export function resolveBusinessLineId"));
check("resolveBusinessLine exported", fileContains(blFile, "export function resolveBusinessLine"));

// 2. Three fixed lines
console.log("\nCHECK 2: Fixed line definitions");
check("castillitos line defined", fileContains(blFile, 'id: "castillitos"'));
check("latin_kids line defined", fileContains(blFile, 'id: "latin_kids"'));
check("accesorios_importacion line defined", fileContains(blFile, 'id: "accesorios_importacion"'));
check("Castillitos label", fileContains(blFile, 'label: "Castillitos"'));
check("Latin Kids label", fileContains(blFile, 'label: "Latin Kids"'));
check("Accesorios label", fileContains(blFile, 'label: "Accesorios / Importacion"'));

// 3. RuleMode types
console.log("\nCHECK 3: Rule modes");
check("textile ruleMode for castillitos", fileContains(blFile, 'ruleMode: "textile"'));
check("accessory ruleMode for accesorios", fileContains(blFile, 'ruleMode: "accessory"'));
check("RuleMode type exported", fileContains(blFile, 'export type RuleMode'));

// 4. SAG line mapping
console.log("\nCHECK 4: SAG line mapping");
check("SAG line 1 → castillitos", fileContains(blFile, '"1": "castillitos"'));
check("SAG line 2 → latin_kids", fileContains(blFile, '"2": "latin_kids"'));
check("SAG line 3 → castillitos", fileContains(blFile, '"3": "castillitos"'));
check("SAG line 5 → accesorios", fileContains(blFile, '"5": "accesorios_importacion"'));
check("Default line = accesorios", fileContains(blFile, 'DEFAULT_LINE_ID = "accesorios_importacion"'));

// 5. Adapter uses resolver
console.log("\nCHECK 5: Adapter integration");
check("Adapter imports resolveBusinessLineId", fileContains(adapter, "resolveBusinessLineId"));
check("Adapter uses resolveBusinessLineId for PIL", fileContains(adapter, "resolveBusinessLineId(lv.product?.productLine)"));
check("No SIN_LINEA_SAG in adapter", fileNotContains(adapter, "SIN_LINEA_SAG"));

// 6. Catalog uses business lines
console.log("\nCHECK 6: Catalog integration");
check("Catalog imports resolveBusinessLine", fileContains(catalog, "resolveBusinessLine"));
check("Catalog imports BUSINESS_LINE_MAP", fileContains(catalog, "BUSINESS_LINE_MAP"));
check("No 'Linea SAG' labels in catalog", fileNotContains(catalog, "Linea SAG"));
check("No SIN_LINEA_SAG in catalog", fileNotContains(catalog, "SIN_LINEA_SAG"));

// 7. inferProductClass updated across files
console.log("\nCHECK 7: inferProductClass uses business line IDs");
check("active-inventory uses castillitos", fileContains(activeInv, '"castillitos"'));
check("active-inventory uses latin_kids", fileContains(activeInv, '"latin_kids"'));
check("active-inventory uses accesorios_importacion", fileContains(activeInv, '"accesorios_importacion"'));
check("needs-service uses castillitos", fileContains(needsSvc, '"castillitos"'));
check("catalog uses castillitos", fileContains(catalog, '"castillitos"'));
check("No SAG numeric IDs in active-inventory inferProductClass", fileNotContains(activeInv, 'lineId === "1"'));
check("No SAG numeric IDs in needs-service inferProductClass", fileNotContains(needsSvc, 'lineId === "1"'));
check("No SAG numeric IDs in catalog inferProductClass", fileNotContains(catalog, 'lineId === "1"'));

// 8. Suggestions service uses resolver
console.log("\nCHECK 8: Suggestions service");
check("Suggestions imports resolveBusinessLineId", fileContains(sugsSvc, "resolveBusinessLineId"));
check("Suggestions uses resolveBusinessLineId", fileContains(sugsSvc, "resolveBusinessLineId(p.productLine)"));
check("No SIN_LINEA_SAG in suggestions", fileNotContains(sugsSvc, "SIN_LINEA_SAG"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
