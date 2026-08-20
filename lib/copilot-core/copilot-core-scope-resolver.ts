/**
 * lib/copilot-core/copilot-core-scope-resolver.ts
 *
 * Copilot Core Foundation — Pure Actor Scope Resolution
 * Sprint: COPILOT-CORE-FOUNDATION-01B1
 *
 * Pure function. No Prisma, no fetch, no side effects.
 *
 * Determines what actorScope, sellerBinding, and resourceScope
 * should be set on a CopilotEnvelope, given server-derived authority input.
 *
 * RULES:
 *   1. Only CERTIFIED seller sources (membership_seller_slug) can produce
 *      actorScope="seller". All other sources fail closed.
 *   2. MANAGER/ORG_ADMIN → organization scope when membership ACTIVE,
 *      org ACTIVE, and module enabled.
 *   3. OPERATOR with CERTIFIED seller → seller scope.
 *      OPERATOR without CERTIFIED seller → self scope.
 *   4. VIEWER/BILLING → self scope for non-commercial modules, deny for commercial.
 *   5. SUPER_ADMIN/AGENTIK_ADMIN → organization scope (subject to module check).
 *   6. Unknown module → MODULE_DENIED, no fallback.
 *   7. Suspended membership → deny.
 *   8. Suspended organization → deny.
 */

import type {
  AuthorityInput,
  ScopeResolutionResult,
  ScopeResolutionWarning,
  SellerBinding,
  ResourceScope,
  ActorScope,
  DenialReason,
  ResolvedSellerInput,
} from "./copilot-core-types";

import { isCertifiedSellerSource } from "./copilot-core-types";

// ── Roles that have organizational authority for commercial modules ──────────

const ORG_AUTHORITY_ROLES = new Set([
  "SUPER_ADMIN",
  "AGENTIK_ADMIN",
  "ORG_ADMIN",
  "MANAGER",
]);

// ── Roles that MAY be seller-confined ────────────────────────────────────────

const SELLER_CONFINABLE_ROLES = new Set([
  "OPERATOR",
]);

// ── Roles denied for commercial module capabilities ─────────────────────────

const COMMERCIAL_DENIED_ROLES = new Set([
  "VIEWER",
  "BILLING",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function denied(
  reason: DenialReason,
  warnings: ScopeResolutionWarning[] = [],
): ScopeResolutionResult {
  return {
    resolved:      false,
    actorScope:    null,
    sellerBinding: null,
    resourceScope: null,
    denialReason:  reason,
    warnings,
  };
}

function resolved(
  actorScope:    ActorScope,
  sellerBinding: SellerBinding | null,
  resourceScope: ResourceScope,
  warnings:      ScopeResolutionWarning[] = [],
): ScopeResolutionResult {
  return {
    resolved: true,
    actorScope,
    sellerBinding,
    resourceScope,
    denialReason: null,
    warnings,
  };
}

function buildSellerBinding(
  seller: ResolvedSellerInput,
): SellerBinding {
  return {
    sellerId:       seller.sellerSlug,
    sellerName:     seller.sellerName,
    sellerSlug:     seller.sellerSlug,
    source:         seller.source,
    confidence:     seller.confidence,
    organizationId: seller.organizationId,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Resolve actor scope from server-derived authority input.
 *
 * This is a PURE function — no DB, no network, no side effects.
 * The caller (future envelope builder) provides all inputs from
 * server-side sources (requireOrgAccess, resolveCurrentSeller, etc.).
 */
export function resolveCopilotActorScope(
  input: AuthorityInput,
): ScopeResolutionResult {
  const warnings: ScopeResolutionWarning[] = [];

  // 1. Membership must be ACTIVE
  if (input.membershipStatus !== "ACTIVE") {
    return denied("INVALID_ENVELOPE");
  }

  // 2. Organization must be ACTIVE
  if (input.organizationStatus !== "ACTIVE") {
    return denied("INVALID_ENVELOPE");
  }

  // 3. Module must be enabled for the tenant
  if (!input.enabledModules.has(input.requestedModuleKey)) {
    return denied("MODULE_DENIED");
  }

  const { membershipRole, resolvedSellerIdentity, requestedModuleKey } = input;

  // 4. VIEWER/BILLING — denied for commercial modules
  if (COMMERCIAL_DENIED_ROLES.has(membershipRole) && requestedModuleKey === "sales") {
    return denied("ROLE_DENIED");
  }

  // 5. Roles with organizational authority → organization scope
  if (ORG_AUTHORITY_ROLES.has(membershipRole)) {
    // These roles get organization scope regardless of seller identity
    if (resolvedSellerIdentity && isCertifiedSellerSource(resolvedSellerIdentity.source)) {
      warnings.push({
        code:    "SELLER_IDENTITY_AVAILABLE",
        message: `User has certified seller identity "${resolvedSellerIdentity.sellerSlug}" but receives organization scope due to ${membershipRole} role`,
      });
    }

    return resolved(
      "organization",
      null,
      { kind: "organization", organizationId: resolvedSellerIdentity?.organizationId ?? "" },
      warnings,
    );
  }

  // 6. OPERATOR — seller scope if CERTIFIED, self otherwise
  if (SELLER_CONFINABLE_ROLES.has(membershipRole)) {
    if (resolvedSellerIdentity) {
      // Only CERTIFIED source can produce seller scope
      if (isCertifiedSellerSource(resolvedSellerIdentity.source)) {
        const binding = buildSellerBinding(resolvedSellerIdentity);
        return resolved(
          "seller",
          binding,
          {
            kind:           "seller",
            organizationId: resolvedSellerIdentity.organizationId,
            sellerId:       resolvedSellerIdentity.sellerSlug,
          },
          warnings,
        );
      }

      // UNVERIFIED source — cannot produce seller scope
      warnings.push({
        code:    "SELLER_IDENTITY_UNVERIFIED",
        message: `Seller identity source "${resolvedSellerIdentity.source}" is not CERTIFIED — falling back to self scope`,
      });
    } else {
      warnings.push({
        code:    "NO_SELLER_IDENTITY",
        message: "No seller identity resolved — falling back to self scope",
      });
    }

    // Fallback to self scope
    return resolved(
      "self",
      null,
      { kind: "self", organizationId: resolvedSellerIdentity?.organizationId ?? "" },
      warnings,
    );
  }

  // 7. VIEWER/BILLING for non-commercial modules → self scope
  if (COMMERCIAL_DENIED_ROLES.has(membershipRole)) {
    return resolved(
      "self",
      null,
      { kind: "self", organizationId: resolvedSellerIdentity?.organizationId ?? "" },
      warnings,
    );
  }

  // 8. Unknown role — fail closed
  return denied("ROLE_DENIED");
}
