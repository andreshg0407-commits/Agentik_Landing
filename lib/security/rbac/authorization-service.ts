/**
 * lib/security/rbac/authorization-service.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * Authorization Service — Domain-Level Access API
 *
 * Server-only. Never import in client components.
 *
 * Provides a high-level authorization API built on top of the RBAC engine.
 * Instead of raw PermissionIds, callers use domain-semantic methods:
 *   - canView(), canCreate(), canUpdate(), canDelete()
 *   - canExport(), canApprove(), canExecute(), canAdmin()
 *   - canManage(), canRead(), canWrite()
 *
 * Each method:
 *   - Accepts userId + orgSlug + resource
 *   - Returns AccessResult (structured, never throws)
 *   - Emits an audit event via rbac-audit.ts
 *
 * Singleton: getAuthorizationService() returns the global instance.
 */

import "server-only";

import type { AccessResult, ResourceId } from "./rbac-types";
import type { PermissionId } from "./rbac-types";
import { evaluateAccess } from "./rbac-engine";
import { emitAccessEvent } from "./rbac-audit";

// ── Permission ID builder ─────────────────────────────────────────────────────

/**
 * Build a PermissionId string from resource + action.
 * Handles resource-specific action name variations.
 */
function buildPermissionId(resource: ResourceId, action: string): PermissionId {
  return `${resource}_${action}` as PermissionId;
}

// ── Authorization Service ─────────────────────────────────────────────────────

export class AuthorizationService {

  private _check(
    userId:       string,
    orgSlug:      string,
    permissionId: PermissionId,
  ): AccessResult {
    const result = evaluateAccess({ userId, orgSlug, permissionId });
    emitAccessEvent(result, userId, orgSlug);
    return result;
  }

  // ── Domain Actions ────────────────────────────────────────────────────────

  /** Check if user can view a resource. */
  canView(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "VIEW"));
  }

  /** Check if user can create records in a resource. */
  canCreate(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "CREATE"));
  }

  /** Check if user can update records in a resource. */
  canUpdate(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "UPDATE"));
  }

  /** Check if user can delete records in a resource. */
  canDelete(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "DELETE"));
  }

  /** Check if user can export data from a resource. */
  canExport(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "EXPORT"));
  }

  /** Check if user can approve actions in a resource. */
  canApprove(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "APPROVE"));
  }

  /** Check if user can execute operations in a resource. */
  canExecute(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "EXECUTE"));
  }

  /** Check if user has admin access to a resource. */
  canAdmin(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "ADMIN"));
  }

  /** Check if user can manage (full CRUD) a resource. */
  canManage(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "MANAGE"));
  }

  /** Check if user can read sensitive data in a resource. */
  canRead(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "READ"));
  }

  /** Check if user can write sensitive data in a resource. */
  canWrite(userId: string, orgSlug: string, resource: ResourceId): AccessResult {
    return this._check(userId, orgSlug, buildPermissionId(resource, "WRITE"));
  }

  // ── Convenience Boolean Helpers ───────────────────────────────────────────

  /** Returns true if user can view the resource. */
  isViewAllowed(userId: string, orgSlug: string, resource: ResourceId): boolean {
    return this.canView(userId, orgSlug, resource).decision === "ALLOW";
  }

  /** Returns true if user can admin the resource. */
  isAdminAllowed(userId: string, orgSlug: string, resource: ResourceId): boolean {
    return this.canAdmin(userId, orgSlug, resource).decision === "ALLOW";
  }

  // ── Named Permission Check ────────────────────────────────────────────────

  /** Check an arbitrary PermissionId directly. */
  check(userId: string, orgSlug: string, permissionId: PermissionId): AccessResult {
    return this._check(userId, orgSlug, permissionId);
  }

  // ── Batch Check ───────────────────────────────────────────────────────────

  /**
   * Run multiple permission checks at once.
   * Returns a map of permissionId → AccessResult.
   */
  checkBatch(
    userId:        string,
    orgSlug:       string,
    permissionIds: PermissionId[],
  ): Map<PermissionId, AccessResult> {
    const results = new Map<PermissionId, AccessResult>();
    for (const permissionId of permissionIds) {
      results.set(permissionId, this._check(userId, orgSlug, permissionId));
    }
    return results;
  }

  // ── Guard ─────────────────────────────────────────────────────────────────

  /**
   * assertCanView — throws if the user cannot view the resource.
   * Use in server actions and API routes.
   */
  assertCanView(userId: string, orgSlug: string, resource: ResourceId): void {
    const result = this.canView(userId, orgSlug, resource);
    if (result.decision !== "ALLOW") {
      throw new Error(`AuthorizationService: VIEW denied on ${resource} — ${result.reason}`);
    }
  }

  /**
   * assertCanAdmin — throws if the user does not have admin access to the resource.
   */
  assertCanAdmin(userId: string, orgSlug: string, resource: ResourceId): void {
    const result = this.canAdmin(userId, orgSlug, resource);
    if (result.decision !== "ALLOW") {
      throw new Error(`AuthorizationService: ADMIN denied on ${resource} — ${result.reason}`);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: AuthorizationService | null = null;

/** Get the singleton AuthorizationService. */
export function getAuthorizationService(): AuthorizationService {
  if (!_instance) _instance = new AuthorizationService();
  return _instance;
}

/** Shorthand singleton accessor. */
export const authorizationService = new AuthorizationService();
