/**
 * app/api/internal/integration-tests/secret-rotation/route.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Integration Test Harness — 70 live tests
 *
 * GET /api/internal/integration-tests/secret-rotation
 *
 * All tests run server-side. No mocks. Uses real instances.
 * Returns JSON: { passed, failed, total, results: [...] }
 */

import { NextResponse } from "next/server";

// ── Domain Imports ────────────────────────────────────────────────────────────

import {
  ROTATION_REGISTRY,
  getRotationEntry,
  isRotatable,
  getEntriesByRisk,
  getRegistrySummary,
} from "@/lib/security/secret-rotation/rotation-registry";

import {
  secretVersionStore,
  createSecretVersion,
  isVersionExpired,
  isVersionActive,
  versionAgeInDays,
  rotationStatusToVersionStatus,
} from "@/lib/security/secret-rotation/secret-version";

import {
  canRotate,
  requiresRotation,
  evaluateRotationRisk,
} from "@/lib/security/secret-rotation/rotation-policy-engine";

import {
  generateRotationPlan,
  buildRotationSchedule,
  detectExpiringSecrets,
} from "@/lib/security/secret-rotation/rotation-planner";

import {
  getApprovalRequirement,
  evaluateApproval,
  canSelfApprove,
  getRiskApprovalMatrix,
} from "@/lib/security/secret-rotation/rotation-approval-policy";

import {
  getActiveRotations,
  getPendingRotations,
  getRotationHistory,
  getFailedRotations,
  getLatestRotation,
  hasInProgressRotation,
  getOrphanedVersions,
  getStaleVersions,
  getRotationSummary,
} from "@/lib/security/secret-rotation/rotation-query";

import {
  buildRotationReport,
  buildExpirationReport,
  buildComplianceReport,
  formatRotationReport,
  formatComplianceReport,
} from "@/lib/security/secret-rotation/rotation-report-builder";

import {
  successResult,
  failedResult,
  cancelledResult,
} from "@/lib/security/secret-rotation/rotation-types";

import {
  getPlannedCapabilities,
  ROTATION_FUTURE_CAPABILITIES,
} from "@/lib/security/secret-rotation/future-compatibility";

import { vaultRotationAdapter }  from "@/lib/security/secret-rotation/integrations/vault-rotation";
import { rbacRotationAdapter }   from "@/lib/security/secret-rotation/integrations/rbac-rotation";
import { rotationAuditLog }      from "@/lib/security/secret-rotation/rotation-audit";
import { rotationHealthMonitor } from "@/lib/security/secret-rotation/rotation-health";

// ── Test Helpers ──────────────────────────────────────────────────────────────

type TestResult = { id: string; label: string; passed: boolean; error?: string };

function t(id: string, label: string, fn: () => boolean | Promise<boolean>): Promise<TestResult> {
  return Promise.resolve()
    .then(() => fn())
    .then(passed => ({ id, label, passed }))
    .catch(err  => ({ id, label, passed: false, error: String(err) }));
}

function assert(cond: boolean, msg: string): boolean {
  if (!cond) throw new Error(msg);
  return true;
}

// ── Sample Rotations ──────────────────────────────────────────────────────────

import type { RotationRecord } from "@/lib/security/secret-rotation/rotation-repository";

