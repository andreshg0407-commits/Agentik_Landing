/**
 * scripts/validate-tiendas-textile-coverage-real.ts
 *
 * Structural validation for TIENDAS-TEXTILE-COVERAGE-REAL-01
 *
 * Usage: npx tsx scripts/validate-tiendas-textile-coverage-real.ts
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

console.log("=== TIENDAS-TEXTILE-COVERAGE-REAL-01 Validation ===\n");

const types = "lib/comercial/tiendas/assortment-types.ts";
const engine = "lib/comercial/tiendas/textile-coverage-engine.ts";
const client = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";

// 1. TextileCoverageKey type
console.log("CHECK 1: TextileCoverageKey type");
check("TextileCoverageKey interface exists", fileContains(types, "export interface TextileCoverageKey"));
check("TextileCoverageKey has line field", fileContains(types, "line:     string;"));
check("TextileCoverageKey has subgroup field", fileContains(types, "subgroup: string;"));
check("TextileCoverageKey has size field", fileContains(types, "size:     string;"));
check("TextileCoverageKey has color field", fileContains(types, "color:    string;"));

// 2. buildTextileCoverageKey helper
console.log("\nCHECK 2: buildTextileCoverageKey helper");
check("buildTextileCoverageKey exported", fileContains(types, "export function buildTextileCoverageKey"));
check("Sentinel exclusion", fileContains(types, "TEXTILE_COVERAGE_SENTINELS"));
check("Diagnostic mode parameter", fileContains(types, "diagnosticMode"));
check("Key format line|subgroup|size|color", fileContains(types, '`${line}|${subgroup}|${size}|${color}`'));

// 3. Combination fields on TextileCoverageAnalysis
console.log("\nCHECK 3: Combination fields");
check("expectedCombinations field", fileContains(types, "expectedCombinations:   number;"));
check("coveredCombinations field", fileContains(types, "coveredCombinations:    number;"));
check("missingCombinations field", fileContains(types, "missingCombinations:    number;"));
check("combinationCoveragePercent field", fileContains(types, "combinationCoveragePercent: number;"));

// 4. Engine: combination-based coverage
console.log("\nCHECK 4: Engine combination logic");
check("computeCombinationCoverage function", fileContains(engine, "computeCombinationCoverage"));
check("resolveSubgroupCatalogFromMainWarehouse function", fileContains(engine, "resolveSubgroupCatalogFromMainWarehouse"));
check("Engine imports buildTextileCoverageKey", fileContains(engine, "buildTextileCoverageKey"));
check("Engine returns expectedCombinations", fileContains(engine, "expectedCombinations: catalog.combinations.size"));
check("Engine returns coveredCombinations", fileContains(engine, "coveredCombinations: comboCov.covered.size"));
check("Engine returns missingCombinations", fileContains(engine, "missingCombinations: comboCov.missing.size"));
check("Engine returns combinationCoveragePercent", fileContains(engine, "combinationCoveragePercent: comboCov.percent"));

// 5. Coverage formula: combination-based (NOT old average)
console.log("\nCHECK 5: Coverage formula");
check("Overall = combination-based", fileContains(engine, "const overall = comboCov.percent;"));
check("NOT old average formula", fileNotContains(engine, "(sizeCov.percent + colorCov.percent) / 2"));

// 6. Expected combos from MAIN WAREHOUSE (not allInventory)
console.log("\nCHECK 6: Expected source");
check("Catalog from main warehouse", fileContains(engine, "resolveSubgroupCatalogFromMainWarehouse"));
check("Uses mainStock for catalog", fileContains(engine, "mainStock: MainWarehouseAvailability[]"));
check("Checks net availability > 0", fileContains(engine, "if (net <= 0) continue;"));
check("NOT old resolveSubgroupCatalog", fileNotContains(engine, "function resolveSubgroupCatalog("));

// 7. RULELESS-MODE guard preserved
console.log("\nCHECK 7: RULELESS-MODE guard");
check("hasRules parameter", fileContains(engine, "hasRules: boolean"));
check("Guard returns empty array", fileContains(engine, "if (!hasRules) return [];"));

// 8. KPI returns combination data
console.log("\nCHECK 8: KPI combination data");
check("KPI returns expectedCombinations", fileContains(engine, "expectedCombinations: totalExpected"));
check("KPI returns coveredCombinations", fileContains(engine, "coveredCombinations: totalCovered"));
check("KPI overall from combos", fileContains(engine, "totalCovered / totalExpected"));

// 9. Client UI updates
console.log("\nCHECK 9: Client UI");
check("Client shows Combinaciones KPI", fileContains(client, "Combinaciones"));
check("Client shows coveredCombinations", fileContains(client, "kpi.coveredCombinations"));
check("Client shows expectedCombinations", fileContains(client, "kpi.expectedCombinations"));
check("Client shows per-subgroup combination coverage", fileContains(client, "a.coveredCombinations"));
check("Client shows combinationCoveragePercent", fileContains(client, "a.combinationCoveragePercent"));

// 10. Gap detection uses missing combinations
console.log("\nCHECK 10: Gap detection");
check("Gaps from missingCombinations", fileContains(engine, "comboCov.missing"));
check("Gap severity critica for missing", fileContains(engine, 'severity: "critica"'));
check("Gap candidates with priority", fileContains(engine, "findGapCandidates"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
