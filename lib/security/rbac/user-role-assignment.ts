/**
 * lib/security/rbac/user-role-assignment.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Foundation — User Role Assignment
 *
 * Defines the UserRoleAssignment type and in-memory assignment store.
 * In production, assignments are loaded from Prisma (OrgMember.role).
 * This module provides:
 *   - The canonical UserRoleAssignment type
 *   - An in-memory registry for server-side caching and testing
 *   - Helpers for resolving roles from a userId + orgSlug pair
 *
 * No Prisma import here — Prisma bridge lives in rbac-query.ts.
 * No server-only — type is safe to share; registry is used server-side only.
 */

import type { RoleId } from "./rbac-types";

// ── UserRoleAssignment ────────────────────────────────────────────────────────

/**
 * A single role assignment linking a user to a role within a tenant.
 * All fields are JSON-serializable.
 */
export interface UserRoleAssignment {
  /** The user this assignment belongs to. */
  userId:     string;
  /** The tenant scope this assignment is valid in. */
  orgSlug:    string;
  /** The role granted to the user. */
  roleId:     RoleId;
  /** Who created this assignment (userId of assigner, or "system"). */
  assignedBy: string;
  /** ISO 8601 timestamp when this assignment was created. */
  assignedAt: string;
  /** Optional ISO 8601 expiry. If set and past, the assignment is inactive. */
  expiresAt?: string;
  /** Whether this assignment is currently active. */
  isActive:   boolean;
}

// ── Assignment Key ────────────────────────────────────────────────────────────

/** Build a deterministic key for a userId+orgSlug+roleId triple. */
export function assignmentKey(
  userId:  string,
  orgSlug: string,
  roleId:  RoleId,
): string {
  return `${orgSlug}:${userId}:${roleId}`;
}

// ── In-Memory Assignment Store ────────────────────────────────────────────────

/**
 * In-memory assignment store used for:
 *   - Integration tests (seeded directly)
 *   - Server-side caching (populated from Prisma by rbac-query.ts)
 *
 * Not a substitute for database persistence.
 * Cleared between test suites via _reset().
 */
class UserRoleAssignmentStore {
  private readonly _store = new Map<string, UserRoleAssignment>();

  /** Add or replace an assignment. */
  set(assignment: UserRoleAssignment): void {
    const key = assignmentKey(assignment.userId, assignment.orgSlug, assignment.roleId);
    this._store.set(key, assignment);
  }

  /** Get a specific assignment (userId + orgSlug + roleId). */
  get(userId: string, orgSlug: string, roleId: RoleId): UserRoleAssignment | undefined {
    return this._store.get(assignmentKey(userId, orgSlug, roleId));
  }

  /** Get all active assignments for a user in a tenant. */
  getForUser(userId: string, orgSlug: string): UserRoleAssignment[] {
    const now = new Date().toISOString();
    return [...this._store.values()].filter(a =>
      a.userId  === userId  &&
      a.orgSlug === orgSlug &&
      a.isActive           &&
      (a.expiresAt === undefined || a.expiresAt > now),
    );
  }

  /** Get all active RoleIds for a user in a tenant. */
  getRolesForUser(userId: string, orgSlug: string): RoleId[] {
    return this.getForUser(userId, orgSlug).map(a => a.roleId);
  }

  /** Check whether a user has a specific role in a tenant. */
  hasRole(userId: string, orgSlug: string, roleId: RoleId): boolean {
    const a = this.get(userId, orgSlug, roleId);
    if (!a || !a.isActive) return false;
    if (a.expiresAt && a.expiresAt <= new Date().toISOString()) return false;
    return true;
  }

  /** Remove an assignment. */
  remove(userId: string, orgSlug: string, roleId: RoleId): void {
    this._store.delete(assignmentKey(userId, orgSlug, roleId));
  }

  /** Deactivate all assignments for a user in a tenant (does not delete). */
  deactivateUser(userId: string, orgSlug: string): void {
    const now = new Date().toISOString();
    for (const [key, a] of this._store) {
      if (a.userId === userId && a.orgSlug === orgSlug) {
        this._store.set(key, { ...a, isActive: false, expiresAt: now });
      }
    }
  }

  /** Get all assignments in a tenant. */
  getAllForTenant(orgSlug: string): UserRoleAssignment[] {
    return [...this._store.values()].filter(a => a.orgSlug === orgSlug);
  }

  /** Total assignments in the store. */
  get size(): number {
    return this._store.size;
  }

  /** Reset the store (for testing only). */
  _reset(): void {
    this._store.clear();
  }
}

/** Singleton in-memory assignment store. */
export const userRoleAssignmentStore = new UserRoleAssignmentStore();

// ── Factory Helpers ───────────────────────────────────────────────────────────

/**
 * Create a UserRoleAssignment with defaults.
 */
export function createAssignment(params: {
  userId:     string;
  orgSlug:    string;
  roleId:     RoleId;
  assignedBy: string;
  expiresAt?: string;
}): UserRoleAssignment {
  return {
    userId:     params.userId,
    orgSlug:    params.orgSlug,
    roleId:     params.roleId,
    assignedBy: params.assignedBy,
    assignedAt: new Date().toISOString(),
    expiresAt:  params.expiresAt,
    isActive:   true,
  };
}

/**
 * Check whether an assignment is currently valid (active and not expired).
 */
export function isAssignmentValid(assignment: UserRoleAssignment): boolean {
  if (!assignment.isActive) return false;
  if (assignment.expiresAt && assignment.expiresAt <= new Date().toISOString()) return false;
  return true;
}
