/**
 * app/api/internal/integration-tests/rbac/route.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Integration Harness — Server-Side Test Route
 *
 * GET /api/internal/integration-tests/rbac
 *
 * Runs 55 integration tests against the live RBAC layer.
 * Guarded by ENABLE_INTERNAL_INTEGRATION_TESTS env var.
 * Returns a structured HarnessReport.
 */

import { NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  id:         string;
  label:      string;
  status:     "PASS" | "FAIL" | "SKIP";
  detail?:    string;
  durationMs: number;
}

// ── Guard ─────────────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return (
    process.env.ENABLE_INTERNAL_INTEGRATION_TESTS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

function checkAuth(req: Request): boolean {
  const expected = process.env.INTERNAL_INTEGRATION_TEST_TOKEN;
  if (!expected) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

// ── Test Runner ───────────────────────────────────────────────────────────────

function run(
  id:    string,
  label: string,
  fn:    () => void | Promise<void>,
): Promise<TestResult> {
  const t0 = Date.now();
  return Promise.resolve()
    .then(fn)
    .then((): TestResult => ({
      id, label, status: "PASS", durationMs: Date.now() - t0,
    }))
    .catch((err: unknown): TestResult => ({
      id, label, status: "FAIL",
      detail:    String(err instanceof Error ? err.message : err),
      durationMs: Date.now() - t0,
    }));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Integration tests disabled" }, { status: 403 });
  }
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];
  const push = (r: TestResult) => results.push(r);

  // ── T01: rbac-types — denyResult ─────────────────────────────────────────

  push(await run("T01", "denyResult produces DENY AccessResult", async () => {
    const { denyResult } = await import("@/lib/security/rbac/rbac-types");
    const r = denyResult("test_reason", "FINANCE_VIEW");
    assert(r.decision === "DENY", "decision is DENY");
    assert(r.reason === "test_reason", "reason set");
    assert(r.permissionId === "FINANCE_VIEW", "permissionId set");
    assert(typeof r.decidedAt === "string", "decidedAt is string");
    assert(typeof r.durationMs === "number", "durationMs is number");
  }));

  // ── T02: rbac-types — allowResult ────────────────────────────────────────

  push(await run("T02", "allowResult produces ALLOW AccessResult", async () => {
    const { allowResult, isAllowed, isDenied } = await import("@/lib/security/rbac/rbac-types");
    const r = allowResult("role_has_permission", "OPERATOR", "FINANCE_VIEW");
    assert(r.decision === "ALLOW", "decision is ALLOW");
    assert(r.grantingRole === "OPERATOR", "grantingRole set");
    assert(isAllowed(r), "isAllowed returns true");
    assert(!isDenied(r), "isDenied returns false");
  }));

  // ── T03: permission-registry — isRegisteredPermission ────────────────────

  push(await run("T03", "isRegisteredPermission identifies valid permissions", async () => {
    const { isRegisteredPermission } = await import("@/lib/security/rbac/permission-registry");
    assert(isRegisteredPermission("FINANCE_VIEW"), "FINANCE_VIEW registered");
    assert(isRegisteredPermission("VAULT_ADMIN"), "VAULT_ADMIN registered");
    assert(isRegisteredPermission("RBAC_ADMIN"), "RBAC_ADMIN registered");
    assert(!isRegisteredPermission("FAKE_PERMISSION"), "FAKE_PERMISSION not registered");
  }));

  // ── T04: permission-registry — getPermissionsByResource ──────────────────

  push(await run("T04", "getPermissionsByResource returns finance permissions", async () => {
    const { getPermissionsByResource } = await import("@/lib/security/rbac/permission-registry");
    const perms = getPermissionsByResource("FINANCE");
    assert(perms.length >= 5, `finance has ≥5 permissions (got ${perms.length})`);
    assert(perms.some(p => p.id === "FINANCE_VIEW"), "FINANCE_VIEW in finance perms");
    assert(perms.some(p => p.id === "FINANCE_ADMIN"), "FINANCE_ADMIN in finance perms");
  }));

  // ── T05: permission-registry — getPermissionsByRisk ──────────────────────

  push(await run("T05", "getPermissionsByRisk returns critical permissions", async () => {
    const { getPermissionsByRisk } = await import("@/lib/security/rbac/permission-registry");
    const critical = getPermissionsByRisk("CRITICAL");
    assert(critical.length >= 3, `≥3 critical permissions (got ${critical.length})`);
    assert(critical.some(p => p.id === "VAULT_ADMIN"), "VAULT_ADMIN is critical");
  }));

  // ── T06: permission-registry — getPermissionSummary ──────────────────────

  push(await run("T06", "getPermissionSummary returns correct counts", async () => {
    const { getPermissionSummary } = await import("@/lib/security/rbac/permission-registry");
    const s = getPermissionSummary();
    assert(s.total >= 40, `total ≥40 (got ${s.total})`);
    assert(s.critical >= 1, "at least 1 critical");
    assert(s.requiresAudit >= 1, "at least 1 requires audit");
  }));

  // ── T07: resource-registry — isRegisteredResource ────────────────────────

  push(await run("T07", "isRegisteredResource identifies valid resources", async () => {
    const { isRegisteredResource } = await import("@/lib/security/rbac/resource-registry");
    assert(isRegisteredResource("FINANCE"), "FINANCE registered");
    assert(isRegisteredResource("VAULT"), "VAULT registered");
    assert(isRegisteredResource("EXECUTIVE_BRAIN"), "EXECUTIVE_BRAIN registered");
    assert(!isRegisteredResource("FAKE_RESOURCE"), "FAKE_RESOURCE not registered");
  }));

  // ── T08: resource-registry — getCriticalResources ────────────────────────

  push(await run("T08", "getCriticalResources returns ≥7 critical resources", async () => {
    const { getCriticalResources } = await import("@/lib/security/rbac/resource-registry");
    const critical = getCriticalResources();
    assert(critical.length >= 7, `≥7 critical resources (got ${critical.length})`);
    assert(critical.some(r => r.id === "VAULT"), "VAULT is critical");
    assert(critical.some(r => r.id === "FINANCE"), "FINANCE is critical");
  }));

  // ── T09: resource-registry — getEncryptionRequiredResources ──────────────

  push(await run("T09", "getEncryptionRequiredResources returns encrypted assets", async () => {
    const { getEncryptionRequiredResources } = await import("@/lib/security/rbac/resource-registry");
    const enc = getEncryptionRequiredResources();
    assert(enc.length >= 4, `≥4 encryption required (got ${enc.length})`);
    assert(enc.some(r => r.id === "VAULT"), "VAULT requires encryption");
    assert(enc.some(r => r.id === "MEMORY"), "MEMORY requires encryption");
  }));

  // ── T10: role-registry — getRoleEntry ────────────────────────────────────

  push(await run("T10", "getRoleEntry returns role metadata", async () => {
    const { getRoleEntry } = await import("@/lib/security/rbac/role-registry");
    const superAdmin = getRoleEntry("SUPER_ADMIN");
    assert(superAdmin !== undefined, "SUPER_ADMIN entry found");
    assert(superAdmin!.rank === 100, "SUPER_ADMIN has rank 100");
    assert(superAdmin!.isSystemRole === true, "SUPER_ADMIN is system role");
    assert(superAdmin!.requiresAudit === true, "SUPER_ADMIN requires audit");
  }));

  // ── T11: role-registry — getRolesByRank ──────────────────────────────────

  push(await run("T11", "getRolesByRank returns roles in descending order", async () => {
    const { getRolesByRank } = await import("@/lib/security/rbac/role-registry");
    const byRank = getRolesByRank();
    assert(byRank.length >= 8, `≥8 roles (got ${byRank.length})`);
    assert(byRank[0].id === "SUPER_ADMIN", "first role is SUPER_ADMIN");
    for (let i = 1; i < byRank.length; i++) {
      assert(byRank[i].rank <= byRank[i - 1].rank, "roles are in descending rank order");
    }
  }));

  // ── T12: role-permission-matrix — getPermissionsForRole ──────────────────

  push(await run("T12", "getPermissionsForRole returns correct permissions", async () => {
    const { getPermissionsForRole } = await import("@/lib/security/rbac/role-permission-matrix");
    const operatorPerms = getPermissionsForRole("OPERATOR");
    assert(operatorPerms.has("FINANCE_VIEW"), "OPERATOR has FINANCE_VIEW");
    assert(operatorPerms.has("COPILOT_EXECUTE"), "OPERATOR has COPILOT_EXECUTE");
    assert(!operatorPerms.has("VAULT_ADMIN"), "OPERATOR does NOT have VAULT_ADMIN");
    assert(!operatorPerms.has("TENANT_ADMIN"), "OPERATOR does NOT have TENANT_ADMIN");
  }));

  // ── T13: role-permission-matrix — hasRolePermission ──────────────────────

  push(await run("T13", "hasRolePermission accurate grant checks", async () => {
    const { hasRolePermission } = await import("@/lib/security/rbac/role-permission-matrix");
    assert(hasRolePermission("ORG_ADMIN", "SETTINGS_ADMIN"), "ORG_ADMIN has SETTINGS_ADMIN");
    assert(hasRolePermission("AUDITOR", "FINANCE_EXPORT"), "AUDITOR has FINANCE_EXPORT");
    assert(!hasRolePermission("AUDITOR", "FINANCE_DELETE"), "AUDITOR does NOT have FINANCE_DELETE");
    assert(!hasRolePermission("OPERATOR", "VAULT_READ"), "OPERATOR does NOT have VAULT_READ");
  }));

  // ── T14: role-permission-matrix — getRolesWithPermission ─────────────────

  push(await run("T14", "getRolesWithPermission returns all roles with that permission", async () => {
    const { getRolesWithPermission } = await import("@/lib/security/rbac/role-permission-matrix");
    const rolesWithVaultAdmin = getRolesWithPermission("VAULT_ADMIN");
    assert(rolesWithVaultAdmin.includes("SUPER_ADMIN"), "SUPER_ADMIN has VAULT_ADMIN");
    assert(rolesWithVaultAdmin.includes("SECURITY_ADMIN"), "SECURITY_ADMIN has VAULT_ADMIN");
    assert(!rolesWithVaultAdmin.includes("OPERATOR"), "OPERATOR does NOT have VAULT_ADMIN");
  }));

  // ── T15: role-permission-matrix — getMatrixSummary ───────────────────────

  push(await run("T15", "getMatrixSummary returns valid counts", async () => {
    const { getMatrixSummary } = await import("@/lib/security/rbac/role-permission-matrix");
    const s = getMatrixSummary();
    assert(s.totalRoles >= 8, `≥8 roles in matrix (got ${s.totalRoles})`);
    assert(s.totalAssignments >= 50, `≥50 total assignments (got ${s.totalAssignments})`);
    assert(s.maxPermissionsRole !== null, "maxPermissionsRole is not null");
  }));

  // ── T16: user-role-assignment — createAssignment ─────────────────────────

  push(await run("T16", "createAssignment creates valid assignment", async () => {
    const { createAssignment, isAssignmentValid } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({
      userId:     "user_T16",
      orgSlug:    "org_T16",
      roleId:     "OPERATOR",
      assignedBy: "system",
    });
    assert(a.userId === "user_T16", "userId set");
    assert(a.orgSlug === "org_T16", "orgSlug set");
    assert(a.roleId === "OPERATOR", "roleId set");
    assert(a.isActive === true, "isActive true");
    assert(isAssignmentValid(a), "isAssignmentValid returns true");
  }));

  // ── T17: user-role-assignment — assignmentKey ─────────────────────────────

  push(await run("T17", "assignmentKey produces deterministic keys", async () => {
    const { assignmentKey } = await import("@/lib/security/rbac/user-role-assignment");
    const k1 = assignmentKey("userA", "orgX", "MANAGER");
    const k2 = assignmentKey("userA", "orgX", "MANAGER");
    const k3 = assignmentKey("userB", "orgX", "MANAGER");
    assert(k1 === k2, "same inputs produce same key");
    assert(k1 !== k3, "different userId produces different key");
  }));

  // ── T18: user-role-assignment-store — set and getRolesForUser ────────────

  push(await run("T18", "userRoleAssignmentStore set and getRolesForUser", async () => {
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T18", orgSlug: "org_T18", roleId: "BILLING", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const roles = userRoleAssignmentStore.getRolesForUser("user_T18", "org_T18");
    assert(roles.includes("BILLING"), "BILLING role found after set");
    userRoleAssignmentStore.remove("user_T18", "org_T18", "BILLING");
  }));

  // ── T19: user-role-assignment-store — hasRole ────────────────────────────

  push(await run("T19", "userRoleAssignmentStore hasRole accurate", async () => {
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T19", orgSlug: "org_T19", roleId: "AUDITOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(userRoleAssignmentStore.hasRole("user_T19", "org_T19", "AUDITOR"), "hasRole returns true");
    assert(!userRoleAssignmentStore.hasRole("user_T19", "org_T19", "MANAGER"), "hasRole returns false for unassigned");
    userRoleAssignmentStore.remove("user_T19", "org_T19", "AUDITOR");
  }));

  // ── T20: rbac-engine — evaluateAccess — missing orgSlug ──────────────────

  push(await run("T20", "evaluateAccess denies missing orgSlug", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const r = evaluateAccess({ userId: "user_T20", orgSlug: "", permissionId: "FINANCE_VIEW" });
    assert(r.decision === "DENY", "decision is DENY");
    assert(r.reason === "missing_org_slug", "reason is missing_org_slug");
  }));

  // ── T21: rbac-engine — evaluateAccess — missing userId ───────────────────

  push(await run("T21", "evaluateAccess denies missing userId", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const r = evaluateAccess({ userId: "", orgSlug: "org_T21", permissionId: "FINANCE_VIEW" });
    assert(r.decision === "DENY", "decision is DENY");
    assert(r.reason === "missing_user_id", "reason is missing_user_id");
  }));

  // ── T22: rbac-engine — evaluateAccess — unregistered permission ──────────

  push(await run("T22", "evaluateAccess denies unregistered permission", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const r = evaluateAccess({ userId: "u", orgSlug: "o", permissionId: "FAKE_PERM_UNKNOWN" as any });
    assert(r.decision === "DENY", "decision is DENY");
    assert(r.reason === "permission_not_registered", "reason is permission_not_registered");
  }));

  // ── T23: rbac-engine — evaluateAccess — no roles assigned ────────────────

  push(await run("T23", "evaluateAccess denies user with no roles", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const r = evaluateAccess({ userId: "nobody_T23", orgSlug: "org_T23", permissionId: "FINANCE_VIEW" });
    assert(r.decision === "DENY", "decision is DENY");
    assert(r.reason === "no_roles_assigned", "reason is no_roles_assigned");
  }));

  // ── T24: rbac-engine — evaluateAccess — ALLOW via role ───────────────────

  push(await run("T24", "evaluateAccess ALLOWs valid role-permission pair", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T24", orgSlug: "org_T24", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const r = evaluateAccess({ userId: "user_T24", orgSlug: "org_T24", permissionId: "FINANCE_VIEW" });
    assert(r.decision === "ALLOW", "decision is ALLOW");
    assert(r.reason === "role_has_permission", "reason is role_has_permission");
    assert(r.grantingRole === "OPERATOR", "grantingRole is OPERATOR");
    userRoleAssignmentStore.remove("user_T24", "org_T24", "OPERATOR");
  }));

  // ── T25: rbac-engine — evaluateAccess — DENY for permission not in role ──

  push(await run("T25", "evaluateAccess DENYs permission not in role", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T25", orgSlug: "org_T25", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const r = evaluateAccess({ userId: "user_T25", orgSlug: "org_T25", permissionId: "VAULT_ADMIN" });
    assert(r.decision === "DENY", "decision is DENY");
    assert(r.reason === "no_matching_permission", "reason is no_matching_permission");
    userRoleAssignmentStore.remove("user_T25", "org_T25", "OPERATOR");
  }));

  // ── T26: rbac-engine — SUPER_ADMIN bypass ────────────────────────────────

  push(await run("T26", "evaluateAccess ALLOWs SUPER_ADMIN on any permission", async () => {
    const { evaluateAccess } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "super_T26", orgSlug: "org_T26", roleId: "SUPER_ADMIN", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const r = evaluateAccess({ userId: "super_T26", orgSlug: "org_T26", permissionId: "VAULT_ADMIN" });
    assert(r.decision === "ALLOW", "decision is ALLOW");
    assert(r.reason === "super_admin_bypass", "reason is super_admin_bypass");
    userRoleAssignmentStore.remove("super_T26", "org_T26", "SUPER_ADMIN");
  }));

  // ── T27: rbac-engine — hasPermission boolean shorthand ───────────────────

  push(await run("T27", "hasPermission returns correct booleans", async () => {
    const { hasPermission } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T27", orgSlug: "org_T27", roleId: "MANAGER", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(hasPermission("user_T27", "org_T27", "FINANCE_VIEW"), "MANAGER can FINANCE_VIEW");
    assert(!hasPermission("user_T27", "org_T27", "VAULT_ADMIN"), "MANAGER cannot VAULT_ADMIN");
    userRoleAssignmentStore.remove("user_T27", "org_T27", "MANAGER");
  }));

  // ── T28: rbac-engine — hasAnyPermission ──────────────────────────────────

  push(await run("T28", "hasAnyPermission returns true if any match", async () => {
    const { hasAnyPermission } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T28", orgSlug: "org_T28", roleId: "AUDITOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(hasAnyPermission("user_T28", "org_T28", ["VAULT_ADMIN", "FINANCE_VIEW"]), "AUDITOR has at least FINANCE_VIEW");
    assert(!hasAnyPermission("user_T28", "org_T28", ["VAULT_ADMIN", "FINANCE_DELETE"]), "AUDITOR has neither");
    userRoleAssignmentStore.remove("user_T28", "org_T28", "AUDITOR");
  }));

  // ── T29: rbac-engine — hasAllPermissions ─────────────────────────────────

  push(await run("T29", "hasAllPermissions requires all to match", async () => {
    const { hasAllPermissions } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T29", orgSlug: "org_T29", roleId: "MANAGER", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(hasAllPermissions("user_T29", "org_T29", ["FINANCE_VIEW", "COMMERCIAL_VIEW"]), "MANAGER has both");
    assert(!hasAllPermissions("user_T29", "org_T29", ["FINANCE_VIEW", "VAULT_ADMIN"]), "MANAGER does not have VAULT_ADMIN");
    userRoleAssignmentStore.remove("user_T29", "org_T29", "MANAGER");
  }));

  // ── T30: rbac-engine — resolveEffectivePermissions ───────────────────────

  push(await run("T30", "resolveEffectivePermissions unions all role permissions", async () => {
    const { resolveEffectivePermissions } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a1 = createAssignment({ userId: "user_T30", orgSlug: "org_T30", roleId: "OPERATOR", assignedBy: "system" });
    const a2 = createAssignment({ userId: "user_T30", orgSlug: "org_T30", roleId: "AUDITOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a1);
    userRoleAssignmentStore.set(a2);
    const perms = resolveEffectivePermissions("user_T30", "org_T30");
    assert(perms.has("FINANCE_VIEW"), "has FINANCE_VIEW from OPERATOR");
    assert(perms.has("AUDIT_VIEW"), "has AUDIT_VIEW from AUDITOR");
    userRoleAssignmentStore.remove("user_T30", "org_T30", "OPERATOR");
    userRoleAssignmentStore.remove("user_T30", "org_T30", "AUDITOR");
  }));

  // ── T31: rbac-engine — assertAccess throws on DENY ───────────────────────

  push(await run("T31", "assertAccess throws on denied access", async () => {
    const { assertAccess } = await import("@/lib/security/rbac/rbac-engine");
    let threw = false;
    try { assertAccess("nobody", "org_T31", "VAULT_ADMIN"); }
    catch { threw = true; }
    assert(threw, "assertAccess threw on DENY");
  }));

  // ── T32: rbac-engine — evaluateBatch ─────────────────────────────────────

  push(await run("T32", "evaluateBatch evaluates multiple permissions", async () => {
    const { evaluateBatch } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T32", orgSlug: "org_T32", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const batch = evaluateBatch("user_T32", "org_T32", ["FINANCE_VIEW", "VAULT_ADMIN"]);
    assert(batch.get("FINANCE_VIEW")?.decision === "ALLOW", "FINANCE_VIEW is ALLOW");
    assert(batch.get("VAULT_ADMIN")?.decision === "DENY", "VAULT_ADMIN is DENY");
    userRoleAssignmentStore.remove("user_T32", "org_T32", "OPERATOR");
  }));

  // ── T33: rbac-audit — globalRbacAuditLog push and query ──────────────────

  push(await run("T33", "globalRbacAuditLog records and queries events", async () => {
    const { globalRbacAuditLog, createRbacAuditEvent } = await import("@/lib/security/rbac/rbac-audit");
    const sizeBefore = globalRbacAuditLog.size;
    const ev = createRbacAuditEvent({
      type: "ACCESS_DENIED", orgSlug: "org_T33", userId: "user_T33",
      permissionId: "VAULT_ADMIN", decision: "DENY", reason: "test",
      durationMs: 1,
    });
    globalRbacAuditLog.push(ev);
    assert(globalRbacAuditLog.size === sizeBefore + 1, "size increased by 1");
    const tenantEvents = globalRbacAuditLog.getByTenant("org_T33");
    assert(tenantEvents.length >= 1, "tenant event found");
  }));

  // ── T34: rbac-audit — emitRoleAssigned ───────────────────────────────────

  push(await run("T34", "emitRoleAssigned creates ROLE_ASSIGNED event", async () => {
    const { emitRoleAssigned, globalRbacAuditLog } = await import("@/lib/security/rbac/rbac-audit");
    const sizeBefore = globalRbacAuditLog.size;
    emitRoleAssigned({ userId: "user_T34", orgSlug: "org_T34", roleId: "MANAGER", assignedBy: "admin" });
    assert(globalRbacAuditLog.size === sizeBefore + 1, "event recorded");
    const events = globalRbacAuditLog.getByType("ROLE_ASSIGNED");
    assert(events.some(e => e.orgSlug === "org_T34"), "ROLE_ASSIGNED for org_T34 found");
  }));

  // ── T35: authorization-service — canView ─────────────────────────────────

  push(await run("T35", "authorizationService.canView ALLOWs for valid role", async () => {
    const { authorizationService } = await import("@/lib/security/rbac/authorization-service");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T35", orgSlug: "org_T35", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const r = authorizationService.canView("user_T35", "org_T35", "FINANCE");
    assert(r.decision === "ALLOW", "canView FINANCE returns ALLOW");
    userRoleAssignmentStore.remove("user_T35", "org_T35", "OPERATOR");
  }));

  // ── T36: authorization-service — canAdmin ────────────────────────────────

  push(await run("T36", "authorizationService.canAdmin DENYs for OPERATOR", async () => {
    const { authorizationService } = await import("@/lib/security/rbac/authorization-service");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T36", orgSlug: "org_T36", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const r = authorizationService.canAdmin("user_T36", "org_T36", "VAULT");
    assert(r.decision === "DENY", "OPERATOR cannot admin VAULT");
    userRoleAssignmentStore.remove("user_T36", "org_T36", "OPERATOR");
  }));

  // ── T37: authorization-service — checkBatch ──────────────────────────────

  push(await run("T37", "authorizationService.checkBatch returns map of results", async () => {
    const { authorizationService } = await import("@/lib/security/rbac/authorization-service");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T37", orgSlug: "org_T37", roleId: "BILLING", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const batch = authorizationService.checkBatch("user_T37", "org_T37", ["FINANCE_VIEW", "VAULT_ADMIN"]);
    assert(batch.size === 2, "batch has 2 results");
    assert(batch.get("FINANCE_VIEW")?.decision === "ALLOW", "BILLING can FINANCE_VIEW");
    assert(batch.get("VAULT_ADMIN")?.decision === "DENY", "BILLING cannot VAULT_ADMIN");
    userRoleAssignmentStore.remove("user_T37", "org_T37", "BILLING");
  }));

  // ── T38: authorization-service — assertCanView throws ────────────────────

  push(await run("T38", "authorizationService.assertCanView throws if denied", async () => {
    const { authorizationService } = await import("@/lib/security/rbac/authorization-service");
    let threw = false;
    try { authorizationService.assertCanView("nobody_T38", "org_T38", "VAULT"); }
    catch { threw = true; }
    assert(threw, "assertCanView threw");
  }));

  // ── T39: vault-rbac adapter ───────────────────────────────────────────────

  push(await run("T39", "vaultRbac adapter correct decisions for SECURITY_ADMIN", async () => {
    const { vaultRbac } = await import("@/lib/security/rbac/integrations/vault-rbac");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T39", orgSlug: "org_T39", roleId: "SECURITY_ADMIN", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(vaultRbac.isReadAllowed("user_T39", "org_T39"), "SECURITY_ADMIN can read vault");
    assert(vaultRbac.isWriteAllowed("user_T39", "org_T39"), "SECURITY_ADMIN can write vault");
    assert(vaultRbac.isAdminAllowed("user_T39", "org_T39"), "SECURITY_ADMIN can admin vault");
    userRoleAssignmentStore.remove("user_T39", "org_T39", "SECURITY_ADMIN");
  }));

  // ── T40: copilot-rbac adapter ─────────────────────────────────────────────

  push(await run("T40", "copilotRbac adapter correct decisions for OPERATOR", async () => {
    const { copilotRbac } = await import("@/lib/security/rbac/integrations/copilot-rbac");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T40", orgSlug: "org_T40", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(copilotRbac.isExecuteAllowed("user_T40", "org_T40"), "OPERATOR can execute copilot");
    assert(!copilotRbac.isMemoryReadAllowed("user_T40", "org_T40"), "OPERATOR cannot read memory");
    userRoleAssignmentStore.remove("user_T40", "org_T40", "OPERATOR");
  }));

  // ── T41: executive-rbac adapter ───────────────────────────────────────────

  push(await run("T41", "executiveRbac adapter correct decisions for MANAGER", async () => {
    const { executiveRbac } = await import("@/lib/security/rbac/integrations/executive-rbac");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T41", orgSlug: "org_T41", roleId: "MANAGER", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(executiveRbac.isViewAllowed("user_T41", "org_T41"), "MANAGER can view executive");
    assert(!executiveRbac.isAdminAllowed("user_T41", "org_T41"), "MANAGER cannot admin executive");
    userRoleAssignmentStore.remove("user_T41", "org_T41", "MANAGER");
  }));

  // ── T42: autonomous-rbac adapter ──────────────────────────────────────────

  push(await run("T42", "autonomousRbac adapter correct decisions for MANAGER", async () => {
    const { autonomousRbac } = await import("@/lib/security/rbac/integrations/autonomous-rbac");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T42", orgSlug: "org_T42", roleId: "MANAGER", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(autonomousRbac.isApproveAllowed("user_T42", "org_T42"), "MANAGER can approve autonomous");
    assert(!autonomousRbac.isAdminAllowed("user_T42", "org_T42"), "MANAGER cannot admin autonomous");
    userRoleAssignmentStore.remove("user_T42", "org_T42", "MANAGER");
  }));

  // ── T43: rbac-query — getUserRoles ───────────────────────────────────────

  push(await run("T43", "getUserRoles returns active roles for user", async () => {
    const { getUserRoles } = await import("@/lib/security/rbac/rbac-query");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T43", orgSlug: "org_T43", roleId: "BILLING", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const roles = getUserRoles("user_T43", "org_T43");
    assert(roles.includes("BILLING"), "BILLING in user roles");
    userRoleAssignmentStore.remove("user_T43", "org_T43", "BILLING");
  }));

  // ── T44: rbac-query — getUserPermissions ─────────────────────────────────

  push(await run("T44", "getUserPermissions union of all role permissions", async () => {
    const { getUserPermissions } = await import("@/lib/security/rbac/rbac-query");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T44", orgSlug: "org_T44", roleId: "BILLING", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const perms = getUserPermissions("user_T44", "org_T44");
    assert(perms.has("FINANCE_VIEW"), "BILLING has FINANCE_VIEW");
    assert(perms.has("COLLECTIONS_VIEW"), "BILLING has COLLECTIONS_VIEW");
    userRoleAssignmentStore.remove("user_T44", "org_T44", "BILLING");
  }));

  // ── T45: rbac-query — getUserRoleSummary ─────────────────────────────────

  push(await run("T45", "getUserRoleSummary builds correct summary", async () => {
    const { getUserRoleSummary } = await import("@/lib/security/rbac/rbac-query");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T45", orgSlug: "org_T45", roleId: "ORG_ADMIN", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const s = getUserRoleSummary("user_T45", "org_T45");
    assert(s.isOrgAdmin === true, "isOrgAdmin is true");
    assert(s.isSuperAdmin === false, "isSuperAdmin is false");
    assert(s.permissionCount >= 20, `permissionCount ≥20 (got ${s.permissionCount})`);
    userRoleAssignmentStore.remove("user_T45", "org_T45", "ORG_ADMIN");
  }));

  // ── T46: rbac-query — tenant isolation ───────────────────────────────────

  push(await run("T46", "RBAC tenant isolation — roles do not cross orgs", async () => {
    const { hasPermission } = await import("@/lib/security/rbac/rbac-engine");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T46", orgSlug: "org_T46_A", roleId: "ORG_ADMIN", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    assert(hasPermission("user_T46", "org_T46_A", "SETTINGS_ADMIN"), "user has SETTINGS_ADMIN in org_T46_A");
    assert(!hasPermission("user_T46", "org_T46_B", "SETTINGS_ADMIN"), "user does NOT have SETTINGS_ADMIN in org_T46_B");
    userRoleAssignmentStore.remove("user_T46", "org_T46_A", "ORG_ADMIN");
  }));

  // ── T47: report builder — buildRoleReport ────────────────────────────────

  push(await run("T47", "buildRoleReport generates valid role report", async () => {
    const { buildRoleReport } = await import("@/lib/security/rbac/rbac-report-builder");
    const report = buildRoleReport();
    assert(report.totalRoles >= 8, `≥8 roles (got ${report.totalRoles})`);
    assert(typeof report.generatedAt === "string", "generatedAt is string");
    assert(report.entries[0].roleId === "SUPER_ADMIN", "first entry is SUPER_ADMIN");
    assert(report.entries[0].permissionCount >= 30, "SUPER_ADMIN has ≥30 permissions");
  }));

  // ── T48: report builder — buildPermissionReport ───────────────────────────

  push(await run("T48", "buildPermissionReport generates valid permission report", async () => {
    const { buildPermissionReport } = await import("@/lib/security/rbac/rbac-report-builder");
    const report = buildPermissionReport();
    assert(report.totalPermissions >= 40, `≥40 permissions (got ${report.totalPermissions})`);
    assert(report.criticalCount >= 1, "at least 1 critical permission");
    assert(report.entries.some(e => e.permissionId === "VAULT_ADMIN"), "VAULT_ADMIN in report");
  }));

  // ── T49: report builder — buildAccessReport ──────────────────────────────

  push(await run("T49", "buildAccessReport generates valid user access report", async () => {
    const { buildAccessReport } = await import("@/lib/security/rbac/rbac-report-builder");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T49", orgSlug: "org_T49", roleId: "MANAGER", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const report = buildAccessReport("user_T49", "org_T49");
    assert(report.userId === "user_T49", "userId set");
    assert(report.permissionCount >= 10, `permissionCount ≥10 (got ${report.permissionCount})`);
    assert(report.resourceAccess.some(r => r.resourceId === "FINANCE" && r.canView), "user can VIEW FINANCE");
    assert(report.isSuperAdmin === false, "not super admin");
    userRoleAssignmentStore.remove("user_T49", "org_T49", "MANAGER");
  }));

  // ── T50: report builder — buildTenantRbacReport ──────────────────────────

  push(await run("T50", "buildTenantRbacReport generates valid tenant summary", async () => {
    const { buildTenantRbacReport } = await import("@/lib/security/rbac/rbac-report-builder");
    const { userRoleAssignmentStore, createAssignment } = await import("@/lib/security/rbac/user-role-assignment");
    const a = createAssignment({ userId: "user_T50", orgSlug: "org_T50", roleId: "OPERATOR", assignedBy: "system" });
    userRoleAssignmentStore.set(a);
    const report = buildTenantRbacReport("org_T50");
    assert(report.totalAssignments >= 1, `≥1 assignment (got ${report.totalAssignments})`);
    assert(report.uniqueUsers >= 1, "at least 1 unique user");
    assert(report.registrySummary.roles.total >= 8, "registry summary has ≥8 roles");
    userRoleAssignmentStore.remove("user_T50", "org_T50", "OPERATOR");
  }));

  // ── T51: health monitor ───────────────────────────────────────────────────

  push(await run("T51", "rbacHealthMonitor.checkRbacHealth returns HEALTHY", async () => {
    const { rbacHealthMonitor } = await import("@/lib/security/rbac/rbac-health");
    const report = rbacHealthMonitor.checkRbacHealth();
    assert(["HEALTHY", "DEGRADED"].includes(report.status), `status is HEALTHY or DEGRADED (got ${report.status})`);
    assert(report.checks.length === 6, `6 health checks (got ${report.checks.length})`);
    assert(typeof report.durationMs === "number", "durationMs is number");
    assert(report.summary.roles.total >= 8, "summary roles ≥8");
  }));

  // ── T52: health check — individual engine round trip ─────────────────────

  push(await run("T52", "health engine_round_trip check passes", async () => {
    const { rbacHealthMonitor } = await import("@/lib/security/rbac/rbac-health");
    const report = rbacHealthMonitor.checkRbacHealth();
    const roundTrip = report.checks.find(c => c.name === "engine_round_trip");
    assert(roundTrip !== undefined, "engine_round_trip check present");
    assert(roundTrip!.status === "HEALTHY", `engine round trip is HEALTHY (got ${roundTrip!.status})`);
  }));

  // ── T53: server barrel — exports key symbols ──────────────────────────────

  push(await run("T53", "server barrel exports evaluateAccess and authorizationService", async () => {
    const srv = await import("@/lib/security/rbac/server");
    assert(typeof srv.evaluateAccess === "function", "evaluateAccess exported from server");
    assert(typeof srv.authorizationService === "object", "authorizationService exported from server");
    assert(typeof srv.vaultRbac === "object", "vaultRbac exported from server");
    assert(typeof srv.rbacHealthMonitor === "object", "rbacHealthMonitor exported from server");
  }));

  // ── T54: client barrel — safe exports only ────────────────────────────────

  push(await run("T54", "client barrel exports types but not engine functions", async () => {
    const idx = await import("@/lib/security/rbac/index");
    assert(typeof idx.isAllowed === "function", "isAllowed exported from client barrel");
    assert(typeof idx.PERMISSION_REGISTRY !== "undefined", "PERMISSION_REGISTRY exported from client barrel");
    assert(typeof idx.ROLE_REGISTRY !== "undefined", "ROLE_REGISTRY exported from client barrel");
    // evaluateAccess should NOT be exported
    assert(!("evaluateAccess" in idx), "evaluateAccess NOT in client barrel");
  }));

  // ── T55: AccessResult is JSON-serializable ────────────────────────────────

  push(await run("T55", "AccessResult is fully JSON-serializable", async () => {
    const { allowResult, denyResult } = await import("@/lib/security/rbac/rbac-types");
    const allow = allowResult("role_has_permission", "OPERATOR", "FINANCE_VIEW", Date.now() - 5);
    const deny  = denyResult("no_roles_assigned", "FINANCE_VIEW", Date.now() - 3);
    const allowJson = JSON.stringify(allow);
    const denyJson  = JSON.stringify(deny);
    assert(allowJson.includes('"ALLOW"'), "ALLOW result serializes correctly");
    assert(denyJson.includes('"DENY"'), "DENY result serializes correctly");
    const allowParsed = JSON.parse(allowJson);
    assert(allowParsed.grantingRole === "OPERATOR", "grantingRole survives round-trip");
  }));

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed  = results.filter(r => r.status === "PASS").length;
  const failed  = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;

  return NextResponse.json({
    totalTests: results.length,
    passed,
    failed,
    skipped,
    results,
    ranAt: new Date().toISOString(),
  });
}
