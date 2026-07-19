/**
 * scripts/validate-commercial-coverage-rules-engine.ts
 *
 * Sprint validation for COMMERCIAL-COVERAGE-RULES-ENGINE-01.
 *
 * Usage: npx tsx scripts/validate-commercial-coverage-rules-engine.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

function readFile(relPath: string): string {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

function fileContains(content: string, needle: string): boolean {
  return content.includes(needle);
}

console.log("\n=== COMMERCIAL-COVERAGE-RULES-ENGINE-01 Validation ===\n");

// ── 1. Engine exists in shared location (not UI) ────────────────────────────

check("1. Engine directory exists", fileExists("lib/comercial/rules/coverage"));
check("1. Engine file exists", fileExists("lib/comercial/rules/coverage/commercial-coverage-engine.ts"));
check("1. Index barrel exists", fileExists("lib/comercial/rules/coverage/index.ts"));
check("1. NOT in UI components", !fileExists("components/comercial/coverage-engine.ts"));

// ── 2. Types file ───────────────────────────────────────────────────────────

const types = readFile("lib/comercial/rules/coverage/commercial-coverage-types.ts");
check("2. CommercialCoverageInput defined", fileContains(types, "CommercialCoverageInput"));
check("2. CommercialCoverageResult defined", fileContains(types, "CommercialCoverageResult"));
check("2. CommercialCoverageEvaluation defined", fileContains(types, "CommercialCoverageEvaluation"));
check("2. CommercialCoverageSuggestion defined", fileContains(types, "CommercialCoverageSuggestion"));
check("2. CommercialCoverageExplanation defined", fileContains(types, "CommercialCoverageExplanation"));
check("2. CommercialCoverageDataQuality defined", fileContains(types, "CommercialCoverageDataQuality"));
check("2. CoverageState defined", fileContains(types, "CoverageState"));
check("2. CoverageSuggestionAction defined", fileContains(types, "CoverageSuggestionAction"));
check("2. ConfidenceLevel defined", fileContains(types, "ConfidenceLevel"));
check("2. DataQualityLevel defined", fileContains(types, "DataQualityLevel"));

// ── 3. Strategy: SUBGROUP ───────────────────────────────────────────────────

check("3. SUBGROUP strategy file", fileExists("lib/comercial/rules/coverage/strategies/subgroup-coverage-strategy.ts"));
const subgroupStrategy = readFile("lib/comercial/rules/coverage/strategies/subgroup-coverage-strategy.ts");
check("3. evaluateSubgroupStrategy exported", fileContains(subgroupStrategy, "export function evaluateSubgroupStrategy"));
check("3. SUBGROUP state: BELOW_MIN", fileContains(subgroupStrategy, "BELOW_MIN"));
check("3. SUBGROUP state: INSUFFICIENT_DATA", fileContains(subgroupStrategy, "INSUFFICIENT_DATA"));

// ── 4. Strategy: SIZE ───────────────────────────────────────────────────────

check("4. SIZE strategy file", fileExists("lib/comercial/rules/coverage/strategies/size-coverage-strategy.ts"));
const sizeStrategy = readFile("lib/comercial/rules/coverage/strategies/size-coverage-strategy.ts");
check("4. evaluateSizeStrategy exported", fileContains(sizeStrategy, "export function evaluateSizeStrategy"));
check("4. SIZE checks sizeClass", fileContains(sizeStrategy, "input.sizeClass"));

// ── 5. Textil uses SUBGROUP ─────────────────────────────────────────────────

const engine = readFile("lib/comercial/rules/coverage/commercial-coverage-engine.ts");
check("5. castillitos → SUBGROUP", fileContains(engine, 'lineId === "castillitos"'));
check("5. latin_kids → SUBGROUP", fileContains(engine, 'lineId === "latin_kids"'));

// ── 6. Accesorios / Importacion uses SIZE ───────────────────────────────────

check("6. accesorios_importacion → SIZE", fileContains(engine, 'lineId === "accesorios_importacion"'));
check("6. Alias accesorios → SIZE", fileContains(engine, 'lineId === "accesorios"'));
check("6. Alias importacion → SIZE", fileContains(engine, 'lineId === "importacion"'));

// ── 7. Rule resolver ────────────────────────────────────────────────────────

const resolver = readFile("lib/comercial/rules/coverage/commercial-coverage-rule-resolver.ts");
check("7. resolveRule exported", fileContains(resolver, "export function resolveRule"));
check("7. Precedence via SCOPE_PRIORITY", fileContains(resolver, "SCOPE_PRIORITY"));
check("7. Store-specific bonus", fileContains(resolver, "storeBonus"));
check("7. hadConflict detection", fileContains(resolver, "hadConflict"));
check("7. matchConfidence", fileContains(resolver, "matchConfidence"));
check("7. selectionReason", fileContains(resolver, "selectionReason"));

// ── 8. Suggestion calculation ───────────────────────────────────────────────

check("8. suggestedQty in engine", fileContains(engine, "rawSuggestedQty"));
check("8. finalSuggestedQty (source constraint)", fileContains(engine, "finalSuggestedQty"));
check("8. unmetQty", fileContains(engine, "unmetQty"));
check("8. sourceConstrained", fileContains(engine, "sourceConstrained"));
check("8. Never negative", fileContains(engine, "Math.max(0,"));

// ── 9. Explanation ──────────────────────────────────────────────────────────

const explanation = readFile("lib/comercial/rules/coverage/commercial-coverage-explanation.ts");
check("9. buildExplanation exported", fileContains(explanation, "export function buildExplanation"));
check("9. Explanation has summary", fileContains(explanation, "summary"));
check("9. Explanation has details.limitations", fileContains(explanation, "limitations"));

// ── 10. Confidence / data quality ───────────────────────────────────────────

check("10. assessDataQuality in engine", fileContains(engine, "assessDataQuality"));
check("10. confidenceLevel (HIGH/MEDIUM/LOW)", fileContains(engine, "HIGH") && fileContains(engine, "MEDIUM") && fileContains(engine, "LOW"));
check("10. inventoryQuality", fileContains(engine, "inventoryQuality"));
check("10. ruleQuality", fileContains(engine, "ruleQuality"));

// ── 11. Store needs integration ─────────────────────────────────────────────

const needsService = readFile("lib/comercial/tiendas/store-needs-service.ts");
check("11. store-needs-service imports coverage engine", fileContains(needsService, "@/lib/comercial/rules/coverage"));
check("11. evaluateStoreCoverage function", fileContains(needsService, "evaluateStoreCoverage"));

// ── 12. Config ──────────────────────────────────────────────────────────────

const config = readFile("lib/comercial/rules/coverage/commercial-coverage-config.ts");
check("12. SCOPE_PRIORITY defined", fileContains(config, "SCOPE_PRIORITY"));
check("12. DEFAULT_THRESHOLDS defined", fileContains(config, "DEFAULT_THRESHOLDS"));
check("12. SIZE_LABEL defined", fileContains(config, "SIZE_LABEL"));

// ── 13. No UI logic ────────────────────────────────────────────────────────

const tiendasClient = readFile("app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
check("13. tiendas-client does NOT import coverage engine", !fileContains(tiendasClient, "commercial-coverage-engine"));
check("13. tiendas-client does NOT calculate gapToIdeal", !fileContains(tiendasClient, "gapToIdeal"));

// ── 14. Maletas/Inventario/Importaciones untouched ──────────────────────────

// Coverage engine should not be imported by maletas or inventario modules
check("14. No maletas dependency on coverage engine", !fileContains(readFile("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx"), "comercial/rules/coverage"));

// ── 15. Rule change test (functional) ───────────────────────────────────────

import { evaluateCoverage } from "../lib/comercial/rules/coverage";
import type { StorePolicyRule } from "../lib/comercial/tiendas/store-policy-types";

const testRule: StorePolicyRule = {
  id: "test-01", storeId: "s1", scope: "class_size", productClass: "accessory",
  sizeClass: "medium", minQty: 4, idealQty: 6, maxQty: 8,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 10, active: true, coverageStrategy: "SIZE",
};

const testInput = {
  tenantId: "t", organizationId: "o", storeId: "s1", storeName: "Test",
  referenceCode: "R1", productName: "P", productClass: "accessory" as const,
  businessLine: "accesorios_importacion", sizeClass: "medium" as const,
  currentUnits: 2, sourceAvailableUnits: 20,
  activeRules: [testRule],
};

const result1 = evaluateCoverage(testInput);
check("15. Mediano ideal=6, current=2 → suggest 4", result1.suggestion.finalSuggestedQty === 4);

// Change rule: ideal 7
const modifiedRule = { ...testRule, idealQty: 7 };
const result2 = evaluateCoverage({ ...testInput, activeRules: [modifiedRule] });
check("15. Change ideal to 7 → suggest 5", result2.suggestion.finalSuggestedQty === 5);

// ── 16. No negative suggestions ─────────────────────────────────────────────

const overMaxInput = { ...testInput, currentUnits: 12 };
const result3 = evaluateCoverage(overMaxInput);
check("16. Over max → suggest 0 (never negative)", result3.suggestion.finalSuggestedQty === 0);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("SPRINT VALIDATION FAILED — fix issues above.\n");
  process.exit(1);
} else {
  console.log("SPRINT VALIDATION PASSED — COMMERCIAL-COVERAGE-RULES-ENGINE-01 complete.\n");
}
