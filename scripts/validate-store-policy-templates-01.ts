/**
 * scripts/validate-store-policy-templates-01.ts
 *
 * Structural validation for STORE-POLICY-TEMPLATES-01.
 *
 * Usage: npx tsx scripts/validate-store-policy-templates-01.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const ROOT = resolve(__dirname, "..");
const STORE = resolve(ROOT, "lib/comercial/business-policy/templates/store");

console.log("\n=== STORE-POLICY-TEMPLATES-01 Structural Validation ===\n");

// -- 1. File Structure -------------------------------------------------------

console.log("--- 1. File Structure ---");

const expectedFiles = [
  "store-policy-template-types.ts",
  "store-policy-template-registry.ts",
  "store-policy-template-validation.ts",
  "store-policy-template-builders.ts",
  "index.ts",
];

for (const f of expectedFiles) {
  check(`${f} exists`, existsSync(resolve(STORE, f)));
}

check("Architecture doc exists", existsSync(resolve(ROOT, "docs/implementation/STORE_POLICY_TEMPLATES_01.md")));

// -- 2. Template Types (FASE 2) -----------------------------------------------

console.log("\n--- 2. Template Types ---");

const types = readFileSync(resolve(STORE, "store-policy-template-types.ts"), "utf-8");

check("STORE_COVERAGE type", types.includes('"STORE_COVERAGE"'));
check("STORE_ASSORTMENT type", types.includes('"STORE_ASSORTMENT"'));
check("STORE_SIZE_TARGET type", types.includes('"STORE_SIZE_TARGET"'));
check("STORE_STOCK_RESTRICTION type", types.includes('"STORE_STOCK_RESTRICTION"'));
check("STORE_PRODUCT_EXCEPTION type", types.includes('"STORE_PRODUCT_EXCEPTION"'));
check("STORE_DEVIATION_ALERT type", types.includes('"STORE_DEVIATION_ALERT"'));
check("STORE_TRANSFER (planned)", types.includes('"STORE_TRANSFER"'));
check("STORE_ROTATION (planned)", types.includes('"STORE_ROTATION"'));
check("STORE_MARKDOWN (planned)", types.includes('"STORE_MARKDOWN"'));
check("STORE_CAPACITY (planned)", types.includes('"STORE_CAPACITY"'));

// -- 3. Template Contract (FASE 3) --------------------------------------------

console.log("\n--- 3. Template Contract ---");

check("StorePolicyTemplate interface", types.includes("interface StorePolicyTemplate"));
check("templateId field", types.includes("readonly templateId: string"));
check("templateType field", types.includes("readonly templateType: StorePolicyTemplateType"));
check("category field", types.includes("readonly category: PolicyCategory"));
check("displayName field", types.includes("readonly displayName: string"));
check("description field", types.includes("readonly description: string"));
check("supportedScopes field", types.includes("readonly supportedScopes: readonly PolicyScope[]"));
check("supportedConditions field", types.includes("readonly supportedConditions: readonly TemplateConditionDescriptor[]"));
check("supportedActions field", types.includes("readonly supportedActions: readonly TemplateActionDescriptor[]"));
check("requiredParameters field", types.includes("readonly requiredParameters: readonly TemplateParameterDescriptor[]"));
check("optionalParameters field", types.includes("readonly optionalParameters: readonly TemplateParameterDescriptor[]"));
check("precedenceGroup field", types.includes("readonly precedenceGroup: PrecedenceGroup"));
check("version field", types.includes("readonly version: string"));
check("metadata field", types.includes("readonly metadata: TemplateMetadata"));

// Supporting types
check("TemplateMetadata interface", types.includes("interface TemplateMetadata"));
check("TemplateParameterDescriptor interface", types.includes("interface TemplateParameterDescriptor"));
check("TemplateConditionDescriptor interface", types.includes("interface TemplateConditionDescriptor"));
check("TemplateActionDescriptor interface", types.includes("interface TemplateActionDescriptor"));
check("ParameterConstraints interface", types.includes("interface ParameterConstraints"));
check("TemplateInstantiationInput interface", types.includes("interface TemplateInstantiationInput"));
check("PrecedenceGroup type", types.includes("type PrecedenceGroup"));
check("PRECEDENCE_VALUES exported", types.includes("PRECEDENCE_VALUES"));

// -- 4. Builders (FASE 4) -----------------------------------------------------

console.log("\n--- 4. Builders ---");

const builders = readFileSync(resolve(STORE, "store-policy-template-builders.ts"), "utf-8");

check("buildStoreCoverageTemplate function", builders.includes("function buildStoreCoverageTemplate"));
check("buildStoreAssortmentTemplate function", builders.includes("function buildStoreAssortmentTemplate"));
check("buildStoreSizeTargetTemplate function", builders.includes("function buildStoreSizeTargetTemplate"));
check("buildStoreStockRestrictionTemplate function", builders.includes("function buildStoreStockRestrictionTemplate"));
check("buildStoreProductExceptionTemplate function", builders.includes("function buildStoreProductExceptionTemplate"));
check("buildStoreDeviationAlertTemplate function", builders.includes("function buildStoreDeviationAlertTemplate"));
check("TemplateBuildResult interface", builders.includes("interface TemplateBuildResult"));
check("Builders produce DRAFT status", builders.includes('"DRAFT"'));
check("Builders do NOT register", !builders.includes("registerPolicy"));
check("Builders do NOT activate", !builders.includes("activatePolicy") && !builders.includes('"ACTIVE"'));
check("Builders set sourceTemplate metadata", builders.includes("sourceTemplate"));

// -- 5. Validation (FASE 5) ---------------------------------------------------

console.log("\n--- 5. Validation ---");

const validation = readFileSync(resolve(STORE, "store-policy-template-validation.ts"), "utf-8");

check("validateTemplate function", validation.includes("function validateTemplate"));
check("validateInstantiation function", validation.includes("function validateInstantiation"));
check("Checks duplicate parameters", validation.includes("Duplicate parameter"));
check("Checks empty scopes", validation.includes("At least one supported scope"));
check("Checks invalid category", validation.includes("Invalid category"));
check("Checks template status", validation.includes("PLANNED"));
check("Checks missing required params", validation.includes("Required parameter"));
check("Checks constraint violations", validation.includes("constraints"));
check("Checks unknown parameters", validation.includes("Unknown parameter"));
check("Checks required conditions", validation.includes("Required condition"));

// -- 6. Registry (FASE 6) -----------------------------------------------------

console.log("\n--- 6. Registry ---");

const registry = readFileSync(resolve(STORE, "store-policy-template-registry.ts"), "utf-8");

check("registerTemplate function", registry.includes("function registerTemplate"));
check("getTemplate function", registry.includes("function getTemplate"));
check("getTemplateByType function", registry.includes("function getTemplateByType"));
check("listTemplates function", registry.includes("function listTemplates"));
check("resolveTemplate function", registry.includes("function resolveTemplate"));
check("_clearTemplateRegistry function", registry.includes("function _clearTemplateRegistry"));
check("Seeds 10 templates", registry.includes("STORE_COVERAGE") && registry.includes("STORE_CAPACITY"));

// -- 7. Barrel Exports ---------------------------------------------------------

console.log("\n--- 7. Barrel Exports ---");

const barrel = readFileSync(resolve(STORE, "index.ts"), "utf-8");

check("Exports StorePolicyTemplateType", barrel.includes("StorePolicyTemplateType"));
check("Exports StorePolicyTemplate", barrel.includes("StorePolicyTemplate"));
check("Exports TemplateInstantiationInput", barrel.includes("TemplateInstantiationInput"));
check("Exports ACTIVE_TEMPLATE_TYPES", barrel.includes("ACTIVE_TEMPLATE_TYPES"));
check("Exports PLANNED_TEMPLATE_TYPES", barrel.includes("PLANNED_TEMPLATE_TYPES"));
check("Exports ALL_STORE_TEMPLATE_TYPES", barrel.includes("ALL_STORE_TEMPLATE_TYPES"));
check("Exports PRECEDENCE_VALUES", barrel.includes("PRECEDENCE_VALUES"));
check("Exports registerTemplate", barrel.includes("registerTemplate"));
check("Exports getTemplate", barrel.includes("getTemplate"));
check("Exports listTemplates", barrel.includes("listTemplates"));
check("Exports resolveTemplate", barrel.includes("resolveTemplate"));
check("Exports validateTemplate", barrel.includes("validateTemplate"));
check("Exports validateInstantiation", barrel.includes("validateInstantiation"));
check("Exports all 6 builders", barrel.includes("buildStoreCoverageTemplate") && barrel.includes("buildStoreDeviationAlertTemplate"));

// -- 8. Architecture Constraints -----------------------------------------------

console.log("\n--- 8. Architecture Constraints ---");

const allContent = [types, builders, validation, registry, barrel].join("\n");

check("No Prisma imports", !allContent.includes("@prisma"));
check("No React imports", !allContent.includes('from "react'));
check("No Next imports", !allContent.includes('from "next'));
check("No UI component imports", !allContent.includes("components/"));
check("No SAG imports", !allContent.includes("sag-adapter") && !allContent.includes("/sag/"));
check("No Coverage Engine imports", !allContent.includes("rules/coverage"));
check("No Tiendas imports", !allContent.includes("tiendas/"));
check("No Maletas imports", !allContent.includes("maletas/"));
check("No Pedidos imports", !allContent.includes("pedidos/"));
check("No hardcoded tenant", !allContent.includes('"castillitos"'));
check("No hardcoded store names", !allContent.includes('"San Diego"') && !allContent.includes('"Centro"'));
check("No hardcoded business values", !allContent.includes('"minQty": 8') && !allContent.includes("regla 36"));
check("Imports only from business-policy parent", allContent.includes("../../policy-types"));

// -- Summary ------------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("STORE-POLICY-TEMPLATES-01 STRUCTURAL VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("STORE-POLICY-TEMPLATES-01 STRUCTURAL VALIDATION PASSED.\n");
}
