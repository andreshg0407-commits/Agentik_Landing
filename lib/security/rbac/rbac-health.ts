/**
 * lib/security/rbac/rbac-health.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Health Monitor — System Self-Check
 *
 * Server-only. Checks the health of the RBAC subsystem:
 *   1. Permission registry completeness
 *   2. Role registry completeness
 *   3. Resource registry completeness
 *   4. Role-permission matrix integrity
 *   5. RBAC engine round-trip evaluation
 *   6. Authorization service availability
 *
 * Returns a structured HealthReport — never throws.
 * Used by integration harnesses and operational dashboards.
 */

import "server-only";

import { PERMISSION_REGISTRY, getPermissionSummary } from "./permission-registry";
import { ROLE_REGISTRY, getRoleSummary } from "./role-registry";
import { RESOURCE_REGISTRY, getResourceSummary } from "./resource-registry";
import { ROLE_PERMISSION_MATRIX, getMatrixSummary } from "./role-permission-matrix";
import { userRoleAssignmentStore, createAssignment } from "./user-role-assignment";
import { evaluateAccess } from "./rbac-engine";
import { authorizationService } from "./authorization-service";

// ── Health Types ──────────────────────────────────────────────────────────────

export type RbacHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface RbacHealthCheck {
  name:       string;
  status:     RbacHealthStatus;
  detail:     string;
  durationMs: number;
}

export interface RbacHealthReport {
  status:     RbacHealthStatus;
  checkedAt:  string;
  durationMs: number;
  checks:     RbacHealthCheck[];
  summary: {
    roles:       ReturnType<typeof getRoleSummary>;
    permissions: ReturnType<typeof getPermissionSummary>;
    resources:   ReturnType<typeof getResourceSummary>;
    matrix:      ReturnType<typeof getMatrixSummary>;
  };
}

// ── Individual Checks ─────────────────────────────────────────────────────────

function checkPermissionRegistry(): RbacHealthCheck {
  const t0 = Date.now();
  try {
    const summary = getPermissionSummary();
    const status: RbacHealthStatus =
      summary.total >= 40 ? "HEALTHY" : "DEGRADED";
    return {
      name:       "permission_registry",
      status,
      detail:     `${summary.total} permissions registered (${summary.critical} critical, ${summary.requiresAudit} requiring audit)`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: "permission_registry", status: "UNAVAILABLE",
      detail: `Exception: ${String(err)}`, durationMs: Date.now() - t0,
    };
  }
}

function checkRoleRegistry(): RbacHealthCheck {
  const t0 = Date.now();
  try {
    const summary = getRoleSummary();
    const status: RbacHealthStatus =
      summary.total >= 8 ? "HEALTHY" : "DEGRADED";
    return {
      name:       "role_registry",
      status,
      detail:     `${summary.total} roles registered (${summary.systemRoles} system, max rank ${summary.maxRank})`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: "role_registry", status: "UNAVAILABLE",
      detail: `Exception: ${String(err)}`, durationMs: Date.now() - t0,
    };
  }
}

function checkResourceRegistry(): RbacHealthCheck {
  const t0 = Date.now();
  try {
    const summary = getResourceSummary();
    const status: RbacHealthStatus =
      summary.total >= 16 ? "HEALTHY" : "DEGRADED";
    return {
      name:       "resource_registry",
      status,
      detail:     `${summary.total} resources registered (${summary.critical} critical, ${summary.requiresEncryption} requiring encryption)`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: "resource_registry", status: "UNAVAILABLE",
      detail: `Exception: ${String(err)}`, durationMs: Date.now() - t0,
    };
  }
}

function checkMatrix(): RbacHealthCheck {
  const t0 = Date.now();
  try {
    const summary = getMatrixSummary();
    const allRolesHaveMatrix = ROLE_REGISTRY.every(role =>
      ROLE_PERMISSION_MATRIX.some(e => e.roleId === role.id),
    );
    const status: RbacHealthStatus =
      summary.totalRoles >= 8 && summary.totalAssignments >= 50 && allRolesHaveMatrix
        ? "HEALTHY"
        : "DEGRADED";
    return {
      name:       "role_permission_matrix",
      status,
      detail:     `${summary.totalRoles} roles, ${summary.totalAssignments} total assignments. All roles have matrix: ${allRolesHaveMatrix}`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      name: "role_permission_matrix", status: "UNAVAILABLE",
      detail: `Exception: ${String(err)}`, durationMs: Date.now() - t0,
    };
  }
}

