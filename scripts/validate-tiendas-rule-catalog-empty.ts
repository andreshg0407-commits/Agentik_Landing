/**
 * scripts/validate-tiendas-rule-catalog-empty.ts
 *
 * Validation for TIENDAS-RULE-CATALOG-EMPTY-01
 *
 * Usage: npx tsx scripts/validate-tiendas-rule-catalog-empty.ts
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

console.log("=== TIENDAS-RULE-CATALOG-EMPTY-01 Validation ===\n");

const catalog = "lib/comercial/tiendas/store-rule-catalog.ts";
const service = "lib/comercial/tiendas/store-replenishment-service.ts";

// 1. Direct Prisma catalog builder exists
console.log("CHECK 1: Direct Prisma catalog builder");
check("buildRuleCatalogFromPrisma function exported", fileContains(catalog, "export async function buildRuleCatalogFromPrisma"));
check("Queries productInventoryLevel", fileContains(catalog, "productInventoryLevel"));
check("Includes ProductEntity fields", fileContains(catalog, "productLine: true, subgrupoSag: true"));
check("Reads product.subgrupoSag", fileContains(catalog, "product?.subgrupoSag"));
check("Reads product.productLine", fileContains(catalog, "product?.productLine"));

// 2. Service uses new builder
console.log("\nCHECK 2: Service integration");
check("Service imports buildRuleCatalogFromPrisma", fileContains(service, "buildRuleCatalogFromPrisma"));
check("getStoreRuleCatalog calls buildRuleCatalogFromPrisma", fileContains(service, "buildRuleCatalogFromPrisma(orgId)"));
check("Cache skips empty catalogs", fileContains(service, "cached.lines.length > 0"));
check("Falls back to store inventory", fileContains(service, "buildRuleCatalog(data.inventory)"));

// 3. Line labels
console.log("\nCHECK 3: Line labels");
check("Lines labeled as Linea SAG", fileContains(catalog, "Linea SAG"));
check("SIN_LINEA_SAG fallback label", fileContains(catalog, "Sin linea SAG"));

// 4. Subgroup handling
console.log("\nCHECK 4: Subgroup handling");
check("Subgroups grouped by line", fileContains(catalog, "subgroupMap.get(lineVal)"));
check("Only includes real subgrupoSag (not null)", fileContains(catalog, "if (subgrupo)"));

// 5. Debug logging
console.log("\nCHECK 5: Debug logging");
check("Debug log with orgId", fileContains(catalog, "[TIENDAS_RULE_CATALOG_DEBUG] orgId="));
check("Debug log with counts", fileContains(catalog, "withSubgrupo="));

// 6. Empty catalog helper
console.log("\nCHECK 6: Empty catalog");
check("emptyCatalog function exists", fileContains(catalog, "function emptyCatalog"));

// 7. Prisma import
console.log("\nCHECK 7: Prisma import");
check("Imports prisma", fileContains(catalog, 'import { prisma } from "@/lib/prisma"'));

// 8. Frontend stale catalog guard (VERIFY-01)
const client = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";
console.log("\nCHECK 8: Frontend stale catalog guard");
check("loadCatalog checks catalog.lines.length > 0", fileContains(client, "catalog.lines.length > 0"));
check("Does NOT use bare catalog truthy check", !fileContains(client, "if (catalog || catalogLoading) return"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
