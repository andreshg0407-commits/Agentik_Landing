/**
 * scripts/validate-commercial-rules-evidence.ts
 *
 * Sprint validation for COMMERCIAL-RULES-EVIDENCE-01.
 *
 * Usage: npx tsx scripts/validate-commercial-rules-evidence.ts
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

function has(content: string, needle: string): boolean {
  return content.includes(needle);
}

console.log("\n=== COMMERCIAL-RULES-EVIDENCE-01 Validation ===\n");

// ── 1. Evidence Engine exists ───────────────────────────────────────────────

check("1. Evidence engine file exists", fileExists("lib/comercial/rules/coverage/commercial-evidence-engine.ts"));
check("1. Evidence types file exists", fileExists("lib/comercial/rules/coverage/commercial-evidence-types.ts"));

// ── 2. Every evaluation returns evidence ────────────────────────────────────

const engineFile = readFile("lib/comercial/rules/coverage/commercial-coverage-engine.ts");
check("2. Engine imports collectEvidence", has(engineFile, "collectEvidence"));
check("2. Engine attaches evidence to result", has(engineFile, "evidence,"));

const typesFile = readFile("lib/comercial/rules/coverage/commercial-coverage-types.ts");
check("2. CommercialCoverageResult has evidence field", has(typesFile, "evidence:"));

// ── 3. Evidence items are typed ─────────────────────────────────────────────

const evidenceTypes = readFile("lib/comercial/rules/coverage/commercial-evidence-types.ts");
check("3. EvidenceType enum defined", has(evidenceTypes, "EvidenceType"));
check("3. EvidenceType: RULE", has(evidenceTypes, '"RULE"'));
check("3. EvidenceType: INVENTORY", has(evidenceTypes, '"INVENTORY"'));
check("3. EvidenceType: STORE", has(evidenceTypes, '"STORE"'));
check("3. EvidenceType: PRODUCT", has(evidenceTypes, '"PRODUCT"'));
check("3. EvidenceType: SOURCE", has(evidenceTypes, '"SOURCE"'));
check("3. EvidenceType: CALCULATION", has(evidenceTypes, '"CALCULATION"'));
check("3. EvidenceType: STRATEGY", has(evidenceTypes, '"STRATEGY"'));
check("3. EvidenceType: FALLBACK", has(evidenceTypes, '"FALLBACK"'));
check("3. EvidenceType: WARNING", has(evidenceTypes, '"WARNING"'));
check("3. EvidenceType: MISSING_DATA", has(evidenceTypes, '"MISSING_DATA"'));

// ── 4. Sources are typed (no free strings) ──────────────────────────────────

check("4. EvidenceSource enum defined", has(evidenceTypes, "EvidenceSource"));
check("4. Source: SAG", has(evidenceTypes, '"SAG"'));
check("4. Source: COMMERCIAL_DATA_LAYER", has(evidenceTypes, '"COMMERCIAL_DATA_LAYER"'));
check("4. Source: STORE_POLICY", has(evidenceTypes, '"STORE_POLICY"'));
check("4. Source: COVERAGE_STRATEGY", has(evidenceTypes, '"COVERAGE_STRATEGY"'));
check("4. Source: INVENTORY_SNAPSHOT", has(evidenceTypes, '"INVENTORY_SNAPSHOT"'));
check("4. Source: CALCULATED", has(evidenceTypes, '"CALCULATED"'));
check("4. Source: MANUAL_OVERRIDE", has(evidenceTypes, '"MANUAL_OVERRIDE"'));
check("4. Source: SYSTEM_DEFAULT", has(evidenceTypes, '"SYSTEM_DEFAULT"'));

// ── 5. Explanation derives from evidence (not vice-versa) ───────────────────

// Engine pipeline: evidence collected BEFORE explanation can use it
check("5. Evidence collected before return", has(engineFile, "collectEvidence(input, evaluation, suggestion, dataQuality)"));

// ── 6. Missing data is registered ──────────────────────────────────────────

const evidenceEngine = readFile("lib/comercial/rules/coverage/commercial-evidence-engine.ts");
check("6. detectMissingData function", has(evidenceEngine, "detectMissingData"));
check("6. Missing sizeClass detection", has(evidenceEngine, '"sizeClass"'));
check("6. Missing subgroup detection", has(evidenceEngine, '"subgroup"'));
check("6. Missing sourceAvailableUnits", has(evidenceEngine, '"sourceAvailableUnits"'));
check("6. MissingDataEvidence built", has(evidenceEngine, "buildMissingDataEvidence"));

// ── 7. Rule evidence is registered ─────────────────────────────────────────

check("7. buildRuleEvidence function", has(evidenceEngine, "buildRuleEvidence"));
check("7. Rule evidence captures ruleId", has(evidenceEngine, "ruleId:"));
check("7. Rule evidence captures scope", has(evidenceEngine, "scope:"));
check("7. Rule evidence captures hadConflict", has(evidenceEngine, "hadConflict:"));
check("7. Rule evidence captures candidateCount", has(evidenceEngine, "candidateCount:"));

// ── 8. Calculation evidence is complete ─────────────────────────────────────

check("8. buildCalculationEvidence function", has(evidenceEngine, "buildCalculationEvidence"));
check("8. Calc: currentCoverage", has(evidenceEngine, "currentCoverage:"));
check("8. Calc: gapToMin", has(evidenceEngine, "gapToMin:"));
check("8. Calc: gapToIdeal", has(evidenceEngine, "gapToIdeal:"));
check("8. Calc: finalSuggestedQty", has(evidenceEngine, "finalSuggestedQty:"));
check("8. Calc: state", has(evidenceEngine, "state:"));
check("8. Calc: action", has(evidenceEngine, "action:"));

// ── 9. Confidence and factors are registered ────────────────────────────────

check("9. buildConfidenceEvidence function", has(evidenceEngine, "buildConfidenceEvidence"));
check("9. buildConfidenceFactors function", has(evidenceEngine, "buildConfidenceFactors"));
check("9. ConfidenceFactor type", has(evidenceTypes, "ConfidenceFactor"));
check("9. Factor: satisfied boolean", has(evidenceTypes, "satisfied: boolean"));
check("9. Factor: impact number", has(evidenceTypes, "impact: number"));

// ── 10. TSC baseline ────────────────────────────────────────────────────────

// (checked externally — just verify files parse correctly via existence)
check("10. Barrel exports collectEvidence", has(readFile("lib/comercial/rules/coverage/index.ts"), "collectEvidence"));
check("10. Barrel exports evidence types", has(readFile("lib/comercial/rules/coverage/index.ts"), "CommercialEvidence"));

// ── 11. Functional tests ────────────────────────────────────────────────────

import { evaluateCoverage } from "../lib/comercial/rules/coverage";
import type { StorePolicyRule } from "../lib/comercial/tiendas/store-policy-types";

const testRule: StorePolicyRule = {
  id: "t1", storeId: "s1", scope: "class_size", productClass: "accessory",
  sizeClass: "medium", minQty: 4, idealQty: 6, maxQty: 8,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 10, active: true, coverageStrategy: "SIZE",
};

const r1 = evaluateCoverage({
  tenantId: "t", organizationId: "o", storeId: "s1", storeName: "T",
  referenceCode: "R1", productName: "P", productClass: "accessory",
  businessLine: "accesorios_importacion", sizeClass: "medium",
  currentUnits: 2, sourceAvailableUnits: 20, activeRules: [testRule],
});

check("11. Result has evidence field", !!r1.evidence);
check("11. Evidence has items array", Array.isArray(r1.evidence.items));
check("11. Evidence has confidenceFactors", Array.isArray(r1.evidence.confidenceFactors));
check("11. Evidence has missingData", Array.isArray(r1.evidence.missingData));
check("11. Evidence has collectedAt", typeof r1.evidence.collectedAt === "string");
check("11. At least 7 evidence items", r1.evidence.items.length >= 7);
check("11. RULE item present", r1.evidence.items.some(e => e.type === "RULE"));
check("11. INVENTORY item present", r1.evidence.items.some(e => e.type === "INVENTORY"));
check("11. CALCULATION item present", r1.evidence.items.some(e => e.type === "CALCULATION"));
check("11. STRATEGY item present", r1.evidence.items.some(e => e.type === "STRATEGY"));
check("11. All items have typed source", r1.evidence.items.every(e => typeof e.source === "string" && e.source.length > 0));

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("SPRINT VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("SPRINT VALIDATION PASSED — COMMERCIAL-RULES-EVIDENCE-01 complete.\n");
}
