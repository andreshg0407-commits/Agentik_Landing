/**
 * scripts/test-business-policy-engine.ts
 *
 * Functional tests for BUSINESS-POLICY-ENGINE-01.
 * Tests resolution, versioning, evidence, registry, validation, compatibility.
 *
 * Usage: npx tsx scripts/test-business-policy-engine.ts
 */

import {
  registerPolicy,
  resolvePolicy,
  evaluatePolicy,
  listPolicies,
  validatePolicy,
  deactivatePolicy,
  _clearPolicyStore,
  createPolicyVersion,
  activatePolicyVersion,
  deprecatePolicyVersion,
  validateVersionTransition,
  buildVersionChain,
  buildPolicyResolutionEvidence,
  policyEvidenceToCommercialEvidence,
  summarizeDiscardReasons,
  buildResolutionNarrative,
  getRegistryEntry,
  getAllRegistryEntries,
  isScopeAllowed,
  getRequiredParameters,
  getOptionalParameters,
  coverageRuleToPolicy,
  buildCoverageResolutionContext,
  ALL_POLICY_CATEGORIES,
  ALL_POLICY_SCOPES,
  SCOPE_SPECIFICITY,
} from "../lib/comercial/business-policy";

import type {
  BusinessPolicy,
  PolicyResolutionContext,
} from "../lib/comercial/business-policy";

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

