/**
 * lib/security/rbac/server.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC — Server-Only Barrel
 *
 * Exports everything needed by server-side code:
 *   - All types and interfaces
 *   - All registries (permission, role, resource, matrix)
 *   - User role assignment store and factory
 *   - RBAC engine (evaluateAccess, hasPermission, etc.)
 *   - RBAC audit (emit, query)
 *   - Authorization service
 *   - Domain integration adapters (vault, copilot, executive, autonomous)
 *   - Query helpers
 *   - Report builder
 *   - Health monitor
 *   - Future compatibility layer
 *
 * NEVER import this file in client components.
 * Use lib/security/rbac/index.ts for client-safe types.
 */

import "server-only";

// ── Domain Types ──────────────────────────────────────────────────────────────

export type {
  RoleId,
  ResourceId,
  PermissionId,
  PermissionEffect,
  AccessDecision,
  AccessResult,
  AuthorizationContext,
} from "./rbac-types";

export {
  denyResult,
  allowResult,
  isAllowed,
  isDenied,
} from "./rbac-types";

// ── Permission Registry ───────────────────────────────────────────────────────

export type {
  PermissionRiskLevel,
  PermissionAction,
  PermissionEntry,
} from "./permission-registry";

export {
  PERMISSION_REGISTRY,
  getPermissionEntry,
  getPermissionsByResource,
  getPermissionsByRisk,
  getAuditRequiredPermissions,
  getAllPermissionIds,
  isRegisteredPermission,
  getPermissionSummary,
} from "./permission-registry";

// ── Resource Registry ─────────────────────────────────────────────────────────

export type {
  ResourceSensitivity,
  ResourceEntry,
} from "./resource-registry";

export {
  RESOURCE_REGISTRY,
  getResourceEntry,
  getResourcesBySensitivity,
  getEncryptionRequiredResources,
  getAuditRequiredResources,
  getCriticalResources,
  isRegisteredResource,
  getAllResourceIds,
  getResourceSummary,
} from "./resource-registry";

// ── Role Registry ─────────────────────────────────────────────────────────────

export type { RoleEntry } from "./role-registry";

export {
  ROLE_REGISTRY,
  getRoleEntry,
  getOrgAdminVisibleRoles,
  getSystemRoles,
  getAuditRequiredRoles,
  getRolesByRank,
  getRoleRank,
  isRegisteredRole,
  getAllRoleIds,
  getRoleSummary,
} from "./role-registry";

// ── Role-Permission Matrix ────────────────────────────────────────────────────

export type { RolePermissionEntry } from "./role-permission-matrix";

export {
  ROLE_PERMISSION_MATRIX,
  getPermissionsForRole,
  hasRolePermission,
  getRolesWithPermission,
  getRoleMatrixEntry,
  getPermissionCountByRole,
  getMatrixSummary,
} from "./role-permission-matrix";

// ── User Role Assignment ──────────────────────────────────────────────────────

export type { UserRoleAssignment } from "./user-role-assignment";

export {
  userRoleAssignmentStore,
  assignmentKey,
  createAssignment,
  isAssignmentValid,
} from "./user-role-assignment";

// ── RBAC Engine ───────────────────────────────────────────────────────────────

export {
  evaluateAccess,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  resolveEffectivePermissions,
  evaluateBatch,
  assertAccess,
} from "./rbac-engine";

// ── RBAC Audit ────────────────────────────────────────────────────────────────

export type {
  RbacAuditEventType,
  RbacAuditEvent,
} from "./rbac-audit";

export {
  globalRbacAuditLog,
  emitAccessEvent,
  emitRoleAssigned,
  emitRoleRevoked,
  emitHealthChecked,
  createRbacAuditEvent,
} from "./rbac-audit";

// ── Authorization Service ─────────────────────────────────────────────────────

export {
  AuthorizationService,
  getAuthorizationService,
  authorizationService,
} from "./authorization-service";

// ── Domain Integration Adapters ───────────────────────────────────────────────

export { VaultRbac, getVaultRbac, vaultRbac }           from "./integrations/vault-rbac";
export { CopilotRbac, getCopilotRbac, copilotRbac }     from "./integrations/copilot-rbac";
export { ExecutiveRbac, getExecutiveRbac, executiveRbac } from "./integrations/executive-rbac";
export { AutonomousRbac, getAutonomousRbac, autonomousRbac } from "./integrations/autonomous-rbac";

// ── Query Helpers ─────────────────────────────────────────────────────────────

export type {
  UserRoleSummary,
  PermissionCoverageEntry,
} from "./rbac-query";

export {
  getUserRoles,
  getUserRoleAssignments,
  userHasRole,
  getUserPermissions,
  userHasPermission,
  getRoleAssignments,
  getUsersWithRole,
  getTenantAssignments,
  getUserRoleSummary,
  getPermissionCoverage,
} from "./rbac-query";

// ── Report Builder ────────────────────────────────────────────────────────────

export type {
  RoleReportEntry,
  RoleReport,
  PermissionReportEntry,
  PermissionReport,
  ResourceAccessEntry,
  AccessReport,
  TenantRbacReport,
} from "./rbac-report-builder";

export {
  buildRoleReport,
  buildPermissionReport,
  buildAccessReport,
  buildTenantRbacReport,
  formatRoleReport,
  formatAccessReport,
} from "./rbac-report-builder";

// ── Health Monitor ────────────────────────────────────────────────────────────

export type {
  RbacHealthStatus,
  RbacHealthCheck,
  RbacHealthReport,
} from "./rbac-health";

export {
  RbacHealthMonitor,
  getRbacHealthMonitor,
  rbacHealthMonitor,
} from "./rbac-health";
