/**
 * lib/security/rbac/rbac-report-builder.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Report Builder — Structured Access Reports
 *
 * Builds human-readable and machine-serializable reports about:
 *   - Role definitions and permission assignments (buildRoleReport)
 *   - Permission details and role coverage (buildPermissionReport)
 *   - A specific user's access state in a tenant (buildAccessReport)
 *
 * No Prisma. No server-only. Pure domain logic.
 */

import type { RoleId, PermissionId } from "./rbac-types";
import { ROLE_REGISTRY } from "./role-registry";
import { PERMISSION_REGISTRY } from "./permission-registry";
import { RESOURCE_REGISTRY } from "./resource-registry";
import { getPermissionsForRole, getRolesWithPermission, getMatrixSummary } from "./role-permission-matrix";
import { getUserRoles, getUserPermissions, getUserRoleSummary, getTenantAssignments } from "./rbac-query";
import { getRoleEntry } from "./role-registry";
import { getPermissionEntry } from "./permission-registry";
import { getResourceSummary } from "./resource-registry";
import { getPermissionSummary } from "./permission-registry";
import { getRoleSummary } from "./role-registry";

// ── Role Report ───────────────────────────────────────────────────────────────

export interface RoleReportEntry {
  roleId:          RoleId;
  name:            string;
  description:     string;
  rank:            number;
  isSystemRole:    boolean;
  requiresAudit:   boolean;
  permissionCount: number;
  permissions:     PermissionId[];
}

export interface RoleReport {
  generatedAt:  string;
  totalRoles:   number;
  entries:      RoleReportEntry[];
  matrixSummary: ReturnType<typeof getMatrixSummary>;
}

/**
 * Build a report of all roles and their assigned permissions.
 */
export function buildRoleReport(): RoleReport {
  const entries: RoleReportEntry[] = ROLE_REGISTRY.map(role => {
    const permissions = [...getPermissionsForRole(role.id)];
    return {
      roleId:          role.id,
      name:            role.name,
      description:     role.description,
      rank:            role.rank,
      isSystemRole:    role.isSystemRole,
      requiresAudit:   role.requiresAudit,
      permissionCount: permissions.length,
      permissions,
    };
  }).sort((a, b) => b.rank - a.rank);

  return {
    generatedAt:  new Date().toISOString(),
    totalRoles:   entries.length,
    entries,
    matrixSummary: getMatrixSummary(),
  };
}

// ── Permission Report ─────────────────────────────────────────────────────────

export interface PermissionReportEntry {
  permissionId:       PermissionId;
  name:               string;
  description:        string;
  resource:           string;
  action:             string;
  riskLevel:          string;
  requiresAudit:      boolean;
  rolesWithPermission: RoleId[];
  coverageCount:      number;
}

export interface PermissionReport {
  generatedAt:       string;
  totalPermissions:  number;
  criticalCount:     number;
  highCount:         number;
  entries:           PermissionReportEntry[];
  permissionSummary: ReturnType<typeof getPermissionSummary>;
}

/**
 * Build a report of all permissions and which roles grant them.
 */
export function buildPermissionReport(): PermissionReport {
  const entries: PermissionReportEntry[] = PERMISSION_REGISTRY.map(p => {
    const roles = getRolesWithPermission(p.id);
    return {
      permissionId:        p.id,
      name:                p.name,
      description:         p.description,
      resource:            p.resource,
      action:              p.action,
      riskLevel:           p.riskLevel,
      requiresAudit:       p.requiresAudit,
      rolesWithPermission: roles,
      coverageCount:       roles.length,
    };
  });

  const criticalCount = entries.filter(e => e.riskLevel === "CRITICAL").length;
  const highCount     = entries.filter(e => e.riskLevel === "HIGH").length;

  return {
    generatedAt:      new Date().toISOString(),
    totalPermissions: entries.length,
    criticalCount,
    highCount,
    entries,
    permissionSummary: getPermissionSummary(),
  };
}

// ── Access Report ─────────────────────────────────────────────────────────────

export interface ResourceAccessEntry {
  resourceId:   string;
  resourceName: string;
  canView:      boolean;
  canCreate:    boolean;
  canUpdate:    boolean;
  canDelete:    boolean;
  canExport:    boolean;
  canAdmin:     boolean;
}

export interface AccessReport {
  generatedAt:     string;
  userId:          string;
  orgSlug:         string;
  roleSummary:     ReturnType<typeof getUserRoleSummary>;
  permissionCount: number;
  permissions:     PermissionId[];
  resourceAccess:  ResourceAccessEntry[];
  isSuperAdmin:    boolean;
  isOrgAdmin:      boolean;
}

/**
 * Build a full access report for a specific user in a tenant.
 */
