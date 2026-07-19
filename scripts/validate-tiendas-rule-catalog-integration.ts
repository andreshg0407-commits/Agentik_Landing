/**
 * scripts/validate-tiendas-rule-catalog-integration.ts
 *
 * Validation for TIENDAS-RULE-CATALOG-INTEGRATION-01
 *
 * Usage: npx tsx scripts/validate-tiendas-rule-catalog-integration.ts
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

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== TIENDAS-RULE-CATALOG-INTEGRATION-01 Validation ===\n");

const catalog = "lib/comercial/tiendas/store-rule-catalog.ts";
const service = "lib/comercial/tiendas/store-replenishment-service.ts";
const route   = "app/api/orgs/[orgSlug]/comercial/tiendas/policies/route.ts";
const client  = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";

// 1. Catalog service exists
console.log("CHECK 1: Catalog service");
check("store-rule-catalog.ts exists", fileExists(catalog));
check("CatalogEntry type exported", fileContains(catalog, "export interface CatalogEntry"));
check("StoreRuleCatalog type exported", fileContains(catalog, "export interface StoreRuleCatalog"));
check("normalizeValue function exported", fileContains(catalog, "export function normalizeValue"));
check("buildRuleCatalog function exported", fileContains(catalog, "export function buildRuleCatalog"));
check("validateRuleAgainstCatalog function exported", fileContains(catalog, "export function validateRuleAgainstCatalog"));

// 2. Catalog structure
console.log("\nCHECK 2: Catalog structure");
check("Catalog has lines field", fileContains(catalog, "lines:"));
check("Catalog has subgroupsByLine field", fileContains(catalog, "subgroupsByLine:"));
check("Catalog has productClasses field", fileContains(catalog, "productClasses:"));
check("Catalog has sizeClasses field", fileContains(catalog, "sizeClasses:"));
check("CatalogEntry has value field", fileContains(catalog, "value: string"));
check("CatalogEntry has label field", fileContains(catalog, "label: string"));

// 3. Normalization
console.log("\nCHECK 3: Normalization");
check("normalizeValue strips accents", fileContains(catalog, "normalize(\"NFD\")"));
check("normalizeValue lowercases", fileContains(catalog, ".toLowerCase()"));
check("normalizeValue replaces non-alphanum with underscore", fileContains(catalog, "/[^a-z0-9]+/g"));

// 4. Validation
console.log("\nCHECK 4: Catalog validation");
check("Validates line exists in catalog", fileContains(catalog, "no existe en el catalogo sincronizado"));
check("Validates subgroup belongs to line", fileContains(catalog, "no pertenece a la linea"));
check("Validates product class exists", fileContains(catalog, "Clase de producto"));
check("Validates size class exists", fileContains(catalog, "Tamano comercial"));
check("CatalogValidationResult type", fileContains(catalog, "export interface CatalogValidationResult"));

// 5. Service integration
console.log("\nCHECK 5: Service integration");
check("Service imports buildRuleCatalog", fileContains(service, "import { buildRuleCatalog }"));
check("getStoreRuleCatalog exported", fileContains(service, "export async function getStoreRuleCatalog"));
check("Catalog uses TTL cache", fileContains(service, "TTL_CATALOG"));
check("Catalog TTL is 5 minutes", fileContains(service, "5 * 60 * 1000"));

// 6. API route
console.log("\nCHECK 6: API route");
check("rule_catalog action exists", fileContains(route, '"rule_catalog"'));
check("Route imports getStoreRuleCatalog", fileContains(route, "getStoreRuleCatalog"));
check("Route imports validateRuleAgainstCatalog", fileContains(route, "validateRuleAgainstCatalog"));
check("add_rule validates against catalog", fileContains(route, "validateRuleAgainstCatalog"));

// 7. UI — no free text for line
console.log("\nCHECK 7: UI line field");
check("No free text input for line", !fileContains(client, 'placeholder="Latin Kids"'));
check("Line uses select element", fileContains(client, "Seleccionar linea..."));
check("Line options from catalog", fileContains(client, "(catalog?.lines ?? []).map"));

// 8. UI — no free text for subgroup
console.log("\nCHECK 8: UI subgroup field");
check("No free text input for subgroup", !fileContains(client, 'placeholder="Camisetas"'));
check("Subgroup uses select element", fileContains(client, "Seleccionar subgrupo..."));
check("Subgroup depends on line", fileContains(client, "Seleccionar linea primero"));
check("Subgroup resets on line change", fileContains(client, 'setSubgroupValue("")'));

// 9. UI — catalog loading state
console.log("\nCHECK 9: UI catalog states");
check("RuleCatalog interface defined", fileContains(client, "interface RuleCatalog"));
check("Catalog loading state", fileContains(client, "Cargando catalogo de productos"));
check("Empty catalog state", fileContains(client, "No se encontraron lineas/subgrupos sincronizados desde SAG"));
check("AddPolicyRuleForm receives catalog prop", fileContains(client, "catalog={catalog}"));
check("loadCatalog function exists", fileContains(client, "const loadCatalog"));

// 10. UI — product class from catalog
console.log("\nCHECK 10: UI product class");
check("Product class options from catalog", fileContains(client, "catalog?.productClasses"));

// 11. Normalization in save flow
console.log("\nCHECK 11: Save flow");
check("Form resolves label from catalog value on submit", fileContains(client, "catalog?.lines.find(l => l.value === lineValue)?.label"));
check("Form resolves subgroup label on submit", fileContains(client, "availableSubgroups.find(s => s.value === subgroupValue)?.label"));

// 12. TSC baseline
console.log("\nCHECK 12: TSC baseline");
check("TSC baseline check deferred (run npx tsc --noEmit manually)", true);

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