const sampleRotations: RotationRecord[] = [
  { id: "r1", orgSlug: "org1", secretId: "OPENAI_API_KEY",   strategy: "MANUAL",    status: "ACTIVE",     requestedBy: "u1", reason: "scheduled",  metadata: {}, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), activatedAt: new Date().toISOString() },
  { id: "r2", orgSlug: "org1", secretId: "WHATSAPP_TOKEN",   strategy: "MANUAL",    status: "PENDING",    requestedBy: "u1", reason: "manual",     metadata: {}, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { id: "r3", orgSlug: "org1", secretId: "SHOPIFY_TOKEN",    strategy: "MANUAL",    status: "FAILED",     requestedBy: "u1", reason: "timeout",    metadata: {}, createdAt: new Date(Date.now() - 1 * 86_400_000).toISOString() },
  { id: "r4", orgSlug: "org1", secretId: "OPENAI_API_KEY",   strategy: "EMERGENCY", status: "REVOKED",    requestedBy: "u2", reason: "compromise", metadata: {}, createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), revokedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  { id: "r5", orgSlug: "org1", secretId: "DIAN_CERTIFICATE", strategy: "MANUAL",    status: "VALIDATING", requestedBy: "u3", reason: "renewal",    metadata: {}, createdAt: new Date().toISOString() },
];

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const results: TestResult[] = [];
  const run = async (id: string, label: string, fn: () => boolean | Promise<boolean>) => {
    results.push(await t(id, label, fn));
  };

  // ── T01–T05: Registry ──────────────────────────────────────────────────────

  await run("T01", "Registry: ROTATION_REGISTRY has >= 10 entries", () =>
    assert(ROTATION_REGISTRY.length >= 10, `Expected >=10, got ${ROTATION_REGISTRY.length}`));

  await run("T02", "Registry: getRotationEntry returns entry by id", () => {
    const entry = getRotationEntry("OPENAI_API_KEY");
    return assert(entry?.id === "OPENAI_API_KEY", "Entry not found or wrong id");
  });

  await run("T03", "Registry: isRotatable returns true for OPENAI_API_KEY", () =>
    assert(isRotatable("OPENAI_API_KEY"), "Should be rotatable"));

  await run("T04", "Registry: isRotatable returns false for unknown secret", () =>
    assert(!isRotatable("NONEXISTENT_SECRET"), "Unknown secret should not be rotatable"));

  await run("T05", "Registry: getRegistrySummary has correct shape", () => {
    const s = getRegistrySummary();
    return assert(typeof s.total === "number" && s.total >= 10, "Summary invalid");
  });

  await run("T05b", "Registry: getEntriesByRisk CRITICAL returns >= 1", () => {
    const critical = getEntriesByRisk("CRITICAL");
    return assert(critical.length >= 1, `Expected >=1 CRITICAL, got ${critical.length}`);
  });

  // ── T06–T12: SecretVersionStore ───────────────────────────────────────────

  await run("T06", "VersionStore: size is a number", () =>
    assert(typeof secretVersionStore.size === "number", "size not a number"));

  await run("T07", "VersionStore: createSecretVersion sets PENDING status", () => {
    const v = createSecretVersion({ secretId: "TEST_HARNESS_KEY", orgSlug: "harness-org", createdBy: "test" });
    secretVersionStore.set(v);
    return assert(v.status === "PENDING", `Expected PENDING, got ${v.status}`);
  });

  await run("T08", "VersionStore: auto-increments version", () => {
    const v1 = createSecretVersion({ secretId: "INCR_TEST", orgSlug: "harness-org", createdBy: "test" });
    secretVersionStore.set(v1);
    const v2 = createSecretVersion({ secretId: "INCR_TEST", orgSlug: "harness-org", createdBy: "test" });
    secretVersionStore.set(v2);
    return assert(v2.version > v1.version, `Expected v2 > v1, got ${v1.version} and ${v2.version}`);
  });

  await run("T09", "VersionStore: isVersionExpired false for future expiry", () => {
    const v = createSecretVersion({
      secretId: "EXP_FUTURE", orgSlug: "harness-org", createdBy: "test",
      expiresAt: new Date(Date.now() + 86_400_000 * 30).toISOString(),
    });
    secretVersionStore.set(v);
    return assert(!isVersionExpired(v), "Should not be expired");
  });

  await run("T10", "VersionStore: isVersionExpired true for past expiry", () => {
    const v = createSecretVersion({
      secretId: "EXP_PAST", orgSlug: "harness-org", createdBy: "test",
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    secretVersionStore.set(v);
    return assert(isVersionExpired(v), "Should be expired");
  });

  await run("T11", "VersionStore: versionAgeInDays >= 0", () => {
    const v = createSecretVersion({ secretId: "AGE_TEST", orgSlug: "harness-org", createdBy: "test" });
    secretVersionStore.set(v);
    return assert(versionAgeInDays(v) >= 0, `Age should be >= 0`);
  });

  await run("T12", "VersionStore: isVersionActive returns false for PENDING", () => {
    const v = createSecretVersion({ secretId: "ACT_TEST", orgSlug: "harness-org", createdBy: "test" });
    secretVersionStore.set(v);
    return assert(!isVersionActive(v), "PENDING should not be active");
  });

  await run("T12b", "VersionStore: rotationStatusToVersionStatus maps correctly", () =>
    assert(
      rotationStatusToVersionStatus("ACTIVE")  === "ACTIVE"  &&
      rotationStatusToVersionStatus("REVOKED") === "REVOKED" &&
      rotationStatusToVersionStatus("PENDING") === "PENDING",
      "Status mapping incorrect"
    ));

  await run("T12c", "VersionStore: list() returns all stored versions", () => {
    const all = secretVersionStore.list();
    return assert(Array.isArray(all), "list() should return array");
  });

  // ── T13–T18: Policy Engine ────────────────────────────────────────────────

  await run("T13", "PolicyEngine: canRotate allows when no active rotation", () => {
    const r = canRotate({ secretId: "OPENAI_API_KEY", strategy: "MANUAL", hasActiveRotation: false });
    return assert(r.allowed, r.reason);
  });

  await run("T14", "PolicyEngine: canRotate blocks when active rotation in progress", () => {
    const r = canRotate({ secretId: "OPENAI_API_KEY", strategy: "MANUAL", hasActiveRotation: true });
    return assert(!r.allowed, "Should be blocked");
  });

  await run("T15", "PolicyEngine: EMERGENCY bypasses active rotation block", () => {
    const r = canRotate({ secretId: "OPENAI_API_KEY", strategy: "EMERGENCY", hasActiveRotation: true });
    return assert(r.allowed, r.reason);
  });

  await run("T16", "PolicyEngine: requiresRotation true when compromised", () => {
    const r = requiresRotation({ isCompromised: true });
    return assert(r.requiresRotation && r.canRotate, "Should require rotation when compromised");
  });

  await run("T17", "PolicyEngine: requiresRotation canRotate true with no version", () => {
    const r = requiresRotation({});
    return assert(r.canRotate === true, "Should be able to rotate with no version");
  });

  await run("T18", "PolicyEngine: evaluateRotationRisk returns a riskLevel", () => {
    const r = evaluateRotationRisk({ strategy: "MANUAL", providerRisk: "HIGH", hasActiveVersion: true });
    return assert(["LOW","MEDIUM","HIGH","CRITICAL"].includes(r.riskLevel), `Unknown riskLevel: ${r.riskLevel}`);
  });

  // ── T19–T22: Planner ──────────────────────────────────────────────────────

  await run("T19", "Planner: generateRotationPlan returns a valid plan", () => {
    const plan = generateRotationPlan({ secretId: "OPENAI_API_KEY", orgSlug: "harness-org", requestedBy: "admin", reason: "test", strategy: "MANUAL" });
    if ("error" in plan) throw new Error(plan.error);
    return assert(plan.secretId === "OPENAI_API_KEY" && plan.steps.length > 0, "Plan invalid");
  });

  await run("T20", "Planner: generateRotationPlan returns error for unknown secret", () => {
    const plan = generateRotationPlan({ secretId: "NONEXISTENT", orgSlug: "harness-org", requestedBy: "admin", reason: "test", strategy: "MANUAL" });
    return assert("error" in plan, "Should return error for unknown secret");
  });

  await run("T21", "Planner: EMERGENCY plan has fewer steps than STANDARD", () => {
    const standard  = generateRotationPlan({ secretId: "OPENAI_API_KEY", orgSlug: "org", requestedBy: "admin", reason: "t", strategy: "MANUAL" });
    const emergency = generateRotationPlan({ secretId: "OPENAI_API_KEY", orgSlug: "org", requestedBy: "admin", reason: "t", strategy: "EMERGENCY" });
    if ("error" in standard || "error" in emergency) return false;
    return assert(emergency.steps.length <= standard.steps.length, "Emergency should have <= steps");
  });

  await run("T22", "Planner: buildRotationSchedule returns array", () => {
    const schedule = buildRotationSchedule("harness-org");
    return assert(Array.isArray(schedule), "Should return array");
  });

  await run("T22b", "Planner: detectExpiringSecrets returns array", () => {
    const expiring = detectExpiringSecrets("harness-org", 30);
    return assert(Array.isArray(expiring), "Should return array");
  });

  // ── T23–T28: Approval Policy ──────────────────────────────────────────────

  await run("T23", "Approval: CRITICAL risk requires DOUBLE", () => {
    const entry = getRotationEntry("DIAN_CERTIFICATE")!;
    const req = getApprovalRequirement({ riskLevel: "CRITICAL", strategy: "MANUAL", entry });
    return assert(req === "DOUBLE", `Expected DOUBLE got ${req}`);
  });

  await run("T24", "Approval: LOW risk requires NONE", () => {
    const entry = getRotationEntry("WEBHOOK_SECRET")!;
    const req = getApprovalRequirement({ riskLevel: "LOW", strategy: "MANUAL", entry });
    return assert(req === "NONE", `Expected NONE got ${req}`);
  });

  await run("T25", "Approval: EMERGENCY strategy bypasses gate", () => {
    const entry = getRotationEntry("OPENAI_API_KEY")!;
    const req = getApprovalRequirement({ riskLevel: "CRITICAL", strategy: "EMERGENCY", entry });
    return assert(req === "EMERGENCY", `Expected EMERGENCY got ${req}`);
  });

  await run("T26", "Approval: canSelfApprove always returns false", () =>
    assert(canSelfApprove() === false, "Self-approval should never be allowed"));

  await run("T27", "Approval: DOUBLE satisfied with 2 distinct approvers", () => {
    const d = evaluateApproval({ requirement: "DOUBLE", strategy: "MANUAL", approvers: ["a1", "a2"], requestedBy: "req-x" });
    return assert(d.isApproved && d.approvalsCollected === 2, "Should be approved with 2 approvers");
  });

  await run("T28", "Approval: requester cannot self-approve", () => {
    const d = evaluateApproval({ requirement: "SINGLE", strategy: "MANUAL", approvers: ["req-x"], requestedBy: "req-x" });
    return assert(!d.isApproved, "Requester cannot self-approve");
  });

  await run("T28b", "Approval: getRiskApprovalMatrix returns 4 levels", () => {
    const matrix = getRiskApprovalMatrix();
    return assert(matrix.length === 4, `Expected 4, got ${matrix.length}`);
  });

  // ── T29–T33: Vault Adapter ────────────────────────────────────────────────

  await run("T29", "Vault: isVaultAvailable returns true", async () => {
    const r = await vaultRotationAdapter.isVaultAvailable();
    return assert(r === true, "Vault should be available");
  });

  await run("T30", "Vault: createNewVersion returns success", async () => {
    const r = await vaultRotationAdapter.createNewVersion({ secretId: "OPENAI_API_KEY", orgSlug: "harness-org", rotationId: "rot-test", version: 99 });
    return assert(r.success === true, `createNewVersion failed`);
  });

  await run("T31", "Vault: activateVersion returns success", async () => {
    const r = await vaultRotationAdapter.activateVersion({ secretId: "OPENAI_API_KEY", orgSlug: "harness-org", rotationId: "rot-test", version: 99 });
    return assert(r.success === true, `activateVersion failed`);
  });

  await run("T32", "Vault: revokeVersion returns success", async () => {
    const r = await vaultRotationAdapter.revokeVersion({ secretId: "OPENAI_API_KEY", orgSlug: "harness-org", rotationId: "rot-test", version: 99 });
    return assert(r.success === true, `revokeVersion failed`);
  });

  await run("T33", "Vault: VaultOperationResult has reason field", async () => {
    const r = await vaultRotationAdapter.createNewVersion({ secretId: "OPENAI_API_KEY", orgSlug: "harness-org", rotationId: "rot-test", version: 1 });
    return assert(typeof r.reason === "string", "Should have reason field");
  });

  // ── T34–T38: RBAC Adapter ─────────────────────────────────────────────────

  await run("T34", "RBAC: canRequest denied for no-role user", () => {
    const r = rbacRotationAdapter.canRequest("nobody-harness", "org-harness");
    return assert(r.decision === "DENY", "No-role user should be denied");
  });

  await run("T35", "RBAC: canApprove denied for no-role user", () => {
    const r = rbacRotationAdapter.canApprove("nobody-harness", "org-harness");
    return assert(r.decision === "DENY", "No-role user should be denied");
  });

  await run("T36", "RBAC: canExecute denied for no-role user", () => {
    const r = rbacRotationAdapter.canExecute("nobody-harness", "org-harness");
    return assert(r.decision === "DENY", "No-role user should be denied");
  });

  await run("T37", "RBAC: isRequestAllowed returns boolean", () => {
    const r = rbacRotationAdapter.isRequestAllowed("nobody-harness", "org-harness");
    return assert(typeof r === "boolean", "Should return boolean");
  });

  await run("T38", "RBAC: hasAnyRotationPermission false for no-role user", () => {
    const r = rbacRotationAdapter.hasAnyRotationPermission("nobody-harness", "org-harness");
    return assert(r === false, "Should be false for no-role user");
  });

  // ── T39–T43: Audit Log ────────────────────────────────────────────────────

  await run("T39", "Audit: rotationAuditLog.size is a number", () =>
    assert(typeof rotationAuditLog.size === "number", "size not a number"));

  await run("T40", "Audit: getRecent returns array", () => {
    const events = rotationAuditLog.getRecent(5);
    return assert(Array.isArray(events), "Should return array");
  });

  await run("T41", "Audit: getByRotation returns array", () => {
    const events = rotationAuditLog.getByRotation("nonexistent-rotation");
    return assert(Array.isArray(events), "Should return array");
  });

  await run("T42", "Audit: getByTenant returns array", () => {
    const events = rotationAuditLog.getByTenant("org-harness");
    return assert(Array.isArray(events), "Should return array");
  });

  await run("T43", "Audit: _reset reduces size to 0", () => {
    rotationAuditLog._reset();
    return assert(rotationAuditLog.size === 0, `Expected 0 after reset`);
  });

  // ── T44–T50: Query Helpers ────────────────────────────────────────────────

  await run("T44", "Query: getActiveRotations returns only ACTIVE", () => {
    const r = getActiveRotations(sampleRotations);
    return assert(r.every(x => x.status === "ACTIVE"), "All should be ACTIVE");
  });

  await run("T45", "Query: getPendingRotations returns PENDING+VALIDATING", () => {
    const r = getPendingRotations(sampleRotations);
    return assert(r.every(x => x.status === "PENDING" || x.status === "VALIDATING"), "All should be PENDING/VALIDATING");
  });

  await run("T46", "Query: getRotationHistory for OPENAI_API_KEY returns 2", () => {
    const h = getRotationHistory(sampleRotations, "OPENAI_API_KEY");
    return assert(h.length === 2, `Expected 2, got ${h.length}`);
  });

  await run("T47", "Query: getFailedRotations returns entries with rotationId+reason", () => {
    const f = getFailedRotations(sampleRotations);
    return assert(f.length > 0 && "rotationId" in f[0] && "reason" in f[0], "Unexpected shape");
  });

  await run("T48", "Query: getLatestRotation returns most recent for OPENAI_API_KEY", () => {
    const latest = getLatestRotation(sampleRotations, "OPENAI_API_KEY");
    return assert(latest?.id === "r1", `Expected r1, got ${latest?.id}`);
  });

  await run("T49", "Query: hasInProgressRotation true for VALIDATING", () => {
    const r = hasInProgressRotation(sampleRotations, "DIAN_CERTIFICATE");
    return assert(r === true, "VALIDATING should count as in-progress");
  });

  await run("T50", "Query: hasInProgressRotation false for FAILED/REVOKED", () => {
    const r = hasInProgressRotation(sampleRotations, "SHOPIFY_TOKEN");
    return assert(r === false, "FAILED should not count as in-progress");
  });

  await run("T50b", "Query: getOrphanedVersions returns array", () => {
    const orphaned = getOrphanedVersions();
    return assert(Array.isArray(orphaned), "Should return array");
  });

  await run("T50c", "Query: getStaleVersions returns array", () => {
    const stale = getStaleVersions(180);
    return assert(Array.isArray(stale), "Should return array");
  });

  await run("T50d", "Query: getRotationSummary has correct shape", () => {
    const s = getRotationSummary({ orgSlug: "org1", rotations: sampleRotations });
    return assert(
      typeof s.totalRotations === "number" && s.totalRotations === sampleRotations.length,
      "Summary incorrect"
    );
  });

  // ── T51–T57: Report Builder ────────────────────────────────────────────────

  await run("T51", "Reports: buildRotationReport correct breakdown", () => {
    const r = buildRotationReport({ rotations: sampleRotations, orgSlug: "org1" });
    return assert(r.breakdown.ACTIVE === 1 && r.breakdown.PENDING === 1 && r.breakdown.FAILED === 1, "Breakdown incorrect");
  });

  await run("T52", "Reports: buildRotationReport has insights", () => {
    const r = buildRotationReport({ rotations: sampleRotations, orgSlug: "org1" });
    return assert(Array.isArray(r.insights) && r.insights.length > 0, "No insights");
  });

  await run("T53", "Reports: buildExpirationReport has correct shape", () => {
    const r = buildExpirationReport({ versions: [], orgSlug: "org1" });
    return assert(typeof r.total === "number" && Array.isArray(r.critical) && r.meta.orgSlug === "org1", "Shape invalid");
  });

  await run("T54", "Reports: buildComplianceReport includes all registry entries", () => {
    const r = buildComplianceReport({ versions: [], rotations: [], orgSlug: "org1" });
    return assert(r.items.length === ROTATION_REGISTRY.length, `Expected ${ROTATION_REGISTRY.length} items`);
  });

  await run("T55", "Reports: formatRotationReport returns non-empty string", () => {
    const r = buildRotationReport({ rotations: sampleRotations, orgSlug: "org1" });
    return assert(formatRotationReport(r).length > 0, "Should be non-empty");
  });

  await run("T56", "Reports: formatComplianceReport contains % sign", () => {
    const r  = buildComplianceReport({ versions: [], rotations: [], orgSlug: "org1" });
    const tx = formatComplianceReport(r);
    return assert(tx.includes("%"), "Should include percentage");
  });

  await run("T57", "Reports: buildRotationReport meta has generatedAt", () => {
    const r = buildRotationReport({ rotations: [], orgSlug: "org1" });
    return assert(!!r.meta.generatedAt, "Missing generatedAt");
  });

  // ── T58–T60: Result Factories ──────────────────────────────────────────────

  await run("T58", "Results: successResult has success=true ACTIVE", () => {
    const r = successResult("rotation_complete", "Rotation completed successfully.");
    return assert(r.success === true && r.status === "ACTIVE", "successResult incorrect");
  });

  await run("T59", "Results: failedResult has success=false FAILED", () => {
    const r = failedResult("provider_error", "Rotation failed due to provider error.");
    return assert(r.success === false && r.status === "FAILED", "failedResult incorrect");
  });

  await run("T60", "Results: cancelledResult has success=false CANCELLED", () => {
    const r = cancelledResult("user_cancelled", "Rotation was cancelled by the user.");
    return assert(r.success === false && r.status === "CANCELLED", "cancelledResult incorrect");
  });

  // ── T61–T63: Future Compatibility ─────────────────────────────────────────

  await run("T61", "Future: ROTATION_FUTURE_CAPABILITIES has >= 5 entries", () =>
    assert(ROTATION_FUTURE_CAPABILITIES.length >= 5, `Expected >=5, got ${ROTATION_FUTURE_CAPABILITIES.length}`));

  await run("T62", "Future: all capabilities are PLANNED", () => {
    const planned = getPlannedCapabilities();
    return assert(planned.length === ROTATION_FUTURE_CAPABILITIES.length, "All should be PLANNED");
  });

  await run("T63", "Future: AUTO_ROTATION capability exists", () => {
    const c = ROTATION_FUTURE_CAPABILITIES.find(x => x.id === "AUTO_ROTATION");
    return assert(!!c, "AUTO_ROTATION not found");
  });

  await run("T63b", "Future: EMERGENCY_RESPONSE capability exists", () => {
    const c = ROTATION_FUTURE_CAPABILITIES.find(x => x.id === "EMERGENCY_RESPONSE");
    return assert(!!c, "EMERGENCY_RESPONSE not found");
  });

  // ── T64–T66: Health Monitor ────────────────────────────────────────────────

  await run("T64", "Health: checkRotationHealth returns valid status", async () => {
    const r = await rotationHealthMonitor.checkRotationHealth();
    return assert(["HEALTHY","DEGRADED","UNAVAILABLE"].includes(r.status), `Unknown: ${r.status}`);
  });

  await run("T65", "Health: report has >= 6 checks", async () => {
    const r = await rotationHealthMonitor.checkRotationHealth();
    return assert(r.checks.length >= 6, `Expected >=6, got ${r.checks.length}`);
  });

  await run("T66", "Health: report summary has total from registry", async () => {
    const r = await rotationHealthMonitor.checkRotationHealth();
    return assert(typeof r.summary.total === "number", "summary.total should be a number");
  });

  // ── T67–T70: Miscellaneous ─────────────────────────────────────────────────

  await run("T67", "VersionStore: getActive returns ACTIVE or undefined", () => {
    const v = createSecretVersion({ secretId: "ACTIVE_GET_TEST", orgSlug: "harness-org", createdBy: "test" });
    v.status = "ACTIVE";
    secretVersionStore.set(v);
    const found = secretVersionStore.getActive("harness-org", "ACTIVE_GET_TEST");
    return assert(found?.status === "ACTIVE", "Should find active version");
  });

  await run("T68", "VersionStore: remove deletes a version", () => {
    const v = createSecretVersion({ secretId: "REMOVE_TEST", orgSlug: "harness-org", createdBy: "test" });
    secretVersionStore.set(v);
    secretVersionStore.remove("harness-org", "REMOVE_TEST", v.version);
    const found = secretVersionStore.get("harness-org", "REMOVE_TEST", v.version);
    return assert(found === undefined, "Should be removed");
  });

  await run("T69", "Approval: SINGLE satisfied with 1 valid approver", () => {
    const d = evaluateApproval({ requirement: "SINGLE", strategy: "MANUAL", approvers: ["valid-approver"], requestedBy: "requester" });
    return assert(d.isApproved && d.approvalsNeeded === 1, "Should satisfy SINGLE approval");
  });

  await run("T70", "Approval: NONE auto-approves with 0 approvers", () => {
    const d = evaluateApproval({ requirement: "NONE", strategy: "MANUAL", approvers: [], requestedBy: "req" });
    return assert(d.isApproved && d.canProceedNow, "NONE should auto-approve");
  });

  // ── Aggregate ──────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total  = results.length;

  return NextResponse.json({
    sprint:  "AGENTIK-SECURITY-SECRET-ROTATION-01",
    passed,
    failed,
    total,
    verdict: failed === 0 ? "PASS" : "FAIL",
    results,
  });
}
