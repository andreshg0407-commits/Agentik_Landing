/**
 * scripts/test-store-policy-templates-01.ts
 *
 * Functional tests for STORE-POLICY-TEMPLATES-01.
 *
 * Usage: npx tsx scripts/test-store-policy-templates-01.ts
 */

import {
  registerTemplate,
  getTemplate,
  getTemplateByType,
  listTemplates,
  resolveTemplate,
  validateTemplate,
  validateInstantiation,
  buildStoreCoverageTemplate,
  buildStoreAssortmentTemplate,
  buildStoreSizeTargetTemplate,
  buildStoreStockRestrictionTemplate,
  buildStoreProductExceptionTemplate,
  buildStoreDeviationAlertTemplate,
  _clearTemplateRegistry,
  ACTIVE_TEMPLATE_TYPES,
  PLANNED_TEMPLATE_TYPES,
  ALL_STORE_TEMPLATE_TYPES,
  PRECEDENCE_VALUES,
} from "../lib/comercial/business-policy/templates/store";

import type {
  TemplateInstantiationInput,
  StorePolicyTemplate,
} from "../lib/comercial/business-policy/templates/store";

// Policy Engine compatibility
import {
  registerPolicy,
  resolvePolicy,
  validatePolicy,
  _clearPolicyStore,
} from "../lib/comercial/business-policy";

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

