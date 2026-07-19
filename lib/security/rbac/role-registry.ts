/**
 * lib/security/rbac/role-registry.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Foundation — Role Registry
 *
 * Registers all system-defined roles in the Agentik OS.
 * Each role entry defines:
 *   - id: RoleId key
 *   - name: human-readable display name
 *   - description: intended role holder
 *   - rank: numeric precedence (higher = more privileged)
 *   - isSystemRole: whether it is immutable / cannot be deleted
 *   - requiresAudit: whether all permission grants from this role are audit-logged
 *
 * No Prisma. No server-only. No crypto. Pure domain registry.
 */

import type { RoleId } from "./rbac-types";

// ── Role Entry ────────────────────────────────────────────────────────────────

export interface RoleEntry {
  /** The RoleId identifier. */
  id:            RoleId;
  /** Human-readable display name. */
  name:          string;
  /** Who holds this role and what they are responsible for. */
  description:   string;
  /**
   * Privilege rank — higher number = more privileged.
   * Used to validate role assignments (cannot assign a role with rank > your own).
   */
  rank:          number;
  /** Whether this role is immutable (system-defined, cannot be deleted). */
  isSystemRole:  boolean;
  /** Whether grants from this role must always produce an audit event. */
  requiresAudit: boolean;
  /** Whether this role is visible in the ORG_ADMIN management UI. */
  visibleToOrgAdmin: boolean;
}

// ── Role Registry ─────────────────────────────────────────────────────────────

export const ROLE_REGISTRY: ReadonlyArray<RoleEntry> = [
  {
    id:               "SUPER_ADMIN",
    name:             "Super Admin",
    description:      "Agentik platform owner. Unrestricted access across all tenants and modules. Reserved for Agentik internal operations.",
    rank:             100,
    isSystemRole:     true,
    requiresAudit:    true,
    visibleToOrgAdmin: false,
  },
  {
    id:               "AGENTIK_ADMIN",
    name:             "Agentik Admin",
    description:      "Agentik platform administrator. Full access within Agentik OS modules. Can manage tenant configurations and security policies.",
    rank:             90,
    isSystemRole:     true,
    requiresAudit:    true,
    visibleToOrgAdmin: false,
  },
  {
    id:               "ORG_ADMIN",
    name:             "Organization Admin",
    description:      "Tenant organization administrator. Full access within their tenant scope. Can manage members, integrations, and settings.",
    rank:             70,
    isSystemRole:     true,
    requiresAudit:    true,
    visibleToOrgAdmin: true,
  },
  {
    id:               "MANAGER",
    name:             "Manager",
    description:      "Operational manager. Read and write access across Finance, Commercial, and Collections. Can approve tasks and view executive data.",
    rank:             50,
    isSystemRole:     true,
    requiresAudit:    false,
    visibleToOrgAdmin: true,
  },
  {
    id:               "OPERATOR",
    name:             "Operator",
    description:      "Day-to-day operator. Create and update access for Finance and Commercial. Can execute Copilot tasks.",
    rank:             30,
    isSystemRole:     true,
    requiresAudit:    false,
    visibleToOrgAdmin: true,
  },
  {
    id:               "BILLING",
    name:             "Billing",
    description:      "Billing and collections specialist. Access to financial records, payment tracking, and collection workflows.",
    rank:             25,
    isSystemRole:     true,
    requiresAudit:    false,
    visibleToOrgAdmin: true,
  },
  {
    id:               "AUDITOR",
    name:             "Auditor",
    description:      "Read-only auditor. Can view and export audit logs, reports, and financial records. No write access.",
    rank:             20,
    isSystemRole:     true,
    requiresAudit:    true,
    visibleToOrgAdmin: true,
  },
  {
    id:               "SECURITY_ADMIN",
    name:             "Security Admin",
    description:      "Security specialist. Full access to security policies, RBAC configuration, encryption management, and vault administration.",
    rank:             80,
    isSystemRole:     true,
    requiresAudit:    true,
    visibleToOrgAdmin: false,
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Get a role entry by its RoleId. Returns undefined if not found. */
export function getRoleEntry(id: RoleId): RoleEntry | undefined {
  return ROLE_REGISTRY.find(r => r.id === id);
}

/** Get all roles visible to ORG_ADMIN in the management UI. */
export function getOrgAdminVisibleRoles(): RoleEntry[] {
  return ROLE_REGISTRY.filter(r => r.visibleToOrgAdmin);
}

/** Get all system roles (immutable). */
export function getSystemRoles(): RoleEntry[] {
  return ROLE_REGISTRY.filter(r => r.isSystemRole);
}

/** Get all roles that require audit logging on every grant. */
export function getAuditRequiredRoles(): RoleEntry[] {
  return ROLE_REGISTRY.filter(r => r.requiresAudit);
}

/** Get all roles ordered by rank (descending — most privileged first). */
export function getRolesByRank(): RoleEntry[] {
  return [...ROLE_REGISTRY].sort((a, b) => b.rank - a.rank);
}

/** Get the numeric rank for a given RoleId. Returns 0 if not found. */
export function getRoleRank(id: RoleId): number {
  return getRoleEntry(id)?.rank ?? 0;
}

/** Check whether a RoleId is registered. */
export function isRegisteredRole(id: string): boolean {
  return ROLE_REGISTRY.some(r => r.id === id);
}

/** Get all registered RoleIds. */
export function getAllRoleIds(): RoleId[] {
  return ROLE_REGISTRY.map(r => r.id);
}

/** Get a summary of the role registry. */
export function getRoleSummary(): {
  total:        number;
  systemRoles:  number;
  requiresAudit: number;
  maxRank:      number;
} {
  return {
    total:         ROLE_REGISTRY.length,
    systemRoles:   ROLE_REGISTRY.filter(r => r.isSystemRole).length,
    requiresAudit: ROLE_REGISTRY.filter(r => r.requiresAudit).length,
    maxRank:       Math.max(...ROLE_REGISTRY.map(r => r.rank)),
  };
}
