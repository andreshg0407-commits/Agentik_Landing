/**
 * lib/security/rbac/index.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC — Client-Safe Barrel
 *
 * Exports ONLY:
 *   - Pure types (RoleId, ResourceId, PermissionId, AccessResult, etc.)
 *   - Pure helpers (isAllowed, isDenied, denyResult, allowResult)
 *   - Registry metadata (read-only, no server deps)
 *   - Pure query types (no store access)
 *
 * NEVER exports:
 *   - evaluateAccess / assertAccess / RBAC engine functions
 *   - AuthorizationService
 *   - userRoleAssignmentStore (in-memory store)
 *   - Domain adapters (vault-rbac, copilot-rbac, executive-rbac, autonomous-rbac)
 *   - Health monitor
 *   - RBAC audit emitters
 *   - Anything that imports "server-only"
 *
 * Safe to import in client components, server components, and shared modules.
 */

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

// ── Permission Registry (pure metadata — no server deps) ──────────────────────

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

// ── Resource Registry (pure metadata — no server deps) ────────────────────────

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

// ── Role Registry (pure metadata — no server deps) ────────────────────────────

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

// ── Role-Permission Matrix (pure metadata — no server deps) ───────────────────

export type { RolePermissionEntry } from "./role-permission-matrix";

export {
  ROLE_PERMISSION_MATRIX,
  getPermissionsForRole,
  hasRolePermission,
  getRolesWithPermission,
  getPermissionCountByRole,
  getMatrixSummary,
} from "./role-permission-matrix";

// ── Assignment Type (type only — no store) ────────────────────────────────────

export type { UserRoleAssignment } from "./user-role-assignment";

export {
  assignmentKey,
  createAssignment,
  isAssignmentValid,
} from "./user-role-assignment";

// ── Audit Event Type (type only — no emitters) ────────────────────────────────

export type {
  RbacAuditEventType,
  RbacAuditEvent,
} from "./rbac-audit";

export { createRbacAuditEvent } from "./rbac-audit";

// ── Health Types (type only — no health monitor) ──────────────────────────────

export type {
  RbacHealthStatus,
  RbacHealthCheck,
  RbacHealthReport,
} from "./rbac-health";

// ── Report Types (type only — no builder functions that import from store) ─────

export type {
  RoleReportEntry,
  RoleReport,
  PermissionReportEntry,
  PermissionReport,
  ResourceAccessEntry,
  AccessReport,
  TenantRbacReport,
} from "./rbac-report-builder";