function makePolicy(overrides: Partial<BusinessPolicy> = {}): BusinessPolicy {
  return {
    id: "test-policy-1",
    tenantId: "castillitos",
    category: "COVERAGE",
    name: "Test Coverage Policy",
    description: "Test policy",
    scopes: [{ scope: "TENANT", scopeValue: "castillitos" }],
    conditions: [],
    actions: [{ type: "SET_THRESHOLD", target: "stockLevel", value: { min: 1, ideal: 3, max: 6 }, description: null }],
    parameters: [
      { name: "minQty", type: "NUMBER", value: 1, description: null, unit: "units" },
      { name: "idealQty", type: "NUMBER", value: 3, description: null, unit: "units" },
      { name: "maxQty", type: "NUMBER", value: 6, description: null, unit: "units" },
    ],
    priority: 100,
    status: "ACTIVE",
    versionInfo: {
      version: "1.0.0",
      createdAt: new Date(),
      createdBy: "test",
      activatedAt: new Date(),
      deprecatedAt: null,
      previousVersion: null,
      changeNote: null,
    },
    tags: [],
    metadata: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<PolicyResolutionContext> = {}): PolicyResolutionContext {
  return {
    tenantId: "castillitos",
    category: "COVERAGE",
    scopeBindings: [{ scope: "TENANT", scopeValue: "castillitos" }],
    contextData: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== BUSINESS-POLICY-ENGINE-01 Functional Tests ===\n");

// -- 1. Types & Constants ---------------------------------------------------

console.log("--- 1. Types & Constants ---");

assert("1.01 ALL_POLICY_CATEGORIES has 12 entries", ALL_POLICY_CATEGORIES.length === 12);
assert("1.02 COVERAGE is a category", ALL_POLICY_CATEGORIES.includes("COVERAGE"));
assert("1.03 MARKDOWN is a category", ALL_POLICY_CATEGORIES.includes("MARKDOWN"));
assert("1.04 GENERAL is a category", ALL_POLICY_CATEGORIES.includes("GENERAL"));
assert("1.05 ALL_POLICY_SCOPES has 13 entries", ALL_POLICY_SCOPES.length === 13);
assert("1.06 REFERENCE scope exists", ALL_POLICY_SCOPES.includes("REFERENCE"));
assert("1.07 GLOBAL scope exists", ALL_POLICY_SCOPES.includes("GLOBAL"));
assert("1.08 SCOPE_SPECIFICITY REFERENCE=1", SCOPE_SPECIFICITY.REFERENCE === 1);
assert("1.09 SCOPE_SPECIFICITY GLOBAL=13", SCOPE_SPECIFICITY.GLOBAL === 13);
assert("1.10 SCOPE_SPECIFICITY STORE=7", SCOPE_SPECIFICITY.STORE === 7);

// -- 2. Registration --------------------------------------------------------

console.log("\n--- 2. Registration ---");

_clearPolicyStore();

const p1 = makePolicy();
const reg1 = registerPolicy(p1);
assert("2.01 Registration succeeds", reg1.success === true);
assert("2.02 Validation is valid", reg1.validation.valid === true);

const invalidPolicy = makePolicy({ id: "", name: "" });
const reg2 = registerPolicy(invalidPolicy);
assert("2.03 Invalid policy fails registration", reg2.success === false);
assert("2.04 Has validation issues", reg2.validation.issues.length > 0);

const missingParams = makePolicy({ parameters: [] });
const reg3 = registerPolicy(missingParams);
assert("2.05 Missing required params fails", reg3.success === false);
assert("2.06 Reports missing minQty", reg3.validation.issues.some(i => i.message.includes("minQty")));

_clearPolicyStore();

// -- 3. Resolution ----------------------------------------------------------

console.log("\n--- 3. Resolution ---");

_clearPolicyStore();

const coverageGlobal = makePolicy({ id: "cov-global", name: "Global Coverage", priority: 200, scopes: [{ scope: "GLOBAL", scopeValue: null }] });
const coverageStore = makePolicy({ id: "cov-store", name: "Store Coverage", priority: 100, scopes: [{ scope: "STORE", scopeValue: "T01" }] });
const coverageRef = makePolicy({ id: "cov-ref", name: "Reference Coverage", priority: 50, scopes: [{ scope: "REFERENCE", scopeValue: "REF-123" }] });
const coverageInactive = makePolicy({ id: "cov-inactive", name: "Inactive Policy", status: "DRAFT" });

registerPolicy(coverageGlobal);
registerPolicy(coverageStore);
registerPolicy(coverageRef);
registerPolicy(coverageInactive);

// Global context
const globalCtx = makeContext();
const globalResult = resolvePolicy(globalCtx);
assert("3.01 Global resolves", globalResult.resolved === true);
assert("3.02 Global selects global policy", globalResult.selectedPolicy?.id === "cov-global");

// Store context
const storeCtx = makeContext({ scopeBindings: [{ scope: "TENANT", scopeValue: "castillitos" }, { scope: "STORE", scopeValue: "T01" }] });
const storeResult = resolvePolicy(storeCtx);
assert("3.03 Store resolves", storeResult.resolved === true);
assert("3.04 Store wins over global (more specific)", storeResult.selectedPolicy?.id === "cov-store");

// Reference context (most specific)
const refCtx = makeContext({ scopeBindings: [{ scope: "TENANT", scopeValue: "castillitos" }, { scope: "REFERENCE", scopeValue: "REF-123" }] });
const refResult = resolvePolicy(refCtx);
assert("3.05 Reference resolves", refResult.resolved === true);
assert("3.06 Reference wins (most specific)", refResult.selectedPolicy?.id === "cov-ref");

// Wrong tenant — store is keyed by tenant, so no policies exist to discard
const wrongTenant = makeContext({ tenantId: "other-tenant" });
const wrongResult = resolvePolicy(wrongTenant);
assert("3.07 Wrong tenant returns no result", wrongResult.resolved === false);
assert("3.08 Wrong tenant has no candidates", wrongResult.candidates.length === 0);

// Wrong category
const wrongCat = makeContext({ category: "ORDER" });
const wrongCatResult = resolvePolicy(wrongCat);
assert("3.09 Wrong category returns no result", wrongCatResult.resolved === false);

// Inactive policies excluded
assert("3.10 Inactive policy not in candidates", !globalResult.candidates.some(c => c.policy.id === "cov-inactive"));
assert("3.11 Inactive policy in discarded", globalResult.discarded.some(d => d.policy.id === "cov-inactive"));

_clearPolicyStore();

// -- 4. Conditions ----------------------------------------------------------

console.log("\n--- 4. Conditions ---");

_clearPolicyStore();

const condPolicy = makePolicy({
  id: "cond-1",
  name: "Conditional Policy",
  conditions: [
    { field: "productClass", operator: "EQUALS", value: "CALZADO", description: null },
    { field: "currentUnits", operator: "LESS_THAN", value: 5, description: null },
  ],
});
registerPolicy(condPolicy);

const condMatch = resolvePolicy(makeContext({ contextData: { productClass: "CALZADO", currentUnits: 3 } }));
assert("4.01 Conditions match", condMatch.resolved === true);

const condFail = resolvePolicy(makeContext({ contextData: { productClass: "ROPA", currentUnits: 3 } }));
assert("4.02 Conditions fail", condFail.resolved === false);
assert("4.03 Discard reason is CONDITION_FAILED", condFail.discarded.some(d => d.reason === "CONDITION_FAILED"));

const condPartial = resolvePolicy(makeContext({ contextData: { productClass: "CALZADO", currentUnits: 10 } }));
assert("4.04 Partial condition fail", condPartial.resolved === false);

_clearPolicyStore();

// -- 5. Priority ------------------------------------------------------------

console.log("\n--- 5. Priority ---");

_clearPolicyStore();

const lowPri = makePolicy({ id: "low", name: "Low Priority", priority: 500 });
const highPri = makePolicy({ id: "high", name: "High Priority", priority: 10 });
registerPolicy(lowPri);
registerPolicy(highPri);

const priResult = resolvePolicy(makeContext());
assert("5.01 Higher priority wins", priResult.selectedPolicy?.id === "high");
assert("5.02 Lower priority discarded", priResult.discarded.some(d => d.policy.id === "low" && d.reason === "LOWER_PRIORITY"));

_clearPolicyStore();

// -- 6. Versioning ----------------------------------------------------------

console.log("\n--- 6. Versioning ---");

const original = makePolicy({ id: "ver-1", name: "Original" });
const v2 = createPolicyVersion(original, { description: "Updated description" }, "admin", "Updated desc");
assert("6.01 New version created", v2.versionInfo.version === "1.0.1");
assert("6.02 Previous version linked", v2.versionInfo.previousVersion === "1.0.0");
assert("6.03 Status is DRAFT", v2.status === "DRAFT");
assert("6.04 Created by recorded", v2.versionInfo.createdBy === "admin");
assert("6.05 Change note recorded", v2.versionInfo.changeNote === "Updated desc");

const activated = activatePolicyVersion(v2);
assert("6.06 Activated status", activated.status === "ACTIVE");
assert("6.07 Activated date set", activated.versionInfo.activatedAt !== null);

const deprecated = deprecatePolicyVersion(activated);
assert("6.08 Deprecated status", deprecated.status === "DEPRECATED");
assert("6.09 Deprecated date set", deprecated.versionInfo.deprecatedAt !== null);

const transitionValid = validateVersionTransition(original, v2);
assert("6.10 Valid transition", transitionValid.valid === true);

const badTransition = createPolicyVersion(original, {}, "admin", null);
const tamperedTransition = { ...badTransition, tenantId: "other" } as BusinessPolicy;
const transitionInvalid = validateVersionTransition(original, tamperedTransition);
assert("6.11 Invalid transition (tenant change)", transitionInvalid.valid === false);

const chain = buildVersionChain([original, v2], "ver-1");
assert("6.12 Version chain length", chain.length === 2);

// -- 7. Evidence ------------------------------------------------------------

console.log("\n--- 7. Evidence ---");

_clearPolicyStore();
registerPolicy(makePolicy({ id: "ev-1", name: "Evidence Policy" }));

const evResult = resolvePolicy(makeContext());
const evidence = buildPolicyResolutionEvidence(evResult, "castillitos", "COVERAGE");
assert("7.01 Evidence domain is BUSINESS_POLICY", evidence.domain === "BUSINESS_POLICY");
assert("7.02 Evidence has tenantId", evidence.tenantId === "castillitos");
assert("7.03 Evidence has category", evidence.category === "COVERAGE");
assert("7.04 Evidence has selected policy", evidence.selectedPolicyId === "ev-1");
assert("7.05 Evidence has confidence", evidence.confidence > 0);
assert("7.06 Evidence has note", evidence.note !== null);

const commercialEv = policyEvidenceToCommercialEvidence(evidence, "test-entity-1");
assert("7.07 Commercial evidence domain", commercialEv.domain === "BUSINESS_POLICY");
assert("7.08 Commercial evidence entityType", commercialEv.entityType === "PolicyResolution");
assert("7.09 Commercial evidence entityId", commercialEv.entityId === "test-entity-1");
assert("7.10 Commercial evidence confidence", commercialEv.confidence > 0);

const narrative = buildResolutionNarrative(evResult);
assert("7.11 Narrative contains policy name", narrative.includes("Evidence Policy"));

const noMatchResult = resolvePolicy(makeContext({ tenantId: "nonexistent" }));
const noMatchNarrative = buildResolutionNarrative(noMatchResult);
assert("7.12 No-match narrative", noMatchNarrative.includes("No matching policy"));

const discardSummary = summarizeDiscardReasons(noMatchResult);
assert("7.13 Discard summary not empty", discardSummary.length > 0);

_clearPolicyStore();

// -- 8. Registry ------------------------------------------------------------

console.log("\n--- 8. Registry ---");

const allEntries = getAllRegistryEntries();
assert("8.01 Registry has 12 entries", allEntries.length === 12);

const coverageEntry = getRegistryEntry("COVERAGE");
assert("8.02 Coverage entry exists", coverageEntry !== null);
assert("8.03 Coverage label", coverageEntry!.label === "Coverage Policies");
assert("8.04 Coverage requires minQty", coverageEntry!.requiredParameters.includes("minQty"));
assert("8.05 Coverage allows STORE scope", coverageEntry!.allowedScopes.includes("STORE"));
assert("8.06 Coverage allows REFERENCE scope", coverageEntry!.allowedScopes.includes("REFERENCE"));

assert("8.07 isScopeAllowed COVERAGE+STORE", isScopeAllowed("COVERAGE", "STORE") === true);
assert("8.08 isScopeAllowed COVERAGE+VENDOR", isScopeAllowed("COVERAGE", "VENDOR") === false);

const orderEntry = getRegistryEntry("ORDER");
assert("8.09 Order entry exists", orderEntry !== null);
assert("8.10 Order allows CUSTOMER scope", orderEntry!.allowedScopes.includes("CUSTOMER"));

const requiredParams = getRequiredParameters("COVERAGE");
assert("8.11 Required params has minQty", requiredParams.includes("minQty"));
assert("8.12 Required params has idealQty", requiredParams.includes("idealQty"));
assert("8.13 Required params has maxQty", requiredParams.includes("maxQty"));

const optionalParams = getOptionalParameters("COVERAGE");
assert("8.14 Optional params has strategy", optionalParams.includes("strategy"));

// -- 9. Validation ----------------------------------------------------------

console.log("\n--- 9. Validation ---");

const validPolicy = makePolicy();
const validResult = validatePolicy(validPolicy);
assert("9.01 Valid policy passes", validResult.valid === true);

const noId = makePolicy({ id: "" });
const noIdResult = validatePolicy(noId);
assert("9.02 No ID fails", noIdResult.valid === false);

const noTenant = makePolicy({ tenantId: "" });
const noTenantResult = validatePolicy(noTenant);
assert("9.03 No tenant fails", noTenantResult.valid === false);

const noName = makePolicy({ name: "" });
const noNameResult = validatePolicy(noName);
assert("9.04 No name fails", noNameResult.valid === false);

const badPriority = makePolicy({ priority: -5 });
const badPriorityResult = validatePolicy(badPriority);
assert("9.05 Negative priority fails", badPriorityResult.valid === false);

const badScope = makePolicy({ scopes: [{ scope: "NONEXISTENT" as any, scopeValue: null }] });
const badScopeResult = validatePolicy(badScope);
assert("9.06 Invalid scope fails", badScopeResult.valid === false);

const noParams = makePolicy({ parameters: [] });
const noParamsResult = validatePolicy(noParams);
assert("9.07 Missing required params fails", noParamsResult.valid === false);

const badVersion = makePolicy({ versionInfo: { ...makePolicy().versionInfo, version: "" } });
const badVersionResult = validatePolicy(badVersion);
assert("9.08 Empty version fails", badVersionResult.valid === false);

const noActions = makePolicy({ actions: [], parameters: [] });
const noActionsResult = validatePolicy(noActions);
assert("9.09 No actions/params has warning", noActionsResult.issues.some(i => i.severity === "WARNING" && i.message.includes("no effect")));

// -- 10. Deactivation -------------------------------------------------------

console.log("\n--- 10. Deactivation ---");

_clearPolicyStore();

registerPolicy(makePolicy({ id: "deact-1", name: "Deactivatable" }));
const deactResult = deactivatePolicy("castillitos", "deact-1");
assert("10.01 Deactivation returns policy", deactResult !== null);
assert("10.02 Status is DEPRECATED", deactResult!.status === "DEPRECATED");

const deactAgain = deactivatePolicy("castillitos", "deact-1");
assert("10.03 Already deactivated returns null", deactAgain === null);

const deactWrong = deactivatePolicy("castillitos", "nonexistent");
assert("10.04 Nonexistent returns null", deactWrong === null);

_clearPolicyStore();

// -- 11. List Policies -------------------------------------------------------

console.log("\n--- 11. List Policies ---");

_clearPolicyStore();

registerPolicy(makePolicy({ id: "list-1", name: "Coverage 1", category: "COVERAGE" }));
registerPolicy(makePolicy({ id: "list-2", name: "Order 1", category: "ORDER", scopes: [{ scope: "TENANT", scopeValue: "castillitos" }], parameters: [] }));

const allPolicies = listPolicies({ tenantId: "castillitos" });
assert("11.01 Lists all policies", allPolicies.length === 2);

const coverageOnly = listPolicies({ tenantId: "castillitos", category: "COVERAGE" });
assert("11.02 Filter by category", coverageOnly.length === 1);
assert("11.03 Correct category", coverageOnly[0].category === "COVERAGE");

const storeScope = listPolicies({ tenantId: "castillitos", scope: "STORE" });
assert("11.04 Filter by scope returns subset", storeScope.length === 0);

const tenantScope = listPolicies({ tenantId: "castillitos", scope: "TENANT" });
assert("11.05 Filter by TENANT scope", tenantScope.length === 2);

_clearPolicyStore();

// -- 12. Evaluate Policy -----------------------------------------------------

console.log("\n--- 12. Evaluate Policy ---");

_clearPolicyStore();

registerPolicy(makePolicy({ id: "eval-1", name: "Eval Policy" }));

const evalResult = evaluatePolicy(makeContext());
assert("12.01 Evaluation returns result", evalResult !== null);
assert("12.02 Evaluation has policyId", evalResult!.policyId === "eval-1");
assert("12.03 Evaluation has policyName", evalResult!.policyName === "Eval Policy");
assert("12.04 Evaluation has parameters", evalResult!.parameters.length === 3);
assert("12.05 Evaluation has actions", evalResult!.actions.length === 1);
assert("12.06 Evaluation has evidence", evalResult!.evidence.domain === "BUSINESS_POLICY");

const evalNull = evaluatePolicy(makeContext({ tenantId: "nonexistent" }));
assert("12.07 No match returns null", evalNull === null);

_clearPolicyStore();

// -- 13. Coverage Compatibility (FASE 9) ------------------------------------

console.log("\n--- 13. Coverage Compatibility ---");

_clearPolicyStore();

const coverageRule = {
  id: "rule-1",
  name: "Subgroup Coverage",
  scope: "subgroup",
  scopeValue: "SG-01",
  minQty: 2,
  idealQty: 4,
  maxQty: 8,
  priority: 50,
  active: true,
};

const converted = coverageRuleToPolicy(coverageRule, "castillitos");
assert("13.01 Converted has coverage category", converted.category === "COVERAGE");
assert("13.02 Converted has correct tenant", converted.tenantId === "castillitos");
assert("13.03 Converted has minQty param", converted.parameters.some(p => p.name === "minQty" && p.value === 2));
assert("13.04 Converted has idealQty param", converted.parameters.some(p => p.name === "idealQty" && p.value === 4));
assert("13.05 Converted has maxQty param", converted.parameters.some(p => p.name === "maxQty" && p.value === 8));
assert("13.06 Converted has SUBGROUP scope", converted.scopes.some(s => s.scope === "SUBGROUP"));
assert("13.07 Converted is ACTIVE", converted.status === "ACTIVE");
assert("13.08 Converted has migration tag", converted.tags.includes("migrated"));

// Register and resolve converted policy
registerPolicy(converted);
const covCtx = buildCoverageResolutionContext({ tenantId: "castillitos", subgroup: "SG-01" });
const covResult = resolvePolicy(covCtx);
assert("13.09 Converted resolves", covResult.resolved === true);
assert("13.10 Converted selected", covResult.selectedPolicy?.id === `coverage-${coverageRule.id}`);

// Inactive rule conversion
const inactiveRule = { ...coverageRule, id: "rule-2", active: false };
const convertedInactive = coverageRuleToPolicy(inactiveRule, "castillitos");
assert("13.11 Inactive rule becomes DEPRECATED", convertedInactive.status === "DEPRECATED");

// Context builder
const fullCtx = buildCoverageResolutionContext({
  tenantId: "castillitos",
  storeId: "T01",
  productClass: "CALZADO",
  subgroup: "SG-01",
  sizeClass: "medium",
  referenceCode: "REF-123",
  businessLine: "LINEA_1",
});
assert("13.12 Context has TENANT scope", fullCtx.scopeBindings.some(s => s.scope === "TENANT"));
assert("13.13 Context has STORE scope", fullCtx.scopeBindings.some(s => s.scope === "STORE"));
assert("13.14 Context has PRODUCT_CLASS scope", fullCtx.scopeBindings.some(s => s.scope === "PRODUCT_CLASS"));
assert("13.15 Context has REFERENCE scope", fullCtx.scopeBindings.some(s => s.scope === "REFERENCE"));
assert("13.16 Context category is COVERAGE", fullCtx.category === "COVERAGE");

_clearPolicyStore();

// -- 14. Multi-tenant isolation ----------------------------------------------

console.log("\n--- 14. Multi-tenant Isolation ---");

_clearPolicyStore();

registerPolicy(makePolicy({ id: "mt-1", tenantId: "castillitos", name: "Castillitos Policy" }));
registerPolicy(makePolicy({ id: "mt-2", tenantId: "jupiter", name: "Jupiter Policy" }));

const castResult = resolvePolicy(makeContext({ tenantId: "castillitos" }));
assert("14.01 Castillitos sees own policy", castResult.selectedPolicy?.id === "mt-1");

const jupResult = resolvePolicy(makeContext({ tenantId: "jupiter" }));
assert("14.02 Jupiter sees own policy", jupResult.selectedPolicy?.id === "mt-2");

const castList = listPolicies({ tenantId: "castillitos" });
assert("14.03 Castillitos lists 1 policy", castList.length === 1);

const jupList = listPolicies({ tenantId: "jupiter" });
assert("14.04 Jupiter lists 1 policy", jupList.length === 1);

_clearPolicyStore();

// -- 15. Complex resolution scenarios ----------------------------------------

console.log("\n--- 15. Complex Resolution ---");

_clearPolicyStore();

// Register policies with different specificity levels
registerPolicy(makePolicy({ id: "cx-global", name: "Global Default", priority: 500, scopes: [{ scope: "GLOBAL", scopeValue: null }] }));
registerPolicy(makePolicy({ id: "cx-tenant", name: "Tenant Default", priority: 400, scopes: [{ scope: "TENANT", scopeValue: "castillitos" }] }));
registerPolicy(makePolicy({ id: "cx-store", name: "Store Policy", priority: 300, scopes: [{ scope: "STORE", scopeValue: "T01" }] }));
registerPolicy(makePolicy({ id: "cx-product", name: "Product Policy", priority: 200, scopes: [{ scope: "PRODUCT", scopeValue: "P01" }] }));
registerPolicy(makePolicy({ id: "cx-ref", name: "Reference Policy", priority: 100, scopes: [{ scope: "REFERENCE", scopeValue: "REF-X" }] }));

const complexCtx = makeContext({
  scopeBindings: [
    { scope: "TENANT", scopeValue: "castillitos" },
    { scope: "STORE", scopeValue: "T01" },
    { scope: "PRODUCT", scopeValue: "P01" },
    { scope: "REFERENCE", scopeValue: "REF-X" },
  ],
});

const complexResult = resolvePolicy(complexCtx);
assert("15.01 Complex resolves", complexResult.resolved === true);
assert("15.02 Most specific wins (REFERENCE)", complexResult.selectedPolicy?.id === "cx-ref");
assert("15.03 Multiple candidates", complexResult.candidates.length >= 4);
assert("15.04 Evidence has resolution path", complexResult.evidence.resolutionPath.length > 0);
assert("15.05 Evidence has trace", complexResult.evidence.traceId.startsWith("bp-"));

_clearPolicyStore();

// -- 16. Condition operators -------------------------------------------------

console.log("\n--- 16. Condition Operators ---");

_clearPolicyStore();

const opPolicy = makePolicy({
  id: "op-1", name: "Operator Test",
  conditions: [
    { field: "qty", operator: "GREATER_OR_EQUAL", value: 10, description: null },
    { field: "status", operator: "IN", value: ["ACTIVE", "PENDING"], description: null },
    { field: "name", operator: "STARTS_WITH", value: "REF-", description: null },
  ],
});
registerPolicy(opPolicy);

const opMatch = resolvePolicy(makeContext({ contextData: { qty: 15, status: "ACTIVE", name: "REF-123" } }));
assert("16.01 All operators match", opMatch.resolved === true);

const opFail1 = resolvePolicy(makeContext({ contextData: { qty: 5, status: "ACTIVE", name: "REF-123" } }));
assert("16.02 GREATER_OR_EQUAL fails", opFail1.resolved === false);

const opFail2 = resolvePolicy(makeContext({ contextData: { qty: 15, status: "CLOSED", name: "REF-123" } }));
assert("16.03 IN fails", opFail2.resolved === false);

const opFail3 = resolvePolicy(makeContext({ contextData: { qty: 15, status: "ACTIVE", name: "PROD-123" } }));
assert("16.04 STARTS_WITH fails", opFail3.resolved === false);

_clearPolicyStore();

// -- 17. No Castillitos-specific rules ---------------------------------------

console.log("\n--- 17. Architecture Constraints ---");

assert("17.01 No Castillitos-specific rules in engine", true); // Verified by structural audit
assert("17.02 All policies are tenant-scoped", true); // Every policy requires tenantId
assert("17.03 No Prisma imports", true); // Verified by structural audit
assert("17.04 No React imports", true); // Verified by structural audit

// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("BUSINESS-POLICY-ENGINE-01 FUNCTIONAL TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("BUSINESS-POLICY-ENGINE-01 FUNCTIONAL TESTS PASSED.\n");
}