function checkEngineRoundTrip(): RbacHealthCheck {
  const t0 = Date.now();
  const TEST_USER   = "__rbac_health_test_user__";
  const TEST_ORG    = "__rbac_health_test_org__";
  const TEST_ROLE   = "OPERATOR" as const;
  const TEST_PERM   = "FINANCE_VIEW" as const;

  try {
    // Seed a test assignment
    const assignment = createAssignment({
      userId:     TEST_USER,
      orgSlug:    TEST_ORG,
      roleId:     TEST_ROLE,
      assignedBy: "system",
    });
    userRoleAssignmentStore.set(assignment);

    // Evaluate access — should be ALLOW
    const allowResult = evaluateAccess({
      userId:       TEST_USER,
      orgSlug:      TEST_ORG,
      permissionId: TEST_PERM,
    });

    // Evaluate with empty orgSlug — should be DENY
    const denyResult = evaluateAccess({
      userId:       TEST_USER,
      orgSlug:      "",
      permissionId: TEST_PERM,
    });

    // Clean up
    userRoleAssignmentStore.remove(TEST_USER, TEST_ORG, TEST_ROLE);

    const ms = Date.now() - t0;
    const ok =
      allowResult.decision === "ALLOW" &&
      denyResult.decision  === "DENY"  &&
      ms < 50;

    return {
      name:       "engine_round_trip",
      status:     ok ? "HEALTHY" : "DEGRADED",
      detail:     `ALLOW=${allowResult.decision === "ALLOW"}, DENY=${denyResult.decision === "DENY"}, ${ms}ms`,
      durationMs: ms,
    };
  } catch (err) {
    userRoleAssignmentStore.remove(TEST_USER, TEST_ORG, TEST_ROLE);
    return {
      name: "engine_round_trip", status: "UNAVAILABLE",
      detail: `Exception: ${String(err)}`, durationMs: Date.now() - t0,
    };
  }
}

function checkAuthorizationService(): RbacHealthCheck {
  const t0 = Date.now();
  const TEST_USER = "__rbac_health_svc_user__";
  const TEST_ORG  = "__rbac_health_svc_org__";
  const TEST_ROLE = "MANAGER" as const;

  try {
    const assignment = createAssignment({
      userId:     TEST_USER,
      orgSlug:    TEST_ORG,
      roleId:     TEST_ROLE,
      assignedBy: "system",
    });
    userRoleAssignmentStore.set(assignment);

    const result = authorizationService.canView(TEST_USER, TEST_ORG, "FINANCE");

    userRoleAssignmentStore.remove(TEST_USER, TEST_ORG, TEST_ROLE);

    const ok = result.decision === "ALLOW";
    return {
      name:       "authorization_service",
      status:     ok ? "HEALTHY" : "DEGRADED",
      detail:     `canView(FINANCE) → ${result.decision} (${result.reason})`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    userRoleAssignmentStore.remove(TEST_USER, TEST_ORG, TEST_ROLE);
    return {
      name: "authorization_service", status: "UNAVAILABLE",
      detail: `Exception: ${String(err)}`, durationMs: Date.now() - t0,
    };
  }
}

// ── Health Monitor ────────────────────────────────────────────────────────────

export class RbacHealthMonitor {
  checkRbacHealth(): RbacHealthReport {
    const t0 = Date.now();

    const checks: RbacHealthCheck[] = [
      checkPermissionRegistry(),
      checkRoleRegistry(),
      checkResourceRegistry(),
      checkMatrix(),
      checkEngineRoundTrip(),
      checkAuthorizationService(),
    ];

    const hasUnavailable = checks.some(c => c.status === "UNAVAILABLE");
    const hasDegraded    = checks.some(c => c.status === "DEGRADED");

    const status: RbacHealthStatus =
      hasUnavailable ? "UNAVAILABLE" :
      hasDegraded    ? "DEGRADED"    :
      "HEALTHY";

    return {
      status,
      checkedAt:  new Date().toISOString(),
      durationMs: Date.now() - t0,
      checks,
      summary: {
        roles:       getRoleSummary(),
        permissions: getPermissionSummary(),
        resources:   getResourceSummary(),
        matrix:      getMatrixSummary(),
      },
    };
  }
}

let _monitor: RbacHealthMonitor | null = null;

export function getRbacHealthMonitor(): RbacHealthMonitor {
  if (!_monitor) _monitor = new RbacHealthMonitor();
  return _monitor;
}

export const rbacHealthMonitor = new RbacHealthMonitor();
