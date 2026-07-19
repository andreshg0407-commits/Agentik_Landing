/**
 * scripts/test-business-policy-packs.ts
 *
 * Functional tests for BUSINESS-POLICY-PACKS-01.
 *
 * Usage: npx tsx scripts/test-business-policy-packs.ts
 */

import {
  registerPack,
  activatePack,
  deactivatePack,
  listPacks,
  resolveActivePack,
  buildPackSummary,
  createPackVersion,
  diffPacks,
  getPoliciesForCategory,
  resolvePackPolicyIds,
  validatePack,
  _clearPackStore,
} from "../lib/comercial/business-policy/packs";

import type {
  BusinessPolicyPack,
  BusinessPolicyPackReference,
} from "../lib/comercial/business-policy/packs";

import type { PolicyCategory } from "../lib/comercial/business-policy";

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

function makeRef(id: string, category: PolicyCategory, version = "1.0.0"): BusinessPolicyPackReference {
  return { policyId: id, category, policyName: `Policy ${id}`, policyVersion: version, addedAt: new Date() };
}

function makePack(overrides: Partial<BusinessPolicyPack> = {}): BusinessPolicyPack {
  return {
    id: "pack-1",
    tenantId: "castillitos",
    name: "Castillitos Comercial",
    description: "Pack comercial completo",
    status: "DRAFT",
    categories: ["COVERAGE", "STORE", "ORDER"] as PolicyCategory[],
    policies: [
      makeRef("cov-1", "COVERAGE"),
      makeRef("store-1", "STORE"),
      makeRef("order-1", "ORDER"),
    ],
    versionInfo: {
      version: "1.0.0",
      createdAt: new Date(),
      createdBy: "admin",
      activatedAt: null,
      deprecatedAt: null,
      previousVersion: null,
      changeNote: null,
    },
    tags: [],
    metadata: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n=== BUSINESS-POLICY-PACKS-01 Functional Tests ===\n");

// -- 1. Registration --------------------------------------------------------

console.log("--- 1. Registration ---");

_clearPackStore();

const p1 = makePack();
const reg1 = registerPack(p1);
assert("1.01 Registration succeeds", reg1.success === true);
assert("1.02 Validation is valid", reg1.validation.valid === true);

const invalid = makePack({ id: "", name: "" });
const reg2 = registerPack(invalid);
assert("1.03 Invalid pack fails", reg2.success === false);

const empty = makePack({ categories: [] });
const reg3 = registerPack(empty);
assert("1.04 Empty categories fails", reg3.success === false);

_clearPackStore();

// -- 2. Activation ----------------------------------------------------------

console.log("\n--- 2. Activation ---");

_clearPackStore();

registerPack(makePack({ id: "act-1", status: "DRAFT" }));

const act1 = activatePack("castillitos", "act-1", "admin");
assert("2.01 Activation returns result", act1 !== null);
assert("2.02 Activation has correct packId", act1!.packId === "act-1");
assert("2.03 Activation has activatedAt", act1!.activatedAt instanceof Date);
assert("2.04 Activation has activatedBy", act1!.activatedBy === "admin");
assert("2.05 No previous pack", act1!.previousPackId === null);

const active = resolveActivePack("castillitos");
assert("2.06 Active pack resolved", active !== null);
assert("2.07 Active pack is correct", active!.id === "act-1");
assert("2.08 Status is ACTIVE", active!.status === "ACTIVE");

// Activate a second pack — first should be deprecated
registerPack(makePack({ id: "act-2", status: "DRAFT", policies: [makeRef("cov-2", "COVERAGE"), makeRef("store-2", "STORE"), makeRef("order-2", "ORDER")] }));
const act2 = activatePack("castillitos", "act-2", "admin");
assert("2.09 Second activation succeeds", act2 !== null);
assert("2.10 Previous pack recorded", act2!.previousPackId === "act-1");

const newActive = resolveActivePack("castillitos");
assert("2.11 New active pack", newActive!.id === "act-2");

// First pack should be deprecated
const allPacks = listPacks({ tenantId: "castillitos" });
const oldPack = allPacks.find(p => p.id === "act-1");
assert("2.12 Old pack deprecated", oldPack!.status === "DEPRECATED");

_clearPackStore();

// -- 3. Deactivation -------------------------------------------------------

console.log("\n--- 3. Deactivation ---");

_clearPackStore();

registerPack(makePack({ id: "deact-1", status: "DRAFT" }));
activatePack("castillitos", "deact-1", "admin");

const deact = deactivatePack("castillitos", "deact-1");
assert("3.01 Deactivation returns pack", deact !== null);
assert("3.02 Status is DEPRECATED", deact!.status === "DEPRECATED");
assert("3.03 Deprecated date set", deact!.versionInfo.deprecatedAt !== null);

const noActive = resolveActivePack("castillitos");
assert("3.04 No active pack after deactivation", noActive === null);

const deactAgain = deactivatePack("castillitos", "deact-1");
assert("3.05 Double deactivation returns null", deactAgain === null);

_clearPackStore();

// -- 4. List Packs ----------------------------------------------------------

console.log("\n--- 4. List Packs ---");

_clearPackStore();

registerPack(makePack({ id: "list-1", name: "Pack A" }));
registerPack(makePack({ id: "list-2", name: "Pack B", categories: ["VENDOR", "MARKDOWN"] as PolicyCategory[], policies: [makeRef("vendor-1", "VENDOR"), makeRef("md-1", "MARKDOWN")] }));

const all = listPacks({ tenantId: "castillitos" });
assert("4.01 Lists all packs", all.length === 2);

const drafts = listPacks({ tenantId: "castillitos", status: "DRAFT" });
assert("4.02 Filter by status", drafts.length === 2);

const coveragePacks = listPacks({ tenantId: "castillitos", category: "COVERAGE" });
assert("4.03 Filter by category", coveragePacks.length === 1);

const vendorPacks = listPacks({ tenantId: "castillitos", category: "VENDOR" });
assert("4.04 Vendor category filter", vendorPacks.length === 1);

const emptyList = listPacks({ tenantId: "nonexistent" });
assert("4.05 Empty for unknown tenant", emptyList.length === 0);

_clearPackStore();

// -- 5. Versioning ----------------------------------------------------------

console.log("\n--- 5. Versioning ---");

const original = makePack({ id: "ver-1" });
const v2 = createPackVersion(original, { description: "Updated" }, "admin", "Added markdown");
assert("5.01 New version created", v2.versionInfo.version === "1.0.1");
assert("5.02 Previous version linked", v2.versionInfo.previousVersion === "1.0.0");
assert("5.03 Status is DRAFT", v2.status === "DRAFT");
assert("5.04 Created by recorded", v2.versionInfo.createdBy === "admin");
assert("5.05 Change note recorded", v2.versionInfo.changeNote === "Added markdown");

const v3 = createPackVersion(v2, {}, "admin", null);
assert("5.06 Version increments", v3.versionInfo.version === "1.0.2");
assert("5.07 Chain links", v3.versionInfo.previousVersion === "1.0.1");

// -- 6. Validation ----------------------------------------------------------

console.log("\n--- 6. Validation ---");

const valid = makePack();
const validResult = validatePack(valid);
assert("6.01 Valid pack passes", validResult.valid === true);

const noId = makePack({ id: "" });
assert("6.02 No ID fails", !validatePack(noId).valid);

const noTenant = makePack({ tenantId: "" });
assert("6.03 No tenant fails", !validatePack(noTenant).valid);

const noName = makePack({ name: "" });
assert("6.04 No name fails", !validatePack(noName).valid);

const noCats = makePack({ categories: [] });
assert("6.05 No categories fails", !validatePack(noCats).valid);

const dupCats = makePack({ categories: ["COVERAGE", "COVERAGE"] as PolicyCategory[] });
assert("6.06 Duplicate categories fails", !validatePack(dupCats).valid);

const dupPolicies = makePack({
  policies: [makeRef("same-1", "COVERAGE"), makeRef("same-1", "COVERAGE")],
});
assert("6.07 Duplicate policies fails", !validatePack(dupPolicies).valid);

const wrongCat = makePack({
  categories: ["COVERAGE"] as PolicyCategory[],
  policies: [makeRef("p1", "ORDER")],
});
assert("6.08 Policy category not in pack fails", !validatePack(wrongCat).valid);

const noPolicies = makePack({ policies: [] });
const noPoliciesResult = validatePack(noPolicies);
assert("6.09 No policies is warning (not error)", noPoliciesResult.valid === true);
assert("6.10 Warning about empty policies", noPoliciesResult.issues.some(i => i.severity === "WARNING"));

const emptyCat = makePack({
  categories: ["COVERAGE", "VENDOR"] as PolicyCategory[],
  policies: [makeRef("cov-1", "COVERAGE")],
});
const emptyCatResult = validatePack(emptyCat);
assert("6.11 Category with no policies warns", emptyCatResult.issues.some(i => i.message.includes("VENDOR") && i.severity === "WARNING"));

// -- 7. Summary -------------------------------------------------------------

console.log("\n--- 7. Summary ---");

const pack = makePack({ id: "sum-1", name: "Summary Pack" });
const summary = buildPackSummary(pack);
assert("7.01 Summary has packId", summary.packId === "sum-1");
assert("7.02 Summary has name", summary.name === "Summary Pack");
assert("7.03 Summary has categoryCount", summary.categoryCount === 3);
assert("7.04 Summary has policyCount", summary.policyCount === 3);
assert("7.05 Summary has status", summary.status === "DRAFT");
assert("7.06 Summary has version", summary.version === "1.0.0");

// -- 8. Diff ----------------------------------------------------------------

console.log("\n--- 8. Diff ---");

const from = makePack({
  policies: [
    makeRef("p1", "COVERAGE", "1.0.0"),
    makeRef("p2", "STORE", "1.0.0"),
    makeRef("p3", "ORDER", "1.0.0"),
  ],
});

const to = makePack({
  policies: [
    makeRef("p1", "COVERAGE", "1.0.1"),  // version changed
    // p2 removed
    makeRef("p3", "ORDER", "1.0.0"),     // unchanged
    makeRef("p4", "COVERAGE", "1.0.0"),  // added
  ],
  versionInfo: { ...makePack().versionInfo, version: "2.0.0" },
});

const diff = diffPacks(from, to);
assert("8.01 Diff from version", diff.fromVersion === "1.0.0");
assert("8.02 Diff to version", diff.toVersion === "2.0.0");
assert("8.03 Diff has 3 entries", diff.entries.length === 3);
assert("8.04 p1 version changed", diff.entries.some(e => e.policyId === "p1" && e.change === "VERSION_CHANGED"));
assert("8.05 p2 removed", diff.entries.some(e => e.policyId === "p2" && e.change === "REMOVED"));
assert("8.06 p4 added", diff.entries.some(e => e.policyId === "p4" && e.change === "ADDED"));

// -- 9. Compatibility -------------------------------------------------------

console.log("\n--- 9. Compatibility ---");

_clearPackStore();

const compatPack = makePack({ id: "compat-1" });
registerPack(compatPack);
activatePack("castillitos", "compat-1", "admin");

const coveragePolicies = getPoliciesForCategory(compatPack, "COVERAGE");
assert("9.01 Gets coverage policies", coveragePolicies.length === 1);
assert("9.02 Correct policy ID", coveragePolicies[0].policyId === "cov-1");

const storePolicies = getPoliciesForCategory(compatPack, "STORE");
assert("9.03 Gets store policies", storePolicies.length === 1);

const markdownPolicies = getPoliciesForCategory(compatPack, "MARKDOWN");
assert("9.04 No markdown policies", markdownPolicies.length === 0);

const resolvedIds = resolvePackPolicyIds("castillitos", "COVERAGE");
assert("9.05 Resolves policy IDs from active pack", resolvedIds.length === 1);
assert("9.06 Correct resolved ID", resolvedIds[0] === "cov-1");

const noPackIds = resolvePackPolicyIds("nonexistent", "COVERAGE");
assert("9.07 No IDs for unknown tenant", noPackIds.length === 0);

_clearPackStore();

// -- 10. Multi-tenant Isolation ---------------------------------------------

console.log("\n--- 10. Multi-tenant Isolation ---");

_clearPackStore();

registerPack(makePack({ id: "mt-1", tenantId: "castillitos", name: "Castillitos Pack" }));
registerPack(makePack({ id: "mt-2", tenantId: "jupiter", name: "Jupiter Pack", policies: [makeRef("j-cov", "COVERAGE"), makeRef("j-store", "STORE"), makeRef("j-order", "ORDER")] }));

activatePack("castillitos", "mt-1", "admin");
activatePack("jupiter", "mt-2", "admin");

const cast = resolveActivePack("castillitos");
assert("10.01 Castillitos has own pack", cast!.id === "mt-1");

const jup = resolveActivePack("jupiter");
assert("10.02 Jupiter has own pack", jup!.id === "mt-2");

const castIds = resolvePackPolicyIds("castillitos", "COVERAGE");
assert("10.03 Castillitos coverage IDs isolated", castIds[0] === "cov-1");

const jupIds = resolvePackPolicyIds("jupiter", "COVERAGE");
assert("10.04 Jupiter coverage IDs isolated", jupIds[0] === "j-cov");

_clearPackStore();

// -- 11. Membership Exclusivity (FASE 3) ------------------------------------

console.log("\n--- 11. Membership Exclusivity ---");

_clearPackStore();

registerPack(makePack({ id: "excl-1", policies: [makeRef("shared-policy", "COVERAGE"), makeRef("store-x", "STORE"), makeRef("order-x", "ORDER")] }));

const conflicting = makePack({ id: "excl-2", policies: [makeRef("shared-policy", "COVERAGE"), makeRef("store-y", "STORE"), makeRef("order-y", "ORDER")] });
const conflictResult = registerPack(conflicting);
assert("11.01 Duplicate membership blocked", conflictResult.success === false);
assert("11.02 Error mentions policy", conflictResult.validation.issues.some(i => i.message.includes("shared-policy")));

_clearPackStore();

// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("BUSINESS-POLICY-PACKS-01 FUNCTIONAL TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("BUSINESS-POLICY-PACKS-01 FUNCTIONAL TESTS PASSED.\n");
}
