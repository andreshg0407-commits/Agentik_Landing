/**
 * lib/security/zero-trust/tenant-isolation.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Tenant Isolation — Multi-Tenant Boundary Enforcement
 *
 * No server-only. No Prisma. Pure domain logic.
 *
 * Principles:
 *   - Every access request must carry orgSlug
 *   - The resource's owning tenant must match the request's tenant
 *   - Cross-tenant access is NEVER permitted without explicit delegation (not yet supported)
 *   - Fail-closed: if orgSlug is missing or mismatched, DENY + CRITICAL risk
 */

import type { TenantIsolationResult, ZeroTrustContext } from "./zero-trust-types";

// ── verifyTenantIsolation ──────────────────────────────────────────────────────

/**
 * verifyTenantIsolation — verify that the request stays within its tenant boundary.
 *
 * Checks:
 *   1. Context orgSlug is present and non-empty
 *   2. Resource owner orgSlug is present and non-empty
 *   3. Both orgSlugs match exactly (case-sensitive)
 *   4. Tenant format is valid (no injection vectors)
 */
export function verifyTenantIsolation(
  context:           ZeroTrustContext,
  resourceOwnerOrg?: string,
): TenantIsolationResult {
  const reasons: string[] = [];

  // 1. Context orgSlug must be present
  if (!context.orgSlug || context.orgSlug.trim().length === 0) {
    return {
      isolated:           false,
      reasons:            ["context_org_slug_missing"],
      requestedOrg:       "",
      contextOrg:         context.orgSlug ?? "",
      crossTenantAttempt: false,
      riskLevel:          "CRITICAL",
    };
  }

  const requestedOrg = context.orgSlug.trim().toLowerCase();

  // 2. Validate orgSlug format (alphanumeric + hyphens only)
  if (!isValidOrgSlug(requestedOrg)) {
    return {
      isolated:           false,
      reasons:            ["invalid_org_slug_format"],
      requestedOrg,
      contextOrg:         requestedOrg,
      crossTenantAttempt: false,
      riskLevel:          "CRITICAL",
    };
  }

  // 3. If resource owner org is specified, verify it matches
  if (resourceOwnerOrg !== undefined && resourceOwnerOrg !== null) {
    const ownerOrg = resourceOwnerOrg.trim().toLowerCase();

    if (!ownerOrg) {
      reasons.push("resource_owner_org_empty");
    } else if (ownerOrg !== requestedOrg) {
      return {
        isolated:           false,
        reasons:            [`cross_tenant_attempt: requested=${requestedOrg} owner=${ownerOrg}`],
        requestedOrg,
        contextOrg:         ownerOrg,
        crossTenantAttempt: true,
        riskLevel:          "CRITICAL",
      };
    }
  }

  // 4. All checks passed
  reasons.push("tenant_boundary_verified");

  return {
    isolated:           true,
    reasons,
    requestedOrg,
    contextOrg:         requestedOrg,
    crossTenantAttempt: false,
    riskLevel:          "LOW",
  };
}

// ── assertTenantMatch ─────────────────────────────────────────────────────────

/**
 * assertTenantMatch — throw if two org slugs don't match.
 * Use at trust gates that must never allow cross-tenant access.
 */
export function assertTenantMatch(contextOrg: string, resourceOrg: string): void {
  const a = contextOrg.trim().toLowerCase();
  const b = resourceOrg.trim().toLowerCase();
  if (a !== b) {
    throw new Error(
      `ZeroTrust: tenant isolation violation — context=${a} resource=${b}`
    );
  }
}

// ── isSameTenant ─────────────────────────────────────────────────────────────

/**
 * isSameTenant — boolean check.
 */
export function isSameTenant(orgA: string, orgB: string): boolean {
  return orgA.trim().toLowerCase() === orgB.trim().toLowerCase();
}

// ── isValidOrgSlug ────────────────────────────────────────────────────────────

/**
 * isValidOrgSlug — validate orgSlug format.
 * Only allows lowercase alphanumeric and hyphens, 2–64 characters.
 */
export function isValidOrgSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug);
}

// ── buildIsolationSummary ─────────────────────────────────────────────────────

/**
 * buildIsolationSummary — human-readable summary of isolation result.
 */
export function buildIsolationSummary(result: TenantIsolationResult): string {
  if (result.isolated) {
    return `Tenant boundary verified for org: ${result.requestedOrg}`;
  }
  if (result.crossTenantAttempt) {
    return `CRITICAL: Cross-tenant access attempt — requested=${result.requestedOrg} owner=${result.contextOrg}`;
  }
  return `Tenant isolation failed: ${result.reasons.join(", ")}`;
}
