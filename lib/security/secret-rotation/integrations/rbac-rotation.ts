/**
 * lib/security/secret-rotation/integrations/rbac-rotation.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * RBAC Rotation Integration — Access Control for Rotation Operations
 *
 * Server-only. Validates RBAC access before any rotation operation.
 *
 * Permissions:
 *   - SECRET_ROTATION_REQUEST: can initiate a rotation
 *   - SECRET_ROTATION_APPROVE: can approve a rotation
 *   - SECRET_ROTATION_EXECUTE: can activate/revoke a rotation
 *   - SECRET_ROTATION_ADMIN:   full rotation administration
 *
 * Uses the RBAC engine directly (server-only evaluateAccess).
 */

import "server-only";

import type { AccessResult } from "../../rbac/rbac-types";
import { evaluateAccess } from "../../rbac/rbac-engine";
import { userRoleAssignmentStore } from "../../rbac/user-role-assignment";

// ── Rotation Permission IDs ───────────────────────────────────────────────────
// These are extension permissions beyond the standard RBAC registry.
// They map to high-risk RBAC operations on the SECURITY resource.

export type RotationPermissionId =
  | "SECRET_ROTATION_REQUEST"
  | "SECRET_ROTATION_APPROVE"
  | "SECRET_ROTATION_EXECUTE"
  | "SECRET_ROTATION_ADMIN";

// ── Permission Mapping ────────────────────────────────────────────────────────
// Maps rotation permissions to existing RBAC permissions for evaluation.

const PERMISSION_MAP: Record<RotationPermissionId, string> = {
  SECRET_ROTATION_REQUEST: "VAULT_WRITE",    // requires vault write capability
  SECRET_ROTATION_APPROVE: "VAULT_WRITE",    // requires vault write capability
  SECRET_ROTATION_EXECUTE: "VAULT_ADMIN",    // requires vault admin capability
  SECRET_ROTATION_ADMIN:   "SECURITY_ADMIN", // requires security admin capability
};

// ── RBAC Rotation Adapter ─────────────────────────────────────────────────────

export class RbacRotationAdapter {

  private _check(
    userId:       string,
    orgSlug:      string,
    rotationPerm: RotationPermissionId,
  ): AccessResult {
    const mappedPermission = PERMISSION_MAP[rotationPerm];
    return evaluateAccess({
      userId,
      orgSlug,
      permissionId: mappedPermission as any,
    });
  }

  /** Can the user request a rotation? */
  canRequest(userId: string, orgSlug: string): AccessResult {
    return this._check(userId, orgSlug, "SECRET_ROTATION_REQUEST");
  }

  /** Can the user approve a rotation? */
  canApprove(userId: string, orgSlug: string): AccessResult {
    return this._check(userId, orgSlug, "SECRET_ROTATION_APPROVE");
  }

  /** Can the user execute a rotation (activate/revoke)? */
  canExecute(userId: string, orgSlug: string): AccessResult {
    return this._check(userId, orgSlug, "SECRET_ROTATION_EXECUTE");
  }

  /** Can the user administer rotations? */
  canAdmin(userId: string, orgSlug: string): AccessResult {
    return this._check(userId, orgSlug, "SECRET_ROTATION_ADMIN");
  }

  // ── Boolean helpers ─────────────────────────────────────────────────────

  isRequestAllowed(userId: string, orgSlug: string): boolean {
    return this.canRequest(userId, orgSlug).decision === "ALLOW";
  }

  isApproveAllowed(userId: string, orgSlug: string): boolean {
    return this.canApprove(userId, orgSlug).decision === "ALLOW";
  }

  isExecuteAllowed(userId: string, orgSlug: string): boolean {
    return this.canExecute(userId, orgSlug).decision === "ALLOW";
  }

  isAdminAllowed(userId: string, orgSlug: string): boolean {
    return this.canAdmin(userId, orgSlug).decision === "ALLOW";
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  assertCanRequest(userId: string, orgSlug: string): void {
    const r = this.canRequest(userId, orgSlug);
    if (r.decision !== "ALLOW") {
      throw new Error(`RbacRotation: REQUEST denied for ${userId} — ${r.reason}`);
    }
  }

  assertCanApprove(userId: string, orgSlug: string): void {
    const r = this.canApprove(userId, orgSlug);
    if (r.decision !== "ALLOW") {
      throw new Error(`RbacRotation: APPROVE denied for ${userId} — ${r.reason}`);
    }
  }

  assertCanExecute(userId: string, orgSlug: string): void {
    const r = this.canExecute(userId, orgSlug);
    if (r.decision !== "ALLOW") {
      throw new Error(`RbacRotation: EXECUTE denied for ${userId} — ${r.reason}`);
    }
  }

  assertCanAdmin(userId: string, orgSlug: string): void {
    const r = this.canAdmin(userId, orgSlug);
    if (r.decision !== "ALLOW") {
      throw new Error(`RbacRotation: ADMIN denied for ${userId} — ${r.reason}`);
    }
  }

  // ── Role Check ──────────────────────────────────────────────────────────

  /** Get roles assigned to a user in a tenant (for auditing). */
  getUserRoles(userId: string, orgSlug: string): string[] {
    return userRoleAssignmentStore.getRolesForUser(userId, orgSlug);
  }

  /** Check if a user has any of the rotation permissions. */
  hasAnyRotationPermission(userId: string, orgSlug: string): boolean {
    return (
      this.isRequestAllowed(userId, orgSlug) ||
      this.isApproveAllowed(userId, orgSlug) ||
      this.isExecuteAllowed(userId, orgSlug) ||
      this.isAdminAllowed(userId, orgSlug)
    );
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: RbacRotationAdapter | null = null;

export function getRbacRotationAdapter(): RbacRotationAdapter {
  if (!_instance) _instance = new RbacRotationAdapter();
  return _instance;
}

export const rbacRotationAdapter = new RbacRotationAdapter();
