/**
 * lib/security/rbac/rbac-audit.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Audit — Authorization Event Logging
 *
 * Emits structured audit events for all RBAC decisions.
 * Integrates with the persistent audit layer (fire-and-forget).
 *
 * Event types:
 *   - ACCESS_GRANTED: a permission check returned ALLOW
 *   - ACCESS_DENIED: a permission check returned DENY
 *   - ROLE_ASSIGNED: a role was added to a user
 *   - ROLE_REVOKED: a role was removed from a user
 *   - PERMISSION_EVALUATED: a batch evaluation was run
 *   - RBAC_HEALTH_CHECKED: the RBAC health monitor ran
 *
 * Principles:
 *   - Fire-and-forget: audit calls never block the caller
 *   - Never throw: all errors are swallowed at the boundary
 *   - Fail-closed: if audit fails, the authorization decision is unaffected
 */

import type { AccessResult, RoleId, PermissionId } from "./rbac-types";

// ── Event Types ───────────────────────────────────────────────────────────────

export type RbacAuditEventType =
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED"
  | "ROLE_ASSIGNED"
  | "ROLE_REVOKED"
  | "PERMISSION_EVALUATED"
  | "RBAC_HEALTH_CHECKED";

// ── Audit Event ───────────────────────────────────────────────────────────────

export interface RbacAuditEvent {
  /** Unique event ID. */
  id:           string;
  /** Event type. */
  type:         RbacAuditEventType;
  /** The tenant scope. */
  orgSlug:      string;
  /** The user being evaluated or modified. */
  userId:       string;
  /** The permission that was evaluated (if applicable). */
  permissionId?: PermissionId;
  /** The role involved (if applicable). */
  roleId?:       RoleId;
  /** The authorization decision (if applicable). */
  decision?:     "ALLOW" | "DENY";
  /** Machine-readable reason. */
  reason?:       string;
  /** Duration of the evaluation in milliseconds. */
  durationMs:    number;
  /** ISO 8601 timestamp. */
  occurredAt:    string;
  /** Optional extra context for the event. */
  context?:      Record<string, string | number | boolean>;
}

// ── ID Generator ──────────────────────────────────────────────────────────────

function newId(): string {
  return `rbac_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── In-Memory Audit Log ───────────────────────────────────────────────────────

const MAX_SIZE = 2000;

class RbacAuditLog {
  private readonly _events: RbacAuditEvent[] = [];

  push(event: RbacAuditEvent): void {
    this._events.push(event);
    if (this._events.length > MAX_SIZE) {
      this._events.splice(0, this._events.length - MAX_SIZE);
    }
  }

  getByTenant(orgSlug: string, limit = 100): RbacAuditEvent[] {
    return this._events
      .filter(e => e.orgSlug === orgSlug)
      .slice(-limit);
  }

  getByType(type: RbacAuditEventType, limit = 100): RbacAuditEvent[] {
    return this._events
      .filter(e => e.type === type)
      .slice(-limit);
  }

  getDenials(orgSlug: string, limit = 100): RbacAuditEvent[] {
    return this._events
      .filter(e => e.orgSlug === orgSlug && e.decision === "DENY")
      .slice(-limit);
  }

  getRecent(limit = 100): RbacAuditEvent[] {
    return this._events.slice(-limit);
  }

  get size(): number { return this._events.length; }

  _reset(): void { this._events.length = 0; }
}

/** Singleton RBAC audit log. */
export const globalRbacAuditLog = new RbacAuditLog();

// ── Persistent Bridge ─────────────────────────────────────────────────────────

/**
 * Attempt to persist an RBAC audit event to the persistent audit layer.
 * Fire-and-forget — never throws.
 */
async function _persistEvent(event: RbacAuditEvent): Promise<void> {
  try {
    // Lazy import to avoid circular dependencies and server-only boundary issues at module level.
    const { getPersistentAuditService } = await import("../audit-persistence/persistent-audit-service");
    const svc = getPersistentAuditService();
    await svc.recordEvent({
      eventType: (event.decision === "ALLOW" ? "ACCESS_GRANTED" : "ACCESS_DENIED") as any,
      category:  "AUTHORIZATION" as any,
      severity:  (event.decision === "DENY" ? "MEDIUM" : "LOW") as any,
      orgSlug:   event.orgSlug,
      metadata:  {
        rbacEventType: event.type,
        userId:        event.userId,
        permissionId:  event.permissionId ?? null,
        roleId:        event.roleId ?? null,
        decision:      event.decision ?? null,
        reason:        event.reason ?? null,
        durationMs:    event.durationMs,
      },
    });
  } catch {
    // Swallow — never block caller
  }
}

// ── Public Emit Helpers ───────────────────────────────────────────────────────

/**
 * emitAccessEvent — log an authorization result from evaluateAccess().
 */
export function emitAccessEvent(
  result:  AccessResult,
  userId:  string,
  orgSlug: string,
): void {
  const event: RbacAuditEvent = {
    id:           newId(),
    type:         result.decision === "ALLOW" ? "ACCESS_GRANTED" : "ACCESS_DENIED",
    orgSlug,
    userId,
    permissionId: result.permissionId,
    roleId:       result.grantingRole,
    decision:     result.decision,
    reason:       result.reason,
    durationMs:   result.durationMs,
    occurredAt:   result.decidedAt,
  };

  globalRbacAuditLog.push(event);

  // Only persist denials and high-sensitivity grants to reduce noise
  if (result.decision === "DENY" || result.reason === "super_admin_bypass") {
    void _persistEvent(event);
  }
}

/**
 * emitRoleAssigned — log a role assignment.
 */
export function emitRoleAssigned(params: {
  userId:     string;
  orgSlug:    string;
  roleId:     RoleId;
  assignedBy: string;
}): void {
  const event: RbacAuditEvent = {
    id:        newId(),
    type:      "ROLE_ASSIGNED",
    orgSlug:   params.orgSlug,
    userId:    params.userId,
    roleId:    params.roleId,
    durationMs: 0,
    occurredAt: new Date().toISOString(),
    context:   { assignedBy: params.assignedBy },
  };
  globalRbacAuditLog.push(event);
  void _persistEvent(event);
}

/**
 * emitRoleRevoked — log a role revocation.
 */
export function emitRoleRevoked(params: {
  userId:    string;
  orgSlug:   string;
  roleId:    RoleId;
  revokedBy: string;
}): void {
  const event: RbacAuditEvent = {
    id:         newId(),
    type:       "ROLE_REVOKED",
    orgSlug:    params.orgSlug,
    userId:     params.userId,
    roleId:     params.roleId,
    durationMs: 0,
    occurredAt: new Date().toISOString(),
    context:    { revokedBy: params.revokedBy },
  };
  globalRbacAuditLog.push(event);
  void _persistEvent(event);
}

/**
 * emitHealthChecked — log an RBAC health check event.
 */
export function emitHealthChecked(orgSlug: string, durationMs: number): void {
  const event: RbacAuditEvent = {
    id:         newId(),
    type:       "RBAC_HEALTH_CHECKED",
    orgSlug,
    userId:     "system",
    durationMs,
    occurredAt: new Date().toISOString(),
  };
  globalRbacAuditLog.push(event);
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Create a standalone RbacAuditEvent without emitting it. */
export function createRbacAuditEvent(
  params: Omit<RbacAuditEvent, "id" | "occurredAt">,
): RbacAuditEvent {
  return {
    ...params,
    id:         newId(),
    occurredAt: new Date().toISOString(),
  };
}
