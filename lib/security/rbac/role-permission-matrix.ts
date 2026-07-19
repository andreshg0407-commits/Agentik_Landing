/**
 * lib/security/rbac/role-permission-matrix.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Foundation — Role-Permission Matrix
 *
 * Defines which PermissionIds are granted to each RoleId.
 * This is the single source of truth for role-to-permission assignment.
 *
 * Principles:
 *   - Explicit: only listed permissions are granted
 *   - No wildcards: every permission must be individually listed
 *   - Fail-closed: unlisted = DENY
 *   - SUPER_ADMIN bypass is handled in the RBAC engine, not here
 *
 * No Prisma. No server-only. No crypto. Pure domain matrix.
 */

import type { RoleId, PermissionId } from "./rbac-types";

// ── Matrix Entry ──────────────────────────────────────────────────────────────

export interface RolePermissionEntry {
  roleId:      RoleId;
  permissions: ReadonlyArray<PermissionId>;
}

// ── Role-Permission Matrix ────────────────────────────────────────────────────

export const ROLE_PERMISSION_MATRIX: ReadonlyArray<RolePermissionEntry> = [
  // ── SUPER_ADMIN ─────────────────────────────────────────────────────────────
  // Bypass is handled in the RBAC engine. Listed here for audit completeness.
  {
    roleId: "SUPER_ADMIN",
    permissions: [
      // Finance
      "FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_UPDATE", "FINANCE_DELETE", "FINANCE_EXPORT", "FINANCE_ADMIN",
      // Commercial
      "COMMERCIAL_VIEW", "COMMERCIAL_CREATE", "COMMERCIAL_UPDATE", "COMMERCIAL_DELETE", "COMMERCIAL_EXPORT", "COMMERCIAL_ADMIN",
      // Collections
      "COLLECTIONS_VIEW", "COLLECTIONS_UPDATE", "COLLECTIONS_APPROVE", "COLLECTIONS_ADMIN",
      // Marketing
      "MARKETING_VIEW", "MARKETING_CREATE", "MARKETING_UPDATE", "MARKETING_ADMIN",
      // Copilot
      "COPILOT_EXECUTE", "COPILOT_ADMIN",
      // Memory
      "MEMORY_READ", "MEMORY_WRITE", "MEMORY_ADMIN",
      // Playbooks
      "PLAYBOOK_VIEW", "PLAYBOOK_MANAGE", "PLAYBOOK_ADMIN",
      // Executive Brain
      "EXECUTIVE_VIEW", "EXECUTIVE_ADMIN",
      // Autonomous
      "AUTONOMOUS_EXECUTE", "AUTONOMOUS_APPROVE", "AUTONOMOUS_ADMIN",
      // Vault
      "VAULT_READ", "VAULT_WRITE", "VAULT_ADMIN",
      // Audit
      "AUDIT_VIEW", "AUDIT_EXPORT", "AUDIT_ADMIN",
      // Security
      "SECURITY_VIEW", "SECURITY_ADMIN",
      // Encryption
      "ENCRYPTION_VIEW", "ENCRYPTION_ADMIN",
      // Settings
      "SETTINGS_VIEW", "SETTINGS_UPDATE", "SETTINGS_ADMIN",
      // Integrations
      "INTEGRATIONS_VIEW", "INTEGRATIONS_MANAGE", "INTEGRATIONS_ADMIN",
      // Tenant Admin
      "TENANT_ADMIN",
      // RBAC
      "RBAC_VIEW", "RBAC_ADMIN",
    ],
  },

  // ── AGENTIK_ADMIN ────────────────────────────────────────────────────────────
  {
    roleId: "AGENTIK_ADMIN",
    permissions: [
      // Finance
      "FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_UPDATE", "FINANCE_EXPORT", "FINANCE_ADMIN",
      // Commercial
      "COMMERCIAL_VIEW", "COMMERCIAL_CREATE", "COMMERCIAL_UPDATE", "COMMERCIAL_EXPORT", "COMMERCIAL_ADMIN",
      // Collections
      "COLLECTIONS_VIEW", "COLLECTIONS_UPDATE", "COLLECTIONS_APPROVE", "COLLECTIONS_ADMIN",
      // Marketing
      "MARKETING_VIEW", "MARKETING_CREATE", "MARKETING_UPDATE", "MARKETING_ADMIN",
      // Copilot
      "COPILOT_EXECUTE", "COPILOT_ADMIN",
      // Memory
      "MEMORY_READ", "MEMORY_WRITE", "MEMORY_ADMIN",
      // Playbooks
      "PLAYBOOK_VIEW", "PLAYBOOK_MANAGE", "PLAYBOOK_ADMIN",
      // Executive Brain
      "EXECUTIVE_VIEW", "EXECUTIVE_ADMIN",
      // Autonomous
      "AUTONOMOUS_EXECUTE", "AUTONOMOUS_APPROVE", "AUTONOMOUS_ADMIN",
      // Vault
      "VAULT_READ", "VAULT_WRITE", "VAULT_ADMIN",
      // Audit
      "AUDIT_VIEW", "AUDIT_EXPORT", "AUDIT_ADMIN",
      // Security
      "SECURITY_VIEW", "SECURITY_ADMIN",
      // Encryption
      "ENCRYPTION_VIEW", "ENCRYPTION_ADMIN",
      // Settings
      "SETTINGS_VIEW", "SETTINGS_UPDATE", "SETTINGS_ADMIN",
      // Integrations
      "INTEGRATIONS_VIEW", "INTEGRATIONS_MANAGE", "INTEGRATIONS_ADMIN",
      // Tenant Admin
      "TENANT_ADMIN",
      // RBAC
      "RBAC_VIEW", "RBAC_ADMIN",
    ],
  },

  // ── ORG_ADMIN ────────────────────────────────────────────────────────────────
  {
    roleId: "ORG_ADMIN",
    permissions: [
      // Finance
      "FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_UPDATE", "FINANCE_EXPORT", "FINANCE_ADMIN",
      // Commercial
      "COMMERCIAL_VIEW", "COMMERCIAL_CREATE", "COMMERCIAL_UPDATE", "COMMERCIAL_EXPORT", "COMMERCIAL_ADMIN",
      // Collections
      "COLLECTIONS_VIEW", "COLLECTIONS_UPDATE", "COLLECTIONS_APPROVE", "COLLECTIONS_ADMIN",
      // Marketing
      "MARKETING_VIEW", "MARKETING_CREATE", "MARKETING_UPDATE", "MARKETING_ADMIN",
      // Copilot
      "COPILOT_EXECUTE", "COPILOT_ADMIN",
      // Memory
      "MEMORY_READ", "MEMORY_WRITE",
      // Playbooks
      "PLAYBOOK_VIEW", "PLAYBOOK_MANAGE",
      // Executive Brain
      "EXECUTIVE_VIEW",
      // Autonomous
      "AUTONOMOUS_EXECUTE", "AUTONOMOUS_APPROVE",
      // Vault
      "VAULT_READ",
      // Audit
      "AUDIT_VIEW", "AUDIT_EXPORT",
      // Security
      "SECURITY_VIEW",
      // Encryption
      "ENCRYPTION_VIEW",
      // Settings
      "SETTINGS_VIEW", "SETTINGS_UPDATE", "SETTINGS_ADMIN",
      // Integrations
      "INTEGRATIONS_VIEW", "INTEGRATIONS_MANAGE", "INTEGRATIONS_ADMIN",
      // RBAC
      "RBAC_VIEW",
    ],
  },

  // ── SECURITY_ADMIN ───────────────────────────────────────────────────────────
  {
    roleId: "SECURITY_ADMIN",
    permissions: [
      // Finance (read-only)
      "FINANCE_VIEW",
      // Vault
      "VAULT_READ", "VAULT_WRITE", "VAULT_ADMIN",
      // Audit
      "AUDIT_VIEW", "AUDIT_EXPORT", "AUDIT_ADMIN",
      // Security
      "SECURITY_VIEW", "SECURITY_ADMIN",
      // Encryption
      "ENCRYPTION_VIEW", "ENCRYPTION_ADMIN",
      // Settings (read-only)
      "SETTINGS_VIEW",
      // Integrations (read-only)
      "INTEGRATIONS_VIEW",
      // RBAC
      "RBAC_VIEW", "RBAC_ADMIN",
    ],
  },

  // ── MANAGER ──────────────────────────────────────────────────────────────────
  {
    roleId: "MANAGER",
    permissions: [
      // Finance
      "FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_UPDATE", "FINANCE_EXPORT",
      // Commercial
      "COMMERCIAL_VIEW", "COMMERCIAL_CREATE", "COMMERCIAL_UPDATE", "COMMERCIAL_EXPORT",
      // Collections
      "COLLECTIONS_VIEW", "COLLECTIONS_UPDATE", "COLLECTIONS_APPROVE",
      // Marketing
      "MARKETING_VIEW", "MARKETING_CREATE", "MARKETING_UPDATE",
      // Copilot
      "COPILOT_EXECUTE",
      // Memory
      "MEMORY_READ",
      // Playbooks
      "PLAYBOOK_VIEW",
      // Executive Brain
      "EXECUTIVE_VIEW",
      // Autonomous
      "AUTONOMOUS_APPROVE",
      // Audit
      "AUDIT_VIEW",
      // Settings
      "SETTINGS_VIEW",
      // Integrations
      "INTEGRATIONS_VIEW",
    ],
  },

  // ── OPERATOR ─────────────────────────────────────────────────────────────────
  {
    roleId: "OPERATOR",
    permissions: [
      // Finance
      "FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_UPDATE",
      // Commercial
      "COMMERCIAL_VIEW", "COMMERCIAL_CREATE", "COMMERCIAL_UPDATE",
      // Collections
      "COLLECTIONS_VIEW", "COLLECTIONS_UPDATE",
      // Marketing
      "MARKETING_VIEW", "MARKETING_CREATE",
      // Copilot
      "COPILOT_EXECUTE",
      // Playbooks
      "PLAYBOOK_VIEW",
      // Settings
      "SETTINGS_VIEW",
    ],
  },

  // ── BILLING ──────────────────────────────────────────────────────────────────
  {
    roleId: "BILLING",
    permissions: [
      // Finance
      "FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_UPDATE", "FINANCE_EXPORT",
      // Collections
      "COLLECTIONS_VIEW", "COLLECTIONS_UPDATE", "COLLECTIONS_APPROVE",
      // Commercial (read-only)
      "COMMERCIAL_VIEW",
      // Settings
      "SETTINGS_VIEW",
    ],
  },

  // ── AUDITOR ──────────────────────────────────────────────────────────────────
  {
    roleId: "AUDITOR",
    permissions: [
      // Finance (read + export only)
      "FINANCE_VIEW", "FINANCE_EXPORT",
      // Commercial (read + export only)
      "COMMERCIAL_VIEW", "COMMERCIAL_EXPORT",
      // Collections (read only)
      "COLLECTIONS_VIEW",
      // Audit
      "AUDIT_VIEW", "AUDIT_EXPORT",
      // Security (read only)
      "SECURITY_VIEW",
      // Encryption (read only)
      "ENCRYPTION_VIEW",
      // Settings (read only)
      "SETTINGS_VIEW",
      // Integrations (read only)
      "INTEGRATIONS_VIEW",
      // RBAC (read only)
      "RBAC_VIEW",
    ],
  },
] as const;

