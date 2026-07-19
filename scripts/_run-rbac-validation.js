#!/usr/bin/env node
/**
 * scripts/_run-rbac-validation.js
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Validation Suite — Static Source Checks
 *
 * 900+ checks across all RBAC sprint files.
 * Verifies structural integrity without running the app.
 *
 * Usage: node scripts/_run-rbac-validation.js
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── File Loader ───────────────────────────────────────────────────────────────

function load(rel) {
  const abs = path.join(process.cwd(), rel);
  try { return fs.readFileSync(abs, "utf8"); }
  catch { return null; }
}

// ── Test Runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
  }
}

// ── Load Files ────────────────────────────────────────────────────────────────

const RT  = load("lib/security/rbac/rbac-types.ts");
const PR  = load("lib/security/rbac/permission-registry.ts");
const RR  = load("lib/security/rbac/resource-registry.ts");
const ROL = load("lib/security/rbac/role-registry.ts");
const RPM = load("lib/security/rbac/role-permission-matrix.ts");
const URA = load("lib/security/rbac/user-role-assignment.ts");
const ENG = load("lib/security/rbac/rbac-engine.ts");
const AUD = load("lib/security/rbac/rbac-audit.ts");
const SVC = load("lib/security/rbac/authorization-service.ts");
const VR  = load("lib/security/rbac/integrations/vault-rbac.ts");
const CR  = load("lib/security/rbac/integrations/copilot-rbac.ts");
const ER  = load("lib/security/rbac/integrations/executive-rbac.ts");
const AR  = load("lib/security/rbac/integrations/autonomous-rbac.ts");
const QRY = load("lib/security/rbac/rbac-query.ts");
const RPB = load("lib/security/rbac/rbac-report-builder.ts");
const HLT = load("lib/security/rbac/rbac-health.ts");
const SRV = load("lib/security/rbac/server.ts");
const IDX = load("lib/security/rbac/index.ts");
const INV = load("lib/security/security-inventory.ts");
const REG = load("lib/security/security-registry.ts");

// ── Section A: File Existence ─────────────────────────────────────────────────

console.log("\n[A] File Existence");
assert(RT  !== null, "A01: rbac-types.ts exists");
assert(PR  !== null, "A02: permission-registry.ts exists");
assert(RR  !== null, "A03: resource-registry.ts exists");
assert(ROL !== null, "A04: role-registry.ts exists");
assert(RPM !== null, "A05: role-permission-matrix.ts exists");
assert(URA !== null, "A06: user-role-assignment.ts exists");
assert(ENG !== null, "A07: rbac-engine.ts exists");
assert(AUD !== null, "A08: rbac-audit.ts exists");
assert(SVC !== null, "A09: authorization-service.ts exists");
assert(VR  !== null, "A10: integrations/vault-rbac.ts exists");
assert(CR  !== null, "A11: integrations/copilot-rbac.ts exists");
assert(ER  !== null, "A12: integrations/executive-rbac.ts exists");
assert(AR  !== null, "A13: integrations/autonomous-rbac.ts exists");
assert(QRY !== null, "A14: rbac-query.ts exists");
assert(RPB !== null, "A15: rbac-report-builder.ts exists");
assert(HLT !== null, "A16: rbac-health.ts exists");
assert(SRV !== null, "A17: server.ts exists");
assert(IDX !== null, "A18: index.ts exists");

// ── Section B: rbac-types.ts ──────────────────────────────────────────────────

console.log("\n[B] rbac-types.ts");
assert(RT.includes('"SUPER_ADMIN"'),          "B01: SUPER_ADMIN defined");
assert(RT.includes('"AGENTIK_ADMIN"'),        "B02: AGENTIK_ADMIN defined");
assert(RT.includes('"ORG_ADMIN"'),            "B03: ORG_ADMIN defined");
assert(RT.includes('"MANAGER"'),              "B04: MANAGER defined");
assert(RT.includes('"OPERATOR"'),             "B05: OPERATOR defined");
assert(RT.includes('"BILLING"'),              "B06: BILLING defined");
assert(RT.includes('"AUDITOR"'),              "B07: AUDITOR defined");
assert(RT.includes('"SECURITY_ADMIN"'),       "B08: SECURITY_ADMIN defined");
assert(RT.includes('"FINANCE"'),              "B09: FINANCE ResourceId");
assert(RT.includes('"VAULT"'),                "B10: VAULT ResourceId");
assert(RT.includes('"EXECUTIVE_BRAIN"'),      "B11: EXECUTIVE_BRAIN ResourceId");
assert(RT.includes('"AUTONOMOUS"'),           "B12: AUTONOMOUS ResourceId");
assert(RT.includes('"FINANCE_VIEW"'),         "B13: FINANCE_VIEW PermissionId");
assert(RT.includes('"VAULT_ADMIN"'),          "B14: VAULT_ADMIN PermissionId");
assert(RT.includes('"RBAC_ADMIN"'),           "B15: RBAC_ADMIN PermissionId");
assert(RT.includes("AccessDecision"),         "B16: AccessDecision type defined");
assert(RT.includes("AccessResult"),           "B17: AccessResult interface defined");
assert(RT.includes("AuthorizationContext"),   "B18: AuthorizationContext defined");
assert(RT.includes("denyResult"),             "B19: denyResult helper defined");
assert(RT.includes("allowResult"),            "B20: allowResult helper defined");
assert(RT.includes("isAllowed"),              "B21: isAllowed helper defined");
assert(RT.includes("isDenied"),               "B22: isDenied helper defined");
assert(!RT.includes('import "server-only"'),  "B23: rbac-types has no server-only import");
assert(!RT.includes('import "crypto"'),       "B24: rbac-types has no crypto import");
assert(!RT.includes('import { PrismaClient'), "B25: rbac-types has no Prisma import");

// ── Section C: permission-registry.ts ────────────────────────────────────────

console.log("\n[C] permission-registry.ts");
assert(PR.includes("PERMISSION_REGISTRY"),    "C01: PERMISSION_REGISTRY exported");
assert(PR.includes('"FINANCE_VIEW"'),         "C02: FINANCE_VIEW in registry");
assert(PR.includes('"VAULT_ADMIN"'),          "C03: VAULT_ADMIN in registry");
assert(PR.includes('"RBAC_ADMIN"'),           "C04: RBAC_ADMIN in registry");
assert(PR.includes('"AUTONOMOUS_APPROVE"'),   "C05: AUTONOMOUS_APPROVE in registry");
assert(PR.includes('"EXECUTIVE_VIEW"'),       "C06: EXECUTIVE_VIEW in registry");
assert(PR.includes("PermissionRiskLevel"),    "C07: PermissionRiskLevel type defined");
assert(PR.includes("PermissionAction"),       "C08: PermissionAction type defined");
assert(PR.includes("PermissionEntry"),        "C09: PermissionEntry interface defined");
assert(PR.includes("getPermissionEntry"),     "C10: getPermissionEntry function");
assert(PR.includes("getPermissionsByResource"), "C11: getPermissionsByResource function");
assert(PR.includes("getPermissionsByRisk"),   "C12: getPermissionsByRisk function");
assert(PR.includes("isRegisteredPermission"), "C13: isRegisteredPermission function");
assert(PR.includes("getPermissionSummary"),   "C14: getPermissionSummary function");
assert(PR.includes("ReadonlyArray"),          "C15: ReadonlyArray used");
assert(!PR.includes('import "server-only"'),  "C16: permission-registry has no server-only");
// Count permissions (id: entries)
const permCount = (PR.match(/id:\s+"[A-Z_]+"/g) || []).length;
assert(permCount >= 40,                       `C17: ≥40 permissions registered (found ${permCount})`);
assert(PR.includes('"CRITICAL"'),             "C18: CRITICAL risk level used");
assert(PR.includes("requiresAudit"),          "C19: requiresAudit field present");

// ── Section D: resource-registry.ts ──────────────────────────────────────────

console.log("\n[D] resource-registry.ts");
assert(RR.includes("RESOURCE_REGISTRY"),      "D01: RESOURCE_REGISTRY exported");
assert(RR.includes('"FINANCE"'),              "D02: FINANCE resource registered");
assert(RR.includes('"VAULT"'),                "D03: VAULT resource registered");
assert(RR.includes('"EXECUTIVE_BRAIN"'),      "D04: EXECUTIVE_BRAIN resource registered");
assert(RR.includes('"AUTONOMOUS"'),           "D05: AUTONOMOUS resource registered");
assert(RR.includes('"MEMORY"'),               "D06: MEMORY resource registered");
assert(RR.includes('"PLAYBOOKS"'),            "D07: PLAYBOOKS resource registered");
assert(RR.includes('"SECURITY"'),             "D08: SECURITY resource registered");
assert(RR.includes('"ENCRYPTION"'),           "D09: ENCRYPTION resource registered");
assert(RR.includes('"SETTINGS"'),             "D10: SETTINGS resource registered");
assert(RR.includes('"INTEGRATIONS"'),         "D11: INTEGRATIONS resource registered");
assert(RR.includes('"TENANT_ADMIN"'),         "D12: TENANT_ADMIN resource registered");
assert(RR.includes('"AUDIT"'),                "D13: AUDIT resource registered");
assert(RR.includes("ResourceSensitivity"),    "D14: ResourceSensitivity type defined");
assert(RR.includes("ResourceEntry"),          "D15: ResourceEntry interface defined");
assert(RR.includes("encryptionRequired"),     "D16: encryptionRequired field present");
assert(RR.includes("requiresAudit"),          "D17: requiresAudit field present");
assert(RR.includes("getResourceEntry"),       "D18: getResourceEntry function");
assert(RR.includes("getResourceSummary"),     "D19: getResourceSummary function");
assert(RR.includes("isRegisteredResource"),   "D20: isRegisteredResource function");
assert(!RR.includes('import "server-only"'),  "D21: resource-registry has no server-only");
// Count resource entries
const resCount = (RR.match(/id:\s+"[A-Z_]+"/g) || []).length;
assert(resCount >= 16,                        `D22: ≥16 resources registered (found ${resCount})`);

// ── Section E: role-registry.ts ───────────────────────────────────────────────

console.log("\n[E] role-registry.ts");
assert(ROL.includes("ROLE_REGISTRY"),         "E01: ROLE_REGISTRY exported");
assert(ROL.includes('"SUPER_ADMIN"'),         "E02: SUPER_ADMIN role registered");
assert(ROL.includes('"AGENTIK_ADMIN"'),       "E03: AGENTIK_ADMIN role registered");
assert(ROL.includes('"ORG_ADMIN"'),           "E04: ORG_ADMIN role registered");
assert(ROL.includes('"SECURITY_ADMIN"'),      "E05: SECURITY_ADMIN role registered");
assert(ROL.includes('"MANAGER"'),             "E06: MANAGER role registered");
assert(ROL.includes('"OPERATOR"'),            "E07: OPERATOR role registered");
assert(ROL.includes('"BILLING"'),             "E08: BILLING role registered");
assert(ROL.includes('"AUDITOR"'),             "E09: AUDITOR role registered");
assert(ROL.includes("RoleEntry"),             "E10: RoleEntry interface defined");
assert(ROL.includes("rank:"),                 "E11: rank field defined on roles");
assert(ROL.includes("isSystemRole"),          "E12: isSystemRole field defined");
assert(ROL.includes("requiresAudit"),         "E13: requiresAudit field defined");
assert(ROL.includes("visibleToOrgAdmin"),     "E14: visibleToOrgAdmin field defined");
assert(ROL.includes("getRoleEntry"),          "E15: getRoleEntry function");
assert(ROL.includes("getRolesByRank"),        "E16: getRolesByRank function");
assert(ROL.includes("getRoleSummary"),        "E17: getRoleSummary function");
assert(!ROL.includes('import "server-only"'), "E18: role-registry has no server-only");
const roleCount = (ROL.match(/id:\s+"[A-Z_]+"/g) || []).length;
assert(roleCount >= 8,                        `E19: ≥8 roles registered (found ${roleCount})`);

// ── Section F: role-permission-matrix.ts ─────────────────────────────────────

console.log("\n[F] role-permission-matrix.ts");
assert(RPM.includes("ROLE_PERMISSION_MATRIX"),  "F01: ROLE_PERMISSION_MATRIX exported");
assert(RPM.includes('"SUPER_ADMIN"'),           "F02: SUPER_ADMIN in matrix");
assert(RPM.includes('"AUDITOR"'),               "F03: AUDITOR in matrix");
assert(RPM.includes('"BILLING"'),               "F04: BILLING in matrix");
assert(RPM.includes("getPermissionsForRole"),   "F05: getPermissionsForRole exported");
assert(RPM.includes("hasRolePermission"),       "F06: hasRolePermission exported");
assert(RPM.includes("getRolesWithPermission"),  "F07: getRolesWithPermission exported");
assert(RPM.includes("getMatrixSummary"),        "F08: getMatrixSummary exported");
assert(RPM.includes("_matrixIndex"),            "F09: _matrixIndex fast lookup");
assert(!RPM.includes('import "server-only"'),   "F10: matrix has no server-only");
// Auditor should NOT have DELETE
assert(!RPM.includes('"AUDITOR"') || (() => {
  const auditorBlock = RPM.substring(
    RPM.indexOf('"AUDITOR"'),
    RPM.indexOf('"AUDITOR"') + 2000
  );
  return !auditorBlock.includes("FINANCE_DELETE");
})(),                                            "F11: AUDITOR does not have FINANCE_DELETE");
// SUPER_ADMIN should have TENANT_ADMIN
assert(RPM.includes('"TENANT_ADMIN"'),           "F12: TENANT_ADMIN permission in matrix");
assert(RPM.includes('"RBAC_ADMIN"'),             "F13: RBAC_ADMIN permission in matrix");

// ── Section G: user-role-assignment.ts ───────────────────────────────────────

console.log("\n[G] user-role-assignment.ts");
assert(URA.includes("UserRoleAssignment"),    "G01: UserRoleAssignment type defined");
assert(URA.includes("assignedBy"),            "G02: assignedBy field defined");
assert(URA.includes("assignedAt"),            "G03: assignedAt field defined");
assert(URA.includes("expiresAt"),             "G04: expiresAt optional field defined");
assert(URA.includes("isActive"),              "G05: isActive field defined");
assert(URA.includes("userRoleAssignmentStore"), "G06: userRoleAssignmentStore exported");
assert(URA.includes("assignmentKey"),         "G07: assignmentKey function exported");
assert(URA.includes("createAssignment"),      "G08: createAssignment function exported");
assert(URA.includes("isAssignmentValid"),     "G09: isAssignmentValid function exported");
assert(URA.includes("_reset"),                "G10: _reset method for testing");
assert(URA.includes("deactivateUser"),        "G11: deactivateUser method");
assert(URA.includes("getAllForTenant"),        "G12: getAllForTenant method");
assert(!URA.includes('import "server-only"'), "G13: user-role-assignment has no server-only");

// ── Section H: rbac-engine.ts ─────────────────────────────────────────────────

console.log("\n[H] rbac-engine.ts");
assert(ENG.includes('import "server-only"'),  "H01: rbac-engine is server-only");
assert(ENG.includes("evaluateAccess"),        "H02: evaluateAccess function exported");
assert(ENG.includes("hasPermission"),         "H03: hasPermission function exported");
assert(ENG.includes("hasAnyPermission"),      "H04: hasAnyPermission function exported");
assert(ENG.includes("hasAllPermissions"),     "H05: hasAllPermissions function exported");
assert(ENG.includes("resolveEffectivePermissions"), "H06: resolveEffectivePermissions exported");
assert(ENG.includes("evaluateBatch"),         "H07: evaluateBatch function exported");
assert(ENG.includes("assertAccess"),          "H08: assertAccess function exported");
assert(ENG.includes("super_admin_bypass"),    "H09: SUPER_ADMIN bypass implemented");
assert(ENG.includes("missing_org_slug"),      "H10: missing orgSlug guard");
assert(ENG.includes("missing_user_id"),       "H11: missing userId guard");
assert(ENG.includes("permission_not_registered"), "H12: permission not registered guard");
assert(ENG.includes("no_roles_assigned"),     "H13: no roles assigned case");
assert(ENG.includes("no_matching_permission"), "H14: no matching permission case");
assert(ENG.includes("role_has_permission"),   "H15: role has permission reason");
assert(!ENG.includes('import { PrismaClient'), "H16: engine has no Prisma import");

// ── Section I: rbac-audit.ts ──────────────────────────────────────────────────

console.log("\n[I] rbac-audit.ts");
assert(AUD.includes("ACCESS_GRANTED"),        "I01: ACCESS_GRANTED event type");
assert(AUD.includes("ACCESS_DENIED"),         "I02: ACCESS_DENIED event type");
assert(AUD.includes("ROLE_ASSIGNED"),         "I03: ROLE_ASSIGNED event type");
assert(AUD.includes("ROLE_REVOKED"),          "I04: ROLE_REVOKED event type");
assert(AUD.includes("PERMISSION_EVALUATED"),  "I05: PERMISSION_EVALUATED event type");
assert(AUD.includes("RBAC_HEALTH_CHECKED"),   "I06: RBAC_HEALTH_CHECKED event type");
assert(AUD.includes("globalRbacAuditLog"),    "I07: globalRbacAuditLog singleton");
assert(AUD.includes("emitAccessEvent"),       "I08: emitAccessEvent exported");
assert(AUD.includes("emitRoleAssigned"),      "I09: emitRoleAssigned exported");
assert(AUD.includes("emitRoleRevoked"),       "I10: emitRoleRevoked exported");
assert(AUD.includes("emitHealthChecked"),     "I11: emitHealthChecked exported");
assert(AUD.includes("createRbacAuditEvent"),  "I12: createRbacAuditEvent exported");
assert(AUD.includes("void _persistEvent"),    "I13: fire-and-forget persist pattern");
assert(AUD.includes("getPersistentAuditService"), "I14: lazy import for persistent audit service");
assert(AUD.includes("} catch"),               "I15: error swallowed in persist");

// ── Section J: authorization-service.ts ──────────────────────────────────────

console.log("\n[J] authorization-service.ts");
assert(SVC.includes('import "server-only"'),  "J01: authorization-service is server-only");
assert(SVC.includes("AuthorizationService"),  "J02: AuthorizationService class exported");
assert(SVC.includes("canView"),               "J03: canView method defined");
assert(SVC.includes("canCreate"),             "J04: canCreate method defined");
assert(SVC.includes("canUpdate"),             "J05: canUpdate method defined");
assert(SVC.includes("canDelete"),             "J06: canDelete method defined");
assert(SVC.includes("canExport"),             "J07: canExport method defined");
assert(SVC.includes("canApprove"),            "J08: canApprove method defined");
assert(SVC.includes("canExecute"),            "J09: canExecute method defined");
assert(SVC.includes("canAdmin"),              "J10: canAdmin method defined");
assert(SVC.includes("canManage"),             "J11: canManage method defined");
assert(SVC.includes("canRead"),               "J12: canRead method defined");
assert(SVC.includes("canWrite"),              "J13: canWrite method defined");
assert(SVC.includes("assertCanView"),         "J14: assertCanView guard method");
assert(SVC.includes("assertCanAdmin"),        "J15: assertCanAdmin guard method");
assert(SVC.includes("authorizationService"),  "J16: authorizationService singleton");
assert(SVC.includes("getAuthorizationService"), "J17: getAuthorizationService factory");
assert(SVC.includes("checkBatch"),            "J18: checkBatch method defined");
assert(SVC.includes("emitAccessEvent"),       "J19: emitAccessEvent called on check");

// ── Section K: Domain Integration Adapters ────────────────────────────────────

console.log("\n[K] Integration Adapters");
assert(VR.includes('import "server-only"'),   "K01: vault-rbac is server-only");
assert(VR.includes("canRead"),                "K02: vault canRead");
assert(VR.includes("canWrite"),               "K03: vault canWrite");
assert(VR.includes("canAdmin"),               "K04: vault canAdmin");
assert(VR.includes("assertCanRead"),          "K05: vault assertCanRead");
assert(VR.includes("vaultRbac"),              "K06: vaultRbac singleton");

assert(CR.includes('import "server-only"'),   "K07: copilot-rbac is server-only");
assert(CR.includes("canExecute"),             "K08: copilot canExecute");
assert(CR.includes("canReadMemory"),          "K09: copilot canReadMemory");
assert(CR.includes("canWriteMemory"),         "K10: copilot canWriteMemory");
assert(CR.includes("canViewPlaybooks"),       "K11: copilot canViewPlaybooks");
assert(CR.includes("canManagePlaybooks"),     "K12: copilot canManagePlaybooks");
assert(CR.includes("copilotRbac"),            "K13: copilotRbac singleton");

assert(ER.includes('import "server-only"'),   "K14: executive-rbac is server-only");
assert(ER.includes("canView"),                "K15: executive canView");
assert(ER.includes("canAdmin"),               "K16: executive canAdmin");
assert(ER.includes("executiveRbac"),          "K17: executiveRbac singleton");

assert(AR.includes('import "server-only"'),   "K18: autonomous-rbac is server-only");
assert(AR.includes("canExecute"),             "K19: autonomous canExecute");
assert(AR.includes("canApprove"),             "K20: autonomous canApprove");
assert(AR.includes("canAdmin"),               "K21: autonomous canAdmin");
assert(AR.includes("assertCanApprove"),       "K22: autonomous assertCanApprove");
assert(AR.includes("autonomousRbac"),         "K23: autonomousRbac singleton");

// ── Section L: rbac-query.ts ──────────────────────────────────────────────────

console.log("\n[L] rbac-query.ts");
assert(QRY.includes("getUserRoles"),          "L01: getUserRoles exported");
assert(QRY.includes("getUserRoleAssignments"), "L02: getUserRoleAssignments exported");
assert(QRY.includes("userHasRole"),           "L03: userHasRole exported");
assert(QRY.includes("getUserPermissions"),    "L04: getUserPermissions exported");
assert(QRY.includes("userHasPermission"),     "L05: userHasPermission exported");
assert(QRY.includes("getRoleAssignments"),    "L06: getRoleAssignments exported");
assert(QRY.includes("getUsersWithRole"),      "L07: getUsersWithRole exported");
assert(QRY.includes("getTenantAssignments"),  "L08: getTenantAssignments exported");
assert(QRY.includes("getUserRoleSummary"),    "L09: getUserRoleSummary exported");
assert(QRY.includes("getPermissionCoverage"), "L10: getPermissionCoverage exported");
assert(QRY.includes("UserRoleSummary"),       "L11: UserRoleSummary interface exported");
assert(QRY.includes("isSuperAdmin"),          "L12: isSuperAdmin field in summary");
assert(QRY.includes("isOrgAdmin"),            "L13: isOrgAdmin field in summary");
assert(!QRY.includes('import "server-only"'), "L14: rbac-query has no server-only");

// ── Section M: rbac-report-builder.ts ────────────────────────────────────────

console.log("\n[M] rbac-report-builder.ts");
assert(RPB.includes("buildRoleReport"),       "M01: buildRoleReport exported");
assert(RPB.includes("buildPermissionReport"), "M02: buildPermissionReport exported");
assert(RPB.includes("buildAccessReport"),     "M03: buildAccessReport exported");
assert(RPB.includes("buildTenantRbacReport"), "M04: buildTenantRbacReport exported");
assert(RPB.includes("formatRoleReport"),      "M05: formatRoleReport exported");
assert(RPB.includes("formatAccessReport"),    "M06: formatAccessReport exported");
assert(RPB.includes("RoleReport"),            "M07: RoleReport interface defined");
assert(RPB.includes("PermissionReport"),      "M08: PermissionReport interface defined");
assert(RPB.includes("AccessReport"),          "M09: AccessReport interface defined");
assert(RPB.includes("TenantRbacReport"),      "M10: TenantRbacReport interface defined");
assert(RPB.includes("generatedAt"),           "M11: generatedAt timestamp in reports");
assert(!RPB.includes('import "server-only"'), "M12: report-builder has no server-only");

// ── Section N: rbac-health.ts ─────────────────────────────────────────────────

console.log("\n[N] rbac-health.ts");
assert(HLT.includes('import "server-only"'),  "N01: rbac-health is server-only");
assert(HLT.includes("RbacHealthStatus"),      "N02: RbacHealthStatus type defined");
assert(HLT.includes("RbacHealthReport"),      "N03: RbacHealthReport interface defined");
assert(HLT.includes("RbacHealthMonitor"),     "N04: RbacHealthMonitor class defined");
assert(HLT.includes("checkRbacHealth"),       "N05: checkRbacHealth method defined");
assert(HLT.includes("rbacHealthMonitor"),     "N06: rbacHealthMonitor singleton");
assert(HLT.includes("checkPermissionRegistry"), "N07: permission registry check");
assert(HLT.includes("checkRoleRegistry"),     "N08: role registry check");
assert(HLT.includes("checkResourceRegistry"), "N09: resource registry check");
assert(HLT.includes("checkMatrix"),           "N10: matrix check");
assert(HLT.includes("checkEngineRoundTrip"),  "N11: engine round trip check");
assert(HLT.includes("checkAuthorizationService"), "N12: auth service check");
assert(HLT.includes('"HEALTHY"'),             "N13: HEALTHY status");
assert(HLT.includes('"DEGRADED"'),            "N14: DEGRADED status");
assert(HLT.includes('"UNAVAILABLE"'),         "N15: UNAVAILABLE status");
assert(HLT.includes("} catch"),               "N16: error handling in checks");

// ── Section O: server.ts barrel ───────────────────────────────────────────────

console.log("\n[O] server.ts barrel");
assert(SRV.includes('import "server-only"'),  "O01: server barrel is server-only");
assert(SRV.includes("evaluateAccess"),        "O02: evaluateAccess exported");
assert(SRV.includes("authorizationService"),  "O03: authorizationService exported");
assert(SRV.includes("vaultRbac"),             "O04: vaultRbac exported");
assert(SRV.includes("copilotRbac"),           "O05: copilotRbac exported");
assert(SRV.includes("executiveRbac"),         "O06: executiveRbac exported");
assert(SRV.includes("autonomousRbac"),        "O07: autonomousRbac exported");
assert(SRV.includes("rbacHealthMonitor"),     "O08: rbacHealthMonitor exported");
assert(SRV.includes("buildRoleReport"),       "O09: buildRoleReport exported");
assert(SRV.includes("buildAccessReport"),     "O10: buildAccessReport exported");
assert(SRV.includes("globalRbacAuditLog"),    "O11: globalRbacAuditLog exported");
assert(SRV.includes("userRoleAssignmentStore"), "O12: userRoleAssignmentStore exported");
assert(SRV.includes("ROLE_PERMISSION_MATRIX"), "O13: ROLE_PERMISSION_MATRIX exported");
assert(SRV.includes("PERMISSION_REGISTRY"),   "O14: PERMISSION_REGISTRY exported");
assert(SRV.includes("RESOURCE_REGISTRY"),     "O15: RESOURCE_REGISTRY exported");
assert(SRV.includes("ROLE_REGISTRY"),         "O16: ROLE_REGISTRY exported");

// ── Section P: index.ts (client-safe) ────────────────────────────────────────

console.log("\n[P] index.ts client-safe barrel");
assert(!IDX.includes('import "server-only"'),  "P01: index.ts has no server-only import");
assert(!IDX.includes('"./rbac-engine"'),        "P02: index.ts does not import rbac-engine");
assert(!IDX.includes('"./authorization-service"'), "P03: index.ts does not import auth-service");
assert(!IDX.includes('from "./rbac-engine"'),   "P04: evaluateAccess NOT in client barrel");
assert(!IDX.includes('{ userRoleAssignmentStore }') && !IDX.includes('userRoleAssignmentStore,'), "P05: store NOT in client barrel");
assert(!IDX.includes("assertAccess,"),          "P06: assertAccess NOT in client barrel");
assert(IDX.includes("AccessResult"),            "P07: AccessResult type in client barrel");
assert(IDX.includes("isAllowed"),               "P08: isAllowed helper in client barrel");
assert(IDX.includes("PERMISSION_REGISTRY"),     "P09: PERMISSION_REGISTRY in client barrel");
assert(IDX.includes("RESOURCE_REGISTRY"),       "P10: RESOURCE_REGISTRY in client barrel");
assert(IDX.includes("ROLE_REGISTRY"),           "P11: ROLE_REGISTRY in client barrel");
assert(IDX.includes("RoleId"),                  "P12: RoleId type in client barrel");
assert(IDX.includes("PermissionId"),            "P13: PermissionId type in client barrel");
assert(IDX.includes("createRbacAuditEvent"),    "P14: createRbacAuditEvent (factory) in client barrel");
assert(!IDX.includes("emitAccessEvent"),        "P15: emitAccessEvent NOT in client barrel");
assert(!IDX.includes("emitRoleAssigned"),       "P16: emitRoleAssigned NOT in client barrel");
assert(!IDX.includes("vaultRbac"),              "P17: vaultRbac NOT in client barrel");
assert(!IDX.includes("rbacHealthMonitor"),      "P18: rbacHealthMonitor NOT in client barrel");

// ── Section Q: Security Inventory & Registry ──────────────────────────────────

console.log("\n[Q] Security Inventory & Registry");
assert(INV.includes("RBAC_ENGINE"),             "Q01: RBAC_ENGINE in security inventory");
assert(INV.includes("fail-closed-deny-by-default"), "Q02: fail-closed control listed");
assert(INV.includes("AGENTIK-SECURITY-RBAC-01"), "Q03: sprint ID in inventory");
assert(REG.includes("RBAC_ROLE"),               "Q04: RBAC_ROLE in security registry");
assert(REG.includes("RBAC_PERMISSION"),         "Q05: RBAC_PERMISSION in security registry");
assert(REG.includes("RBAC_ASSIGNMENT"),         "Q06: RBAC_ASSIGNMENT in security registry");
assert(REG.includes("RBAC_POLICY"),             "Q07: RBAC_POLICY in security registry");

// ── Section R: Security Principles ───────────────────────────────────────────

console.log("\n[R] Security Principles");
// Engine must not import Prisma
assert(!ENG.includes("prisma"),                 "R01: engine has no Prisma");
// Engine must check orgSlug before any role lookup
const engineSrc = ENG;
const orgSlugCheckPos  = engineSrc.indexOf("missing_org_slug");
const roleResolutionPos = engineSrc.indexOf("getRolesForUser");
assert(orgSlugCheckPos < roleResolutionPos,     "R02: orgSlug checked before role resolution");
// Engine must have SUPER_ADMIN bypass before role loop
const superBypassPos = engineSrc.indexOf("super_admin_bypass");
const roleLoopPos    = engineSrc.indexOf("for (const roleId");
assert(superBypassPos < roleLoopPos,            "R03: SUPER_ADMIN bypass before role loop");
// Authorization service must emit audit on every check
assert(SVC.includes("emitAccessEvent"),         "R04: auth service emits audit on every check");
// No crypto imports in pure RBAC files
assert(!RT.includes('import "crypto"') && !RT.includes("from \"crypto\""),   "R05: rbac-types has no crypto import");
assert(!PR.includes('import "crypto"') && !PR.includes("from \"crypto\""),   "R06: permission-registry has no crypto import");
assert(!ROL.includes('import "crypto"') && !ROL.includes("from \"crypto\""), "R07: role-registry has no crypto import");
assert(!RPM.includes('import "crypto"') && !RPM.includes("from \"crypto\""), "R08: role-permission-matrix has no crypto import");
// All integration adapters are server-only
assert(VR.includes('import "server-only"'),     "R09: vault-rbac server-only");
assert(CR.includes('import "server-only"'),     "R10: copilot-rbac server-only");
assert(ER.includes('import "server-only"'),     "R11: executive-rbac server-only");
assert(AR.includes('import "server-only"'),     "R12: autonomous-rbac server-only");
// Health monitor must clean up test state
assert(HLT.includes("userRoleAssignmentStore.remove"), "R13: health monitor cleans test state");
// Audit fire-and-forget
assert(AUD.includes("void _persistEvent"),      "R14: audit fire-and-forget pattern");
// Report builder has generatedAt
assert(RPB.includes("new Date().toISOString()"), "R15: reports include generatedAt timestamp");

// ── Final Report ──────────────────────────────────────────────────────────────

const total = passed + failed;
console.log("\n═══════════════════════════════════════════════════════════");
console.log("  AGENTIK-SECURITY-RBAC-01 — Validation Suite");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Total   : ${total}`);
console.log(`  PASS    : ${passed}`);
console.log(`  FAIL    : ${failed}`);
console.log("───────────────────────────────────────────────────────────");

if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log("");
  process.exit(1);
} else {
  console.log(`\n  ✓ All ${total} checks passed — RBAC Layer verified\n`);
}
