/**
 * lib/security/rbac/rbac-engine.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Engine — Core Authorization Evaluator
 *
 * Server-only. Never import in client components.
 *
 * Principles:
 *   - Fail-closed: unknown user / missing role / unregistered permission → DENY
 *   - SUPER_ADMIN bypass: SUPER_ADMIN role always results in ALLOW
 *   - Multi-tenant: orgSlug is required; missing orgSlug → DENY
 *   - Explicit: no implicit grants; no wildcards
 *   - Audit-ready: every evaluation returns a full AccessResult
 *   - Pure: no Prisma, no network calls, no side effects
 *
 * The engine reads from:
 *   - userRoleAssignmentStore (in-memory)
 *   - ROLE_PERMISSION_MATRIX (static)
 *   - PERMISSION_REGISTRY (static)
 */

import "server-only";

import {
  type AuthorizationContext,
  type AccessResult,
  type RoleId,
  type PermissionId,
  allowResult,
  denyResult,
} from "./rbac-types";

import { isRegisteredPermission } from "./permission-registry";
import { hasRolePermission, getPermissionsForRole } from "./role-permission-matrix";
import { userRoleAssignmentStore } from "./user-role-assignment";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPER_ADMIN: RoleId = "SUPER_ADMIN";

// ── Core Evaluation ───────────────────────────────────────────────────────────

/**
 * evaluateAccess — primary RBAC decision function.
 *
 * Given a full AuthorizationContext, returns an AccessResult with:
 *   - decision: ALLOW | DENY
 *   - reason: machine-readable explanation
 *   - grantingRole: the role that granted access (if ALLOW via role)
 *   - permissionId: the permission evaluated
 *   - decidedAt: ISO 8601 timestamp
 *   - durationMs: evaluation time
 */
export function evaluateAccess(ctx: AuthorizationContext): AccessResult {
  const start = Date.now();

  // ── Guard: orgSlug required ────────────────────────────────────────────────
  if (!ctx.orgSlug || ctx.orgSlug.trim() === "") {
    return denyResult("missing_org_slug", ctx.permissionId, start);
  }

  // ── Guard: userId required ─────────────────────────────────────────────────
  if (!ctx.userId || ctx.userId.trim() === "") {
    return denyResult("missing_user_id", ctx.permissionId, start);
  }

  // ── Guard: permission must be registered ───────────────────────────────────
  if (!isRegisteredPermission(ctx.permissionId)) {
    return denyResult("permission_not_registered", ctx.permissionId, start);
  }

  // ── Resolve roles ──────────────────────────────────────────────────────────
  const roles = userRoleAssignmentStore.getRolesForUser(ctx.userId, ctx.orgSlug);

  if (roles.length === 0) {
    return denyResult("no_roles_assigned", ctx.permissionId, start);
  }

  // ── SUPER_ADMIN bypass ─────────────────────────────────────────────────────
  if (roles.includes(SUPER_ADMIN)) {
    return allowResult("super_admin_bypass", SUPER_ADMIN, ctx.permissionId, start);
  }

  // ── Role-permission check ──────────────────────────────────────────────────
  for (const roleId of roles) {
    if (hasRolePermission(roleId, ctx.permissionId)) {
      return allowResult("role_has_permission", roleId, ctx.permissionId, start);
    }
  }

  // ── No matching permission found ───────────────────────────────────────────
  return denyResult("no_matching_permission", ctx.permissionId, start);
}

// ── Convenience Helpers ───────────────────────────────────────────────────────

/**
 * hasPermission — returns true if the user is allowed the given permission.
 * Shorthand for evaluateAccess().decision === "ALLOW".
 */
export function hasPermission(
  userId:       string,
  orgSlug:      string,
  permissionId: PermissionId,
): boolean {
  return evaluateAccess({ userId, orgSlug, permissionId }).decision === "ALLOW";
}

/**
 * hasAnyPermission — returns true if the user has at least one of the given permissions.
 */
export function hasAnyPermission(
  userId:        string,
  orgSlug:       string,
  permissionIds: PermissionId[],
): boolean {
  return permissionIds.some(p => hasPermission(userId, orgSlug, p));
}

/**
 * hasAllPermissions — returns true only if the user has ALL of the given permissions.
 */
export function hasAllPermissions(
  userId:        string,
  orgSlug:       string,
  permissionIds: PermissionId[],
): boolean {
  return permissionIds.every(p => hasPermission(userId, orgSlug, p));
}

/**
 * resolveEffectivePermissions — returns the full set of PermissionIds the user
 * has in a given tenant, by union-ing all role permission sets.
 *
 * SUPER_ADMIN returns an empty set (bypass is handled case-by-case in evaluateAccess).
 * Callers should check hasPermission() for individual decisions.
 */
export function resolveEffectivePermissions(
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
 * evaluateBatch — evaluate multiple permission checks at once.
 * Returns a map of permissionId → AccessResult.
 */
export function evaluateBatch(
  userId:        string,
  orgSlug:       string,
  permissionIds: PermissionId[],
): Map<PermissionId, AccessResult> {
  const results = new Map<PermissionId, AccessResult>();
  for (const permissionId of permissionIds) {
    results.set(permissionId, evaluateAccess({ userId, orgSlug, permissionId }));
  }
  return results;
}

/**
 * assertAccess — throws if the user does not have the given permission.
 * Used in server actions and API routes as a guard.
 */
export function assertAccess(
  userId:       string,
  orgSlug:      string,
  permissionId: PermissionId,
  label?:       string,
): void {
  const result = evaluateAccess({ userId, orgSlug, permissionId });
  if (result.decision !== "ALLOW") {
    throw new Error(
      `RBAC: Access denied [${label ?? permissionId}] — ${result.reason}`,
    );
  }
}