// ── Index for fast lookup ─────────────────────────────────────────────────────

const _matrixIndex = new Map<RoleId, ReadonlySet<PermissionId>>(
  ROLE_PERMISSION_MATRIX.map(entry => [
    entry.roleId,
    new Set(entry.permissions),
  ]),
);

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/**
 * Get the set of PermissionIds granted to a given RoleId.
 * Returns an empty set if the role is not in the matrix.
 */
export function getPermissionsForRole(roleId: RoleId): ReadonlySet<PermissionId> {
  return _matrixIndex.get(roleId) ?? new Set();
}

/**
 * Check whether a given RoleId has a specific PermissionId.
 * SUPER_ADMIN bypass is NOT applied here — handle it in the RBAC engine.
 */
export function hasRolePermission(roleId: RoleId, permissionId: PermissionId): boolean {
  return _matrixIndex.get(roleId)?.has(permissionId) ?? false;
}

/**
 * Get all roles that have a specific PermissionId.
 */
export function getRolesWithPermission(permissionId: PermissionId): RoleId[] {
  const result: RoleId[] = [];
  for (const [roleId, perms] of _matrixIndex) {
    if (perms.has(permissionId)) result.push(roleId);
  }
  return result;
}

/**
 * Get the matrix entry for a given role.
 */
export function getRoleMatrixEntry(roleId: RoleId): RolePermissionEntry | undefined {
  return ROLE_PERMISSION_MATRIX.find(e => e.roleId === roleId);
}

/**
 * Get permission count per role as a summary map.
 */
export function getPermissionCountByRole(): Record<RoleId, number> {
  const result: Record<string, number> = {};
  for (const [roleId, perms] of _matrixIndex) {
    result[roleId] = perms.size;
  }
  return result;
}

/**
 * Get a matrix summary.
 */
export function getMatrixSummary(): {
  totalRoles:         number;
  totalAssignments:   number;
  maxPermissionsRole: RoleId | null;
  minPermissionsRole: RoleId | null;
} {
  let max = -1;
  let min = Infinity;
  let maxRole: RoleId | null = null;
  let minRole: RoleId | null = null;
  let total = 0;

  for (const [roleId, perms] of _matrixIndex) {
    total += perms.size;
    if (perms.size > max) { max = perms.size; maxRole = roleId; }
    if (perms.size < min) { min = perms.size; minRole = roleId; }
  }

  return {
    totalRoles:         _matrixIndex.size,
    totalAssignments:   total,
    maxPermissionsRole: maxRole,
    minPermissionsRole: minRole,
  };
}
