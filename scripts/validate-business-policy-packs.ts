/**
 * scripts/validate-business-policy-packs.ts
 *
 * Structural validation for BUSINESS-POLICY-PACKS-01.
 *
 * Usage: npx tsx scripts/validate-business-policy-packs.ts
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
const PACKS = resolve(ROOT, "lib/comercial/business-policy/packs");
const BP = resolve(ROOT, "lib/comercial/business-policy");

console.log("\n=== BUSINESS-POLICY-PACKS-01 Structural Validation ===\n");

// -- 1. File Structure -------------------------------------------------------

console.log("--- 1. File Structure ---");

const expectedFiles = [
  "pack-types.ts",
  "pack-engine.ts",
  "pack-validation.ts",
  "index.ts",
];

for (const f of expectedFiles) {
  check(`packs/${f} exists`, existsSync(resolve(PACKS, f)));
}

check("Architecture doc exists", existsSync(resolve(ROOT, "docs/architecture/BUSINESS_POLICY_PACKS_01.md")));

// -- 2. Canonical Types (FASE 1) ---------------------------------------------

console.log("\n--- 2. Canonical Types ---");

const types = readFileSync(resolve(PACKS, "pack-types.ts"), "utf-8");

check("BusinessPolicyPack interface", types.includes("interface BusinessPolicyPack"));
check("BusinessPolicyPackVersion interface", types.includes("interface BusinessPolicyPackVersion"));
check("BusinessPolicyPackSummary interface", types.includes("interface BusinessPolicyPackSummary"));
check("BusinessPolicyPackActivation interface", types.includes("interface BusinessPolicyPackActivation"));
check("BusinessPolicyPackReference interface", types.includes("interface BusinessPolicyPackReference"));
check("PackStatus type", types.includes("type PackStatus"));
check("PackDiff interface", types.includes("interface PackDiff"));
check("PackDiffEntry interface", types.includes("interface PackDiffEntry"));
check("PackValidationResult interface", types.includes("interface PackValidationResult"));

// -- 3. Pack Manifest (FASE 2) -----------------------------------------------

console.log("\n--- 3. Pack Manifest ---");

check("Pack has id field", types.includes("readonly id: string"));
check("Pack has tenantId field", types.includes("readonly tenantId: string"));
check("Pack has name field", types.includes("readonly name: string"));
check("Pack has description field", types.includes("readonly description: string | null"));
check("Pack has status field", types.includes("readonly status: PackStatus"));
check("Pack has categories field", types.includes("readonly categories: readonly PolicyCategory[]"));
check("Pack has policies field", types.includes("readonly policies: readonly BusinessPolicyPackReference[]"));
check("Pack has versionInfo field", types.includes("readonly versionInfo: BusinessPolicyPackVersion"));

// -- 4. Membership (FASE 3) --------------------------------------------------

console.log("\n--- 4. Membership ---");

check("Reference has policyId", types.includes("readonly policyId: string"));
check("Reference has category", types.includes("readonly category: PolicyCategory"));
check("Reference has policyName", types.includes("readonly policyName: string"));
check("Reference has policyVersion", types.includes("readonly policyVersion: string"));
check("Reference has addedAt", types.includes("readonly addedAt: Date"));

const engine = readFileSync(resolve(PACKS, "pack-engine.ts"), "utf-8");
check("Membership exclusivity check", engine.includes("checkMembershipExclusivity"));

// -- 5. Engine API (FASE 4) ---------------------------------------------------

console.log("\n--- 5. Engine API ---");

check("registerPack function", engine.includes("function registerPack"));
check("activatePack function", engine.includes("function activatePack"));
check("deactivatePack function", engine.includes("function deactivatePack"));
check("listPacks function", engine.includes("function listPacks"));
check("resolveActivePack function", engine.includes("function resolveActivePack"));
check("_clearPackStore for testing", engine.includes("function _clearPackStore"));
check("buildPackSummary function", engine.includes("function buildPackSummary"));

// -- 6. Versioning (FASE 5) ---------------------------------------------------

console.log("\n--- 6. Versioning ---");

check("createPackVersion function", engine.includes("function createPackVersion"));
check("incrementVersion helper", engine.includes("incrementVersion"));
check("previousVersion tracked", engine.includes("previousVersion"));
check("changeNote tracked", engine.includes("changeNote"));
check("New version is DRAFT", engine.includes('"DRAFT"'));

// Version info fields
check("Version has version field", types.includes("readonly version: string"));
check("Version has createdAt field", types.includes("readonly createdAt: Date"));
check("Version has createdBy field", types.includes("readonly createdBy: string"));
check("Version has activatedAt field", types.includes("readonly activatedAt: Date | null"));
check("Version has deprecatedAt field", types.includes("readonly deprecatedAt: Date | null"));
check("Version has previousVersion field", types.includes("readonly previousVersion: string | null"));
check("Version has changeNote field", types.includes("readonly changeNote: string | null"));

// -- 7. Validation (FASE 6) ---------------------------------------------------

console.log("\n--- 7. Validation ---");

const validation = readFileSync(resolve(PACKS, "pack-validation.ts"), "utf-8");

check("validatePack function", validation.includes("function validatePack"));
check("Checks duplicate categories", validation.includes("Duplicate category"));
check("Checks duplicate policies", validation.includes("Duplicate policy"));
check("Checks invalid categories", validation.includes("Invalid category"));
check("Checks empty categories", validation.includes("no categories"));
check("Checks empty policies", validation.includes("no policies"));
check("Checks policy category in pack", validation.includes("not in pack categories"));
check("Warns on empty category", validation.includes("no policies assigned"));
check("Imports ALL_POLICY_CATEGORIES", validation.includes("ALL_POLICY_CATEGORIES"));

// -- 8. Compatibility (FASE 7) ------------------------------------------------

console.log("\n--- 8. Compatibility ---");

check("getPoliciesForCategory function", engine.includes("function getPoliciesForCategory"));
check("resolvePackPolicyIds function", engine.includes("function resolvePackPolicyIds"));
check("diffPacks function", engine.includes("function diffPacks"));

// -- 9. Barrel Exports --------------------------------------------------------

console.log("\n--- 9. Barrel Exports ---");

const barrel = readFileSync(resolve(PACKS, "index.ts"), "utf-8");

check("Exports BusinessPolicyPack", barrel.includes("BusinessPolicyPack"));
check("Exports BusinessPolicyPackVersion", barrel.includes("BusinessPolicyPackVersion"));
check("Exports BusinessPolicyPackSummary", barrel.includes("BusinessPolicyPackSummary"));
check("Exports BusinessPolicyPackActivation", barrel.includes("BusinessPolicyPackActivation"));
check("Exports BusinessPolicyPackReference", barrel.includes("BusinessPolicyPackReference"));
check("Exports registerPack", barrel.includes("registerPack"));
check("Exports activatePack", barrel.includes("activatePack"));
check("Exports deactivatePack", barrel.includes("deactivatePack"));
check("Exports listPacks", barrel.includes("listPacks"));
check("Exports resolveActivePack", barrel.includes("resolveActivePack"));
check("Exports createPackVersion", barrel.includes("createPackVersion"));
check("Exports validatePack", barrel.includes("validatePack"));
check("Exports diffPacks", barrel.includes("diffPacks"));
check("Exports getPoliciesForCategory", barrel.includes("getPoliciesForCategory"));
check("Exports resolvePackPolicyIds", barrel.includes("resolvePackPolicyIds"));

// -- 10. Architecture Constraints ---------------------------------------------

console.log("\n--- 10. Architecture Constraints ---");

const allContent = [types, engine, validation, barrel].join("\n");

check("No Prisma imports", !allContent.includes("@prisma"));
check("No React imports", !allContent.includes('from "react'));
check("No Next imports", !allContent.includes('from "next'));
check("No UI component imports", !allContent.includes("components/"));
check("No SAG imports", !allContent.includes("sag-adapter") && !allContent.includes("sag/"));
check("No Coverage Engine imports", !allContent.includes("coverage-engine") && !allContent.includes("rules/coverage"));
check("No Store Engine imports", !allContent.includes("store-policy-engine"));
check("No hardcoded tenant ID", !types.includes('"castillitos"') && !engine.includes('"castillitos"') && !validation.includes('"castillitos"'));

// Imports only from parent business-policy module
check("Types import from parent policy-types", types.includes("../policy-types"));
check("Engine imports from parent", engine.includes("../policy-types") || engine.includes("./pack-types"));

// -- Summary ------------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("BUSINESS-POLICY-PACKS-01 STRUCTURAL VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("BUSINESS-POLICY-PACKS-01 STRUCTURAL VALIDATION PASSED.\n");
}
