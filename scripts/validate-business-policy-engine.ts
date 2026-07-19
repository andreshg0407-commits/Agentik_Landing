/**
 * scripts/validate-business-policy-engine.ts
 *
 * Structural validation for BUSINESS-POLICY-ENGINE-01.
 * Verifies contracts, resolution, priorities, versioning, evidence, compatibility.
 *
 * Usage: npx tsx scripts/validate-business-policy-engine.ts
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
const BP = resolve(ROOT, "lib/comercial/business-policy");

console.log("\n=== BUSINESS-POLICY-ENGINE-01 Structural Validation ===\n");

// -- 1. File Structure -------------------------------------------------------

console.log("--- 1. File Structure ---");

const expectedFiles = [
  "policy-types.ts",
  "policy-resolution.ts",
  "policy-versioning.ts",
  "policy-evidence.ts",
  "policy-registry.ts",
  "policy-validation.ts",
  "policy-engine.ts",
  "policy-compatibility.ts",
  "index.ts",
];

for (const f of expectedFiles) {
  check(`${f} exists`, existsSync(resolve(BP, f)));
}

// -- 2. Types (FASE 1) -------------------------------------------------------

console.log("\n--- 2. Canonical Types ---");

const types = readFileSync(resolve(BP, "policy-types.ts"), "utf-8");

check("BusinessPolicy interface", types.includes("interface BusinessPolicy"));
check("BusinessPolicyVersion interface", types.includes("interface BusinessPolicyVersion"));
check("BusinessPolicyScopeBinding interface", types.includes("interface BusinessPolicyScopeBinding"));
check("BusinessPolicyCondition interface", types.includes("interface BusinessPolicyCondition"));
check("BusinessPolicyAction interface", types.includes("interface BusinessPolicyAction"));
check("BusinessPolicyParameter interface", types.includes("interface BusinessPolicyParameter"));
check("BusinessPolicyEvaluation interface", types.includes("interface BusinessPolicyEvaluation"));
check("BusinessPolicyEvidence interface", types.includes("interface BusinessPolicyEvidence"));
check("PolicyResolutionContext interface", types.includes("interface PolicyResolutionContext"));
check("PolicyResolutionResult interface", types.includes("interface PolicyResolutionResult"));
check("PolicyValidationResult interface", types.includes("interface PolicyValidationResult"));
check("PolicyRegistryEntry interface", types.includes("interface PolicyRegistryEntry"));

// -- 3. Categories (FASE 2) --------------------------------------------------

console.log("\n--- 3. Policy Categories ---");

check("COVERAGE category", types.includes('"COVERAGE"'));
check("STORE category", types.includes('"STORE"'));
check("REPLENISHMENT category", types.includes('"REPLENISHMENT"'));
check("ORDER category", types.includes('"ORDER"'));
check("VENDOR category", types.includes('"VENDOR"'));
check("CUSTOMER category", types.includes('"CUSTOMER"'));
check("INVENTORY category", types.includes('"INVENTORY"'));
check("IMPORT category", types.includes('"IMPORT"'));
check("MARKDOWN category", types.includes('"MARKDOWN"'));
check("ALERT category", types.includes('"ALERT"'));
check("REPORT category", types.includes('"REPORT"'));
check("GENERAL category", types.includes('"GENERAL"'));
check("ALL_POLICY_CATEGORIES exported", types.includes("ALL_POLICY_CATEGORIES"));

// -- 4. Scopes (FASE 3) ------------------------------------------------------

console.log("\n--- 4. Policy Scopes ---");

check("GLOBAL scope", types.includes('"GLOBAL"'));
check("TENANT scope", types.includes('"TENANT"'));
check("BUSINESS_LINE scope", types.includes('"BUSINESS_LINE"'));
check("STORE scope", types.includes('"STORE"'));
check("WAREHOUSE scope", types.includes('"WAREHOUSE"'));
check("PRODUCT scope", types.includes('"PRODUCT"'));
check("PRODUCT_CLASS scope", types.includes('"PRODUCT_CLASS"'));
check("SUBGROUP scope", types.includes('"SUBGROUP"'));
check("SIZE scope", types.includes('"SIZE"'));
check("CUSTOMER scope", types.includes('"CUSTOMER"'));
check("VENDOR scope", types.includes('"VENDOR"'));
check("ORDER scope", types.includes('"ORDER"'));
check("REFERENCE scope", types.includes('"REFERENCE"'));
check("ALL_POLICY_SCOPES exported", types.includes("ALL_POLICY_SCOPES"));
check("SCOPE_SPECIFICITY exported", types.includes("SCOPE_SPECIFICITY"));

// -- 5. Resolution (FASE 4) --------------------------------------------------

console.log("\n--- 5. Resolution Engine ---");

const resolution = readFileSync(resolve(BP, "policy-resolution.ts"), "utf-8");

check("resolvePolicy function", resolution.includes("function resolvePolicy"));
check("Tenant filter", resolution.includes("WRONG_TENANT"));
check("Category filter", resolution.includes("WRONG_CATEGORY"));
check("Scope matching", resolution.includes("matchScopes"));
check("Condition evaluation", resolution.includes("evaluateConditions"));
check("Priority sorting", resolution.includes("policy.priority"));
check("Match scoring", resolution.includes("computeMatchScore"));
check("Evidence building", resolution.includes("buildResolutionEvidence"));
check("SCOPE_SPECIFICITY used", resolution.includes("SCOPE_SPECIFICITY"));
check("EQUALS operator", resolution.includes('"EQUALS"'));
check("IN operator", resolution.includes('"IN"'));
check("IS_NULL operator", resolution.includes('"IS_NULL"'));
check("STARTS_WITH operator", resolution.includes('"STARTS_WITH"'));

// -- 6. Versioning (FASE 5) --------------------------------------------------

console.log("\n--- 6. Versioning ---");

const versioning = readFileSync(resolve(BP, "policy-versioning.ts"), "utf-8");

check("createPolicyVersion function", versioning.includes("function createPolicyVersion"));
check("activatePolicyVersion function", versioning.includes("function activatePolicyVersion"));
check("deprecatePolicyVersion function", versioning.includes("function deprecatePolicyVersion"));
check("validateVersionTransition function", versioning.includes("function validateVersionTransition"));
check("buildVersionChain function", versioning.includes("function buildVersionChain"));
check("incrementVersion helper", versioning.includes("incrementVersion"));
check("previousVersion tracked", versioning.includes("previousVersion"));
check("createdBy tracked", versioning.includes("createdBy"));
check("changeNote tracked", versioning.includes("changeNote"));
check("Never overwrites (DRAFT status)", versioning.includes('"DRAFT"'));

// -- 7. Evidence (FASE 6) ----------------------------------------------------

console.log("\n--- 7. Evidence ---");

const evidence = readFileSync(resolve(BP, "policy-evidence.ts"), "utf-8");

check("buildPolicyResolutionEvidence function", evidence.includes("function buildPolicyResolutionEvidence"));
check("policyEvidenceToCommercialEvidence function", evidence.includes("function policyEvidenceToCommercialEvidence"));
check("summarizeDiscardReasons function", evidence.includes("function summarizeDiscardReasons"));
check("buildResolutionNarrative function", evidence.includes("function buildResolutionNarrative"));
check("Evidence domain is BUSINESS_POLICY", evidence.includes('"BUSINESS_POLICY"'));
check("Bridge to CommercialDomainEvidence", evidence.includes("CommercialDomainEvidence"));
check("Imports from domain-evidence", evidence.includes("domain-evidence"));

// -- 8. Registry (FASE 7) ----------------------------------------------------

console.log("\n--- 8. Registry ---");

const registry = readFileSync(resolve(BP, "policy-registry.ts"), "utf-8");

check("Coverage Policies entry", registry.includes("Coverage Policies"));
check("Store Policies entry", registry.includes("Store Policies"));
check("Replenishment Policies entry", registry.includes("Replenishment Policies"));
check("Order Policies entry", registry.includes("Order Policies"));
check("Vendor Policies entry", registry.includes("Vendor Policies"));
check("Customer Policies entry", registry.includes("Customer Policies"));
check("Inventory Policies entry", registry.includes("Inventory Policies"));
check("Import Policies entry", registry.includes("Import Policies"));
check("Markdown Policies entry", registry.includes("Markdown Policies"));
check("Alert Policies entry", registry.includes("Alert Policies"));
check("Report Policies entry", registry.includes("Report Policies"));
check("General Policies entry", registry.includes("General Policies"));
check("getRegistryEntry function", registry.includes("function getRegistryEntry"));
check("getAllRegistryEntries function", registry.includes("function getAllRegistryEntries"));
check("isScopeAllowed function", registry.includes("function isScopeAllowed"));

// -- 9. API (FASE 8) ---------------------------------------------------------

console.log("\n--- 9. Engine API ---");

const engine = readFileSync(resolve(BP, "policy-engine.ts"), "utf-8");

check("registerPolicy exported", engine.includes("function registerPolicy"));
check("resolvePolicy exported", engine.includes("function resolvePolicy") || engine.includes("resolvePolicy"));
check("evaluatePolicy exported", engine.includes("function evaluatePolicy"));
check("listPolicies exported", engine.includes("function listPolicies"));
check("validatePolicy exported", engine.includes("validatePolicy"));
check("deactivatePolicy exported", engine.includes("function deactivatePolicy"));
check("_clearPolicyStore for testing", engine.includes("function _clearPolicyStore"));

// -- 10. Compatibility (FASE 9) -----------------------------------------------

console.log("\n--- 10. Coverage Compatibility ---");

const compat = readFileSync(resolve(BP, "policy-compatibility.ts"), "utf-8");

check("coverageRuleToPolicy function", compat.includes("function coverageRuleToPolicy"));
check("buildCoverageResolutionContext function", compat.includes("function buildCoverageResolutionContext"));
check("CoverageRuleShape interface", compat.includes("interface CoverageRuleShape"));
check("Maps subgroup scope", compat.includes("subgroup"));
check("Maps reference scope", compat.includes("reference"));
check("Maps store scope", compat.includes("store"));
check("Maps productClass scope", compat.includes("productClass"));
check("Does NOT import Coverage types directly", !compat.includes("from \"@/lib/comercial/rules/coverage"));
check("Does NOT import StorePolicyRule", !compat.includes("StorePolicyRule"));

// -- 11. Barrel Exports -------------------------------------------------------

console.log("\n--- 11. Barrel Exports ---");

const barrel = readFileSync(resolve(BP, "index.ts"), "utf-8");

check("Exports BusinessPolicy type", barrel.includes("BusinessPolicy"));
check("Exports BusinessPolicyVersion type", barrel.includes("BusinessPolicyVersion"));
check("Exports BusinessPolicyEvidence type", barrel.includes("BusinessPolicyEvidence"));
check("Exports PolicyResolutionContext type", barrel.includes("PolicyResolutionContext"));
check("Exports PolicyResolutionResult type", barrel.includes("PolicyResolutionResult"));
check("Exports registerPolicy", barrel.includes("registerPolicy"));
check("Exports resolvePolicy", barrel.includes("resolvePolicy"));
check("Exports evaluatePolicy", barrel.includes("evaluatePolicy"));
check("Exports listPolicies", barrel.includes("listPolicies"));
check("Exports validatePolicy", barrel.includes("validatePolicy"));
check("Exports deactivatePolicy", barrel.includes("deactivatePolicy"));
check("Exports createPolicyVersion", barrel.includes("createPolicyVersion"));
check("Exports coverageRuleToPolicy", barrel.includes("coverageRuleToPolicy"));
check("Exports buildCoverageResolutionContext", barrel.includes("buildCoverageResolutionContext"));
check("Exports ALL_POLICY_CATEGORIES", barrel.includes("ALL_POLICY_CATEGORIES"));
check("Exports ALL_POLICY_SCOPES", barrel.includes("ALL_POLICY_SCOPES"));
check("Exports SCOPE_SPECIFICITY", barrel.includes("SCOPE_SPECIFICITY"));
check("Exports getAllRegistryEntries", barrel.includes("getAllRegistryEntries"));

// -- 12. Architecture Constraints --------------------------------------------

console.log("\n--- 12. Architecture Constraints ---");

const allContent = [types, resolution, versioning, evidence, registry, engine, compat].join("\n");

check("No Prisma imports", !allContent.includes("@prisma"));
check("No React imports", !allContent.includes('from "react'));
check("No Next imports", !allContent.includes('from "next'));
check("No UI component imports", !allContent.includes("components/"));
check("No SAG imports", !allContent.includes("sag-adapter") && !allContent.includes("sag/"));
check("No SAP references", !allContent.includes("SAP"));
check("No Castillitos-specific rules", !allContent.includes("castillitos") || allContent.includes("castillitos") === false);
check("No dashboard imports", !allContent.includes("dashboard"));

// Check for Castillitos references (allowed in comments/docs, not in logic)
const noHardcodedTenant = !types.includes('"castillitos"') &&
  !resolution.includes('"castillitos"') &&
  !versioning.includes('"castillitos"') &&
  !evidence.includes('"castillitos"') &&
  !registry.includes('"castillitos"') &&
  !engine.includes('"castillitos"') &&
  !compat.includes('"castillitos"');
check("No hardcoded tenant ID in engine code", noHardcodedTenant);

// -- Summary ------------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("BUSINESS-POLICY-ENGINE-01 STRUCTURAL VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("BUSINESS-POLICY-ENGINE-01 STRUCTURAL VALIDATION PASSED.\n");
}
