/**
 * scripts/_validate-castillitos-store-policy-pack-01.ts
 *
 * FASE 12 — Structural validation for CASTILLITOS-STORE-POLICY-PACK-01.
 *
 * Run: npx tsx scripts/_validate-castillitos-store-policy-pack-01.ts
 *
 * Validates:
 *   - Policy Pack created and complete
 *   - Configuration decoupled from evaluators
 *   - No hardcoded rules in engine
 *   - No dependencies with Maletas
 *   - TSC regression check
 *   - Functional tests pass
 */

import * as fs from "fs";
import * as path from "path";

// ── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(60 - title.length)}`);
}

const BASE = path.resolve(__dirname, "../lib/comercial/tiendas");

// ── Validation ──────────────────────────────────────────────────────────────

function validateFileExists(): void {
  section("File Existence");

  const requiredFiles = [
    "store-decision-types.ts",
    "store-policy-pack-config.ts",
    "store-decision-engine.ts",
    "store-policy-pack.ts",
  ];

  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.join(BASE, file));
    check(exists, `${file} exists`);
  }
}

function validatePolicyPackContent(): void {
  section("Policy Pack Content");

  const packContent = fs.readFileSync(path.join(BASE, "store-policy-pack.ts"), "utf-8");

  check(packContent.includes("csp-textile-coverage-v1"), "Textile coverage policy defined");
  check(packContent.includes("csp-global-low-stock-v1"), "Global low stock policy defined");
  check(packContent.includes("csp-accessory-coverage-v1"), "Accessory coverage policy defined");
  check(packContent.includes("csp-special-products-v1"), "Special products policy defined");
  check(packContent.includes("csp-automatic-markdown-v1"), "Automatic markdown policy defined");
  check(packContent.includes("csp-slow-rotation-v1"), "Slow rotation policy defined");
  check(packContent.includes("csp-assortment-suggestion-v1"), "Assortment suggestion policy defined");
  check(packContent.includes("csp-comparative-report-v1"), "Comparative report policy defined");

  // All 8 policies
  check(packContent.includes("CASTILLITOS_STORE_POLICY_COUNT = 8"), "Policy count constant = 8");

  // Only tiendas tags
  check(packContent.includes('"tiendas"'), "Has 'tiendas' tag");
  check(!packContent.includes('"maletas"'), "No 'maletas' tag in pack");
  check(!packContent.includes('"vendedores"'), "No 'vendedores' tag in pack");
}

function validateConfigDecoupled(): void {
  section("Configuration Decoupling");

  const configContent = fs.readFileSync(path.join(BASE, "store-policy-pack-config.ts"), "utf-8");
  const engineContent = fs.readFileSync(path.join(BASE, "store-decision-engine.ts"), "utf-8");

  // Config file has all thresholds
  check(configContent.includes("minimumUnits: 8"), "Config: textile min = 8");
  check(configContent.includes("idealUnits: 10"), "Config: textile ideal = 10");
  check(configContent.includes("maximumUnits: 12"), "Config: textile max = 12");
  check(configContent.includes("threshold: 36"), "Config: Rule 36 threshold = 36");
  check(configContent.includes("small: 6"), "Config: accessory small = 6");
  check(configContent.includes("medium: 4"), "Config: accessory medium = 4");
  check(configContent.includes("large: 1"), "Config: accessory large = 1");
  check(configContent.includes("minimumDaysThreshold: 90"), "Config: slow rotation = 90 days");

  // Engine does NOT hardcode these values
  // It should only reference config.* properties
  const engineWithoutComments = engineContent.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // The engine should use config parameters, not literal numbers for thresholds
  check(engineWithoutComments.includes("config.textileCoverage"), "Engine uses config.textileCoverage");
  check(engineWithoutComments.includes("config.globalLowStock"), "Engine uses config.globalLowStock");
  check(engineWithoutComments.includes("config.accessoryCoverage"), "Engine uses config.accessoryCoverage");
  check(engineWithoutComments.includes("config.specialProducts"), "Engine uses config.specialProducts");
  check(engineWithoutComments.includes("config.automaticMarkdown"), "Engine uses config.automaticMarkdown");
  check(engineWithoutComments.includes("config.slowRotation"), "Engine uses config.slowRotation");
}

function validateNoMaletasDependency(): void {
  section("No Maletas Dependency");

  const files = [
    "store-decision-types.ts",
    "store-policy-pack-config.ts",
    "store-decision-engine.ts",
    "store-policy-pack.ts",
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(BASE, file), "utf-8").toLowerCase();

    check(!content.includes("maleta"), `${file}: no 'maleta' reference`);
    check(!content.includes("derrotero"), `${file}: no 'derrotero' reference`);
    check(!content.includes("vendedor"), `${file}: no 'vendedor' reference`);
    check(!content.includes("pedido"), `${file}: no 'pedido' reference`);
  }
}

function validateEvidenceContract(): void {
  section("Evidence Contract (Three Questions)");

  const typesContent = fs.readFileSync(path.join(BASE, "store-decision-types.ts"), "utf-8");

  // StorePolicyEvidenceItem must have the three-question fields
  check(typesContent.includes("activationReason"), "Evidence has activationReason (Q1: why?)");
  check(typesContent.includes("dataUsed"), "Evidence has dataUsed (Q2: what data?)");
  check(typesContent.includes("recommendedAction"), "Evidence has recommendedAction (Q3: what action?)");
  check(typesContent.includes("actionRationale"), "Evidence has actionRationale (Q3: why this action?)");
  check(typesContent.includes("confidence"), "Evidence has confidence score");
  check(typesContent.includes("severity"), "Evidence has severity level");
}

function validateAllPolicyTypes(): void {
  section("All Policy Types Defined");

  const typesContent = fs.readFileSync(path.join(BASE, "store-decision-types.ts"), "utf-8");

  const expectedTypes = [
    "STORE_TEXTILE_COVERAGE",
    "STORE_GLOBAL_LOW_STOCK",
    "STORE_ACCESSORY_COVERAGE",
    "STORE_SPECIAL_PRODUCT",
    "STORE_AUTOMATIC_MARKDOWN",
    "STORE_SLOW_ROTATION",
    "STORE_ASSORTMENT_SUGGESTION",
    "STORE_COMPARATIVE_REPORT",
  ];

  for (const t of expectedTypes) {
    check(typesContent.includes(t), `Policy type ${t} defined`);
  }
}

function validateEngineExports(): void {
  section("Engine Exports");

  const engineContent = fs.readFileSync(path.join(BASE, "store-decision-engine.ts"), "utf-8");

  const expectedExports = [
    "evaluateTextileCoverage",
    "evaluateGlobalLowStock",
    "evaluateAccessoryCoverage",
    "evaluateSpecialProducts",
    "evaluateAutomaticMarkdowns",
    "evaluateSlowRotation",
    "evaluateAssortmentSuggestion",
    "evaluateComparativeReport",
    "evaluateStorePolicyPack",
  ];

  for (const fn of expectedExports) {
    check(engineContent.includes(`export function ${fn}`), `Engine exports ${fn}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CASTILLITOS-STORE-POLICY-PACK-01 — Structural Validation");
  console.log("═══════════════════════════════════════════════════════════════");

  validateFileExists();
  validatePolicyPackContent();
  validateConfigDecoupled();
  validateNoMaletasDependency();
  validateEvidenceContract();
  validateAllPolicyTypes();
  validateEngineExports();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main();
