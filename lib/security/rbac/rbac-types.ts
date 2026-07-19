/**
 * lib/security/rbac/rbac-types.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Foundation — Domain Types
 *
 * Core types for the Agentik Role-Based Access Control layer.
 * Defines identifiers, decision shapes, and all primitive contracts
 * used across the RBAC engine and authorization service.
 *
 * Principles:
 *   - All types are JSON-serializable
 *   - Multi-tenant: every decision carries orgSlug
 *   - Fail-closed: default AccessDecision is DENY
 *   - Explicit: no implicit grants, no wildcard by default
 *
 * No Prisma. No server-only. No crypto. Pure domain types.
 */

// ── Identifier types ──────────────────────────────────────────────────────────

/**
 * RoleId — opaque identifier for a role.
 * Format: uppercase snake_case string, e.g. "SUPER_ADMIN".
 */
export type RoleId =
  | "SUPER_ADMIN"
  | "AGENTIK_ADMIN"
  | "ORG_ADMIN"
  | "MANAGER"
  | "OPERATOR"
  | "BILLING"
  | "AUDITOR"
  | "SECURITY_ADMIN"
  | string; // extensible for future tenant-custom roles

/**
 * ResourceId — identifies a protected resource domain.
 */
export type ResourceId =
  | "FINANCE"
  | "COMMERCIAL"
  | "COLLECTIONS"
  | "MARKETING"
  | "COPILOT"
  | "MEMORY"
  | "PLAYBOOKS"
  | "EXECUTIVE_BRAIN"
  | "AUTONOMOUS"
  | "VAULT"
  | "AUDIT"
  | "SECURITY"
  | "ENCRYPTION"
  | "SETTINGS"
  | "INTEGRATIONS"
  | "TENANT_ADMIN"
  | string; // extensible

/**
 * PermissionId — identifies one specific action on one resource.
 * Format: RESOURCE_ACTION, e.g. "FINANCE_VIEW", "VAULT_ADMIN".
 */
export type PermissionId =
  | "FINANCE_VIEW"
  | "FINANCE_CREATE"
  | "FINANCE_UPDATE"
  | "FINANCE_DELETE"
  | "FINANCE_EXPORT"
  | "FINANCE_ADMIN"
  | "COMMERCIAL_VIEW"
  | "COMMERCIAL_CREATE"
  | "COMMERCIAL_UPDATE"
  | "COMMERCIAL_DELETE"
  | "COMMERCIAL_EXPORT"
  | "COMMERCIAL_ADMIN"
  | "COLLECTIONS_VIEW"
  | "COLLECTIONS_UPDATE"
  | "COLLECTIONS_APPROVE"
  | "COLLECTIONS_ADMIN"
  | "MARKETING_VIEW"
  | "MARKETING_CREATE"
  | "MARKETING_UPDATE"
  | "MARKETING_ADMIN"
  | "COPILOT_EXECUTE"
  | "COPILOT_ADMIN"
  | "MEMORY_READ"
  | "MEMORY_WRITE"
  | "MEMORY_ADMIN"
  | "PLAYBOOK_VIEW"
  | "PLAYBOOK_MANAGE"
  | "PLAYBOOK_ADMIN"
  | "EXECUTIVE_VIEW"
  | "EXECUTIVE_ADMIN"
  | "AUTONOMOUS_EXECUTE"
  | "AUTONOMOUS_APPROVE"
  | "AUTONOMOUS_ADMIN"
  | "VAULT_READ"
  | "VAULT_WRITE"
  | "VAULT_ADMIN"
  | "AUDIT_VIEW"
  | "AUDIT_EXPORT"
  | "AUDIT_ADMIN"
  | "SECURITY_VIEW"
  | "SECURITY_ADMIN"
  | "ENCRYPTION_VIEW"
  | "ENCRYPTION_ADMIN"
  | "SETTINGS_VIEW"
  | "SETTINGS_UPDATE"
  | "SETTINGS_ADMIN"
  | "INTEGRATIONS_VIEW"
  | "INTEGRATIONS_MANAGE"
  | "INTEGRATIONS_ADMIN"
  | "TENANT_ADMIN"
  | "RBAC_VIEW"
  | "RBAC_ADMIN"
  | string; // extensible

// ── Permission Effect ─────────────────────────────────────────────────────────

/**
 * PermissionEffect — whether a rule grants or denies a permission.
 * DENY always takes precedence over ALLOW (fail-closed).
 */
export type PermissionEffect = "ALLOW" | "DENY";

// ── Access Decision ───────────────────────────────────────────────────────────

/**
 * AccessDecision — the outcome of an authorization check.
 */
export type AccessDecision = "ALLOW" | "DENY";

/**
 * AccessResult — full structured outcome of an access evaluation.
 * Always includes a decision and an explicit reason.
 * Never includes sensitive user data beyond IDs.
 */
export interface AccessResult {
  /** The authorization decision. */
  decision:     AccessDecision;
  /**
   * Machine-readable reason for the decision.
   * Examples: "super_admin_bypass", "role_has_permission",
   *           "no_matching_permission", "no_roles_assigned",
   *           "missing_org_slug", "permission_not_registered"
   */
  reason:       string;
  /** The role that granted access (if ALLOW via role). */
  grantingRole?: RoleId;
  /** The permission that was evaluated. */
  permissionId?: PermissionId;
  /** ISO 8601 timestamp of the decision. */
  decidedAt:    string;
  /** Duration of the evaluation in milliseconds. */
  durationMs:   number;
}

// ── Authorization Context ─────────────────────────────────────────────────────

/**
 * AuthorizationContext — the full context for one access evaluation.
 * Passed to the RBAC Engine for every check.
 */
export interface AuthorizationContext {
  /** The user or agent requesting access. */
  userId:       string;
  /** The tenant scope. Required — no cross-tenant access. */
  orgSlug:      string;
  /** The permission being requested. */
  permissionId: PermissionId;
  /** Optional: the specific resource instance being accessed. */
  resourceId?:  string;
  /** Optional: additional context for audit (e.g., module, route). */
  context?:     Record<string, string | number | boolean>;
}

// ── Helper factories ──────────────────────────────────────────────────────────

/**
 * denyResult — construct a DENY AccessResult.
 */
export function denyResult(
  reason:       string,
  permissionId?: PermissionId,
  start?:       number,
): AccessResult {
  return {
    decision:    "DENY",
    reason,
    permissionId,
    decidedAt:   new Date().toISOString(),
    durationMs:  start !== undefined ? Date.now() - start : 0,
  };
}

/**
 * allowResult — construct an ALLOW AccessResult.
 */
export function allowResult(
  reason:       string,
  grantingRole?: RoleId,
  permissionId?: PermissionId,
  start?:       number,
): AccessResult {
  return {
    decision:    "ALLOW",
    reason,
    grantingRole,
    permissionId,
    decidedAt:   new Date().toISOString(),
    durationMs:  start !== undefined ? Date.now() - start : 0,
  };
}

/**
 * isAllowed — type-safe check of an AccessResult.
 */
export function isAllowed(result: AccessResult): boolean {
  return result.decision === "ALLOW";
}

/**
 * isDenied — type-safe check of an AccessResult.
 */
export function isDenied(result: AccessResult): boolean {
  return result.decision === "DENY";
}
