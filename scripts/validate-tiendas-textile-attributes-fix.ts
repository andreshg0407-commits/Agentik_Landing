/**
 * scripts/validate-tiendas-textile-attributes-fix.ts
 *
 * Structural validation for TIENDAS-TEXTILE-ATTRIBUTES-FIX-01
 *
 * Usage: npx tsx scripts/validate-tiendas-textile-attributes-fix.ts
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

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileNotContains(rel: string, text: string): boolean {
  return !fileContains(rel, text);
}

console.log("=== TIENDAS-TEXTILE-ATTRIBUTES-FIX-01 Validation ===\n");

const resolver = "lib/comercial/tiendas/variant-attribute-resolver.ts";
const adapter = "lib/comercial/tiendas/sag-store-adapter.ts";

// 1. Resolver exists
console.log("CHECK 1: Resolver file");
check("variant-attribute-resolver.ts exists", fileExists(resolver));
check("resolveVariantSizeColor exported", fileContains(resolver, "export function resolveVariantSizeColor"));

// 2. JSON attributes (primary source)
console.log("\nCHECK 2: JSON attributes source");
check("Reads variant.attributes", fileContains(resolver, "variant.attributes"));
check("Uses tallaName", fileContains(resolver, "tallaName"));
check("Uses talla", fileContains(resolver, "a.talla"));
check("Uses colorName", fileContains(resolver, "colorName"));
check("Uses color code", fileContains(resolver, "a.color"));

// 3. Variant name fallback
console.log("\nCHECK 3: Variant name fallback");
check("Parses variant.name with /", fileContains(resolver, 'indexOf("/")'));
check("fromVariantName function", fileContains(resolver, "fromVariantName"));

// 4. Variant SKU fallback
console.log("\nCHECK 4: Variant SKU fallback");
check("Parses variant.sku with |", fileContains(resolver, 'split("|")'));
check("fromVariantSku function", fileContains(resolver, "fromVariantSku"));

// 5. Relational attributes fallback
console.log("\nCHECK 5: Relational attributes fallback");
check("Reads variantAttributes as fallback", fileContains(resolver, "variantAttributes"));
check("fromRelationalAttributes function", fileContains(resolver, "fromRelationalAttributes"));

// 6. Sentinels
console.log("\nCHECK 6: Sentinels");
check("SIN_TALLA sentinel", fileContains(resolver, "SIN_TALLA"));
check("SIN_COLOR sentinel", fileContains(resolver, "SIN_COLOR"));
check("Source type includes fallback", fileContains(resolver, '"fallback"'));

// 7. Adapter uses resolver
console.log("\nCHECK 7: Adapter integration");
check("Adapter imports resolveVariantSizeColor", fileContains(adapter, "resolveVariantSizeColor"));
check("Adapter uses resolveVariantSizeColor", fileContains(adapter, "resolveVariantSizeColor(lv.variant)"));
check("Adapter does NOT directly find talla", fileNotContains(adapter, 'find((a: { key: string }) => a.key === "talla")'));
check("Adapter does NOT directly find color", fileNotContains(adapter, 'find((a: { key: string }) => a.key === "color")'));

// 8. Source tracking
console.log("\nCHECK 8: Source tracking");
check("VariantAttributeSource type exported", fileContains(resolver, "export type VariantAttributeSource"));
check("Source json_attributes", fileContains(resolver, '"json_attributes"'));
check("Source variant_name", fileContains(resolver, '"variant_name"'));
check("Source variant_sku", fileContains(resolver, '"variant_sku"'));
check("Source relational_attributes", fileContains(resolver, '"relational_attributes"'));

// 9. Debug log
console.log("\nCHECK 9: Coverage debug log");
check("Debug log exists in adapter", fileContains(adapter, "TIENDAS_TEXTILE_ATTR_DEBUG"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