function makeInput(overrides: Partial<TemplateInstantiationInput> = {}): TemplateInstantiationInput {
  return {
    templateId: "tpl-store-coverage",
    tenantId: "tenant-a",
    policyName: "Generic Coverage Policy",
    policyDescription: "A test coverage policy",
    scopeBindings: [{ scope: "TENANT", scopeValue: "tenant-a" }],
    parameterValues: { minQty: 1, idealQty: 3, maxQty: 6 },
    conditionValues: [],
    priority: 100,
    createdBy: "test-user",
    tags: ["test"],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== STORE-POLICY-TEMPLATES-01 Functional Tests ===\n");

// -- 1. Constants -----------------------------------------------------------

console.log("--- 1. Constants ---");

assert("1.01 6 active templates", ACTIVE_TEMPLATE_TYPES.length === 6);
assert("1.02 4 planned templates", PLANNED_TEMPLATE_TYPES.length === 4);
assert("1.03 10 total templates", ALL_STORE_TEMPLATE_TYPES.length === 10);
assert("1.04 BASE precedence = 100", PRECEDENCE_VALUES.BASE === 100);
assert("1.05 STANDARD precedence = 200", PRECEDENCE_VALUES.STANDARD === 200);
assert("1.06 EXCEPTION precedence = 300", PRECEDENCE_VALUES.EXCEPTION === 300);
assert("1.07 RESTRICTION precedence = 400", PRECEDENCE_VALUES.RESTRICTION === 400);
assert("1.08 ALERT precedence = 500", PRECEDENCE_VALUES.ALERT === 500);

// -- 2. Registry ------------------------------------------------------------

console.log("\n--- 2. Registry ---");

_clearTemplateRegistry();

const allTemplates = listTemplates();
assert("2.01 Registry has 10 templates", allTemplates.length === 10);

const activeTemplates = listTemplates({ status: "ACTIVE" });
assert("2.02 6 active templates", activeTemplates.length === 6);

const plannedTemplates = listTemplates({ status: "PLANNED" });
assert("2.03 4 planned templates", plannedTemplates.length === 4);

const covTpl = getTemplate("tpl-store-coverage");
assert("2.04 Coverage template exists", covTpl !== null);
assert("2.05 Coverage type correct", covTpl!.templateType === "STORE_COVERAGE");
assert("2.06 Coverage category is COVERAGE", covTpl!.category === "COVERAGE");
assert("2.07 Coverage precedence is BASE", covTpl!.precedenceGroup === "BASE");

const assortTpl = getTemplate("tpl-store-assortment");
assert("2.08 Assortment template exists", assortTpl !== null);
assert("2.09 Assortment category is STORE", assortTpl!.category === "STORE");

const sizeTpl = getTemplateByType("STORE_SIZE_TARGET");
assert("2.10 Size target by type", sizeTpl !== null);
assert("2.11 Size target category is COVERAGE", sizeTpl!.category === "COVERAGE");

const restrictionTpl = getTemplate("tpl-store-stock-restriction");
assert("2.12 Restriction template exists", restrictionTpl !== null);
assert("2.13 Restriction precedence is RESTRICTION", restrictionTpl!.precedenceGroup === "RESTRICTION");

const exceptionTpl = getTemplate("tpl-store-product-exception");
assert("2.14 Exception template exists", exceptionTpl !== null);
assert("2.15 Exception precedence is EXCEPTION", exceptionTpl!.precedenceGroup === "EXCEPTION");

const alertTpl = getTemplate("tpl-store-deviation-alert");
assert("2.16 Alert template exists", alertTpl !== null);
assert("2.17 Alert category is ALERT", alertTpl!.category === "ALERT");
assert("2.18 Alert precedence is ALERT", alertTpl!.precedenceGroup === "ALERT");

// -- 3. Resolve Template ----------------------------------------------------

console.log("\n--- 3. Resolve Template ---");

const resolvedCov = resolveTemplate("STORE_COVERAGE");
assert("3.01 Resolves active template", resolvedCov !== null);

const resolvedPlanned = resolveTemplate("STORE_TRANSFER");
assert("3.02 Does not resolve planned template", resolvedPlanned === null);

const resolvedUnknown = resolveTemplate("NONEXISTENT" as any);
assert("3.03 Does not resolve unknown", resolvedUnknown === null);

// -- 4. Template Validation -------------------------------------------------

console.log("\n--- 4. Template Validation ---");

assert("4.01 Coverage template valid", validateTemplate(covTpl!).valid);
assert("4.02 Assortment template valid", validateTemplate(assortTpl!).valid);
assert("4.03 Size target template valid", validateTemplate(sizeTpl!).valid);
assert("4.04 Restriction template valid", validateTemplate(restrictionTpl!).valid);
assert("4.05 Exception template valid", validateTemplate(exceptionTpl!).valid);
assert("4.06 Alert template valid", validateTemplate(alertTpl!).valid);

// Invalid template
const badTpl: StorePolicyTemplate = {
  ...covTpl!,
  templateId: "",
  displayName: "",
  description: "",
  supportedScopes: [],
  version: "",
  metadata: { author: "", createdAt: "", updatedAt: "", usageHint: "", compatibleEngines: [], tags: [] },
};
const badResult = validateTemplate(badTpl);
assert("4.07 Invalid template fails", !badResult.valid);
assert("4.08 Multiple issues", badResult.issues.length >= 4);

// Duplicate template
const dupResult = registerTemplate(covTpl!);
assert("4.09 Duplicate template rejected", !dupResult.valid);

// -- 5. Instantiation Validation --------------------------------------------

console.log("\n--- 5. Instantiation Validation ---");

const validInput = makeInput();
const instResult = validateInstantiation(validInput, covTpl!);
assert("5.01 Valid instantiation passes", instResult.valid);

const noTenant = makeInput({ tenantId: "" });
assert("5.02 No tenant fails", !validateInstantiation(noTenant, covTpl!).valid);

const noName = makeInput({ policyName: "" });
assert("5.03 No name fails", !validateInstantiation(noName, covTpl!).valid);

const noCreatedBy = makeInput({ createdBy: "" });
assert("5.04 No createdBy fails", !validateInstantiation(noCreatedBy, covTpl!).valid);

const missingParams = makeInput({ parameterValues: { minQty: 1 } });
assert("5.05 Missing required params fails", !validateInstantiation(missingParams, covTpl!).valid);

const wrongScope = makeInput({ scopeBindings: [{ scope: "VENDOR", scopeValue: null }] });
assert("5.06 Unsupported scope fails", !validateInstantiation(wrongScope, covTpl!).valid);

const wrongType = makeInput({ parameterValues: { minQty: "not-a-number", idealQty: 3, maxQty: 6 } });
assert("5.07 Wrong param type fails", !validateInstantiation(wrongType, covTpl!).valid);

const negativeParam = makeInput({ parameterValues: { minQty: -5, idealQty: 3, maxQty: 6 } });
assert("5.08 Constraint violation fails", !validateInstantiation(negativeParam, covTpl!).valid);

const unknownParam = makeInput({ parameterValues: { minQty: 1, idealQty: 3, maxQty: 6, unknown: true } });
const unknownResult = validateInstantiation(unknownParam, covTpl!);
assert("5.09 Unknown param warns", unknownResult.issues.some(i => i.message.includes("unknown") || i.message.includes("Unknown")));

// Planned template cannot be instantiated
const plannedTpl = getTemplateByType("STORE_TRANSFER")!;
const plannedInput = makeInput({ templateId: "tpl-store-transfer" });
assert("5.10 Planned template fails instantiation", !validateInstantiation(plannedInput, plannedTpl).valid);

// -- 6. Builders ------------------------------------------------------------

console.log("\n--- 6. Builders ---");

const covBuild = buildStoreCoverageTemplate(makeInput());
assert("6.01 Coverage build succeeds", covBuild.success);
assert("6.02 Policy created", covBuild.policy !== null);
assert("6.03 Policy category is COVERAGE", covBuild.policy!.category === "COVERAGE");
assert("6.04 Policy status is DRAFT", covBuild.policy!.status === "DRAFT");
assert("6.05 Policy has parameters", covBuild.policy!.parameters.length === 3);
assert("6.06 Policy has template tag", covBuild.policy!.tags.includes("template:tpl-store-coverage"));
assert("6.07 Policy has sourceTemplate metadata", (covBuild.policy!.metadata as any).sourceTemplate === "tpl-store-coverage");
assert("6.08 Policy has version 1.0.0", covBuild.policy!.versionInfo.version === "1.0.0");

const assortBuild = buildStoreAssortmentTemplate(makeInput({
  templateId: "tpl-store-assortment",
  policyName: "Assortment Policy",
  parameterValues: {},
}));
assert("6.09 Assortment build succeeds", assortBuild.success);
assert("6.10 Assortment category is STORE", assortBuild.policy!.category === "STORE");

const sizeBuild = buildStoreSizeTargetTemplate(makeInput({
  templateId: "tpl-store-size-target",
  policyName: "Size Target Policy",
  parameterValues: { sizeDistribution: { S: 0.2, M: 0.3, L: 0.3, XL: 0.2 } },
}));
assert("6.11 Size target build succeeds", sizeBuild.success);

const restrictBuild = buildStoreStockRestrictionTemplate(makeInput({
  templateId: "tpl-store-stock-restriction",
  policyName: "Restriction Policy",
  parameterValues: { absoluteMax: 100 },
  scopeBindings: [{ scope: "STORE", scopeValue: null }],
}));
assert("6.12 Restriction build succeeds", restrictBuild.success);

const exceptionBuild = buildStoreProductExceptionTemplate(makeInput({
  templateId: "tpl-store-product-exception",
  policyName: "Exception Policy",
  parameterValues: { minQty: 0, idealQty: 1, maxQty: 2 },
  scopeBindings: [{ scope: "REFERENCE", scopeValue: null }],
  conditionValues: [{ field: "referenceCode", operator: "EQUALS", value: "REF-GENERIC" }],
}));
assert("6.13 Exception build succeeds", exceptionBuild.success);

const alertBuild = buildStoreDeviationAlertTemplate(makeInput({
  templateId: "tpl-store-deviation-alert",
  policyName: "Deviation Alert",
  parameterValues: { deviationThreshold: 0.2 },
  conditionValues: [{ field: "deviationType", operator: "EQUALS", value: "COVERAGE" }],
}));
assert("6.14 Alert build succeeds", alertBuild.success);
assert("6.15 Alert category is ALERT", alertBuild.policy!.category === "ALERT");

// Builder with invalid params fails
const badBuild = buildStoreCoverageTemplate(makeInput({ parameterValues: {} }));
assert("6.16 Invalid build fails", !badBuild.success);
assert("6.17 No policy on failure", badBuild.policy === null);

// -- 7. Policy Engine Compatibility (FASE 7) --------------------------------

console.log("\n--- 7. Policy Engine Compatibility ---");

_clearPolicyStore();

// Activate before registering so resolution engine finds it
const builtPolicy = { ...covBuild.policy!, status: "ACTIVE" as const, versionInfo: { ...covBuild.policy!.versionInfo, activatedAt: new Date() } };

// Validate with Policy Engine validator
const policyValidation = validatePolicy(builtPolicy);
assert("7.01 Built policy passes Policy Engine validation", policyValidation.valid);

// Register with Policy Engine
const regResult = registerPolicy(builtPolicy);
assert("7.02 Built policy registers in Policy Engine", regResult.success);

// Resolve with Policy Engine
const resolveResult = resolvePolicy({
  tenantId: "tenant-a",
  category: "COVERAGE",
  scopeBindings: [{ scope: "TENANT", scopeValue: "tenant-a" }],
  contextData: {},
});
assert("7.03 Built policy resolves via Policy Engine", resolveResult.resolved);
assert("7.04 Correct policy resolved", resolveResult.selectedPolicy?.name === "Generic Coverage Policy");

// Evidence from resolution
assert("7.05 Resolution has evidence", resolveResult.evidence.domain === "BUSINESS_POLICY");
assert("7.06 Evidence has traceId", resolveResult.evidence.traceId.length > 0);

_clearPolicyStore();

// -- 8. Template Metadata ---------------------------------------------------

console.log("\n--- 8. Template Metadata ---");

assert("8.01 Coverage has author", covTpl!.metadata.author === "business-policy-platform");
assert("8.02 Coverage has createdAt", covTpl!.metadata.createdAt.length > 0);
assert("8.03 Coverage has usageHint", covTpl!.metadata.usageHint.length > 0);
assert("8.04 Coverage has compatibleEngines", covTpl!.metadata.compatibleEngines.includes("CoverageEngine"));
assert("8.05 Coverage has tags", covTpl!.metadata.tags.includes("coverage"));

assert("8.06 Alert has compatibleEngines", alertTpl!.metadata.compatibleEngines.includes("AlertEngine"));
assert("8.07 Exception has tags", exceptionTpl!.metadata.tags.includes("exception"));

// -- 9. Template Parameters -------------------------------------------------

console.log("\n--- 9. Template Parameters ---");

assert("9.01 Coverage has 3 required params", covTpl!.requiredParameters.length === 3);
assert("9.02 Coverage has 2 optional params", covTpl!.optionalParameters.length === 2);
assert("9.03 minQty required", covTpl!.requiredParameters.some(p => p.name === "minQty" && p.required));
assert("9.04 idealQty required", covTpl!.requiredParameters.some(p => p.name === "idealQty"));
assert("9.05 maxQty required", covTpl!.requiredParameters.some(p => p.name === "maxQty"));
assert("9.06 strategy optional", covTpl!.optionalParameters.some(p => p.name === "strategy"));
assert("9.07 seasonalFactor optional", covTpl!.optionalParameters.some(p => p.name === "seasonalFactor"));

assert("9.08 Exception requires referenceCode condition", exceptionTpl!.supportedConditions.some(c => c.field === "referenceCode" && c.required));
assert("9.09 Alert requires deviationType condition", alertTpl!.supportedConditions.some(c => c.field === "deviationType" && c.required));

// -- 10. No Tenant-Specific Data --------------------------------------------

console.log("\n--- 10. Architecture Constraints ---");

const allTemplateStrings = allTemplates.map(t => JSON.stringify(t)).join("");
assert("10.01 No Castillitos references", !allTemplateStrings.includes("castillitos"));
assert("10.02 No Caldas references", !allTemplateStrings.includes("Caldas"));
assert("10.03 No specific store names", !allTemplateStrings.includes("San Diego") && !allTemplateStrings.includes("Centro"));
assert("10.04 No hardcoded numbers in templates", !allTemplateStrings.includes('"minQty":8') && !allTemplateStrings.includes('"maxQty":12'));

// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("STORE-POLICY-TEMPLATES-01 FUNCTIONAL TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("STORE-POLICY-TEMPLATES-01 FUNCTIONAL TESTS PASSED.\n");
}
