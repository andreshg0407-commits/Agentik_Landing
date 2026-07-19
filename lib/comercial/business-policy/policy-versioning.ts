/**
 * lib/comercial/business-policy/policy-versioning.ts
 *
 * Policy Versioning (FASE 5).
 * Creates new versions of policies without overwriting existing ones.
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type {
  BusinessPolicy,
  BusinessPolicyVersion,
  PolicyValidationResult,
} from "./policy-types";

// ── Version Creation ────────────────────────────────────────────────────────

export function createPolicyVersion(
  existingPolicy: BusinessPolicy,
  updates: Partial<Pick<BusinessPolicy, "name" | "description" | "scopes" | "conditions" | "actions" | "parameters" | "priority" | "tags" | "metadata">>,
  createdBy: string,
  changeNote: string | null,
): BusinessPolicy {
  const prevVersion = existingPolicy.versionInfo.version;
  const nextVersion = incrementVersion(prevVersion);

  const newVersionInfo: BusinessPolicyVersion = {
    version: nextVersion,
    createdAt: new Date(),
    createdBy,
    activatedAt: null,
    deprecatedAt: null,
    previousVersion: prevVersion,
    changeNote,
  };

  return {
    ...existingPolicy,
    ...updates,
    status: "DRAFT",
    versionInfo: newVersionInfo,
  };
}

// ── Activation ──────────────────────────────────────────────────────────────

export function activatePolicyVersion(policy: BusinessPolicy): BusinessPolicy {
  return {
    ...policy,
    status: "ACTIVE",
    versionInfo: {
      ...policy.versionInfo,
      activatedAt: new Date(),
    },
  };
}

// ── Deprecation ─────────────────────────────────────────────────────────────

export function deprecatePolicyVersion(policy: BusinessPolicy): BusinessPolicy {
  return {
    ...policy,
    status: "DEPRECATED",
    versionInfo: {
      ...policy.versionInfo,
      deprecatedAt: new Date(),
    },
  };
}

// ── Version Validation ──────────────────────────────────────────────────────

export function validateVersionTransition(
  from: BusinessPolicy,
  to: BusinessPolicy,
): PolicyValidationResult {
  const issues: { field: string; message: string; severity: "ERROR" | "WARNING" | "INFO" }[] = [];

  if (to.versionInfo.previousVersion !== from.versionInfo.version) {
    issues.push({
      field: "versionInfo.previousVersion",
      message: `Previous version mismatch: expected "${from.versionInfo.version}", got "${to.versionInfo.previousVersion}"`,
      severity: "ERROR",
    });
  }

  if (to.tenantId !== from.tenantId) {
    issues.push({
      field: "tenantId",
      message: "Cannot change tenant across versions",
      severity: "ERROR",
    });
  }

  if (to.category !== from.category) {
    issues.push({
      field: "category",
      message: "Cannot change category across versions",
      severity: "ERROR",
    });
  }

  if (to.id !== from.id) {
    issues.push({
      field: "id",
      message: "Cannot change policy ID across versions",
      severity: "ERROR",
    });
  }

  if (from.status === "ARCHIVED") {
    issues.push({
      field: "status",
      message: "Cannot create new version from archived policy",
      severity: "ERROR",
    });
  }

  return {
    valid: issues.every(i => i.severity !== "ERROR"),
    issues,
  };
}

// ── Version History ─────────────────────────────────────────────────────────

export function buildVersionChain(
  allVersions: readonly BusinessPolicy[],
  policyId: string,
): readonly BusinessPolicy[] {
  const versions = allVersions
    .filter(p => p.id === policyId)
    .sort((a, b) => a.versionInfo.createdAt.getTime() - b.versionInfo.createdAt.getTime());

  return versions;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function incrementVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "1.0.1";

  const major = parseInt(parts[0], 10) || 1;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = (parseInt(parts[2], 10) || 0) + 1;

  return `${major}.${minor}.${patch}`;
}
