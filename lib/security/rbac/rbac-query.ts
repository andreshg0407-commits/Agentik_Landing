/**
 * lib/security/rbac/rbac-query.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Query Helpers — User-Facing Access Inspection API
 *
 * Provides read-only query helpers to inspect RBAC state:
 *   - getUserRoles(): what roles does a user have?
 *   - getUserPermissions(): what permissions does a user have?
 *   - getRoleAssignments(): who is assigned to a role in a tenant?
 *   - getRoleSummary(): summarize the role state for a user
 *
 * These helpers read from userRoleAssignmentStore and ROLE_PERMISSION_MATRIX.
 * No writes. No side effects.
 *
 * No Prisma here — Prisma bridge is the caller's responsibility.
 * No server-only — pure domain logic, can be shared.
 */

import type { RoleId, PermissionId } from "./rbac-types";
import { userRoleAssignmentStore, type UserRoleAssignment } from "./user-role-assignment";
import { getPermissionsForRole, getRolesWithPermission } from "./role-permission-matrix";
import { getRoleEntry } from "./role-registry";
import { getPermissionEntry } from "./permission-registry";

// ── User Role Query ───────────────────────────────────────────────────────────

/**
 * Get all active role IDs for a user in a tenant.
 */
export function getUserRoles(userId: string, orgSlug: string): RoleId[] {
  return userRoleAssignmentStore.getRolesForUser(userId, orgSlug);
}

/**
 * Get all active role assignments for a user in a tenant (full metadata).
 */
export function getUserRoleAssignments(
  userId:  string,
  orgSlug: string,
): UserRoleAssignment[] {
  return userRoleAssignmentStore.getForUser(userId, orgSlug);
}

/**
 * Check whether a user has a specific role in a tenant.
 */
export function userHasRole(
  userId:  string,
  orgSlug: string,
  roleId:  RoleId,
): boolean {
  return userRoleAssignmentStore.hasRole(userId, orgSlug, roleId);
}

// ── Permission Query ──────────────────────────────────────────────────────────

/**
 * Get the full set of PermissionIds a user has in a tenant.
 * Union of all role permission sets.
 */
export function getUserPermissions(
  userId:  string,
  orgSlug: string,
): Set<PermissionId> {
  const roles = userRoleAssignmentStore.getRolesForUser(userId, orgSlug);
  const result = new Set<PermissionId>();
  for (const roleId of roles) {
    for (const permissionId of getPermissionsForRole(roleId)) {
      result.add(permissionId);
    }
  }
  return result;
}

/**
 * Check whether a user has a specific permission in a tenant.
 * Does NOT apply SUPER_ADMIN bypass — use evaluateAccess() for full decision.
 */
export function userHasPermission(
  userId:       string,
  orgSlug:      string,
  permissionId: PermissionId,
): boolean {
  const roles = userRoleAssignmentStore.getRolesForUser(userId, orgSlug);
  for (const roleId of roles) {
    if (getPermissionsForRole(roleId).has(permissionId)) return true;
  }
  return false;
}

// ── Role Assignment Query ─────────────────────────────────────────────────────

/**
 * Get all active assignments for a role in a tenant.
 */
export function getRoleAssignments(
  orgSlug: string,
  roleId:  RoleId,
): UserRoleAssignment[] {
  return userRoleAssignmentStore
    .getAllForTenant(orgSlug)
    .filter(a => a.roleId === roleId && a.isActive);
}

/**
 * Get all unique user IDs who hold a specific role in a tenant.
 */
export function getUsersWithRole(orgSlug: string, roleId: RoleId): string[] {
  return getRoleAssignments(orgSlug, roleId).map(a => a.userId);
}

/**
 * Get all active assignments in a tenant.
 */
export function getTenantAssignments(orgSlug: string): UserRoleAssignment[] {
  return userRoleAssignmentStore.getAllForTenant(orgSlug);
}

// ── Role Summary ──────────────────────────────────────────────────────────────

export interface UserRoleSummary {
  userId:           string;
  orgSlug:          string;
  roles:            Array<{ id: RoleId; name: string; rank: number }>;
  permissionCount:  number;
  isSuperAdmin:     boolean;
  isOrgAdmin:       boolean;
}

/**
 * Build a summary of a user's RBAC state in a tenant.
 */
export function getUserRoleSummary(
  userId:  string,
  orgSlug: string,
): UserRoleSummary {
  const roleIds    = getUserRoles(userId, orgSlug);
  const permissions = getUserPermissions(userId, orgSlug);

  const roles = roleIds.map(id => {
    const entry = getRoleEntry(id);
    return { id, name: entry?.name ?? id, rank: entry?.rank ?? 0 };
  });

  return {
    userId,
    orgSlug,
    roles,
    permissionCount:  permissions.size,
    isSuperAdmin:     roleIds.includes("SUPER_ADMIN"),
    isOrgAdmin:       roleIds.includes("ORG_ADMIN"),
  };
}

// ── Permission Coverage ───────────────────────────────────────────────────────

export interface PermissionCoverageEntry {
  permissionId: PermissionId;
  name:         string;
  rolesWithPermission: RoleId[];
  userHasIt:    boolean;
}

/**
 * Get permission coverage — for each permission, which roles grant it,
 * and whether the given user has it.
 */
export function getPermissionCoverage(
  userId:        string,
  orgSlug:       string,
  permissionIds: PermissionId[],
): PermissionCoverageEntry[] {
  const userPerms = getUserPermissions(userId, orgSlug);

  return permissionIds.map(permissionId => {
    const entry = getPermissionEntry(permissionId);
    return {
      permissionId,
      name:                entry?.name ?? permissionId,
      rolesWithPermission: getRolesWithPermission(permissionId),
      userHasIt:           userPerms.has(permissionId),
    };
  });
}
