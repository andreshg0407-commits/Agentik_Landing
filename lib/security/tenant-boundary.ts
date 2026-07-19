/**
 * lib/security/tenant-boundary.ts
 *
 * Agentik — Security Foundation — Tenant Boundary Contract
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Centralizes multi-tenant boundary enforcement.
 * Every cross-tenant access check flows through this module.
 *
 * Design principles:
 *   - Fail closed: when in doubt, deny.
 *   - Never assume access is allowed.
 *   - All violations are auditable.
 *   - Pure functions — no side effects, no Prisma, no server-only.
 */

import type { SecuritySeverity } from "./security-types";

// ── Tenant Boundary Policy ────────────────────────────────────────────────────

/**
 * TenantBoundaryPolicy — defines the rules for cross-tenant access.
 */
export interface TenantBoundaryPolicy {
  /** Unique policy identifier. */
  id:                 string;
  /** Human-readable policy name. */
  name:               string;
  /**
   * Whether cross-tenant access is ever permitted.
   * AGENTIK_ADMIN and SUPER_ADMIN tenants may set this true.
   */
  allowCrossTenant:   boolean;
  /**
   * Explicit list of orgSlugs this tenant may access.
   * Only relevant when allowCrossTenant === true.
   */
  allowedTargets:     string[];
  /** Severity to record when a boundary violation occurs. */
  violationSeverity:  SecuritySeverity;
}

// ── Tenant Boundary Violation ─────────────────────────────────────────────────

export class TenantBoundaryViolation extends Error {
  readonly orgSlug:       string;
  readonly targetOrgSlug: string;
  readonly resource:      string;

  constructor(orgSlug: string, targetOrgSlug: string, resource: string) {
    super(
      `Tenant boundary violation: actor from "${orgSlug}" attempted to access resource "${resource}" owned by "${targetOrgSlug}"`,
    );
    this.name           = "TenantBoundaryViolation";
    this.orgSlug        = orgSlug;
    this.targetOrgSlug  = targetOrgSlug;
    this.resource       = resource;
  }
}

// ── Default Strict Policy ─────────────────────────────────────────────────────

/**
 * Default policy — strict isolation, no cross-tenant access.
 * Used when no explicit policy is provided.
 */
export const STRICT_TENANT_BOUNDARY_POLICY: TenantBoundaryPolicy = {
  id:                "strict-isolation",
  name:              "Strict Tenant Isolation",
  allowCrossTenant:  false,
  allowedTargets:    [],
  violationSeverity: "CRITICAL",
};

// ── Core Functions ────────────────────────────────────────────────────────────

/**
 * isTenantAllowed — pure predicate; does NOT throw.
 *
 * Returns true if actorOrgSlug is allowed to access resourceOrgSlug
 * under the given policy.
 */
export function isTenantAllowed(
  actorOrgSlug:    string,
  resourceOrgSlug: string,
  policy:          TenantBoundaryPolicy = STRICT_TENANT_BOUNDARY_POLICY,
): boolean {
  // Same tenant — always allowed
  if (actorOrgSlug === resourceOrgSlug) return true;

  // Empty slugs — deny (fail closed)
  if (!actorOrgSlug || !resourceOrgSlug) return false;

  // Cross-tenant disabled — deny
  if (!policy.allowCrossTenant) return false;

  // Check explicit allowlist
  return policy.allowedTargets.includes(resourceOrgSlug);
}

/**
 * assertSameTenant — throws TenantBoundaryViolation if slugs differ.
 *
 * Use when the operation MUST be within the same tenant (no exceptions).
 *
 * @param actorOrgSlug    — the org making the request
 * @param resourceOrgSlug — the org that owns the resource
 * @param resource        — human-readable resource label for the error
 */
export function assertSameTenant(
  actorOrgSlug:    string,
  resourceOrgSlug: string,
  resource:        string = "unknown-resource",
): void {
  if (actorOrgSlug !== resourceOrgSlug) {
    throw new TenantBoundaryViolation(actorOrgSlug, resourceOrgSlug, resource);
  }
}

/**
 * assertTenantAccess — throws TenantBoundaryViolation if access is not allowed
 * under the given policy.
 *
 * Use when policy-driven cross-tenant access may be permitted.
 *
 * @param actorOrgSlug    — the org making the request
 * @param resourceOrgSlug — the org that owns the resource
 * @param resource        — human-readable resource label for the error
 * @param policy          — the policy to evaluate (defaults to STRICT)
 */
export function assertTenantAccess(
  actorOrgSlug:    string,
  resourceOrgSlug: string,
  resource:        string = "unknown-resource",
  policy:          TenantBoundaryPolicy = STRICT_TENANT_BOUNDARY_POLICY,
): void {
  if (!isTenantAllowed(actorOrgSlug, resourceOrgSlug, policy)) {
    throw new TenantBoundaryViolation(actorOrgSlug, resourceOrgSlug, resource);
  }
}

/**
 * filterToTenant — filters an array of records to only those belonging to orgSlug.
 *
 * Generic utility for applying tenant isolation to any collection.
 * Never throws — returns empty array for empty input or no matches.
 */
export function filterToTenant<T extends { orgSlug: string }>(
  records:  T[],
  orgSlug:  string,
): T[] {
  if (!orgSlug) return [];
  return records.filter(r => r.orgSlug === orgSlug);
}

/**
 * isSameTenant — pure predicate (no throw).
 */
export function isSameTenant(a: string, b: string): boolean {
  return !!a && !!b && a === b;
}