export function buildAccessReport(userId: string, orgSlug: string): AccessReport {
  const roleSummary   = getUserRoleSummary(userId, orgSlug);
  const permissions   = [...getUserPermissions(userId, orgSlug)];
  const isSuperAdmin  = roleSummary.isSuperAdmin;

  const resourceAccess: ResourceAccessEntry[] = RESOURCE_REGISTRY.map(resource => {
    const hasPermission = (action: string): boolean => {
      if (isSuperAdmin) return true;
      const pid = `${resource.id}_${action}` as PermissionId;
      return permissions.includes(pid);
    };

    return {
      resourceId:   resource.id,
      resourceName: resource.name,
      canView:      hasPermission("VIEW"),
      canCreate:    hasPermission("CREATE"),
      canUpdate:    hasPermission("UPDATE"),
      canDelete:    hasPermission("DELETE"),
      canExport:    hasPermission("EXPORT"),
      canAdmin:     hasPermission("ADMIN"),
    };
  });

  return {
    generatedAt:     new Date().toISOString(),
    userId,
    orgSlug,
    roleSummary,
    permissionCount: permissions.length,
    permissions,
    resourceAccess,
    isSuperAdmin,
    isOrgAdmin:      roleSummary.isOrgAdmin,
  };
}

// ── Tenant Report ─────────────────────────────────────────────────────────────

export interface TenantRbacReport {
  generatedAt:       string;
  orgSlug:           string;
  totalAssignments:  number;
  uniqueUsers:       number;
  roleDistribution:  Record<RoleId, number>;
  registrySummary: {
    roles:       ReturnType<typeof getRoleSummary>;
    permissions: ReturnType<typeof getPermissionSummary>;
    resources:   ReturnType<typeof getResourceSummary>;
  };
}

/**
 * Build a summary of the RBAC state for an entire tenant.
 */
export function buildTenantRbacReport(orgSlug: string): TenantRbacReport {
  const assignments = getTenantAssignments(orgSlug);
  const uniqueUsers = new Set(assignments.map(a => a.userId)).size;

  const roleDistribution: Record<string, number> = {};
  for (const a of assignments) {
    if (!a.isActive) continue;
    roleDistribution[a.roleId] = (roleDistribution[a.roleId] ?? 0) + 1;
  }

  return {
    generatedAt:      new Date().toISOString(),
    orgSlug,
    totalAssignments: assignments.filter(a => a.isActive).length,
    uniqueUsers,
    roleDistribution,
    registrySummary: {
      roles:       getRoleSummary(),
      permissions: getPermissionSummary(),
      resources:   getResourceSummary(),
    },
  };
}

// ── Formatted Text Output ─────────────────────────────────────────────────────

/**
 * Format a role report as human-readable text.
 */
export function formatRoleReport(report: RoleReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════════════════════════",
    "  AGENTIK-SECURITY-RBAC-01 — Role Report",
    `  Generated: ${report.generatedAt}`,
    `  Total Roles: ${report.totalRoles}`,
    "═══════════════════════════════════════════════════════════",
  ];

  for (const entry of report.entries) {
    lines.push(`\n  [${entry.roleId}] ${entry.name} (rank: ${entry.rank})`);
    lines.push(`    ${entry.description}`);
    lines.push(`    Permissions: ${entry.permissionCount} | Audit: ${entry.requiresAudit}`);
  }

  lines.push("\n───────────────────────────────────────────────────────────");
  lines.push(`  Matrix Total Assignments: ${report.matrixSummary.totalAssignments}`);
  lines.push("───────────────────────────────────────────────────────────");

  return lines.join("\n");
}

/**
 * Format an access report as human-readable text.
 */
export function formatAccessReport(report: AccessReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════════════════════════",
    "  AGENTIK-SECURITY-RBAC-01 — User Access Report",
    `  User:    ${report.userId}`,
    `  Tenant:  ${report.orgSlug}`,
    `  Generated: ${report.generatedAt}`,
    "═══════════════════════════════════════════════════════════",
    `  Roles: ${report.roleSummary.roles.map(r => r.id).join(", ") || "none"}`,
    `  Permissions: ${report.permissionCount}`,
    `  Super Admin: ${report.isSuperAdmin} | Org Admin: ${report.isOrgAdmin}`,
    "\n  Resource Access:",
  ];

  for (const r of report.resourceAccess) {
    const flags = [
      r.canView   ? "VIEW"   : null,
      r.canCreate ? "CREATE" : null,
      r.canUpdate ? "UPDATE" : null,
      r.canDelete ? "DELETE" : null,
      r.canExport ? "EXPORT" : null,
      r.canAdmin  ? "ADMIN"  : null,
    ].filter(Boolean).join(" | ");
    lines.push(`    ${r.resourceId.padEnd(20)} ${flags || "— no access"}`);
  }

  lines.push("\n───────────────────────────────────────────────────────────");
  return lines.join("\n");
}
